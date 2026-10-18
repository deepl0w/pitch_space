import type { ItemId } from '../exercises/types';
import type { ProgressLine } from './line';
import type { ItemTally, TallyKey } from './progressStore';
import { schedule } from './schedule';

/**
 * The item the next question should aim at, or nothing.
 *
 * This is where the schedule finally steers practice. Everything it needed was
 * already built — the queue in `schedule`, the wish in `ExerciseSpec.prefer`,
 * each exercise's honest `aims` — and nothing connected them, so every question
 * was a uniform draw however much history sat behind it.
 *
 * **The schedule's order, unchanged: unseen first in the catalogue's order,
 * then the most overdue.** `schedule` already argues both halves; this adds
 * only what a single question needs on top of a queue.
 *
 * **Not the item just asked, while anything else is due.** A wrong answer sets
 * the streak to zero, which the ladder makes due at once, so the queue's head
 * after a miss is very often the miss. Asking it again immediately turns one
 * mistake into a drill the learner did not choose; asking it after one other
 * question still brings it back within the minute. When it is the only thing
 * due — a pool of one, or everything else resting — it is asked again, since
 * the alternative is a question the schedule has no reason for.
 *
 * **Nothing when nothing is due.** Then the draw is the generator's own, which
 * is free practice rather than review, and is what every question was before
 * this existed. A wish for something not due would spend the learner's time on
 * an item the ladder has said can rest.
 *
 * Pure, and in `state/` beside the schedule rather than in the screen, so the
 * policy is tested without mounting anything and the screen only asks.
 */
export function nextWish(
  line: ProgressLine,
  tallies: ReadonlyMap<TallyKey, ItemTally>,
  now: number,
  previous?: ItemId,
): ItemId | undefined {
  const due = schedule(line, tallies, now).filter((row) => row.due).map((row) => row.item);
  return due.find((item) => item !== previous) ?? due[0];
}
