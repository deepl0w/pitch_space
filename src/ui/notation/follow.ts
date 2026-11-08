import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScoreLayout } from '../../exercises/render/toVexflow';
import type { Voice } from '../../audio/output/synth';

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
 * The events in a set of voices: what starts together is one event.
 */
export function eventsOf(voices: readonly Voice[]): { starts: number[]; midis: number[][] } {
  const byStart = new Map<number, number[]>();
  for (const voice of voices) {
    const key = Math.round(voice.start * 1e6) / 1e6;
    byStart.set(key, [...(byStart.get(key) ?? []), voice.midi]);
  }
  const starts = [...byStart.keys()].sort((a, b) => a - b);
  return { starts, midis: starts.map((s) => byStart.get(s)!) };
}

/**
 * Which stave note each event sounds, or null if any event is not on it.
 *
 * Matched by pitch, not by count: an event belongs to the note whose
 * pitches include all of its own, nearest the note the last event landed
 * on — so a scale played down walks the stave back, an arpeggio stays on
 * its chord, and a replay of a wrong answer, whose second note is nowhere
 * on the stave, follows nothing rather than lighting a note it did not
 * play. Strict on purpose: a cursor on the wrong note teaches the wrong
 * thing, and no cursor teaches nothing.
 */
export function eventsOnStave(
  events: readonly (readonly number[])[],
  notes: readonly (readonly number[])[],
): number[] | null {
  const out: number[] = [];
  let last = 0;
  for (const event of events) {
    let best = -1;
    notes.forEach((note, i) => {
      if (!event.every((m) => note.includes(m))) return;
      if (best < 0 || Math.abs(i - last) < Math.abs(best - last)) best = i;
    });
    if (best < 0) return null;
    out.push(best);
    last = best;
  }
  return out;
}

/**
 * Play something and follow it on a stave.
 *
 * `playhead` is the clock the passage was scheduled on — `Synth.playhead`,
 * or an exercise's `AudioOut.playhead` — taken as an argument so the page
 * that plays and the clock it reads cannot be two different synths, and so
 * a test can drive it. `along` takes when each event starts and which
 * stave note each sounds. One animation loop runs while the passage
 * sounds and stops when the clock reports nothing sounding — including
 * when another play or a navigation cut it short, which is what keeps a
 * cursor from running on over silence.
 */
export function usePlayAlong(playhead: () => number | null) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [plan, setPlan] = useState<{ starts: number[]; indices: number[] } | null>(null);
  const [layout, setLayout] = useState<ScoreLayout | null>(null);
  const frame = useRef(0);
  // Read through a ref so a caller passing an inline function does not
  // restart the loop every render.
  const clock = useRef(playhead);
  useEffect(() => { clock.current = playhead; }, [playhead]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const along = useCallback((starts: number[], indices: readonly number[]) => {
    cancelAnimationFrame(frame.current);
    setPlan({ starts, indices: [...indices] });
    const began = performance.now();
    let heard = false;
    const step = () => {
      const now = clock.current();
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

  /*
    Called for a passage that will not be followed. Without it the loop
    from the last one runs on and reads the *new* passage's clock against
    the *old* notes — found by a test that replayed a wrong answer straight
    after a right one and saw the right one's first note light.
  */
  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    setSeconds(null);
    setPlan(null);
  }, []);

  const lit = seconds !== null && plan ? soundingAt(seconds, plan.starts) : null;
  return {
    /** Stop following, for a passage that is played but not on the stave. */
    stop,
    /** Call with what `play` returned and the stave note each event sounds. */
    along,
    /** The stave note sounding now, for `Score`'s `lit`. */
    lit: lit === null || !plan ? null : plan.indices[lit] ?? null,
    cursorX: seconds !== null && plan && layout
      ? cursorFor(seconds, plan.starts, plan.indices, layout) : null,
    onLayout: setLayout,
  };
}
