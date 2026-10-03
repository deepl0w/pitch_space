// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { drawScore, type ScoreSpec } from './toVexflow';
import { ALL_KEYS, type Key, findKey, keyName } from '../../theory/key';
import { CHORD_TYPES, chord, spellChord } from '../../theory/chord';
import { SCALE_TYPES, spellScale } from '../../theory/scale';
import { noteValue } from '../../theory/meter';
import {
  DIATONIC_SEVENTHS, DIATONIC_TRIADS, type Degree, numeral, realizePitches,
} from '../../theory/roman';
import { type Pitch, parsePitch, pitchName } from '../../theory/pitch';

/**
 * These assert the property the engine's spelling tests could only approximate.
 * "Every accidental is within a double" is a proxy for "the staff draws"; the
 * proxy held while a Cb diminished seventh refused to render, because the
 * limit it stands for lives in VexFlow's key parser rather than in the theory.
 * Here the engraver is actually asked.
 */

function host(): HTMLDivElement {
  const div = document.createElement('div');
  document.body.append(div);
  return div;
}

function draw(spec: ScoreSpec): SVGElement {
  const div = host();
  drawScore(div, spec, { width: 760 });
  const svg = div.querySelector('svg');
  if (!svg) throw new Error('nothing was drawn');
  return svg;
}

const QUARTER = noteValue('q');

describe('drawing a score', () => {
  it('draws a plain scale and puts real glyphs on the page', () => {
    const key = findKey('C_major');
    const svg = draw({
      clef: 'treble',
      key,
      notes: spellScale(parsePitch('C4'), SCALE_TYPES[0]).map((p) => ({
        pitches: [p], value: QUARTER,
      })),
    });
    // A stave that drew nothing still produces an <svg>, so count the marks.
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(10);
  });

  // The defect that started this: the chord is legal, reachable from the
  // shipped key list, and VexFlow refuses the spelling outright.
  it('draws the Cb diminished seventh that once refused to render', () => {
    const svg = draw({
      clef: 'treble',
      key: findKey('Cb_major'),
      notes: [{ pitches: spellChord(chord(parsePitch('Cb4'), CHORD_TYPES.find((c) => c.id === 'dim7')!)), value: noteValue('w') }],
    });
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(5);
  });

  it('draws rests, dotted values and chords without complaint', () => {
    const svg = draw({
      clef: 'bass',
      key: findKey('Eb_major'),
      notes: [
        { pitches: [], value: QUARTER },
        { pitches: [parsePitch('Eb2')], value: noteValue('h', 1) },
        { pitches: [parsePitch('Eb2'), parsePitch('G2'), parsePitch('Bb2')], value: noteValue('8') },
      ],
    });
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(5);
  });

  /**
   * The sweep the proxy tests were standing in for, done by coverage rather
   * than by brute force.
   *
   * What VexFlow's key parser can reject is a *spelling* — a letter with too
   * many accidentals — and it rejects one wherever it appears. So the property
   * is that every distinct spelling the catalogs can produce engraves, and the
   * set of those is small: seven letters across a handful of alterations.
   * Rendering each of the 720 chords separately asked the same question
   * hundreds of times over, took minutes under jsdom, and would have stopped
   * being run.
   */
  const everySpelling = (): Pitch[] => {
    const seen = new Map<string, Pitch>();
    for (const key of ALL_KEYS) {
      const tonic = { ...key.tonic, octave: 4 };
      const pitches = [
        ...CHORD_TYPES.flatMap((type) => spellChord(chord(tonic, type))),
        ...SCALE_TYPES.flatMap((type) => spellScale(tonic, type)),
        ...romanSpellings(key),
      ];
      for (const p of pitches) seen.set(`${p.letter}:${p.alter}`, p);
    }
    return [...seen.values()];
  };

  /**
   * A harmony exercise reaches the staff through a numeral, not through a
   * chord rooted on the tonic, and an applied chord is built against its
   * target rather than against the home key — so it can spell a note the
   * catalogs never produce. VII/II in A# minor has a C### in it, which is one
   * spelling further out than anything the chord list alone reaches.
   */
  const romanSpellings = (key: Key): Pitch[] => {
    const out: Pitch[] = [];
    for (let degree = 1; degree <= 7; degree++) {
      for (const table of [DIATONIC_TRIADS, DIATONIC_SEVENTHS]) {
        out.push(...realizePitches(key, numeral(degree as Degree, table[key.mode][degree - 1])));
      }
      for (const target of [2, 3, 4, 5, 6] as Degree[]) {
        for (const typeId of ['maj', 'dom7', 'dim7']) {
          for (const applied of [5, 7] as Degree[]) {
            out.push(...realizePitches(key, numeral(applied, typeId, { appliedTo: target })));
          }
        }
      }
    }
    return out;
  };

  it('covers more spellings than a single key could', () => {
    // Guards the sweep below against silently shrinking to nothing.
    const spellings = everySpelling();
    expect(spellings.length).toBeGreaterThan(20);
    expect(spellings.some((p) => Math.abs(p.alter) > 2)).toBe(true);
  });

  it('reaches further through a numeral than through the chord list alone', () => {
    // If the numeral path ever stops contributing, the sweep above still
    // passes on the catalogs and quietly stops covering what the app renders.
    const catalogs = new Set<string>();
    for (const key of ALL_KEYS) {
      const tonic = { ...key.tonic, octave: 4 };
      for (const type of CHORD_TYPES) {
        for (const p of spellChord(chord(tonic, type))) catalogs.add(`${p.letter}:${p.alter}`);
      }
      for (const type of SCALE_TYPES) {
        for (const p of spellScale(tonic, type)) catalogs.add(`${p.letter}:${p.alter}`);
      }
    }
    const extra = ALL_KEYS.flatMap(romanSpellings)
      .filter((p) => !catalogs.has(`${p.letter}:${p.alter}`));
    expect(extra.map((p) => pitchName(p, false))).toContain('C###');
  });

  it('engraves every spelling the chord and scale catalogs can produce', () => {
    const spellings = everySpelling();
    const failures: string[] = [];
    for (const pitch of spellings) {
      try {
        draw({ clef: 'treble', notes: [{ pitches: [pitch], value: QUARTER }] });
      } catch (cause) {
        failures.push(`${pitchName(pitch)}: ${(cause as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  /**
   * The heaviest test in the suite, and the only one that asks what happens
   * when a key signature and a page of accidentals meet: VexFlow decides per
   * note whether the signature already covers it, and that decision is made
   * thirty different ways. Thirty staves of twenty-four chords is a few
   * seconds under jsdom, which is why the budget is stated rather than left
   * to the five-second default and discovered as a flake.
   */
  it('engraves a whole key signature with a chord of every type', () => {
    const failures: string[] = [];
    for (const key of ALL_KEYS) {
      const notes = CHORD_TYPES.map((type) => ({
        pitches: spellChord(chord({ ...key.tonic, octave: 4 }, type)),
        value: QUARTER,
      }));
      try {
        draw({ clef: 'treble', key, notes });
      } catch (cause) {
        failures.push(`${keyName(key)}: ${(cause as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  }, 30_000);
});
