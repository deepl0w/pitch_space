import { describe, expect, it } from 'vitest';
import { tallyItems, tallyKey } from './progressStore';
import { INTERVALS_MS, completion, dueAt } from './schedule';
import type { ProgressLine } from './line';
import type { Attempt } from './schema';
import type { ItemId, ItemOutcome } from '../exercises/types';
import { EXERCISE_TYPES } from '../exercises/registry';
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
});
