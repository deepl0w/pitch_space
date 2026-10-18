import { describe, expect, it } from 'vitest';
import { nextWish } from './wish';
import { INTERVALS_MS } from './schedule';
import { tallyKey, type ItemTally, type TallyKey } from './progressStore';
import type { ProgressLine } from './line';
import type { ItemId } from '../exercises/types';

const NOW = 1_000_000_000_000;
const line: ProgressLine = {
  exercise: 'interval-id',
  askable: ['interval:m2:up', 'interval:M2:up', 'interval:m3:up'] as ItemId[],
  presentation: 'listen',
};

/** Seen and resting: right four times running, last asked just now. */
const resting: ItemTally = { seen: 4, correct: 4, lastSeenAt: NOW, streak: 4 };
/** Seen and wrong last time, which the ladder makes due at once. */
const missed: ItemTally = { seen: 1, correct: 0, lastSeenAt: NOW - 1000, streak: 0 };

const tallies = (entries: [string, ItemTally][]): Map<TallyKey, ItemTally> =>
  new Map(entries.map(([item, t]) => [tallyKey(line, item as ItemId), t]));

describe('which item the next question aims at', () => {
  it('starts a new learner at the top of the catalogue, not anywhere', () => {
    expect(nextWish(line, new Map(), NOW)).toBe('interval:m2:up');
  });

  it('meets what has never been asked before reviewing what has', () => {
    const history = tallies([['interval:m2:up', missed]]);
    expect(nextWish(line, history, NOW)).toBe('interval:M2:up');
  });

  it('comes back to a miss, but not as the very next question while anything else is due', () => {
    const history = tallies([
      ['interval:m2:up', missed],
      ['interval:M2:up', { ...missed, lastSeenAt: NOW - 500 }],
      ['interval:m3:up', resting],
    ]);
    const first = nextWish(line, history, NOW);
    expect(first).toBeDefined();
    const second = nextWish(line, history, NOW, first);
    expect(second).toBeDefined();
    expect(second, 'the same item twice running, with another one due').not.toBe(first);
  });

  it('asks the miss again when it is the only thing due', () => {
    const history = tallies([
      ['interval:m2:up', missed],
      ['interval:M2:up', resting],
      ['interval:m3:up', resting],
    ]);
    expect(nextWish(line, history, NOW, 'interval:m2:up' as ItemId)).toBe('interval:m2:up');
  });

  it('aims at nothing when nothing is due, leaving the draw its own', () => {
    const history = tallies(line.askable.map((item) => [item, resting]));
    expect(nextWish(line, history, NOW)).toBeUndefined();
    // And the moment the shortest rest at that rung runs out, it aims again.
    expect(nextWish(line, history, NOW + INTERVALS_MS[4])).toBeDefined();
  });

  it('never aims outside what the settings can ask', () => {
    // History for an item the pool no longer holds is a different line's.
    const narrowed: ProgressLine = { ...line, askable: ['interval:m3:up'] as ItemId[] };
    const history = new Map([[tallyKey(narrowed, 'interval:m3:up' as ItemId), resting]]);
    expect(nextWish(narrowed, history, NOW)).toBeUndefined();
    expect(nextWish(narrowed, new Map(), NOW)).toBe('interval:m3:up');
  });

  it('works through every miss in turn, not the first two in the catalogue', () => {
    /*
      Every item seen and missed, the state a struggling learner reaches.
      A miss is infinitely overdue, and two infinities tied and fell to
      catalogue order, so the queue alternated the first two misses for
      ever. Asked over a whole rotation: each miss once before any twice.
    */
    const wide: ProgressLine = {
      ...line,
      askable: ['interval:m2:up', 'interval:M2:up', 'interval:m3:up', 'interval:M3:up', 'interval:P4:up'] as ItemId[],
    };
    const seen = new Map<string, number>(wide.askable.map((item, i) => [item, NOW - 10_000 + i]));
    const asked: (ItemId | undefined)[] = [];
    let now = NOW;
    let previous: ItemId | undefined;
    for (let round = 0; round < wide.askable.length; round += 1) {
      const history = new Map([...seen].map(([item, at]) => [
        tallyKey(wide, item as ItemId), { ...missed, lastSeenAt: at },
      ]));
      const next = nextWish(wide, history, now, previous);
      asked.push(next);
      now += 1000;
      seen.set(next!, now);
      previous = next;
    }
    expect(new Set(asked).size, `asked ${asked.join(', ')}`).toBe(wide.askable.length);
  });
});

/**
 * The queue as an order, over histories nobody chose by hand.
 *
 * **Asked for after the ping-pong, and shaped by what is actually
 * observable.** The defect was `Infinity − Infinity` reaching `sort` as
 * `NaN`: the comparison said "tie", the tie fell to catalogue index, and a
 * learner who had missed everything was asked the first two items for ever.
 *
 * There is no assertion to write that reads "no NaN". `schedule` builds its
 * rows from `line.askable` in order and exposes no ratio, so a comparator
 * that returns nonsense is invisible at the boundary — except in what it
 * does to the sequence a learner is given. So the sequence is the test:
 * an inconsistent comparator cannot rotate through a pool, and a total
 * order must.
 */
describe('the queue over histories nobody chose', () => {
  /** A small deterministic generator, so any failure reproduces exactly. */
  function rng(seed: number): () => number {
    let s = (seed * 2654435761) >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }

  const poolOf = (n: number): ProgressLine => ({
    exercise: 'interval-id',
    askable: Array.from({ length: n }, (_, i) => `interval:p${i}:up` as ItemId),
    presentation: 'listen',
  });

  /**
   * Practising the queue, as a session does: ask what it wishes for, record
   * the miss, move the clock on.
   *
   * Recording matters — without it the history never changes and any
   * comparator ping-pongs, which would make this pass against the defect.
   */
  function askedOver(line: ProgressLine, start: Map<TallyKey, ItemTally>, rounds: number) {
    const history = new Map(start);
    const asked: ItemId[] = [];
    let now = NOW;
    let previous: ItemId | undefined;

    for (let i = 0; i < rounds; i += 1) {
      const wish = nextWish(line, history, now, previous);
      if (wish === undefined) break;
      asked.push(wish);
      history.set(tallyKey(line, wish), { seen: 2, correct: 0, lastSeenAt: now, streak: 0 });
      previous = wish;
      now += 60_000;
    }
    return asked;
  }

  it('works through every miss, over every pool size a line can have', () => {
    for (const size of [2, 3, 5, 8, 11, 20]) {
      const line = poolOf(size);
      const everythingMissed = new Map<TallyKey, ItemTally>(line.askable.map((item) => [
        tallyKey(line, item), { seen: 1, correct: 0, lastSeenAt: NOW - 1000, streak: 0 },
      ]));

      // Three times round is room enough; the defect never reached three.
      const asked = askedOver(line, everythingMissed, size * 3);
      expect(new Set(asked).size, `a pool of ${size} never got past ${new Set(asked).size} of them`)
        .toBe(size);
    }
  });

  it('never asks the same item twice running while another is due', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const next = rng(seed);
      const line = poolOf(2 + Math.floor(next() * 10));
      const history = new Map<TallyKey, ItemTally>();
      for (const item of line.askable) {
        // A quarter never asked, the rest seen with a spread of ages and streaks.
        if (next() < 0.25) continue;
        const streak = Math.floor(next() * 5);
        history.set(tallyKey(line, item), {
          seen: streak + 1,
          correct: streak,
          lastSeenAt: NOW - Math.floor(next() * INTERVALS_MS[INTERVALS_MS.length - 1] * 2),
          streak,
        });
      }

      const asked = askedOver(line, history, 12);
      const repeats = asked.filter((item, i) => i > 0 && item === asked[i - 1]);
      /*
        A repeat is allowed only where the pool offered nothing else — the
        documented fallback, and the one case `nextWish` is explicit about.
        Anything else is the drill a learner did not choose.
      */
      expect(repeats.length === 0 || line.askable.length === 1,
        `seed ${seed}: ${JSON.stringify(asked)}`).toBe(true);
    }
  });
});
