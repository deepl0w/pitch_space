import { Synth } from '../audio/output/synth';
import { schedule } from '../audio/output/schedule';
import { midiOf, type Pitch } from '../theory/pitch';

/**
 * The app's one synth, and so its one AudioContext.
 *
 * Exported rather than kept private because a second instance is not a
 * duplicate, it is a second audio graph that `stopSound` cannot reach: the
 * practice screen built its own and its notes played on over whatever screen
 * came next, which is precisely the defect `stopAll` was added to fix. An
 * import test now refuses `new Synth()` anywhere but here.
 */
export const appSynth = new Synth();

/** Silence anything still scheduled. Called when a screen goes away. */
export function stopSound(): void {
  appSynth.stopAll();
}

export interface Sounded {
  pitches: readonly Pitch[];
}

/**
 * Play a sequence of events.
 *
 * Pressing play again cuts what is already sounding rather than layering a
 * second copy over it. An earlier version locked the button for 250 ms
 * instead, which stopped a double-click and did nothing at all about a
 * passage longer than a quarter of a second — the case it was written for.
 */
export function usePlayer() {
  return function play(events: readonly Sounded[], options: { rolled?: boolean; gap?: number } = {}) {
    appSynth.stopAll();

    const timed = events.map((e) => ({ midis: e.pitches.map(midiOf) }));
    const gap = options.gap ?? 0.62;
    appSynth.play(schedule(timed, {
      eventGap: gap,
      rollGap: options.rolled ? 0.14 : 0,
      hold: events.length === 1 ? 2.2 : Math.max(gap * 1.6, 0.5),
    }));
  };
}

/** Play events that carry their own durations, such as a generated rhythm. */
export function usePulsePlayer() {
  return function play(events: ReadonlyArray<{ pitches: readonly Pitch[]; seconds: number }>) {
    appSynth.stopAll();
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
    appSynth.play(voices);
  };
}
