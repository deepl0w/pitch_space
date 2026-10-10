import { tallyKey, type ItemTally, type TallyKey } from './progressStore';
import type { ProgressLine } from './line';
import type { ItemId } from '../exercises/types';

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
  /**
   * Whether the current settings can actually ask this.
   *
   * A due item the settings exclude has to be representable, or the
   * schedule silently never shows it and nothing anywhere says why — the
   * roadmap's `m7b5` that comes due while triads only are allowed. The
   * caller may pass an `askable` wider than the settings precisely so
   * this can be said; without the field a wider set arrives
   * indistinguishable from a narrower one, which is why the caller
   * cannot answer it alone. See ADR 0037.
   *
   * True when `reachable` is not given, because a caller that passes one
   * set is making no claim about a second.
   */
  reachable: boolean;
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
  /**
   * The line being practised, which carries its own askable set.
   *
   * Three arguments became one when ADR 0039 named the line: the
   * exercise, the answer space and the presentation are not independent
   * inputs a caller chooses between, they are the thing progress belongs
   * to. A caller that could pass an `askable` disagreeing with the
   * presentation's tallies was a caller that could ask the wrong
   * question of the right data.
   */
  line: ProgressLine,
  tallies: ReadonlyMap<TallyKey, ItemTally>,
  now: number,
  /**
   * The subset of `askable` the settings can currently ask, when the
   * caller passed a wider `askable` in order to see past them.
   *
   * Omitted means every askable item is reachable — not that nothing is.
   * A caller that passes one set is making no claim about a second, and
   * defaulting the other way would mark every item of every existing
   * caller unreachable.
   */
  reachable?: ReadonlySet<ItemId>,
): ScheduledItem[] {
  const rows = line.askable.map((item, index): ScheduledItem & { index: number } => {
    const tally = tallies.get(tallyKey(line, item)) ?? null;
    return {
      item,
      tally,
      due: tally === null || dueAt(tally) <= now,
      reachable: reachable === undefined || reachable.has(item),
      index,
    };
  });

  return rows.sort((a, b) => {
    if ((a.tally === null) !== (b.tally === null)) return a.tally === null ? -1 : 1;
    if (a.tally !== null && b.tally !== null) {
      const byOverdue = overdueRatio(b.tally, now) - overdueRatio(a.tally, now);
      if (byOverdue !== 0) return byOverdue;
    }
    return a.index - b.index;
  }).map(({ item, tally, due, reachable: itemReachable }) => ({
    item, tally, due, reachable: itemReachable,
  }));
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
 *
 * **This counts what it is given, and takes no `reachable` set.** A caller
 * that widened `askable` to see past the settings — see
 * {@link ScheduledItem.reachable} — must pass the narrow set here, or it
 * gets a count including items the settings cannot ask. The two functions
 * differ on purpose: a list can carry a flag per row and say *due but not
 * reachable*, and a single number cannot, which is 0037's argument for
 * why a figure that cannot name what it covers should not be shown.
 */
/**
 * How far a line has advanced, from 0 to 1, or `null` if it asks nothing.
 *
 * **Not a score, and deliberately not derived from one.** ADR 0040 settles
 * that a line's grade is a function of how far its items have moved along
 * the ladder rather than of how many answers were right: the interval is
 * the progress, and a right answer is the thing that lengthens it. So this
 * reads `streak` — the same value `dueAt` uses to pick an interval — and
 * asks how far up the ladder each item has climbed.
 *
 * **An unseen item is 0, not absent.** The denominator is everything the
 * line can ask, so an item nobody has reached drags the figure down rather
 * than sitting outside the average. Same reason `dueCount` counts over
 * `line.askable` rather than over the tallies it was given.
 *
 * **That is not what stops a narrowed pool flattering a learner**, and
 * the first version of this comment said it was. Narrowing shrinks
 * `askable`, which is the denominator, so on its own the fraction would
 * rise. What prevents it is one level up: `lineKey` is built from the
 * sorted askable set, so a narrowed pool is a *different line* with
 * different tally keys and reads 0 rather than an inflated number.
 *
 * Worth knowing because the property is compositional rather than local.
 * It holds only while line identity stays tied to the askable set — if
 * `tallyKey` is ever simplified, this figure begins inflating and the
 * home screen is where it will show.
 *
 * **It cannot reach 1 by being lucky once.** The top rung is a fortnight's
 * interval, which an item arrives at only by being right repeatedly across
 * real elapsed time, so a full line is a claim about weeks rather than
 * about a session. A line with one item still reaches 1 — that is true and
 * visibly small, which 0040 prefers to a number inflated to look larger.
 *
 * `null` rather than 0 for a line that asks nothing: no items is not no
 * progress, and a caller showing "0%" for a pool the settings emptied
 * would be reporting a fact about the settings as a fact about the
 * learner.
 */
export function completion(
  line: ProgressLine,
  tallies: ReadonlyMap<TallyKey, ItemTally>,
): number | null {
  if (line.askable.length === 0) return null;
  const top = INTERVALS_MS.length - 1;
  let climbed = 0;
  for (const item of line.askable) {
    const tally = tallies.get(tallyKey(line, item));
    if (tally !== undefined) climbed += Math.min(tally.streak, top) / top;
  }
  return climbed / line.askable.length;
}

export function dueCount(
  line: ProgressLine,
  tallies: ReadonlyMap<TallyKey, ItemTally>,
  now: number,
): number {
  let due = 0;
  for (const item of line.askable) {
    const tally = tallies.get(tallyKey(line, item));
    if (tally === undefined || dueAt(tally) <= now) due += 1;
  }
  return due;
}
