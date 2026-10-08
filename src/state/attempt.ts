import type { ExerciseBase, ItemId, Result } from '../exercises/types';
import type { Attempt } from './schema';

/**
 * What a finished round becomes, in the shape the log stores.
 *
 * Pulled out of `PracticeScreen.respond` because of what sits downstream
 * of it rather than because the screen was crowded. `tallyKey` composes
 * presentation with item, `tallyItems` folds outcomes into a tally and
 * `dueAt` schedules on what that fold produces — so the fields stamped
 * here decide what the scheduler can read. Both halves had tests and
 * **neither had ever been checked against the other's output**: the store
 * suite feeds hand-built attempts, and nothing built one the way the app
 * does. That is a pure-data join and it does not need a browser, which is
 * the whole argument for this being a function rather than a prop.
 *
 * `answeredAt` is a parameter rather than a `Date.now()` here for the same
 * reason the generators take an `Rng`: a clock read inside makes the result
 * untestable except by mocking time.
 */
export function attemptFrom(
  round: {
    /** Also the attempt's id, so a recorded attempt is the round it came from. */
    readonly id: string;
    readonly exercise: ExerciseBase;
    /** Frozen at generation — what was actually used, not what is set now. */
    readonly settings: unknown;
    readonly startedAt: number;
  },
  exerciseType: string,
  result: Result,
  answeredAt: number,
  /**
   * Everything the round's settings could have asked, from
   * `definition.items(settings)`.
   *
   * A parameter rather than computed here, because computing it needs the
   * definition and this module must not reach into the registry — the
   * attempt is a record of what happened, not a thing that knows which
   * exercises exist.
   *
   * Omitted means the attempt joins no line, which is what
   * [0041](../../docs/adr/0041-practice-that-counts-towards-nothing.md)
   * describes for practice that counts towards nothing. It is not a
   * default for "we forgot": a caller that wants a line passes the set.
   */
  askable?: readonly ItemId[],
): Attempt {
  return {
    id: round.id,
    exerciseType,
    seed: round.exercise.seed,
    settings: round.settings,
    /*
      From the exercise, not from the live settings: the exercise carries
      how it was actually asked, and the setting may have been changed
      since it was generated.

      This was already true of `presentation` before anyone found the same
      hazard in the prompt's choice list, and `Round.settings` states the
      rule in its own comment — "changing the settings mid-exercise must
      not change the exercise or the answers on offer". The attempt path
      believed it; the prompt path did not, and nothing checked.
    */
    presentation: round.exercise.presentation,
    startedAt: round.startedAt,
    answeredAt,
    // Copied rather than referenced: the attempt outlives the round, and a
    // stored record sharing an array with live state is the aliasing the
    // exercise's own `choices` was just fixed for.
    items: [...round.exercise.items],
    outcomes: result.outcomes.map((o) => ({ ...o })),
    correct: result.correct,
    /*
      Copied, and absent rather than empty when there is none.

      An empty array is a real line — the one whose answer space holds
      nothing — so defaulting to `[]` would fold every untracked attempt
      and every pre-line row into a single bucket that reads as progress
      against nothing. Absent is the only honest encoding of "this does
      not belong to a line".
    */
    ...(askable === undefined ? {} : { askable: [...askable] }),
  };
}
