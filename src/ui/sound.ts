import { useRef } from 'react';
import { Synth } from '../audio/output/synth';
import { schedule } from '../audio/output/schedule';
import { midiOf, type Pitch } from '../theory/pitch';

/** One AudioContext for the whole app; creating a second is how you get drift. */
const synth = new Synth();

/** Silence anything still scheduled. Called when a screen goes away. */
export function stopSound(): void {
  synth.stopAll();
}

export interface Sounded {
  pitches: readonly Pitch[];
  /** Seconds this event occupies. Omit for an evenly-spaced sequence. */
  seconds?: number;
}

/**
 * Play a sequence of events, with a guard against a double-press stacking two
 * copies of the same passage on top of each other.
 */
export function usePlayer() {
  const busy = useRef(false);
  return function play(events: readonly Sounded[], options: { rolled?: boolean; gap?: number } = {}) {
    if (busy.current) return;
    busy.current = true;
    window.setTimeout(() => { busy.current = false; }, 250);

    const timed = events.map((e) => ({ midis: e.pitches.map(midiOf) }));
    const gap = options.gap ?? 0.62;
    synth.play(schedule(timed, {
      eventGap: gap,
      rollGap: options.rolled ? 0.14 : 0,
      hold: events.length === 1 ? 2.2 : Math.max(gap * 1.6, 0.5),
    }));
  };
}

/** Play events that carry their own durations, such as a generated rhythm. */
export function usePulsePlayer() {
  const busy = useRef(false);
  return function play(events: ReadonlyArray<{ pitches: readonly Pitch[]; seconds: number }>) {
    if (busy.current) return;
    busy.current = true;
    const total = events.reduce((s, e) => s + e.seconds, 0);
    window.setTimeout(() => { busy.current = false; }, Math.min(10_000, total * 1000 + 200));

    let at = 0;
    const voices = [];
    for (const event of events) {
      for (const pitch of event.pitches) {
        // Held just short of the next attack, so repeated notes are heard as
        // separate strikes rather than as one tied sound.
        voices.push({ midi: midiOf(pitch), start: at, duration: Math.max(0.08, event.seconds * 0.9) });
      }
      at += event.seconds;
    }
    synth.play(voices);
  };
}
