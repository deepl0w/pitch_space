import { type Letter, type Pitch, accidentalGlyph, midiOf, pitchFromDiatonic, diatonicOf } from './pitch';

/**
 * A scale is defined by two parallel patterns: how far each degree sits above
 * the root in semitones, and how far it sits in staff steps. The second is what
 * makes the spelling come out right — a C blues scale wants Gb and G, not F# and
 * G, because the flat fifth is a lowered fifth degree and not a raised fourth.
 */
export interface ScaleType {
  id: string;
  name: string;
  /** Semitones above the root, ascending, root included, octave excluded. */
  semitones: readonly number[];
  /** Staff steps above the root letter, parallel to `semitones`. */
  steps: readonly number[];
  /** Grouping for the picker, and for grading a scale's difficulty. */
  family: 'common' | 'mode' | 'pentatonic' | 'symmetric' | 'exotic';
}

function scale(
  id: string, name: string,
  semitones: readonly number[], steps: readonly number[],
  family: ScaleType['family'],
): ScaleType {
  if (semitones.length !== steps.length) {
    throw new Error(`${id}: ${semitones.length} semitones but ${steps.length} steps`);
  }
  return { id, name, semitones, steps, family };
}

const HEPTATONIC = [0, 1, 2, 3, 4, 5, 6];

export const SCALE_TYPES: readonly ScaleType[] = [
  scale('major', 'Major (Ionian)', [0, 2, 4, 5, 7, 9, 11], HEPTATONIC, 'common'),
  scale('natural_minor', 'Natural Minor (Aeolian)', [0, 2, 3, 5, 7, 8, 10], HEPTATONIC, 'common'),
  scale('harmonic_minor', 'Harmonic Minor', [0, 2, 3, 5, 7, 8, 11], HEPTATONIC, 'common'),
  scale('melodic_minor', 'Melodic Minor', [0, 2, 3, 5, 7, 9, 11], HEPTATONIC, 'common'),

  scale('dorian', 'Dorian', [0, 2, 3, 5, 7, 9, 10], HEPTATONIC, 'mode'),
  scale('phrygian', 'Phrygian', [0, 1, 3, 5, 7, 8, 10], HEPTATONIC, 'mode'),
  scale('lydian', 'Lydian', [0, 2, 4, 6, 7, 9, 11], HEPTATONIC, 'mode'),
  scale('mixolydian', 'Mixolydian', [0, 2, 4, 5, 7, 9, 10], HEPTATONIC, 'mode'),
  scale('locrian', 'Locrian', [0, 1, 3, 5, 6, 8, 10], HEPTATONIC, 'mode'),

  scale('major_pentatonic', 'Major Pentatonic', [0, 2, 4, 7, 9], [0, 1, 2, 4, 5], 'pentatonic'),
  scale('minor_pentatonic', 'Minor Pentatonic', [0, 3, 5, 7, 10], [0, 2, 3, 4, 6], 'pentatonic'),
  // The blues scale puts two notes on the fifth degree: a lowered one and a
  // natural one. That duplicated step is the whole point of the scale.
  scale('blues', 'Blues', [0, 3, 5, 6, 7, 10], [0, 2, 3, 4, 4, 6], 'pentatonic'),

  scale('whole_tone', 'Whole Tone', [0, 2, 4, 6, 8, 10], [0, 1, 2, 3, 4, 5], 'symmetric'),
  scale('octatonic_hw', 'Diminished (half-whole)', [0, 1, 3, 4, 6, 7, 9, 10], [0, 1, 2, 2, 3, 4, 5, 6], 'symmetric'),
  scale('octatonic_wh', 'Diminished (whole-half)', [0, 2, 3, 5, 6, 8, 9, 11], [0, 1, 2, 3, 3, 4, 5, 6], 'symmetric'),

  scale('harmonic_major', 'Harmonic Major', [0, 2, 4, 5, 7, 8, 11], HEPTATONIC, 'exotic'),
  scale('double_harmonic', 'Double Harmonic', [0, 1, 4, 5, 7, 8, 11], HEPTATONIC, 'exotic'),
  scale('phrygian_dominant', 'Phrygian Dominant', [0, 1, 4, 5, 7, 8, 10], HEPTATONIC, 'exotic'),
  scale('lydian_dominant', 'Lydian Dominant', [0, 2, 4, 6, 7, 9, 10], HEPTATONIC, 'exotic'),
  scale('altered', 'Altered (Super Locrian)', [0, 1, 3, 4, 6, 8, 10], HEPTATONIC, 'exotic'),
];

const BY_ID = new Map(SCALE_TYPES.map((s) => [s.id, s]));

export function scaleType(id: string): ScaleType {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown scale type: ${id}`);
  return found;
}

/**
 * Spell one ascending octave of `type` from `root`, choosing each accidental so
 * the note lands on the staff step the scale asks for.
 */
export function spellScale(root: Pitch, type: ScaleType): Pitch[] {
  const rootDiatonic = diatonicOf(root);
  const rootMidi = midiOf(root);
  return type.semitones.map((semi, i) => {
    const d = rootDiatonic + type.steps[i];
    const natural = pitchFromDiatonic(d, 0);
    return { ...natural, alter: rootMidi + semi - midiOf(natural) };
  });
}

/** The same notes as a set of pitch classes, for membership tests. */
export function scalePitchClasses(root: Pitch, type: ScaleType): Set<number> {
  const rootPc = ((midiOf(root) % 12) + 12) % 12;
  return new Set(type.semitones.map((s) => (rootPc + s) % 12));
}

/**
 * Lay the scale out across a pitch range so a melody generator can walk it by
 * index instead of recomputing octaves. Index 0 is the lowest scale note at or
 * above `lowMidi`.
 */
export function scaleLadder(root: Pitch, type: ScaleType, lowMidi: number, highMidi: number): Pitch[] {
  const out: Pitch[] = [];
  const rootDiatonic = diatonicOf(root);
  const rootMidi = midiOf(root);
  const perOctave = type.semitones.length;
  // Start well below the range and walk up; cheaper than solving for the octave.
  for (let octave = -2; octave <= 9; octave++) {
    for (let i = 0; i < perOctave; i++) {
      const d = rootDiatonic + type.steps[i] + 7 * octave;
      const natural = pitchFromDiatonic(d, 0);
      const target = rootMidi + type.semitones[i] + 12 * octave;
      if (target < lowMidi || target > highMidi) continue;
      out.push({ ...natural, alter: target - midiOf(natural) });
    }
  }
  out.sort((a, b) => midiOf(a) - midiOf(b));
  return out;
}

/** Degree names used when quizzing, 1-indexed into the scale. */
export function degreeLabel(type: ScaleType, index: number): string {
  const step = type.steps[index % type.steps.length];
  const semi = type.semitones[index % type.semitones.length];
  const natural = [0, 2, 4, 5, 7, 9, 11][step % 7];
  const alter = semi - natural - (step >= 7 ? 12 : 0);
  return accidentalGlyph(alter) + String((step % 7) + 1);
}

export type { Letter };
