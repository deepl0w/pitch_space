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

/**
 * The nearest spelling of the same sounding pitch that needs no more than
 * `maxAlter` accidentals.
 *
 * Theory produces triple accidentals honestly — a Cb diminished seventh
 * contains a Bbbb — but nobody engraves one, and notation libraries do not
 * draw one. This is the respelling a copyist would make: keep the sound, move
 * the letter, and prefer to stay on the side the original accidental pointed
 * so a flat chord does not suddenly sprout sharps.
 *
 * It belongs to notation rather than to harmony, so callers apply it at the
 * point of drawing and leave the analysis spelled as it really is.
 */
export function simplifySpelling(p: Pitch, maxAlter = 2): Pitch {
  if (Math.abs(p.alter) <= maxAlter) return p;
  const midi = midiOf(p);
  const direction = Math.sign(p.alter);
  let best: Pitch | null = null;
  for (let step = -3; step <= 3; step++) {
    const candidate = respell(diatonicOf(p) + step, midi);
    if (Math.abs(candidate.alter) > maxAlter) continue;
    if (best === null) { best = candidate; continue; }
    const better = Math.abs(candidate.alter) - Math.abs(best.alter)
      // Tie-break towards the original accidental's direction: Bbbb becomes
      // Ab rather than G#, which keeps a flat-spelled chord looking flat.
      || (Math.sign(best.alter) === direction ? 1 : 0)
         - (Math.sign(candidate.alter) === direction ? 1 : 0);
    if (better < 0) best = candidate;
  }
  return best ?? p;
}

/**
 * The inverse of `pitchName`, accidental grammar included.
 *
 * Any number of flats or sharps, because `accidentalGlyph` writes any number:
 * a Cb diminished seventh contains a Bbbb and an applied chord in A# minor a
 * C###. A parser that stopped at the double accidental could not read back
 * what the printer had just written, and only on the rare spellings that are
 * worth round-tripping. Mixed accidentals are still refused — `C#b4` is not a
 * spelling, it is a typo. `x` is accepted as the other way of writing a double
 * sharp.
 */
export function parsePitch(s: string): Pitch {
  const m = /^([A-Ga-g])(x|b+|#+)?(-?\d+)$/.exec(s.trim());
  if (!m) throw new Error(`Unparseable pitch: ${s}`);
  const letter = LETTER_NAMES.indexOf(m[1].toUpperCase() as 'C') as Letter;
  const accidental = m[2] ?? '';
  const alter = accidental === 'x' ? 2
    : accidental.startsWith('b') ? -accidental.length
      : accidental.length;
  return { letter, alter, octave: parseInt(m[3], 10) };
}
