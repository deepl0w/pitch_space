import { midiOf, pitchName, type Pitch } from '../../theory/pitch';

/**
 * Where notes fall on a keyboard and a guitar neck, as numbers a drawing can
 * read. Pure, so what is drawn is testable without drawing it.
 */

const BLACK = new Set([1, 3, 6, 8, 10]);

/** Whether a MIDI note is a black key. */
export function isBlack(midi: number): boolean {
  return BLACK.has(((midi % 12) + 12) % 12);
}

/**
 * The keys to draw for these notes: from the C at or below the lowest to the
 * B at or above the highest.
 *
 * Whole octaves from C because that is how a keyboard is read — the eye finds
 * its place from the group of two black keys, and a strip starting on an
 * arbitrary note gives it nothing to find.
 */
export function keyboardSpan(pitches: readonly Pitch[]): { low: number; high: number } {
  const midis = pitches.map(midiOf);
  const low = Math.min(...midis);
  const high = Math.max(...midis);
  return { low: low - (((low % 12) + 12) % 12), high: high + (11 - (((high % 12) + 12) % 12)) };
}

/**
 * Standard tuning, lowest string first: E2 A2 D3 G3 B3 E4.
 *
 * The only tuning drawn. A setting for others is cheap to add once someone
 * asks for one; guessing which (drop D, DADGAD, open G) is not.
 */
export const GUITAR_TUNING: readonly number[] = [40, 45, 50, 55, 59, 64];

/** Open strings and the first twelve frets: one full octave on every string. */
export const FRETS = 12;

export interface FretPosition {
  /** 0 is the lowest string. */
  readonly string: number;
  /** 0 is the open string. */
  readonly fret: number;
  readonly pitchClass: number;
}

/**
 * Every place on the neck one of these notes can be played, to the twelfth
 * fret.
 *
 * By pitch class rather than by the exact octave, which is the deliberate
 * difference from the keyboard: on a guitar a scale is a pattern across the
 * neck and a chord has many shapes, and drawing one octave at one position
 * would choose a fingering for the reader. Every position is the map they
 * choose from.
 */
export function fretPositions(pitches: readonly Pitch[]): FretPosition[] {
  const wanted = new Set(pitches.map((p) => ((midiOf(p) % 12) + 12) % 12));
  const out: FretPosition[] = [];
  GUITAR_TUNING.forEach((open, string) => {
    for (let fret = 0; fret <= FRETS; fret += 1) {
      const pitchClass = (open + fret) % 12;
      if (wanted.has(pitchClass)) out.push({ string, fret, pitchClass });
    }
  });
  return out;
}

/**
 * The name each pitch class is written with in these notes.
 *
 * So a C blues scale's flat fifth is labelled G♭ on the neck as it is on the
 * stave, not F♯ because a lookup table preferred sharps.
 */
export function spelledNames(pitches: readonly Pitch[]): Map<number, string> {
  const names = new Map<number, string>();
  for (const p of pitches) {
    const pc = ((midiOf(p) % 12) + 12) % 12;
    if (!names.has(pc)) names.set(pc, pitchName(p, false));
  }
  return names;
}
