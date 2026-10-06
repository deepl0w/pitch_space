import type { ExerciseBase, Result } from '../exercises/types';
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
  };
}
