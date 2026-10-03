import {
  type Pitch, diatonicOf, midiOf, pitchFromDiatonic, pitchName, pitchClass,
} from './pitch';

export type ChordFamily = 'triad' | 'seventh' | 'sixth' | 'sus' | 'extended' | 'altered';

export interface ChordType {
  id: string;
  /** Spoken name, for the answer buttons. */
  name: string;
  /** Symbol suffix appended to the root, e.g. "m7b5". */
  suffix: string;
  /** Semitones above the root. */
  semitones: readonly number[];
  /** Staff steps above the root letter, parallel to `semitones`. */
  steps: readonly number[];
  family: ChordFamily;
}

function ct(
  id: string, name: string, suffix: string,
  semitones: readonly number[], steps: readonly number[], family: ChordFamily,
): ChordType {
  if (semitones.length !== steps.length) throw new Error(`${id}: pattern length mismatch`);
  return { id, name, suffix, semitones, steps, family };
}

const TRIAD_STEPS = [0, 2, 4];
const SEVENTH_STEPS = [0, 2, 4, 6];

export const CHORD_TYPES: readonly ChordType[] = [
  ct('maj', 'Major', '', [0, 4, 7], TRIAD_STEPS, 'triad'),
  ct('min', 'Minor', 'm', [0, 3, 7], TRIAD_STEPS, 'triad'),
  ct('dim', 'Diminished', 'dim', [0, 3, 6], TRIAD_STEPS, 'triad'),
  ct('aug', 'Augmented', 'aug', [0, 4, 8], TRIAD_STEPS, 'triad'),

  ct('sus2', 'Suspended 2nd', 'sus2', [0, 2, 7], [0, 1, 4], 'sus'),
  ct('sus4', 'Suspended 4th', 'sus4', [0, 5, 7], [0, 3, 4], 'sus'),

  ct('maj6', 'Major 6th', '6', [0, 4, 7, 9], [0, 2, 4, 5], 'sixth'),
  ct('min6', 'Minor 6th', 'm6', [0, 3, 7, 9], [0, 2, 4, 5], 'sixth'),

  ct('maj7', 'Major 7th', 'maj7', [0, 4, 7, 11], SEVENTH_STEPS, 'seventh'),
  ct('dom7', 'Dominant 7th', '7', [0, 4, 7, 10], SEVENTH_STEPS, 'seventh'),
  ct('min7', 'Minor 7th', 'm7', [0, 3, 7, 10], SEVENTH_STEPS, 'seventh'),
  ct('m7b5', 'Half-diminished 7th', 'm7b5', [0, 3, 6, 10], SEVENTH_STEPS, 'seventh'),
  ct('dim7', 'Diminished 7th', 'dim7', [0, 3, 6, 9], SEVENTH_STEPS, 'seventh'),
  ct('minmaj7', 'Minor-Major 7th', 'mMaj7', [0, 3, 7, 11], SEVENTH_STEPS, 'seventh'),

  ct('dom9', 'Dominant 9th', '9', [0, 4, 7, 10, 14], [0, 2, 4, 6, 8], 'extended'),
  ct('maj9', 'Major 9th', 'maj9', [0, 4, 7, 11, 14], [0, 2, 4, 6, 8], 'extended'),
  ct('min9', 'Minor 9th', 'm9', [0, 3, 7, 10, 14], [0, 2, 4, 6, 8], 'extended'),
  ct('dom11', 'Dominant 11th', '11', [0, 7, 10, 14, 17], [0, 4, 6, 8, 10], 'extended'),
  ct('dom13', 'Dominant 13th', '13', [0, 4, 10, 14, 21], [0, 2, 6, 8, 12], 'extended'),

  ct('dom7b9', 'Dominant 7th flat 9', '7b9', [0, 4, 7, 10, 13], [0, 2, 4, 6, 8], 'altered'),
  ct('dom7s9', 'Dominant 7th sharp 9', '7#9', [0, 4, 7, 10, 15], [0, 2, 4, 6, 8], 'altered'),
  ct('dom7s11', 'Dominant 7th sharp 11', '7#11', [0, 4, 10, 14, 18], [0, 2, 6, 8, 10], 'altered'),
  ct('dom7b13', 'Dominant 7th flat 13', '7b13', [0, 4, 10, 14, 20], [0, 2, 6, 8, 12], 'altered'),
  ct('aug7', 'Augmented 7th', '7#5', [0, 4, 8, 10], SEVENTH_STEPS, 'altered'),
];

const BY_ID = new Map(CHORD_TYPES.map((c) => [c.id, c]));

export function chordType(id: string): ChordType {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown chord type: ${id}`);
  return found;
}

export interface Chord {
  root: Pitch;
  type: ChordType;
  /** 0 = root position, 1 = first inversion, and so on. */
  inversion: number;
}

export function chord(root: Pitch, type: ChordType, inversion = 0): Chord {
  return { root, type, inversion };
}

/** Spell the chord in close root position starting on `root`. */
export function spellChord(c: Chord): Pitch[] {
  const rootDiatonic = diatonicOf(c.root);
  const rootMidi = midiOf(c.root);
  return c.type.semitones.map((semi, i) => {
    const natural = pitchFromDiatonic(rootDiatonic + c.type.steps[i], 0);
    return { ...natural, alter: rootMidi + semi - midiOf(natural) };
  });
}

/**
 * Voice the chord as actual sounding pitches, applying the inversion by lifting
 * the bottom notes an octave at a time. `maxSpread` keeps a wide extended chord
 * from running off the top of the keyboard.
 */
export function voiceChord(c: Chord, options: { open?: boolean } = {}): Pitch[] {
  const tones = spellChord(c);
  const inv = ((c.inversion % tones.length) + tones.length) % tones.length;
  const voiced = tones.map((p, i) =>
    i < inv ? { ...p, octave: p.octave + 1 } : p,
  );
  voiced.sort((a, b) => midiOf(a) - midiOf(b));
  if (options.open && voiced.length >= 3) {
    // Drop-2: take the second voice from the top down an octave. It is the
    // voicing a pianist actually plays, and it sounds less like a stack.
    const idx = voiced.length - 2;
    voiced[idx] = { ...voiced[idx], octave: voiced[idx].octave - 1 };
    voiced.sort((a, b) => midiOf(a) - midiOf(b));
  }
  return voiced;
}

export function chordSymbol(c: Chord): string {
  const base = pitchName(c.root, false) + c.type.suffix;
  if (c.inversion === 0) return base;
  const bass = voiceChord(c)[0];
  return `${base}/${pitchName(bass, false)}`;
}

export const INVERSION_LABELS = ['root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion'];

/**
 * Identify a chord from sounding pitches, ignoring octaves and doublings.
 * Returns every reading that fits, best first — a diminished seventh genuinely
 * has four equally good roots, and pretending otherwise would mark a correct
 * answer wrong.
 */
export function identifyChord(pitches: readonly Pitch[]): Array<{ rootPc: number; type: ChordType; inversion: number }> {
  const pcs = [...new Set(pitches.map(pitchClass))].sort((a, b) => a - b);
  if (pcs.length < 3) return [];
  const bassPc = pitches.length
    ? pitchClass([...pitches].sort((a, b) => midiOf(a) - midiOf(b))[0])
    : pcs[0];

  const matches: Array<{ rootPc: number; type: ChordType; inversion: number }> = [];
  for (const type of CHORD_TYPES) {
    const shape = [...new Set(type.semitones.map((s) => s % 12))].sort((a, b) => a - b);
    if (shape.length !== pcs.length) continue;
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const want = shape.map((s) => (rootPc + s) % 12).sort((a, b) => a - b);
      if (want.every((v, i) => v === pcs[i])) {
        const sorted = type.semitones.map((s) => (rootPc + s) % 12);
        const inversion = Math.max(0, sorted.indexOf(bassPc));
        matches.push({ rootPc, type, inversion });
      }
    }
  }
  // Prefer the simpler families, then root position: C/E is more likely to be
  // "C major, first inversion" than an exotic reading rooted on E.
  const rank: Record<ChordFamily, number> = {
    triad: 0, seventh: 1, sixth: 2, sus: 3, extended: 4, altered: 5,
  };
  matches.sort((a, b) =>
    rank[a.type.family] - rank[b.type.family] || a.inversion - b.inversion);
  return matches;
}
