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
  /** Which way it was measured: 1 up, -1 down, 0 for a unison. */
  direction: -1 | 0 | 1;
}

export type Quality = 'dim' | 'min' | 'perf' | 'maj' | 'aug';

/** Semitones spanned by a perfect/major interval of each diatonic size. */
const BASE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const IS_PERFECT = [true, false, false, true, true, false, false];

/**
 * The interval from one pitch to another, in whichever order they come.
 *
 * `number` is always the ascending magnitude and `direction` says which way it
 * was measured, because every caller that wants the size wants it positive. An
 * earlier version took (low, high) and stated the ordering only in its
 * parameter names: given a descending pair it returned number 0 and printed
 * "m0", or "P-6" for a descending octave. Judging a played note against the one
 * that was asked for hits that case constantly, so the precondition had to go
 * rather than be documented.
 *
 * Direction is the direction on the staff, so an altered unison has none: C to
 * Cb and C to C# both stay on the same step, and there the sign of `semitones`
 * is carrying the quality rather than a direction. Taking the magnitude of both
 * components independently would collapse those two into one interval.
 */
export function intervalBetween(from: Pitch, to: Pitch): Interval {
  const diatonic = diatonicOf(to) - diatonicOf(from);
  const semitones = midiOf(to) - midiOf(from);
  if (diatonic === 0) return { number: 1, semitones, direction: 0 };
  const direction = diatonic > 0 ? 1 : -1;
  // `|| 0` normalises negative zero, which measuring downwards produces
  // whenever the two pitches sound alike on different steps: Db to C# counts 0
  // semitones, and -0 compares equal under === but not under Object.is, so an
  // interval would fail a toEqual against the same interval measured upwards.
  return {
    number: Math.abs(diatonic) + 1,
    semitones: semitones * direction || 0,
    direction,
  };
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

/** The name with its direction, for feedback on a played answer. */
export function directedIntervalName(iv: Interval): string {
  if (iv.direction === 0) return intervalName(iv);
  return `${intervalName(iv)} ${iv.direction > 0 ? 'up' : 'down'}`;
}

/** The names ear-training exercises use, keyed by semitone distance. */
export const SIMPLE_INTERVAL_NAMES: Record<number, string> = {
  0: 'Unison', 1: 'Minor 2nd', 2: 'Major 2nd', 3: 'Minor 3rd', 4: 'Major 3rd',
  5: 'Perfect 4th', 6: 'Tritone', 7: 'Perfect 5th', 8: 'Minor 6th',
  9: 'Major 6th', 10: 'Minor 7th', 11: 'Major 7th', 12: 'Octave',
};

/**
 * A reference tune for each interval, which is how most people learn them.
 *
 * **Every one of these rises, and that is a property of the table rather
 * than an accident of which tunes were chosen.** A mnemonic works by giving
 * the ear a contour it already knows, so one offered for the opposite
 * contour does not merely fail to help — it points the wrong way, at the
 * thing the learner is being asked to hear. A descending major 6th answered
 * with *"Think My Bonnie"* is worse than no hint.
 *
 * So callers must not use these for a descending interval. `gradeInterval`
 * does not. Descending tunes exist and are a real body of content —
 * *Swing Low* for a descending major 3rd, *The Way You Look Tonight* for a
 * fifth — and belong in a second table somebody writes deliberately rather
 * than in a guess appended here.
 */
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
