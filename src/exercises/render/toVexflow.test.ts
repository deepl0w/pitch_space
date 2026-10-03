// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { drawScore, type ScoreSpec } from './toVexflow';
import { ALL_KEYS, type Key, findKey, keyName } from '../../theory/key';
import { CHORD_TYPES, chord, spellChord } from '../../theory/chord';
import { SCALE_TYPES, spellScale } from '../../theory/scale';
import { noteValue, timeSignature } from '../../theory/meter';
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

function drawInk(spec: ScoreSpec, colour: string): SVGElement {
  const div = host();
  drawScore(div, spec, { width: 760, colour });
  const svg = div.querySelector('svg');
  if (!svg) throw new Error('nothing was drawn');
  return svg;
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

/**
 * Every mark on the page takes the ink it was given.
 *
 * The bug this pins reached the screen and looked nearly right: recolouring
 * VexFlow's output with CSS caught the glyphs and missed the staff lines and
 * stems, which are stroked paths carrying no `stroke` attribute of their own.
 * Thirteen of thirty-three marks stayed black. Counting marks by eye is what
 * found it; resolving the paint the way a browser does is what keeps it found.
 *
 * Attributes alone are not enough to ask this. A notehead sets no fill and
 * inherits one from the group above it, so reading its own attributes says
 * "black (the SVG default)" when it is painted correctly, and says nothing at
 * all when it is not.
 */
describe('the ink every mark is drawn in', () => {
  const INK = 'rgb(7, 11, 13)';

  /** Fill or stroke as a browser would resolve it: the nearest ancestor that sets it. */
  function painted(element: Element, property: 'fill' | 'stroke'): string | null {
    let node: Element | null = element;
    while (node) {
      const value = node.getAttribute(property);
      if (value) return value === 'none' ? null : value;
      if (node.tagName === 'svg') break;
      node = node.parentElement;
    }
    // An unset fill paints black; an unset stroke paints nothing.
    return property === 'fill' ? 'black' : null;
  }

  function marksOffTheInk(svg: SVGElement, ink: string): string[] {
    const off: string[] = [];
    for (const element of svg.querySelectorAll('path, rect, text, line, circle, polygon')) {
      for (const property of ['fill', 'stroke'] as const) {
        const colour = painted(element, property);
        if (colour !== null && colour !== ink) {
          off.push(`${element.tagName} ${property}=${colour} (${element.getAttribute('d')?.slice(0, 32) ?? element.textContent ?? ''})`);
        }
      }
    }
    return off;
  }

  /** A score with one of everything that gets drawn, including ledger lines. */
  const everything: ScoreSpec = {
    clef: 'treble',
    key: findKey('Eb_major'),
    timeSignature: timeSignature('4/4'),
    notes: [
      // C4 sits below the treble staff and A5 above it, so both ledger lines
      // are drawn. Middle C is the commonest ledger-line note there is.
      { pitches: [parsePitch('C4')], value: noteValue('8') },
      { pitches: [parsePitch('A5')], value: noteValue('8') },
      { pitches: [], value: noteValue('q') },
      { pitches: [parsePitch('G4'), parsePitch('B4')], value: noteValue('h', 1) },
    ],
  };

  it('draws the marks this is meant to be checking', () => {
    // A vacuous pass is the failure mode here: a sweep over an empty staff
    // finds nothing off the ink because there is nothing on the page.
    const svg = drawInk(everything, INK);
    expect(svg.querySelectorAll('path, rect, text').length).toBeGreaterThan(20);
    const ledger = [...svg.querySelectorAll('.vf-stavenote path')]
      .filter((p) => /^M[\d.]+ ([\d.]+)L[\d.]+ \1$/.test(p.getAttribute('d') ?? ''));
    expect(ledger.length, 'no ledger line was drawn').toBeGreaterThan(0);
  });

  it('paints every mark in the ink it was handed', () => {
    expect(marksOffTheInk(drawInk(everything, INK), INK)).toEqual([]);
  });

  it('paints every mark in the default ink when none is given', () => {
    const div = document.createElement('div');
    document.body.append(div);
    drawScore(div, everything, { width: 760 });
    const svg = div.querySelector('svg')!;
    expect(marksOffTheInk(svg, '#000000')).toEqual([]);
  });

  it('lets a note carry its own colour, for marking a performance', () => {
    const marked: ScoreSpec = {
      clef: 'treble',
      notes: [
        { pitches: [parsePitch('C4')], value: noteValue('q') },
        { pitches: [parsePitch('E4')], value: noteValue('q'), colour: 'rgb(200, 30, 30)' },
      ],
    };
    const svg = drawInk(marked, INK);
    const off = marksOffTheInk(svg, INK);
    expect(off.length, 'the marked note should stand out').toBeGreaterThan(0);
    for (const mark of off) expect(mark).toContain('rgb(200, 30, 30)');
  });
});
