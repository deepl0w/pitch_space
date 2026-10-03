import type { Voice } from './synth';

/**
 * Turn notated events into scheduled voices.
 *
 * Pure, and separate from the component, because the only interesting thing
 * here is arithmetic and arithmetic is worth pinning. The bug that prompted
 * the split: a "play together" mode set the gap between events to 0 and the
 * gap was then read as `gap || 0.9`, so zero — the one value that meant
 * anything — fell through to the default and both modes played the same
 * sequence at different speeds. Nothing could have caught that while it lived
 * inside an onClick.
 */

export interface TimedEvent {
  /** MIDI numbers sounding at the same moment. Empty for a rest. */
  midis: readonly number[];
}

export interface ScheduleOptions {
  /** Seconds between successive events. */
  eventGap: number;
  /** Seconds between the pitches of one event; 0 strikes them together. */
  rollGap: number;
  /** How long each note rings. */
  hold: number;
}

export function schedule(
  events: readonly TimedEvent[], options: ScheduleOptions,
): Voice[] {
  const voices: Voice[] = [];
  let at = 0;
  for (const event of events) {
    event.midis.forEach((midi, i) => {
      voices.push({ midi, start: at + i * options.rollGap, duration: options.hold });
    });
    // A rolled event takes longer to lay out, so the next one waits for it.
    // Without this a roll and the event after it overlap, which is audible as
    // the chord changing underneath the last note of the roll.
    at += options.eventGap + event.midis.length * options.rollGap;
  }
  return voices;
}
