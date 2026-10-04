import { type Pitch, parsePitch, pitchName, midiOf } from './pitch';
import { scaleType, spellScale, type ScaleType } from './scale';

export type Mode = 'major' | 'minor';

export interface Key {
  /** Tonic as a spelled pitch class; the octave is a placeholder. */
  tonic: Pitch;
  mode: Mode;
  /** Sharps as positive, flats as negative. Decides the key signature. */
  accidentals: number;
}

function key(tonic: string, mode: Mode, accidentals: number): Key {
  return { tonic: parsePitch(tonic + '4'), mode, accidentals };
}

/**
 * Every key signature from seven flats to seven sharps, in both modes. Keys
 * past six accidentals are included because sight-reading practice at the hard
 * end is exactly where they are worth meeting.
 */
export const MAJOR_KEYS: readonly Key[] = [
  key('Cb', 'major', -7), key('Gb', 'major', -6), key('Db', 'major', -5),
  key('Ab', 'major', -4), key('Eb', 'major', -3), key('Bb', 'major', -2),
  key('F', 'major', -1), key('C', 'major', 0), key('G', 'major', 1),
  key('D', 'major', 2), key('A', 'major', 3), key('E', 'major', 4),
  key('B', 'major', 5), key('F#', 'major', 6), key('C#', 'major', 7),
];

export const MINOR_KEYS: readonly Key[] = [
  key('Ab', 'minor', -7), key('Eb', 'minor', -6), key('Bb', 'minor', -5),
  key('F', 'minor', -4), key('C', 'minor', -3), key('G', 'minor', -2),
  key('D', 'minor', -1), key('A', 'minor', 0), key('E', 'minor', 1),
  key('B', 'minor', 2), key('F#', 'minor', 3), key('C#', 'minor', 4),
  key('G#', 'minor', 5), key('D#', 'minor', 6), key('A#', 'minor', 7),
];

export const ALL_KEYS: readonly Key[] = [...MAJOR_KEYS, ...MINOR_KEYS];

export function keyId(k: Key): string {
  return `${pitchName(k.tonic, false)}_${k.mode}`;
}

export function keyName(k: Key): string {
  return `${pitchName(k.tonic, false)} ${k.mode === 'major' ? 'major' : 'minor'}`;
}

export function findKey(id: string): Key {
  const found = ALL_KEYS.find((k) => keyId(k) === id);
  if (!found) throw new Error(`Unknown key: ${id}`);
  return found;
}

/** Keys within `max` accidentals, which is how key identification slices them. */
export function keysUpTo(max: number, modes: readonly Mode[] = ['major', 'minor']): Key[] {
  return ALL_KEYS.filter((k) => Math.abs(k.accidentals) <= max && modes.includes(k.mode));
}

/** VexFlow names a signature by its major key, even for a minor piece. */
export function vexKeySignature(k: Key): string {
  const major = MAJOR_KEYS.find((m) => m.accidentals === k.accidentals);
  return major ? pitchName(major.tonic, false) : 'C';
}

export function relativeKey(k: Key): Key {
  const pool = k.mode === 'major' ? MINOR_KEYS : MAJOR_KEYS;
  return pool.find((o) => o.accidentals === k.accidentals)!;
}

/** The scale a key's diatonic material comes from. */
export function keyScaleType(k: Key): ScaleType {
  return scaleType(k.mode === 'major' ? 'major' : 'natural_minor');
}

/**
 * The seven diatonic pitches of the key, spelled, in one octave from the tonic.
 * Minor keys return the natural minor; the raised leading tone is applied by
 * whatever needs it (the dominant chord, a melodic cadence) rather than baked
 * in here, because it is a choice and not a property of the key.
 */
export function keyPitches(k: Key): Pitch[] {
  return spellScale(k.tonic, keyScaleType(k));
}

/** Pitch classes in the key, for "is this note diatonic" tests. */
export function keyPitchClasses(k: Key): Set<number> {
  return new Set(keyPitches(k).map((p) => ((midiOf(p) % 12) + 12) % 12));
}

/** Which accidentals the signature carries, in the order they are written. */
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

export function signatureLetters(k: Key): string[] {
  const n = Math.abs(k.accidentals);
  return (k.accidentals >= 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, n);
}
