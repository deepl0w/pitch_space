import type { ScoreLayout } from '../render/toVexflow';

/*
  Its own module rather than an export from the component beside it.

  `cursorAt` is pure arithmetic over a layout and a list of times, and the
  lint rule objecting to a component file exporting a function is right
  here rather than merely noisy: this is the one piece of the cursor that
  can be tested without a browser, and leaving it in a `.tsx` made that an
  accident of where it happened to be written.
*/

/**
 * Where the cursor sits at a given moment, in the score's own pixels.
 *
 * The written events carry the time axis and the layout carries the space
 * axis, and they are the same list in the same order — `rhythmScoreSpec`
 * emits one note per event — so this is an interpolation between two
 * parallel arrays rather than a search.
 *
 * Exported because it is the whole correctness of following the music and
 * is worth testing without a browser: a time between two events must land
 * between their two x positions.
 */
export function cursorAt(
  seconds: number, times: readonly number[], layout: ScoreLayout,
): number | null {
  const xs = layout.notes;
  if (xs.length === 0 || times.length === 0) return null;
  // Strictly before: at the instant the first note sounds the line belongs
  // on that note, not still waiting in front of it. With `<=` the cursor
  // sat at the stave's note-start for the whole of the first note, which
  // is the one moment the join between sound and notation is being made.
  if (seconds < times[0]) return layout.stave.notesStartX;
  for (let i = 1; i < Math.min(times.length, xs.length); i += 1) {
    if (seconds < times[i]) {
      /*
        The span cannot be zero here, so there is no guard against it.

        Reaching index `i` means every earlier index failed `seconds <
        times[j]`, so `seconds >= times[i - 1]`; entering this branch means
        `seconds < times[i]`. If the two times were equal those would
        contradict each other, for any input — the array does not even have
        to be sorted. There used to be a `span > 0 ? … : 1` here with a
        comment about two events sharing a tick, which read as handling a
        case nothing can produce. Two events at one tick still work: the
        first is skipped by the same reasoning and the cursor lands on the
        later, by the ordinary path.
      */
      const through = (seconds - times[i - 1]) / (times[i] - times[i - 1]);
      return xs[i - 1].x + (xs[i].x - xs[i - 1].x) * through;
    }
  }
  return xs[xs.length - 1].x;
}
