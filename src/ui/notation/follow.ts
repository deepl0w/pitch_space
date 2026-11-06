import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScoreLayout } from '../../exercises/render/toVexflow';
import { appSynth } from '../sound';

/**
 * Following the music on the staff while it plays: which note is lit, and
 * where the cursor is.
 *
 * **Time is read from the audio clock, never counted in frames.** The synth
 * schedules every passage against `AudioContext.currentTime` and says where
 * on that clock the passage it laid begins (`Synth.playhead`); this reads
 * that and nothing else, so the cursor is where the sound is rather than
 * where a timer started from the click thinks it should be — sixty
 * milliseconds early on a warm device and most of a second on a cold one.
 */

/**
 * Which event is sounding `seconds` into a passage: the last to have begun.
 * Null before the first.
 */
export function soundingAt(seconds: number, starts: readonly number[]): number | null {
  let at: number | null = null;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] <= seconds) at = i;
    else break;
  }
  return at;
}

/**
 * Where the cursor stands: on the sounding note, moving towards the next one
 * as the time between them passes.
 *
 * `indices` maps each event to the note it sounds on the stave, since the
 * two need not run in the same order — a scale played downwards walks the
 * ascending stave from the right, and a chord arpeggiated is several events
 * on one note.
 */
export function cursorFor(
  seconds: number,
  starts: readonly number[],
  indices: readonly number[],
  layout: ScoreLayout,
): number | null {
  const at = soundingAt(seconds, starts);
  const xOf = (event: number) => layout.notes[indices[event]]?.x;
  if (at === null) return null;
  const here = xOf(at);
  if (here === undefined) return null;
  const next = at + 1 < starts.length ? xOf(at + 1) : undefined;
  if (next === undefined) return here;
  const through = (seconds - starts[at]) / (starts[at + 1] - starts[at]);
  return here + (next - here) * Math.min(1, Math.max(0, through));
}

/** How long to wait for a passage to begin before deciding it never will. */
const WAKE_GRACE_MS = 2500;

/**
 * Play something and follow it on a stave.
 *
 * `play` is whatever plays the passage and returns when each event starts;
 * `indices` says which stave note each event sounds. The hook drives one
 * animation loop while the passage sounds and stops it when the synth
 * reports nothing sounding — including when another play or a navigation
 * cut it short, which is what keeps a cursor from running on over silence.
 */
export function usePlayAlong() {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [plan, setPlan] = useState<{ starts: number[]; indices: number[] } | null>(null);
  const [layout, setLayout] = useState<ScoreLayout | null>(null);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const along = useCallback((starts: number[], indices: readonly number[]) => {
    cancelAnimationFrame(frame.current);
    setPlan({ starts, indices: [...indices] });
    const began = performance.now();
    let heard = false;
    const step = () => {
      const now = appSynth.playhead();
      if (now === null) {
        // Not begun yet (a cold device is still opening) or already over.
        if (heard || performance.now() - began > WAKE_GRACE_MS) {
          setSeconds(null);
          return;
        }
      } else {
        heard = true;
        setSeconds(now);
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, []);

  const lit = seconds !== null && plan ? soundingAt(seconds, plan.starts) : null;
  return {
    /** Call with what `play` returned and the stave note each event sounds. */
    along,
    /** The stave note sounding now, for `Score`'s `lit`. */
    lit: lit === null || !plan ? null : plan.indices[lit] ?? null,
    cursorX: seconds !== null && plan && layout
      ? cursorFor(seconds, plan.starts, plan.indices, layout) : null,
    onLayout: setLayout,
  };
}
