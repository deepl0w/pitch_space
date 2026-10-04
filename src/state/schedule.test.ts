import { describe, expect, it } from 'vitest';
import {
  INTERVALS_MS, dueAt, dueCount, overdueRatio, schedule,
} from './schedule';
import { tallyItems, tallyKey, type ItemTally, type TallyKey } from './progressStore';
import type { Attempt } from './schema';
import type { ItemId } from '../exercises/types';

/**
 * What the schedule owes, which is less than an SRS paper and more than
 * nothing.
 *
 * The intervals themselves are not asserted anywhere. They are a starting
 * point rather than a measurement — nothing here has been validated
 * against retention data — and a test that pinned them would make tuning
 * them a test change, which is the same complaint this project already
 * makes about pinning the generator's weights. What is asserted is the
 * structure: that the spacing expands, that being wrong costs it, that
 * the order is total, and that the settings bound what can be proposed.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function tally(over: Partial<ItemTally> = {}): ItemTally {
  return { seen: 1, correct: 1, lastSeenAt: 0, streak: 1, ...over };
}

const map = (entries: [ItemId, ItemTally][]): Map<TallyKey, ItemTally> =>
  new Map(entries.map(([item, t]) => [tallyKey(item, 'listen'), t]));

describe('when an item comes back', () => {
  it('rests longer after each consecutive correct answer', () => {
    const gaps = INTERVALS_MS.map((_, streak) => dueAt(tally({ streak })) - 0);
    for (let i = 1; i < gaps.length; i += 1) {
      expect(gaps[i], `streak ${i} rests no longer than streak ${i - 1}`)
        .toBeGreaterThan(gaps[i - 1]);
    }
  });

  it('comes back immediately after a wrong answer, however long the streak was', () => {
    // The reason the tally carries a streak rather than a ratio. An item
    // answered right nine times and then wrong is not 90% learned; it has
    // just been forgotten, and nine old successes must not buy it a rest.
    const longStreak = tally({ seen: 10, correct: 9, streak: 9, lastSeenAt: 1000 });
    const justWrong = tally({ seen: 10, correct: 9, streak: 0, lastSeenAt: 1000 });

    expect(dueAt(longStreak)).toBeGreaterThan(1000 + DAY);
    expect(dueAt(justWrong)).toBe(1000);
  });

  it('stops growing rather than running away past the cap', () => {
    const capped = dueAt(tally({ streak: INTERVALS_MS.length - 1 }));
    expect(dueAt(tally({ streak: 500 }))).toBe(capped);
  });
});

describe('ordering what is worth asking', () => {
  const ITEMS = ['interval:M3:up', 'interval:P5:up', 'interval:m2:up'] as ItemId[];

  it('puts what has never been asked ahead of what is merely overdue', () => {
    /*
      A decision, not a fallthrough. An unseen item is not overdue by any
      amount — it is unmeasured — so sorting it among the others means
      inventing the number you then sort on. It also happens to be what a
      learner wants: the quickest route to knowing where you stand is to
      be asked each thing once.
    */
    const tallies = map([
      // A year overdue, and still behind a question never asked.
      ['interval:M3:up' as ItemId, tally({ streak: 1, lastSeenAt: 0 })],
    ]);
    const order = schedule(ITEMS, tallies, 'listen', 365 * DAY).map((r) => r.item);

    expect(order[0]).not.toBe('interval:M3:up');
    expect(order[order.length - 1]).toBe('interval:M3:up');
  });

  it('ranks by how far past its own schedule an item is, not by raw lateness', () => {
    /*
      The case that makes the ratio worth having instead of `now -
      dueAt`. A well-known item on a fortnight's rest overshoots by large
      numbers simply because its interval is large; a shaky one on a
      two-minute rest can be twenty times past its schedule and still be
      "less late" in milliseconds. The shaky one is the one to ask.
    */
    const now = 30 * DAY;
    const shaky = tally({ streak: 1, lastSeenAt: now - HOUR });
    const solid = tally({ streak: INTERVALS_MS.length - 1, lastSeenAt: now - 20 * DAY });

    expect(now - dueAt(solid), 'the solid item is later in raw milliseconds')
      .toBeGreaterThan(now - dueAt(shaky));
    expect(overdueRatio(shaky, now)).toBeGreaterThan(overdueRatio(solid, now));

    const order = schedule(
      ['solid', 'shaky'] as ItemId[],
      map([['solid' as ItemId, solid], ['shaky' as ItemId, shaky]]),
      'listen',
      now,
    ).map((r) => r.item);
    expect(order).toEqual(['shaky', 'solid']);
  });

  it('gives the same history the same order every time', () => {
    // Two items equally due is the common case at the start of a
    // session, not an edge one, so the tie-break has to be total rather
    // than whatever order the map happened to be built in.
    const tallies = map(ITEMS.map((i) => [i, tally({ lastSeenAt: 0 })]));
    const once = schedule(ITEMS, tallies, 'listen', DAY).map((r) => r.item);
    const again = schedule(ITEMS, tallies, 'listen', DAY).map((r) => r.item);
    expect(again).toEqual(once);
  });

  it('introduces unseen items in the order the exercise lists them', () => {
    /*
      The cold-start half of the job, and the reason the tie-break is
      the input order rather than the item id.

      History answers *review* order and cannot answer *introduction*
      order: a new user has none, on the first session, which is when an
      order matters most. `items(settings)` returns the catalogue's own
      order, and every catalogue here is written deliberately — common
      scales before modes before octatonics, triads before sevenths
      before altered dominants. Sorted by id instead, a learner met the
      twenty-four chord qualities alphabetically, starting at the
      augmented triad.

      This test is the one that would have passed under the old
      behaviour only by accident, so it is written with an order that
      alphabetical gets wrong.
    */
    const catalogue = ['chord:maj', 'chord:min', 'chord:dim', 'chord:aug'] as ItemId[];
    expect(schedule(catalogue, new Map(), 'listen', DAY).map((r) => r.item))
      .toEqual(catalogue);
    expect([...catalogue].sort(), 'alphabetical would give a different answer')
      .not.toEqual(catalogue);
  });

  it('still prefers a forgotten item to an unmet one it lists earlier', () => {
    // Introduction order decides between items with no history. It must
    // not outrank history where there is some — the unseen-first rule
    // comes before the tie-break, and both come after it for items that
    // have been seen.
    const catalogue = ['chord:maj', 'chord:min'] as ItemId[];
    const seen = map([['chord:maj' as ItemId, tally({ streak: 1, lastSeenAt: 0 })]]);
    expect(schedule(catalogue, seen, 'listen', 365 * DAY).map((r) => r.item))
      .toEqual(['chord:min', 'chord:maj']);
  });

  it('proposes only what the settings allow', () => {
    // A user who has unticked everything but one interval has one askable
    // item, however much history sits behind the others. A schedule that
    // ignored that would keep proposing questions the exercise cannot ask.
    const tallies = map(ITEMS.map((i) => [i, tally({ lastSeenAt: 0 })]));
    const narrowed = schedule(['interval:m2:up'] as ItemId[], tallies, 'listen', DAY);
    expect(narrowed.map((r) => r.item)).toEqual(['interval:m2:up']);
  });

  it('keeps the two presentations apart', () => {
    // ADR 0010's distinction, carried through to the schedule: hearing a
    // third and reading one are different skills, so practising one must
    // not mark the other as rested.
    const heard = map([['interval:M3:up' as ItemId, tally({ streak: 5, lastSeenAt: DAY })]]);
    const now = DAY + HOUR;
    expect(dueCount(['interval:M3:up'] as ItemId[], heard, 'listen', now)).toBe(0);
    expect(dueCount(['interval:M3:up'] as ItemId[], heard, 'read', now)).toBe(1);
  });
});

describe('counting what is due', () => {
  const ITEMS = ['a', 'b', 'c'] as ItemId[];

  it('counts everything unseen, because unseen is due', () => {
    expect(dueCount(ITEMS, new Map(), 'listen', DAY)).toBe(3);
  });

  it('stops counting an item while it is resting, and resumes when it is not', () => {
    const rested = map([['a' as ItemId, tally({ streak: 4, lastSeenAt: 0 })]]);
    const interval = INTERVALS_MS[4];
    expect(dueCount(['a'] as ItemId[], rested, 'listen', interval - 1)).toBe(0);
    expect(dueCount(['a'] as ItemId[], rested, 'listen', interval)).toBe(1);
  });
});

/**
 * The fold the schedule reads, checked for the property the schedule
 * depends on and nothing else did.
 */
describe('the streak the schedule reads', () => {
  const attempt = (answeredAt: number, correct: boolean): Attempt => ({
    id: `a${answeredAt}`,
    exerciseType: 'interval-id',
    presentation: 'listen',
    seed: 1,
    settings: {},
    startedAt: answeredAt,
    answeredAt,
    items: ['interval:M3:up'] as ItemId[],
    outcomes: [{ item: 'interval:M3:up' as ItemId, correct }],
    correct,
  });

  it('counts only the run ending at the most recent attempt', () => {
    const history = [attempt(1, true), attempt(2, true), attempt(3, false), attempt(4, true)];
    const got = tallyItems(history).get(tallyKey('interval:M3:up' as ItemId, 'listen'))!;
    expect({ seen: got.seen, correct: got.correct, streak: got.streak })
      .toEqual({ seen: 4, correct: 3, streak: 1 });
  });

  it('does not depend on the order the attempts arrive in', () => {
    /*
      The streak is the one field whose value depends on the order, so
      `tallyItems` sorts rather than trusting its caller. The store does
      read the log in `answeredAt` order today — which is exactly why this
      is worth a test: the guard is invisible until something hands it an
      unsorted history, and then it is the difference between a streak of
      one and a streak of three.
    */
    const history = [attempt(1, true), attempt(2, true), attempt(3, false), attempt(4, true)];
    // The shuffle has to end on a *different* answer from the true last
    // one, or the fold lands on the same streak by luck and the test
    // passes with the sort removed. The first version of this did exactly
    // that: it reordered the middle and still finished on the correct
    // answer at t=4, so it asserted nothing. Here the unsorted fold
    // finishes on the wrong answer at t=3 and would read streak 0.
    const shuffled = [history[0], history[1], history[3], history[2]];
    const key = tallyKey('interval:M3:up' as ItemId, 'listen');
    expect(tallyItems(shuffled).get(key)!.streak).toBe(tallyItems(history).get(key)!.streak);
    expect(tallyItems(history).get(key)!.streak, 'the two orders must differ to discriminate')
      .not.toBe(0);
  });
});
