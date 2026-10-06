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
