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
