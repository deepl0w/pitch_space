import { describe, expect, it } from 'vitest';
import {
  INTERVALS_MS, completion, dueAt, dueCount, overdueRatio, schedule,
} from './schedule';
import { tallyItems, tallyKey, type ItemTally, type TallyKey } from './progressStore';
import type { ProgressLine } from './line';
import type { Attempt } from './schema';
import type { ItemId, Presentation } from '../exercises/types';

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

/**
 * A line, which is what a tally now hangs from (ADR 0039).
 *
 * The askable set is the line's identity, so a case that schedules a
 * different set is asking about a different line — which is the whole
 * point of the rule and the reason the helpers below take the line rather
 * than assembling one per call.
 */
const lineOver = (
  askable: readonly ItemId[],
  presentation: Presentation = 'listen',
  exercise = 'interval-id',
): ProgressLine => ({ exercise, askable, presentation });

/**
 * Tallies keyed for one line.
 *
 * Taking the line rather than defaulting it, because a map built for a
 * line the caller does not then schedule is a map nothing looks in — every
 * lookup misses, every item reads as never asked, and a case about
 * ordering still passes. `finds a tally it was given` below is the guard
 * against that, and it is new: under the old key a mismatch was far harder
 * to write by accident.
 */
const map = (line: ProgressLine, entries: [ItemId, ItemTally][]): Map<TallyKey, ItemTally> =>
  new Map(entries.map(([item, t]) => [tallyKey(line, item), t]));

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
    const line = lineOver(ITEMS);
    const tallies = map(line, [
      // A year overdue, and still behind a question never asked.
      ['interval:M3:up' as ItemId, tally({ streak: 1, lastSeenAt: 0 })],
    ]);
    const order = schedule(line, tallies, 365 * DAY).map((r) => r.item);

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

    const pair = lineOver(['solid', 'shaky'] as ItemId[]);
    const order = schedule(
      pair,
      map(pair, [['solid' as ItemId, solid], ['shaky' as ItemId, shaky]]),
      now,
    ).map((r) => r.item);
    expect(order).toEqual(['shaky', 'solid']);
  });

  it('gives the same history the same order every time', () => {
    // Two items equally due is the common case at the start of a
    // session, not an edge one, so the tie-break has to be total rather
    // than whatever order the map happened to be built in.
    const line = lineOver(ITEMS);
    const tallies = map(line, ITEMS.map((i) => [i, tally({ lastSeenAt: 0 })]));
    const once = schedule(line, tallies, DAY).map((r) => r.item);
    const again = schedule(line, tallies, DAY).map((r) => r.item);
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
    expect(schedule(lineOver(catalogue), new Map(), DAY).map((r) => r.item))
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
    const line = lineOver(catalogue, 'listen', 'chord-id');
    const seen = map(line, [['chord:maj' as ItemId, tally({ streak: 1, lastSeenAt: 0 })]]);
    expect(schedule(line, seen, 365 * DAY).map((r) => r.item))
      .toEqual(['chord:min', 'chord:maj']);
  });

  it('proposes only what the settings allow, and reads no other line\'s history', () => {
    /*
      **The old claim became structural and a new one took its place.**
      It used to be that a narrower askable list limited the proposals
      while the same tallies were still read — the schedule was given the
      pool and the history separately and could have ignored the pool.
      It cannot now: 0039 makes the askable set the line's identity, so
      the pool *is* what is proposed and nothing else can be.

      What is worth asserting instead is the consequence that replaced
      it. Unticking two of three intervals does not narrow a line, it
      starts a different one — and that line has no history, however much
      sits behind the pool it was cut from. The user chose this reading
      knowing it loses visible progress, and it is the thing most likely
      to be read as a bug, so it is asserted rather than assumed.
    */
    const wide = lineOver(ITEMS);
    const tallies = map(wide, ITEMS.map((i) => [i, tally({ streak: 4, lastSeenAt: 0 })]));

    const narrow = lineOver(['interval:m2:up'] as ItemId[]);
    const proposed = schedule(narrow, tallies, DAY);

    expect(proposed.map((r) => r.item)).toEqual(['interval:m2:up']);
    expect(proposed[0].tally, 'the narrowed line inherited the wider line\'s history')
      .toBeNull();
    // The control: that history is real and findable under its own line,
    // so "null" above is the line changing rather than the map being empty.
    expect(schedule(wide, tallies, DAY)[0].tally).not.toBeNull();
  });

  it('keeps the two presentations apart', () => {
    // ADR 0010's distinction, carried through to the schedule: hearing a
    // third and reading one are different skills, so practising one must
    // not mark the other as rested.
    const only = ['interval:M3:up'] as ItemId[];
    const byEar = lineOver(only, 'listen');
    const onPaper = lineOver(only, 'read');
    const heard = map(byEar, [['interval:M3:up' as ItemId, tally({ streak: 5, lastSeenAt: DAY })]]);
    const now = DAY + HOUR;

    expect(dueCount(byEar, heard, now)).toBe(0);
    expect(dueCount(onPaper, heard, now)).toBe(1);
  });
});

describe('counting what is due', () => {
  const ITEMS = ['a', 'b', 'c'] as ItemId[];

  it('counts everything unseen, because unseen is due', () => {
    expect(dueCount(lineOver(ITEMS), new Map(), DAY)).toBe(3);
  });

  it('stops counting an item while it is resting, and resumes when it is not', () => {
    const line = lineOver(['a'] as ItemId[]);
    const rested = map(line, [['a' as ItemId, tally({ streak: 4, lastSeenAt: 0 })]]);
    const interval = INTERVALS_MS[4];
    expect(dueCount(line, rested, interval - 1)).toBe(0);
    expect(dueCount(line, rested, interval)).toBe(1);
  });

  it('finds a tally it was given, which everything above depends on', () => {
    /*
      The guard the new key needs and the old one did not. A tally map
      built for one line and handed to another is a map nothing looks in:
      every lookup misses, every item reads as never asked, and most cases
      in this file still pass. Under `presentation:item` that mismatch was
      hard to write by accident; under a key carrying the whole askable
      set it is one wrong fixture away.
    */
    const line = lineOver(['a'] as ItemId[]);
    const rested = map(line, [['a' as ItemId, tally({ streak: 4, lastSeenAt: 0 })]]);
    expect(schedule(line, rested, 0)[0].tally, 'the map was built under a different line')
      .not.toBeNull();
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
    // Declared, because the fold skips an attempt with no askable set —
    // practice that counts towards nothing (0041) and history written
    // before lines existed (0042). A fixture that omitted it would make
    // every case below assert over an empty map.
    askable: ['interval:M3:up'] as ItemId[],
    outcomes: [{ item: 'interval:M3:up' as ItemId, correct }],
    correct,
  });

  /** The line those attempts belong to, which is what their tally hangs from. */
  const line = lineOver(['interval:M3:up'] as ItemId[], 'listen');

  it('counts only the run ending at the most recent attempt', () => {
    const history = [attempt(1, true), attempt(2, true), attempt(3, false), attempt(4, true)];
    const got = tallyItems(history).get(tallyKey(line, 'interval:M3:up' as ItemId))!;
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
    const key = tallyKey(line, 'interval:M3:up' as ItemId);
    expect(tallyItems(shuffled).get(key)!.streak).toBe(tallyItems(history).get(key)!.streak);
    expect(tallyItems(history).get(key)!.streak, 'the two orders must differ to discriminate')
      .not.toBe(0);
  });
});

/**
 * Whether the settings can ask a thing, kept apart from whether it is due.
 *
 * ADR 0037: a due item the settings exclude has to be representable, or
 * the schedule silently never shows it and nothing says why. The caller
 * passes a wider `askable` so this can be said at all, which means the
 * two sets have to be distinguishable once they arrive.
 */
describe('an item the settings cannot currently ask', () => {
  const NOW = 1_000_000;

  it('is still scheduled, and marked unreachable rather than dropped', () => {
    const rows = schedule(
      lineOver(['a', 'b', 'c'] as ItemId[], 'read'), new Map(), NOW, new Set(['a', 'c'] as ItemId[]),
    );

    expect(rows.map((r) => r.item).sort()).toEqual(['a', 'b', 'c']);
    expect(rows.find((r) => r.item === 'b')?.reachable).toBe(false);
    expect(rows.filter((r) => r.reachable).map((r) => r.item).sort()).toEqual(['a', 'c']);
  });

  it('is due on its own merits, because reachability is not a kind of dueness', () => {
    /*
      The pair that makes the field worth having. An unreachable item that
      is due is the case the roadmap names — a chord quality that comes
      due while the settings allow triads only — and if `due` quietly
      folded in reachability there would be no way to say it.
    */
    const only = lineOver(['b'] as ItemId[], 'read');
    const seen = new Map([[tallyKey(only, 'b' as ItemId), { seen: 3, correct: 3, lastSeenAt: 0, streak: 1 }]]);
    const [unreachable] = schedule(only, seen, NOW, new Set<ItemId>());

    expect(unreachable.reachable).toBe(false);
    expect(unreachable.tally, 'the history must actually attach').not.toBeNull();
    expect(unreachable.due, 'dueness is about history, not about settings').toBe(true);
  });

  it('treats an absent set as a caller making no claim, not as nothing reachable', () => {
    /*
      The default has to be true. A caller that passes one set is saying
      nothing about a second, and defaulting the other way would mark
      every item of every existing caller unreachable — which reads as a
      working flag and is the opposite of the truth.
    */
    const rows = schedule(lineOver(['a', 'b'] as ItemId[], 'read'), new Map(), NOW);
    expect(rows.every((r) => r.reachable)).toBe(true);
  });
});

/**
 * Completion, which is a claim about the ladder rather than about answers.
 *
 * Asserted as relations — unseen is lower than practised, a narrowed pool
 * cannot flatter a learner, the top rung is reachable only from the top
 * rung — rather than against figures. The ladder is eight rungs today and
 * the comment above it says plainly that the numbers are not validated
 * against retention data, so a test that pinned 0.428 would be pinning a
 * tuning decision and making it unchangeable.
 */
describe('how far a line has advanced', () => {
  const line = (askable: readonly string[]) => ({
    exercise: 'interval-id', presentation: 'listen' as const, askable,
  } as never as Parameters<typeof completion>[0]);

  const at = (streak: number) => ({
    seen: streak, correct: streak, streak, lastSeenAt: 0,
  } as never as ItemTally);

  const tallies = (line: Parameters<typeof completion>[0], by: Record<string, number>) =>
    new Map(Object.entries(by).map(([item, streak]) =>
      [tallyKey(line, item as never), at(streak)] as const));

  it('is nothing at all for a line that can ask nothing', () => {
    // Not zero: an empty pool is a fact about the settings, and reporting it
    // as a figure about the learner is the thing ADR 0037 forbids.
    expect(completion(line([]), new Map())).toBeNull();
  });

  it('is zero when nothing has been practised, and not null', () => {
    const l = line(['a', 'b']);
    expect(completion(l, new Map())).toBe(0);
  });

  it('rises as items climb the ladder and never passes one', () => {
    const l = line(['a', 'b']);
    const none = completion(l, new Map())!;
    const some = completion(l, tallies(l, { a: 1 }))!;
    const more = completion(l, tallies(l, { a: 3 }))!;
    const full = completion(l, tallies(l, { a: 99, b: 99 }))!;
    expect(some).toBeGreaterThan(none);
    expect(more).toBeGreaterThan(some);
    expect(full).toBe(1);
    // A streak past the top rung is still the top rung, not more than full.
    expect(completion(l, tallies(l, { a: 999, b: 999 }))).toBe(1);
  });

  it('divides by what the line can ask, not by what has been practised', () => {
    /*
      The defect this forbids: a learner who has practised one interval of
      five sees 20%, and would see 100% if the denominator were the items
      with a tally rather than the items askable.

      **It is not what stops narrowing a pool flattering a learner**, which
      is what this case claimed when it was written. That protection is
      `lineKey` being built from the askable set, so a narrowed pool is a
      different line and reads 0 — one level above this function, and the
      case below is the one that actually touches it.
    */
    const wide = line(['a', 'b', 'c', 'd', 'e']);
    const practised = tallies(wide, { a: 99 });
    expect(completion(wide, practised)).toBeCloseTo(0.2, 10);
  });

  it('does not count an item practised under another presentation', () => {
    // Reading a third and hearing one are different skills and different
    // lines; `tallyKey` keys on both, and this is what proves completion
    // inherits that rather than summing across them.
    const heard = line(['a']);
    const read = { ...heard, presentation: 'read' } as typeof heard;
    expect(completion(read, tallies(heard, { a: 99 }))).toBe(0);
  });
});
