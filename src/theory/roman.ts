import { type Pitch, accidentalGlyph, diatonicOf, midiOf, respell } from './pitch';
import { type Key, keyPitches } from './key';
import { type Chord, type ChordType, chord, chordType, spellChord } from './chord';

/**
 * Roman numerals, kept symbolic and realised into pitches as late as possible.
 *
 * The point of the indirection is spelling. A numeral names a scale degree,
 * and the degree fixes the root's *letter* before any accidental is chosen —
 * which is the whole reason V/V in C comes out D–F#–A and not D–Gb–A. A
 * generator that worked in pitch classes and spelled afterwards would have no
 * way to know which of those two was meant.
 */

export type Degree = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** What a chord is doing, which is what the harmony generator moves between. */
export type HarmonicFunction = 'tonic' | 'predominant' | 'dominant' | 'applied' | 'other';

export interface RomanNumeral {
  degree: Degree;
  /** Chromatic alteration of the degree itself: bII is degree 2, alter -1. */
  chromaticAlter: number;
  /** Id into CHORD_TYPES. */
  typeId: string;
  inversion: number;
  /** Set for an applied chord: V/V is degree 5 applied to degree 5. */
  appliedTo?: Degree;
  fn: HarmonicFunction;
}

export function numeral(
  degree: Degree, typeId: string,
  options: Partial<Omit<RomanNumeral, 'degree' | 'typeId'>> = {},
): RomanNumeral {
  return {
    degree,
    typeId,
    chromaticAlter: options.chromaticAlter ?? 0,
    inversion: options.inversion ?? 0,
    appliedTo: options.appliedTo,
    fn: options.fn ?? defaultFunction(degree, options.appliedTo),
  };
}

function defaultFunction(degree: Degree, appliedTo?: Degree): HarmonicFunction {
  if (appliedTo !== undefined) return 'applied';
  switch (degree) {
    case 1: case 6: case 3: return 'tonic';
    case 2: case 4: return 'predominant';
    case 5: case 7: return 'dominant';
  }
}

/** The diatonic triad quality on each degree, which decides numeral case. */
export const DIATONIC_TRIADS: Record<'major' | 'minor', readonly string[]> = {
  major: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],
  // Natural minor. A raised leading tone is a choice the generator makes by
  // asking for a major V, not a property of the key.
  minor: ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
};

export const DIATONIC_SEVENTHS: Record<'major' | 'minor', readonly string[]> = {
  major: ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'm7b5'],
  minor: ['min7', 'm7b5', 'maj7', 'min7', 'min7', 'maj7', 'dom7'],
};

/**
 * The root of a degree in a key, spelled. The letter comes from the key's own
 * scale, so an alteration only ever moves the accidental.
 */
export function degreeRoot(key: Key, degree: Degree, chromaticAlter = 0): Pitch {
  const base = keyPitches(key)[degree - 1];
  return { ...base, alter: base.alter + chromaticAlter };
}

/** Move a pitch by a diatonic step count and a semitone count at once. */
function transpose(p: Pitch, steps: number, semitones: number): Pitch {
  return respell(diatonicOf(p) + steps, midiOf(p) + semitones);
}

/**
 * Realise a numeral as a spelled chord in a key.
 *
 * An applied chord is realised against its target rather than against the
 * home key: V/ii in C is built a fifth above the root of ii, which gives A and
 * not the A that happens to be degree 6. The two coincide here and diverge the
 * moment the target is itself altered, which is exactly the case worth getting
 * right.
 */
export function realizeNumeral(key: Key, n: RomanNumeral): Chord {
  const type = chordType(n.typeId);
  let root: Pitch;
  if (n.appliedTo === undefined) {
    root = degreeRoot(key, n.degree, n.chromaticAlter);
  } else {
    const target = degreeRoot(key, n.appliedTo);
    root = transpose(target, n.degree - 1, APPLIED_SEMITONES[n.degree]);
    if (n.chromaticAlter) root = { ...root, alter: root.alter + n.chromaticAlter };
  }
  return chord(root, type, n.inversion);
}

/**
 * Semitones above a tonicised root for each degree of its major scale. An
 * applied chord borrows the major scale of its target whatever the target's
 * own quality, because that is what makes the leading tone lead.
 */
const APPLIED_SEMITONES: Record<Degree, number> = {
  1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11,
};

export function realizePitches(key: Key, n: RomanNumeral): Pitch[] {
  return spellChord(realizeNumeral(key, n));
}

// ---- Display -------------------------------------------------------------

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/**
 * Figured bass for an inversion.
 *
 * The inversion is taken modulo the chord size, matching `voiceChord`. Taking
 * `Math.min` instead meant the figure and the sound disagreed: a triad at
 * inversion 3 printed I64 while sounding in root position, and a negative
 * inversion printed "Iundefined".
 *
 * Only triads and sevenths get figures, because only they have them. An added
 * sixth, a suspension and the extended chords have no standard figured bass,
 * so the suffix carries the quality and an inversion is named outright rather
 * than dressed up in figures that would mean something else.
 */
function figures(type: ChordType, inversion: number): string {
  const size = type.semitones.length;
  const inv = ((inversion % size) + size) % size;
  if (type.family === 'triad') return ['', '6', '64'][inv];
  if (type.family === 'seventh' || (type.family === 'altered' && size === 4)) {
    return ['7', '65', '43', '42'][inv];
  }
  return type.suffix + (inv === 0 ? '' : ` inv${inv}`);
}

function isMinorish(typeId: string): boolean {
  return typeId.startsWith('min') || typeId === 'dim' || typeId === 'dim7'
    || typeId === 'm7b5' || typeId === 'minmaj7';
}

/**
 * The numeral as it is written: case carries the quality, a degree symbol the
 * diminished triads, figured bass the inversion, and a slash the target of an
 * applied chord.
 */
export function numeralText(n: RomanNumeral): string {
  const type = chordType(n.typeId);
  const base = ROMAN[n.degree - 1];
  const cased = isMinorish(n.typeId) ? base.toLowerCase() : base;
  let quality = '';
  if (n.typeId === 'dim' || n.typeId === 'dim7') quality = 'o';
  else if (n.typeId === 'm7b5') quality = 'ø';
  else if (n.typeId === 'aug') quality = '+';
  const text = accidentalGlyph(n.chromaticAlter) + cased + quality + figures(type, n.inversion);
  if (n.appliedTo === undefined) return text;
  return `${text}/${ROMAN[n.appliedTo - 1]}`;
}

export type CadenceType = 'HC' | 'PAC' | 'IAC' | 'DC' | 'PC';

export const CADENCE_NAMES: Record<CadenceType, string> = {
  HC: 'half cadence',
  PAC: 'perfect authentic cadence',
  IAC: 'imperfect authentic cadence',
  DC: 'deceptive cadence',
  PC: 'plagal cadence',
};
