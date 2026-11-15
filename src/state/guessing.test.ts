import { describe, expect, it } from 'vitest';
import { tallyItems, tallyKey } from './progressStore';
import { INTERVALS_MS, MAX_INTERVAL_MS, completion, dueAt } from './schedule';
import type { ProgressLine } from './line';
import type { Attempt } from './schema';
import type { ItemId, ItemOutcome } from '../exercises/types';
import { EXERCISE_TYPES } from '../exercises/registry';
import { readFileSync } from 'node:fs';
import { INTERVAL_DEFAULTS, generateInterval, gradeInterval, intervalItems } from '../exercises/interval-id/intervals';

/**
 * A right answer advances an item by what it rules out.
 *
 * The user's ruling, 15 November: advance less when guessing was easy. Right
 * out of two is weaker evidence than right out of twelve, and right out of
 * one is none at all — ADR 0037's pool of one, where pressing the only
 * button built a streak to the top of the ladder on no information.
 */

const ITEM = 'interval:m3:up' as ItemId;
const line: ProgressLine = { exercise: 'interval-id', askable: [ITEM], presentation: 'listen' };

function answered(outcomes: Array<Partial<ItemOutcome> & { correct: boolean }>): Attempt[] {
  return outcomes.map((o, i) => ({
    id: `a${i}`,
    exerciseType: 'interval-id',
    seed: i,
    settings: {},
    presentation: 'listen',
    startedAt: i * 1000,
    answeredAt: i * 1000 + 500,
    items: [ITEM],
    outcomes: [{ item: ITEM, ...o }],
    correct: o.correct,
    askable: [ITEM],
  }));
}

const streakAfter = (outcomes: Array<Partial<ItemOutcome> & { correct: boolean }>) =>
  tallyItems(answered(outcomes)).get(tallyKey(line, ITEM))!.streak;

describe('how far a right answer moves an item', () => {
  it('moves it a whole step when nothing says guessing could have done it', () => {
    // A tapped rhythm, or any row written before the field existed.
    expect(streakAfter([{ correct: true }, { correct: true }, { correct: true }])).toBe(3);
  });

  it('moves it half as far when half the buttons were right', () => {
    const half = { correct: true, chance: 0.5 };
    expect(streakAfter([half, half, half])).toBe(1.5);
  });

  it('does not move it at all when the only button was the answer', () => {
    const certain = { correct: true, chance: 1 };
    expect(streakAfter(Array.from({ length: 20 }, () => certain))).toBe(0);
  });

  it('still loses the whole streak on a miss, however it was built', () => {
    expect(streakAfter([
      { correct: true, chance: 1 / 12 }, { correct: true, chance: 1 / 12 }, { correct: false, chance: 1 / 12 },
    ])).toBe(0);
  });

  it('rests an item at the rung its whole streak has earned, not a partial one', () => {
    // One and a half steps of evidence earn the first rung's rest, not the
    // second's: a rung is granted when the evidence for it is complete.
    const at = (streak: number) => dueAt({ seen: 3, correct: 3, lastSeenAt: 0, streak });
    expect(at(1.5)).toBe(INTERVALS_MS[1]);
    expect(at(2)).toBe(INTERVALS_MS[2]);
  });

  it('counts the fraction towards how far a line has come', () => {
    const top = INTERVALS_MS.length - 1;
    const tallies = new Map([[tallyKey(line, ITEM), { seen: 2, correct: 2, lastSeenAt: 0, streak: 1.5 }]]);
    expect(completion(line, tallies)).toBeCloseTo(1.5 / top, 10);
  });
});

describe('the chance an answer records', () => {
  it('is one over the buttons, not over the items the settings make askable', () => {
    /*
      Architect's warning made a case: both directions on gives twice as
      many items as buttons, because the answer names a size and not a
      direction. The floor is the buttons.
    */
    const settings = { ...INTERVAL_DEFAULTS, directions: ['up', 'down'] as const };
    const ex = generateInterval({ seed: 4, settings: { ...settings, directions: [...settings.directions] } });
    const outcome = gradeInterval(ex, { semitones: ex.choices[0] }).outcomes[0];
    expect(outcome.chance).toBe(1 / ex.choices.length);
    expect(intervalItems({ ...settings, directions: [...settings.directions] }).length)
      .toBe(ex.choices.length * 2);
  });

  it('is recorded by every exercise answered from a list, and by none that is performed', () => {
    const responses: Record<string, (ex: Record<string, unknown>) => unknown> = {
      'interval-id': (ex) => ({ semitones: (ex.choices as number[])[0] }),
      'key-id': (ex) => ({ keyId: (ex.choices as string[])[0] }),
      'degree-id': (ex) => ({ degree: (ex.choices as number[])[0] }),
      'scale-id': (ex) => ({ typeId: (ex.choices as string[])[0] }),
      'chord-id': (ex) => ({
        typeId: (ex.choices as string[])[0],
        inversion: (ex.inversionChoices as number[])[0],
      }),
      'progression-id': (ex) => ({
        numerals: (ex.numerals as string[]).map(() => (ex.palette as string[])[0]),
      }),
    };
    const picked = EXERCISE_TYPES.filter((t) => t.id in responses);
    expect(picked.length, 'an exercise answered from a list has no case here').toBe(
      EXERCISE_TYPES.filter((t) => t.id !== 'rhythm-id').length,
    );
    for (const type of picked) {
      const ex = type.generate({ seed: 3, settings: type.settings.defaults }) as Record<string, unknown>;
      for (const outcome of type.grade(ex, responses[type.id](ex)).outcomes) {
        expect(outcome.chance, `${type.id} recorded no chance`).toBeDefined();
        expect(outcome.chance!, type.id).toBeGreaterThan(0);
        expect(outcome.chance!, type.id).toBeLessThanOrEqual(1);
      }
    }
  });

  /**
   * The numerator, which the case above does not reach.
   *
   * `chance` is asserted there as a number in (0, 1]; three exercises
   * compute it from something other than a plain button count and were
   * unheld — the scale's twin answers (a falling melodic minor is the
   * natural minor's notes, so two buttons are right), the chord's product
   * of type and bass, and the progression's per-slot palette. Each is a
   * different arithmetic, and a wrong one is invisible from the range.
   *
   * The property that covers all three without restating any of them: the
   * chance an outcome records, times the responses the learner was offered
   * for it, is the number of those responses the grader actually accepts.
   * A guess is a uniform pick among the buttons, so that identity is what
   * "how likely was luck" means, whatever the exercise does to arrive at it.
   *
   * Each exercise is configured to reach its own interesting branch, which
   * is not the default in two cases — the scale needs a falling listening
   * question for the twin to exist at all, and the chord needs the bass
   * asked. Both were found by mutation: with the defaults, dropping the
   * twin term and dropping the inversion factor were each undetectable
   * here, because the branch never ran.
   */
  it('records a chance whose numerator is the answers the grader accepts', () => {
    type Ex = Record<string, unknown>;
    /** Every response on offer, grouped by the outcome it decides. */
    const offers: Record<string, {
      settings?: Record<string, unknown>;
      groups: (ex: Ex) => Array<{ outcome: number; responses: unknown[] }>;
    }> = {
      'interval-id': {
        groups: (ex) => [{ outcome: 0, responses: (ex.choices as number[]).map((semitones) => ({ semitones })) }],
      },
      'key-id': {
        groups: (ex) => [{ outcome: 0, responses: (ex.choices as string[]).map((keyId) => ({ keyId })) }],
      },
      'degree-id': {
        groups: (ex) => [{ outcome: 0, responses: (ex.choices as number[]).map((degree) => ({ degree })) }],
      },
      'scale-id': {
        // Falling, and heard: the only shape in which two names are one sound.
        settings: { presentation: 'listen', direction: 'down' },
        groups: (ex) => [{ outcome: 0, responses: (ex.choices as string[]).map((typeId) => ({ typeId })) }],
      },
      'chord-id': {
        settings: { inversions: true },
        groups: (ex) => [{
          outcome: 0,
          responses: (ex.choices as string[]).flatMap((typeId) =>
            ((ex.inversionChoices as number[]).length ? ex.inversionChoices as number[] : [0])
              .map((inversion) => ({ typeId, inversion }))),
        }],
      },
      'progression-id': {
        groups: (ex) => (ex.numerals as string[]).map((_, i) => ({
          outcome: i,
          responses: (ex.palette as string[]).map((cand) => ({
            numerals: (ex.numerals as string[]).map((n, j) => (j === i ? cand : n)),
          })),
        })),
      },
    };

    const picked = EXERCISE_TYPES.filter((t) => t.id in offers);
    expect(picked.length, 'an exercise answered from a list has no case here')
      .toBe(EXERCISE_TYPES.filter((t) => t.id !== 'rhythm-id').length);

    for (const type of picked) {
      const { settings, groups } = offers[type.id];
      // Several seeds: which scale or chord comes up decides whether a twin
      // or an inversion is in play at all, and one seed can miss it.
      for (let seed = 0; seed < 12; seed++) {
        const ex = type.generate({
          seed, settings: { ...type.settings.defaults, ...settings },
        }) as unknown as Ex;
        for (const { outcome, responses } of groups(ex)) {
          const graded = responses.map((r) => type.grade(ex as never, r as never).outcomes[outcome]);
          const accepted = graded.filter((o) => o.correct).length;
          const chances = [...new Set(graded.map((o) => o.chance))];

          expect(chances, `${type.id} seed ${seed}: the chance moved with the answer given, `
            + 'so it is not a property of the buttons').toHaveLength(1);
          expect(chances[0]! * responses.length,
            `${type.id} seed ${seed} outcome ${outcome}: `
            + `${accepted} of ${responses.length} offered answers are accepted`)
            .toBeCloseTo(accepted, 10);
        }
      }
    }
  });
});

/**
 * ADR 0051's consequences table, kept true by the code it describes.
 *
 * Four figures — what a right answer is worth from a pool, and how many
 * such answers reach the top rung — and every one of them depends on the
 * ladder being eight rungs long. Adding a rung is an ordinary retune of
 * `INTERVALS_MS` that would silently falsify all four, in a record that is
 * append-only and so cannot simply be edited back into truth.
 *
 * This is the project's own remedy rather than a new one: bind the claim
 * to a fact a command can verify, in the place the claim is made. A reader
 * who changes the ladder gets a red test naming the record, and adds a
 * dated correction to it, which is what append-only asks for.
 *
 * The table is read out of the file rather than copied here, so the two
 * cannot drift into agreeing with each other while both are wrong.
 */
describe('what ADR 0051 tells a reader the discount is worth', () => {
  const RECORD = 'docs/adr/0051-a-right-answer-advances-an-item-by-what-it-ruled-out.md';

  /** `| twelve, two of them right | 0.833 | 9 |` → the three cells. */
  const rows = () => readFileSync(RECORD, 'utf8')
    .split('\n')
    .map((line) => line.match(/^\| ([a-z].*?) \| ([\d.]+) \| (\d+|never) \|$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ pool: m[1], advance: Number(m[2]), answers: m[3] }));

  /** The pool each row names, as the buttons offered and the buttons right. */
  const POOLS: Record<string, { offered: number; right: number }> = {
    'one button': { offered: 1, right: 1 },
    two: { offered: 2, right: 1 },
    twelve: { offered: 12, right: 1 },
    'twelve, two of them right': { offered: 12, right: 2 },
  };

  it('names a pool this test knows how to work out', () => {
    // The population, so a row added to the record cannot go unchecked by
    // simply not matching anything here.
    expect(rows().map((r) => r.pool).sort()).toEqual(Object.keys(POOLS).sort());
  });

  it('is what the schedule actually does', () => {
    for (const { pool, advance, answers } of rows()) {
      const { offered, right } = POOLS[pool];
      const step = 1 - right / offered;
      expect(step, `${RECORD}: "${pool}" is not worth ${advance} a right answer`)
        .toBeCloseTo(advance, 3);

      let streak = 0;
      let n = 0;
      // Bounded well past the ladder, so a pool that never arrives says so
      // rather than hanging.
      while (n < 500 && dueAt({ seen: n, correct: n, lastSeenAt: 0, streak }) !== MAX_INTERVAL_MS) {
        streak += step;
        n++;
      }
      expect(n >= 500 ? 'never' : String(n),
        `${RECORD}: "${pool}" does not reach the top rung in ${answers}`).toBe(answers);
    }
  });

  it('has a top rung the table was written against', () => {
    /*
      The figures above are all distances to the last rung, so they move
      together if the ladder grows. Named here so a red run points at the
      cause rather than at four separate arithmetic failures.
    */
    expect(INTERVALS_MS.length, `${RECORD}'s table was written for an eight-rung ladder`).toBe(8);
  });
});
