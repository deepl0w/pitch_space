import { tallyKey, type ItemTally, type TallyKey } from './progressStore';
import type { ItemId, Presentation } from '../exercises/types';

/**
 * When each thing is worth asking again.
 *
 * This is the app's reason for existing — a platform for spaced repetition
 * of musical exercises — and until now nothing read the attempt log to
 * decide anything. The log was written, folded into per-item tallies and
 * printed beside the answer, and the next question was a fresh random
 * seed. A record nothing schedules from is a scoreboard.
 *
 * Pure, and the clock arrives as an argument. `theory/` and `generate/`
 * are already barred from reading the clock so an exercise reproduces from
 * its seed; this is not under that rule, but the same discipline is worth
 * more here than anywhere — a scheduler that reads `Date.now()` internally
 * can only be tested by waiting.
 */

/**
 * How long an item rests after each consecutive correct answer.
 *
 * Expanding, roughly doubling, and the first two are deliberately short: a
 * learner who has just got something right once has not learned it, and
 * the half-hour step is what makes a single session feel like practice
 * rather than a quiz. The tail is capped at a fortnight because this is a
 * practice app and an interval longer than the gap between sessions is
 * indistinguishable from "never again".
 *
 * Indexed by streak, so index 0 is never used — an item with no correct
 * answers behind it is due now, which {@link dueAt} returns without
 * consulting this table.
 *
 * These are a starting point and not a measurement. Nothing here has been
 * validated against retention data and it would be dishonest to imply
 * otherwise; what the structure buys is that tuning them is a change to
 * one array.
 */
export const INTERVALS_MS: readonly number[] = [
  0,
  2 * 60 * 1000,
  30 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
];

/** The longest an item ever rests, whatever its streak. */
export const MAX_INTERVAL_MS = INTERVALS_MS[INTERVALS_MS.length - 1];

/**
 * When this item next wants asking.
 *
 * A wrong answer resets the streak to zero and so brings the item back
 * immediately, which is the whole point of tracking a streak rather than a
 * ratio: being wrong once should cost the spacing, not a fraction of it.
 */
export function dueAt(tally: ItemTally): number {
  const interval = INTERVALS_MS[Math.min(tally.streak, INTERVALS_MS.length - 1)];
  return tally.lastSeenAt + interval;
}

/**
 * How overdue an item is, as a multiple of the rest it was given.
 *
 * Used for ordering rather than for deciding. Comparing raw overdue
 * *times* would put every item on its longest interval ahead of
 * everything else the moment a fortnight passed, because a big interval
 * overshoots by big numbers; comparing against the interval asks "how far
 * past its own schedule is this", which is the question.
 *
 * Something never seen has no interval to be a multiple of, and is handled
 * ahead of this rather than inside it.
 */
export function overdueRatio(tally: ItemTally, now: number): number {
  const interval = INTERVALS_MS[Math.min(tally.streak, INTERVALS_MS.length - 1)];
  if (interval === 0) return Number.POSITIVE_INFINITY;
  return (now - tally.lastSeenAt) / interval;
}

/** What is known about one askable item at a moment in time. */
export interface ScheduledItem {
  item: ItemId;
  /** Null when the item has never been tested in this presentation. */
  tally: ItemTally | null;
  due: boolean;
}

/**
 * Everything askable, in the order it is worth asking.
 *
 * `askable` is what the exercise's current settings allow — a user who has
 * unticked every degree but the fourth has one askable item however much
 * history sits behind the others, and a schedule that ignored the settings
 * would keep proposing questions the exercise cannot ask.
 *
 * **Unseen items come first, and that is a decision rather than a
 * fallthrough.** An item with no history is not overdue by any amount; it
 * is unmeasured, and a scheduler that sorted it by a made-up overdue ratio
 * would be inventing the number it then sorted on. Showing it first is
 * also what a learner wants: the fastest route to knowing where they stand
 * is to be asked each thing once.
 *
 * **Ties are broken by the order `askable` came in, not by the item id.**
 * That is the whole of the cold-start answer and it is worth saying why
 * alphabetical was wrong rather than merely arbitrary.
 *
 * A schedule has two jobs and the attempt log can only do one of them.
 * *Review* order comes from history — what you have forgotten, and when.
 * *Introduction* order cannot: a new user has no history, on the first
 * session, which is exactly when an order matters most. Sorting the
 * unseen by id meant a learner met the twenty-four chord qualities
 * alphabetically, starting at the augmented triad.
 *
 * The order `items(settings)` returns is the catalogue's own, and every
 * catalogue in this project is written in a deliberate order — the
 * common scales before the modes before the octatonics, the triads
 * before the sevenths before the altered dominants, intervals by
 * widening span. That is an author's judgement about where to start,
 * which is the one thing a grade column was ever good for and the half
 * worth keeping (ADR 0027's addendum). It differs from a grade in that
 * nothing *filters* on it: it decides what you meet first and never what
 * you are allowed to meet.
 *
 * The order stays total and deterministic, which is what the tie-break
 * is for: the same history always produces the same queue.
 */
export function schedule(
  askable: readonly ItemId[],
  tallies: ReadonlyMap<TallyKey, ItemTally>,
  presentation: Presentation,
  now: number,
): ScheduledItem[] {
  const rows = askable.map((item, index): ScheduledItem & { index: number } => {
    const tally = tallies.get(tallyKey(item, presentation)) ?? null;
    return { item, tally, due: tally === null || dueAt(tally) <= now, index };
  });

  return rows.sort((a, b) => {
    if ((a.tally === null) !== (b.tally === null)) return a.tally === null ? -1 : 1;
    if (a.tally !== null && b.tally !== null) {
      const byOverdue = overdueRatio(b.tally, now) - overdueRatio(a.tally, now);
      if (byOverdue !== 0) return byOverdue;
    }
    return a.index - b.index;
  }).map(({ item, tally, due }) => ({ item, tally, due }));
}

/**
 * How many askable items want asking now.
 *
 * The figure ADR 0006 named as the thing that would make the first paint
 * want the history, so it is also the one that has to say something honest
 * while the log is still loading. It cannot: with no history every item
 * reads as never-seen and therefore due, which is true but is the same
 * number a brand-new user sees, and a count that is right for the wrong
 * reason is worse than no count. The caller shows nothing until the log
 * has loaded; `ProgressState.status` is what it checks.
 */
export function dueCount(
  askable: readonly ItemId[],
  tallies: ReadonlyMap<TallyKey, ItemTally>,
  presentation: Presentation,
  now: number,
): number {
  let due = 0;
  for (const item of askable) {
    const tally = tallies.get(tallyKey(item, presentation));
    if (tally === undefined || dueAt(tally) <= now) due += 1;
  }
  return due;
}
