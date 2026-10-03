import { type Pitch, diatonicOf, midiOf } from './pitch';

/**
 * Intervals are spelled, like pitches: a diatonic size (how many staff steps)
 * and a chromatic size (how many semitones). C-F# and C-Gb both span six
 * semitones but they are not the same interval, and ear training that calls
 * them the same teaches the wrong thing.
 */
export interface Interval {
  /** 1 = unison, 2 = second, ... 8 = octave. Can exceed 8 for compound. */
  number: number;
  semitones: number;
}

export type Quality = 'dim' | 'min' | 'perf' | 'maj' | 'aug';

/** Semitones spanned by a perfect/major interval of each diatonic size. */
const BASE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const IS_PERFECT = [true, false, false, true, true, false, false];

export function intervalBetween(low: Pitch, high: Pitch): Interval {
  const diatonic = diatonicOf(high) - diatonicOf(low);
  return { number: diatonic + 1, semitones: midiOf(high) - midiOf(low) };
}

export function qualityOf(iv: Interval): Quality {
  const simpleSteps = ((iv.number - 1) % 7 + 7) % 7;
  const octaves = Math.floor((iv.number - 1) / 7);
  const expected = BASE_SEMITONES[simpleSteps] + 12 * octaves;
  const diff = iv.semitones - expected;
  if (IS_PERFECT[simpleSteps]) {
    if (diff === 0) return 'perf';
    return diff > 0 ? 'aug' : 'dim';
  }
  if (diff === 0) return 'maj';
  if (diff === -1) return 'min';
  return diff > 0 ? 'aug' : 'dim';
}

const QUALITY_ABBREV: Record<Quality, string> = {
  dim: 'd', min: 'm', perf: 'P', maj: 'M', aug: 'A',
};

export function intervalName(iv: Interval): string {
  return QUALITY_ABBREV[qualityOf(iv)] + iv.number;
}

/** The names ear-training exercises use, keyed by semitone distance. */
export const SIMPLE_INTERVAL_NAMES: Record<number, string> = {
  0: 'Unison', 1: 'Minor 2nd', 2: 'Major 2nd', 3: 'Minor 3rd', 4: 'Major 3rd',
  5: 'Perfect 4th', 6: 'Tritone', 7: 'Perfect 5th', 8: 'Minor 6th',
  9: 'Major 6th', 10: 'Minor 7th', 11: 'Major 7th', 12: 'Octave',
};

/** A reference tune for each interval, which is how most people learn them. */
export const INTERVAL_MNEMONICS: Record<number, string> = {
  1: 'Jaws',
  2: 'Happy Birthday',
  3: 'Greensleeves',
  4: 'When the Saints',
  5: 'Here Comes the Bride',
  6: 'The Simpsons',
  7: 'Twinkle Twinkle',
  8: 'The Entertainer',
  9: 'My Bonnie',
  10: 'Star Trek theme',
  11: 'Take On Me',
  12: 'Somewhere Over the Rainbow',
};
