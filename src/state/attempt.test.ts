import { describe, expect, it } from 'vitest';
import { attemptFrom } from './attempt';
import { tallyItems, tallyKey } from './progressStore';
import { dueAt } from './schedule';
import { coerceAttempt } from './schema';
import type { ExerciseBase, Result } from '../exercises/types';

/**
 * The join between what the screen stamps and what the scheduler reads.
 *
 * Both ends had suites and neither had been checked against the other's
 * output: the store suite feeds hand-built attempts, and nothing built one
 * the way the app does. `tallyKey` composes presentation with item, so an
 * attempt whose presentation disagrees with its items produces a key the
 * fold cannot find — and the symptom is not an error, it is a tally that
 * never moves while every test passes.
 */

const round = (over: Partial<{ exercise: ExerciseBase; settings: unknown }> = {}) => ({
  id: 'round-1',
  startedAt: 1_000,
  settings: { clef: 'treble' },
  exercise: {
    type: 'interval-id',
    seed: 42,
    presentation: 'read' as const,
    items: ['interval:P5:up'],
  } as unknown as ExerciseBase,
  ...over,
});

const result = (correct: boolean): Result => ({
  correct,
  feedback: correct ? 'Yes' : 'No',
  outcomes: [{ item: 'interval:P5:up', correct }],
});

describe('an attempt built the way the screen builds one', () => {
  it('survives the coercion the log puts it through', () => {
    // Round-trip rather than a type assertion: the attempt is written
    // through a validator on the way to storage, and a field the screen
    // stamps in a shape the validator repairs would be silently altered
    // between answering and reading back.
    const attempt = attemptFrom(round(), 'interval-id', result(true), 2_000);
    expect(coerceAttempt(attempt)).toEqual(attempt);
  });

  it('folds into a tally the schedule can find and read', () => {
    /*
      The whole point. A key the fold cannot find produces an empty map
      rather than an error, so the control below is what stops this
      passing on a tally that was never built.
    */
    const attempt = attemptFrom(round(), 'interval-id', result(true), 2_000);
    const tallies = tallyItems([attempt]);

    expect(tallies.size, 'nothing was folded, so nothing below is asserted').toBe(1);
    const tally = tallies.get(tallyKey('interval:P5:up', 'read'));
    expect(tally, 'the key the screen stamps is not the key the fold builds').toBeDefined();
    expect(tally).toMatchObject({ seen: 1, correct: 1, streak: 1 });
    expect(dueAt(tally!)).toBeGreaterThan(attempt.answeredAt);
  });

  it('keys on the presentation the exercise was asked in, not another', () => {
    // The pair that makes the key composite rather than decorative: the
    // same item heard and read are two skills (ADR 0010), so a tally
    // found under the wrong presentation would credit the wrong one.
    const attempt = attemptFrom(round(), 'interval-id', result(true), 2_000);
    const tallies = tallyItems([attempt]);

    expect(tallies.get(tallyKey('interval:P5:up', 'listen'))).toBeUndefined();
    expect(tallies.get(tallyKey('interval:P5:up', 'read'))).toBeDefined();
  });

  it('copies the items, so the record cannot be edited by the round', () => {
    const items = ['interval:P5:up'];
    const exercise = { ...round().exercise, items } as unknown as ExerciseBase;
    const attempt = attemptFrom(round({ exercise }), 'interval-id', result(true), 2_000);

    items.push('interval:m3:down');
    expect(attempt.items, 'the attempt shares the round’s array').toEqual(['interval:P5:up']);
  });

  it('carries the round’s own verdict, which no fold recomputes', () => {
    /*
      `correct` is stamped beside the outcomes and is not derived from
      them by anything downstream — `tallyItems` folds outcomes and never
      reads it. So nothing else in the suite can catch it being wrong:
      hard-coding it to true left every other case here green.
    */
    expect(attemptFrom(round(), 'interval-id', result(true), 2_000).correct).toBe(true);
    expect(attemptFrom(round(), 'interval-id', result(false), 2_000).correct).toBe(false);
  });

  it('records a wrong answer as seen but not correct, and resets the streak', () => {
    const wrong = attemptFrom(round(), 'interval-id', result(false), 2_000);
    const tally = tallyItems([wrong]).get(tallyKey('interval:P5:up', 'read'));
    expect(tally).toMatchObject({ seen: 1, correct: 0, streak: 0 });
  });
});

/**
 * A sequence rather than a single answer, which is where the streak lives.
 *
 * Every case above folds one attempt. `streak` is the only field in a tally
 * whose value depends on more than one of them, and it is the only field
 * `dueAt` reads — so the half of this join that decides when an item comes
 * back had not been travelled at all.
 *
 * It is also the half where order matters. `tallyItems` sorts by
 * `answeredAt` rather than trusting the array, and nothing had asked it to
 * demonstrate that over attempts built the way the screen builds them.
 */
describe('several attempts on one item', () => {
  const KEY = tallyKey('interval:P5:up' as never, 'read');

  /** One attempt per verdict, a minute apart, in the order given. */
  const sequence = (verdicts: readonly boolean[]) => verdicts.map((correct, i) =>
    attemptFrom(
      { ...round(), id: `round-${i}` },
      'interval-id',
      result(correct),
      10_000 + i * 60_000,
    ));

  it('builds a streak the schedule spaces on', () => {
    const tally = tallyItems(sequence([true, true, true]));
    const entry = tally.get(KEY)!;
    expect(entry.seen).toBe(3);
    expect(entry.correct).toBe(3);
    expect(entry.streak).toBe(3);

    // And the spacing follows it rather than the count: three right in a row
    // is further out than one, which is the whole point of a streak.
    const one = tallyItems(sequence([true])).get(KEY)!;
    expect(dueAt(entry)).toBeGreaterThan(dueAt(one));
  });

  it('brings the item straight back when the last answer is wrong', () => {
    const tally = tallyItems(sequence([true, true, false])).get(KEY)!;
    expect(tally.seen, 'a wrong answer is still a sighting').toBe(3);
    expect(tally.correct, 'and still only two of them were right').toBe(2);
    expect(tally.streak).toBe(0);
    // `dueAt` on a zero streak is the item's own last-seen time, so it is
    // due the moment it was answered rather than at some interval after.
    expect(dueAt(tally)).toBeLessThanOrEqual(tally.lastSeenAt);
  });

  it('reads the order off the clock, not off the array', () => {
    /*
      `tallyItems` sorts by `answeredAt` because `streak` is the one field
      whose value depends on the order. Asserted both ways round, because a
      fold that ignored the sort would agree with one of them: a wrong
      answer last in time must zero the streak however early it sits in the
      array, and a wrong answer *first* in time must not.
    */
    const [first, second, third] = sequence([true, true, false]);
    expect(tallyItems([third, first, second]).get(KEY)!.streak,
      'a wrong answer last in time did not end the streak').toBe(0);

    const [early, middle, late] = sequence([false, true, true]);
    expect(tallyItems([late, early, middle]).get(KEY)!.streak,
      'a wrong answer first in time ended a streak it precedes').toBe(2);
  });

  it('keeps the same item separate under each presentation', () => {
    /*
      Hearing an interval and reading one are different skills and ADR 0010
      makes the presentation part of the attempt for that reason. The fold
      composes it into the key, so the two should not share a streak — and
      the failure would be silent: one tally twice the size, spaced as
      though the learner had practised twice as much.
    */
    const byEar = sequence([true, true]).map((a) => ({ ...a, presentation: 'listen' as const }));
    const onPaper = sequence([true]);
    const tally = tallyItems([...byEar, ...onPaper]);

    expect(tally.get(tallyKey('interval:P5:up' as never, 'listen'))!.streak).toBe(2);
    expect(tally.get(KEY)!.streak).toBe(1);
    expect(tally.size, 'the two presentations folded into one entry').toBe(2);
  });
});

/**
 * Practice that counts towards nothing, which is a recorded attempt with
 * no outcomes.
 *
 * [ADR 0041](../../docs/adr/0041-practice-that-counts-towards-nothing.md)
 * makes untracked practice a mode an exercise declares rather than an
 * absence of recording: the attempt is written, `items` says what the
 * rendering contained, and nothing is credited. That is 0007's machinery
 * reused rather than a new field — an outcome is a claim the user was
 * asked *and that the answer counts*.
 *
 * The mechanism already works, because `tallyItems` folds outcomes and an
 * empty list contributes nothing. **Nothing asserted it**, and the half
 * that matters is not that an untracked attempt adds nothing — it is that
 * it does not *disturb* what a tracked one built. A fold that stamped
 * `lastSeenAt` from every attempt it saw, say, would leave the streak
 * intact and still move the due date, and twenty minutes of untracked
 * practice would quietly reschedule a line the learner never advanced.
 */
describe('an attempt that counts towards nothing', () => {
  const KEY = tallyKey('interval:P5:up' as never, 'read');

  /** What 0041 describes: what it contained, crediting nothing. */
  const untracked = (answeredAt: number) => ({
    ...attemptFrom({ ...round(), id: `untracked-${answeredAt}` }, 'interval-id',
      { correct: false, feedback: '', outcomes: [] }, answeredAt),
  });

  it('still records what the rendering contained', () => {
    // Not an absence of recording: "you practised for twenty minutes and
    // the app has no idea" is the answer 0041 rejected, and an attempt is
    // also how a defect gets reported by its seed.
    const attempt = untracked(5_000);
    expect(attempt.items).toEqual(['interval:P5:up']);
    expect(attempt.outcomes).toEqual([]);
    expect(coerceAttempt(attempt), 'the log would not carry it').toEqual(attempt);
  });

  it('folds into no tally at all', () => {
    expect(tallyItems([untracked(5_000)]).size).toBe(0);
  });

  it('leaves a tracked line exactly where it was', () => {
    /*
      The half that matters. Three tracked answers build a streak and a due
      date; an untracked attempt on the same item afterwards must change
      neither — not the streak, not the count, and not `lastSeenAt`, which
      is what `dueAt` adds its interval to.
    */
    const tracked = [10_000, 70_000, 130_000].map((at, i) => attemptFrom(
      { ...round(), id: `tracked-${i}` }, 'interval-id', result(true), at,
    ));

    const before = tallyItems(tracked).get(KEY)!;
    const after = tallyItems([...tracked, untracked(200_000)]).get(KEY)!;

    expect(after).toEqual(before);
    expect(dueAt(after), 'untracked practice moved when the item is next due')
      .toBe(dueAt(before));
    // And the control: the tracked attempts did build something, or
    // "unchanged" is a statement about nothing.
    expect(before.streak).toBe(3);
  });
});

/**
 * History written before a line existed.
 *
 * The user's ruling, 6 October: history is highly changeable while the
 * project is young and need not survive a release; when settings settle,
 * a porting and versioning system is owed. So a v2 attempt gets no
 * askable set, joins no line, and is **kept** — a step that dropped rows
 * would leave that owed system nothing to port.
 */
describe('an attempt from before the askable set existed', () => {
  const v2 = {
    id: 'old-1',
    exerciseType: 'interval-id',
    seed: 7,
    settings: { semitones: [1, 2] },
    presentation: 'read' as const,
    startedAt: 1_000,
    answeredAt: 2_000,
    items: ['interval:m2:up'],
    outcomes: [{ item: 'interval:m2:up', correct: true }],
    correct: true,
  };

  it('is read rather than rejected, and keeps everything it had', () => {
    const read = coerceAttempt(v2);
    expect(read.askable, 'a set was invented for a row that has none').toBeUndefined();
    expect(read.outcomes, 'the history itself was dropped').toEqual(v2.outcomes);
  });

  it('does not acquire an empty set, which would be a line of its own', () => {
    /*
      The failure this guards is quiet: `askable: []` keys to a real line
      — the one whose answer space is empty — so every pre-line attempt
      in a user's history would fold into one shared bucket and appear as
      progress against nothing.
    */
    expect('askable' in coerceAttempt(v2)).toBe(false);
  });

  it('refuses a row whose set is there but unreadable', () => {
    // Absent is a fact about when it was written; malformed is a row that
    // cannot be trusted, and this file skips those rather than repairing.
    expect(() => coerceAttempt({ ...v2, askable: 'interval:m2:up' })).toThrow(/askable/);
    expect(() => coerceAttempt({ ...v2, askable: [1, 2] })).toThrow(/askable/);
  });

  it('keeps a set that is there', () => {
    const read = coerceAttempt({ ...v2, askable: ['interval:m2:up', 'interval:M2:up'] });
    expect(read.askable).toEqual(['interval:m2:up', 'interval:M2:up']);
  });
});

/**
 * The answer space an attempt belongs to.
 *
 * ADR 0039: a line is identified by what the settings could have asked,
 * so the attempt has to carry that set — settings get migrated and the
 * identity must not move when they do. ADR 0041: an attempt with no set
 * joins no line, which is how practice that counts towards nothing is
 * expressed rather than by a flag.
 */
describe('the askable set an attempt carries', () => {
  const pool = ['interval:m2:up', 'interval:M2:up'];

  it('is kept, so a line can be identified without reading settings', () => {
    const a = attemptFrom(round(), 'interval-id', result(true), 2_000, pool);
    expect(a.askable).toEqual(pool);
  });

  it('is copied, so the caller cannot edit a stored record', () => {
    // The same aliasing the exercise's own `choices` was fixed for: a
    // record that *is* the array someone else holds is not a record.
    const live = [...pool];
    const a = attemptFrom(round(), 'interval-id', result(true), 2_000, live);
    live.push('interval:m3:up');
    expect(a.askable).toEqual(pool);
  });

  it('is absent rather than empty when there is none', () => {
    /*
      The distinction with teeth. `[]` is a real answer space — the empty
      one — and keys to a real line, so defaulting to it would fold every
      untracked attempt into a single bucket reading as progress against
      nothing. Absent is the only encoding of "no line".
    */
    const a = attemptFrom(round(), 'interval-id', result(true), 2_000);
    expect('askable' in a).toBe(false);
  });

  it('survives the coercion the log puts it through', () => {
    const a = attemptFrom(round(), 'interval-id', result(true), 2_000, pool);
    expect(coerceAttempt(a)).toEqual(a);
  });
});
