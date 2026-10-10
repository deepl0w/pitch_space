import { midiOf, type Pitch } from '../theory/pitch';
import { establishingCadence } from '../generate/tonicize';
import { schedule } from '../audio/output/schedule';
import type { Key } from '../theory/key';
import type { Voice } from '../audio/output/synth';

/**
 * Sounding a cadence, once, for the three exercises that establish a key.
 *
 * Key identification, scale-degree identification and chord progressions
 * all open by putting a tonic in the ear, and each had written the same
 * thing: take a flat list of pitches, chunk it back into threes, map to
 * MIDI, hand to `schedule`.
 *
 * **The chunking was the part worth removing.** `establishingCadence`
 * returns `Pitch[][]` — already grouped as chords — and the flat list was
 * that same call with `.flat()` on it. So each caller flattened a
 * structure and then guessed it back, and the guess was the literal `3`.
 * `spellChord` decides how many tones a chord has; a seventh anywhere in
 * that progression would have left all three exercises playing chords that
 * do not exist, built from notes belonging to two different ones.
 *
 * Nothing here is new behaviour. The three timings differed slightly —
 * 0.55/0.5, 0.6/0.55, 1.1/1.0 — and that difference is real, so it stays
 * a parameter rather than being averaged away.
 */
export interface CadenceTiming {
  /** Seconds between the start of one chord and the next. */
  eventGap: number;
  /** How long each chord is held. */
  hold: number;
}

/** What a key-establishing cadence sounds like before the question. */
export const ESTABLISHING: CadenceTiming = { eventGap: 0.55, hold: 0.5 };

/**
 * Voices for a sequence of chords, in order.
 *
 * `rollGap` is zero throughout: these are block chords, and spreading them
 * would make the cadence an arpeggio and a different question.
 */
export function chordVoices(
  chords: readonly (readonly Pitch[])[], timing: CadenceTiming,
): Voice[] {
  return schedule(
    chords.map((pitches) => ({ midis: pitches.map(midiOf) })),
    { eventGap: timing.eventGap, rollGap: 0, hold: timing.hold },
  );
}

/** The I–IV–V–I that establishes a key, as voices. */
export function cadenceVoices(key: Key, timing: CadenceTiming = ESTABLISHING): Voice[] {
  return chordVoices(establishingCadence(key), timing);
}

/** Where the cadence ends, so a caller can schedule a question after it. */
export function cadenceEndsAt(key: Key, timing: CadenceTiming = ESTABLISHING): number {
  return establishingCadence(key).length * timing.eventGap;
}
