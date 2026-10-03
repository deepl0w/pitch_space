/**
 * Spelled pitch representation.
 *
 * A pitch is stored as (letter, alter, octave) rather than as a bare MIDI
 * number because notation and theory both care about spelling: G# and Ab are
 * the same key on a piano but different notes on a staff, and the difference
 * decides whether an interval is an augmented fifth or a minor sixth.
 */

/** C=0, D=1, E=2, F=3, G=4, A=5, B=6 */
export type Letter = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Pitch {
  letter: Letter;
  /** Accidental in semitones: -2 (bb) .. +2 (x) */
  alter: number;
  /** Scientific pitch notation octave; middle C is octave 4 */
  octave: number;
}

export const LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
/** Semitone offset of each letter above C */
export const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;

export function pitch(letter: Letter, alter: number, octave: number): Pitch {
  return { letter, alter, octave };
}

export function midiOf(p: Pitch): number {
  return 12 * (p.octave + 1) + LETTER_SEMITONES[p.letter] + p.alter;
}

/** Position on the staff ladder, ignoring accidentals. C4 -> 28. */
export function diatonicOf(p: Pitch): number {
  return p.octave * 7 + p.letter;
}

export function pitchFromDiatonic(d: number, alter = 0): Pitch {
  const octave = Math.floor(d / 7);
  const letter = (d - octave * 7) as Letter;
  return { letter, alter, octave };
}

const SHARP_SPELLING: Array<[Letter, number]> = [
  [0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0],
  [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0],
];
const FLAT_SPELLING: Array<[Letter, number]> = [
  [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0],
  [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
];

/** Fallback spelling when no key context is available. */
export function pitchFromMidi(midi: number, preferFlats = false): Pitch {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  const [letter, alter] = (preferFlats ? FLAT_SPELLING : SHARP_SPELLING)[pc];
  return { letter, alter, octave };
}

export function pitchClass(p: Pitch): number {
  return ((midiOf(p) % 12) + 12) % 12;
}

/**
 * Spelling runs past the double accidental more often than it looks: a Cb
 * diminished seventh has a Bbbb in it, and a whole-tone scale on A# has an F###.
 * A fixed table covering -2..+2 returned undefined for those, which reached the
 * user as a note called "Bundefined" and as a VexFlow key of "bundefined/4".
 */
export function accidentalGlyph(alter: number): string {
  return alter < 0 ? 'b'.repeat(-alter) : '#'.repeat(alter);
}

/** The common accidentals, derived so the table and the glyphs cannot disagree. */
export const ACCIDENTAL_GLYPHS: Record<number, string> = Object.fromEntries(
  [-2, -1, 0, 1, 2].map((a) => [a, accidentalGlyph(a)]),
);

export function pitchName(p: Pitch, withOctave = true): string {
  return LETTER_NAMES[p.letter] + accidentalGlyph(p.alter) + (withOctave ? p.octave : '');
}

/** VexFlow key string, e.g. "c#/4" */
export function vexKey(p: Pitch): string {
  return `${LETTER_NAMES[p.letter].toLowerCase()}${accidentalGlyph(p.alter)}/${p.octave}`;
}

export function freqOf(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function midiFromFreq(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

/** Signed distance in cents from `freq` to the nearest equal-tempered pitch. */
export function centsOff(freq: number, a4 = 440): { midi: number; cents: number } {
  const exact = midiFromFreq(freq, a4);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}

/**
 * Move a pitch by a diatonic step count while keeping it in a given set of
 * pitch classes, re-spelling the accidental to match.
 */
export function respell(d: number, targetMidi: number): Pitch {
  const base = pitchFromDiatonic(d, 0);
  return { ...base, alter: targetMidi - midiOf(base) };
}

export function parsePitch(s: string): Pitch {
  const m = /^([A-Ga-g])(bb|b|##|#|x)?(-?\d+)$/.exec(s.trim());
  if (!m) throw new Error(`Unparseable pitch: ${s}`);
  const letter = LETTER_NAMES.indexOf(m[1].toUpperCase() as 'C') as Letter;
  const alter = { bb: -2, b: -1, '#': 1, '##': 2, x: 2, undefined: 0 }[
    m[2] as string
  ] ?? 0;
  return { letter, alter, octave: parseInt(m[3], 10) };
}
