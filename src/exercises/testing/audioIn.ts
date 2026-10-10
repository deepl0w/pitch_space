import type { AudioIn, Heard, PlayedNote } from '../types';

/**
 * Microphones that are not microphones, for tests of everything above one.
 *
 * Here rather than in each test file because `AudioIn` has two methods and
 * most tests care about neither — they need *an* input so a prompt will
 * render, and fourteen files had each written one out. Adding the second
 * method broke all fourteen, which is the cost of a shape repeated rather
 * than named, and is the second time this seam has done it.
 *
 * Beside `audio/testing/` and for the same reason: a double that lives with
 * the thing it stands in for stays honest about the interface, because it
 * fails to compile when the interface moves. One that lives in a test file
 * fails fourteen times instead.
 */

/**
 * Gives the same take however it is asked, continuous or not.
 *
 * Deliberately ignores `enough` rather than consulting it. A test that
 * wants the continuous path examined uses {@link hearsOverTime}; this one
 * is for the many that want a prompt to have an input at all, and a double
 * that quietly honoured the predicate would make those tests depend on a
 * rule they never meant to exercise.
 */
export function alwaysHears(take: Heard): AudioIn {
  return {
    listen: async () => take,
    listenUntil: async () => take,
  };
}

/** Heard nothing, because there was nothing to hear with. */
export const noMicrophone: AudioIn = alwaysHears({ heard: false, reason: 'unavailable' });

/**
 * A take that arrives a note at a time, so the continuous path's own
 * question — *is this enough yet* — is actually asked.
 *
 * `listen` still answers with everything, since a fixed take hears the
 * whole window; only `listenUntil` reveals the notes one by one and stops
 * where the caller says. The count of polls is reported so a test can
 * assert it stopped early rather than merely arrived at the right answer.
 */
export function hearsOverTime(notes: readonly PlayedNote[]): AudioIn & { polls: () => number } {
  let polls = 0;
  return {
    polls: () => polls,
    listen: async () => ({ heard: true, notes }),
    listenUntil: async (enough) => {
      for (let n = 1; n <= notes.length; n += 1) {
        polls += 1;
        const sofar = notes.slice(0, n);
        if (enough(sofar)) return { heard: true, notes: sofar };
      }
      return { heard: true, notes };
    },
  };
}
