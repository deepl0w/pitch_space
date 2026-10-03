import { describe, expect, it } from 'vitest';
import { ALL_KEYS, MAJOR_KEYS, MINOR_KEYS, findKey, keyName } from './key';
import { type Pitch, diatonicOf, midiOf, pitchName } from './pitch';
import { identifyChord } from './chord';
import {
  DIATONIC_SEVENTHS, DIATONIC_TRIADS, type Degree, degreeRoot, numeral,
  numeralText, realizePitches,
} from './roman';

const names = (ps: Pitch[]) => ps.map((p) => pitchName(p, false));

const DEGREES: Degree[] = [1, 2, 3, 4, 5, 6, 7];

describe('realising numerals', () => {
  it('spells the diatonic triads of C major without an accidental anywhere', () => {
    const c = findKey('C_major');
    expect(DEGREES.map((d) => names(realizePitches(c, numeral(d, DIATONIC_TRIADS.major[d - 1]))))).toEqual([
      ['C', 'E', 'G'], ['D', 'F', 'A'], ['E', 'G', 'B'], ['F', 'A', 'C'],
      ['G', 'B', 'D'], ['A', 'C', 'E'], ['B', 'D', 'F'],
    ]);
  });

  // The case the whole symbolic-numeral design exists for.
  it('spells V/V in C as D-F#-A, not D-Gb-A', () => {
    const c = findKey('C_major');
    expect(names(realizePitches(c, numeral(5, 'dom7', { appliedTo: 5 }))))
      .toEqual(['D', 'F#', 'A', 'C']);
  });

  it('builds an applied dominant on its target, not on the home-key degree', () => {
    const c = findKey('C_major');
    // V/ii is A7 — the fifth above D — and its C# is a raised note in C major.
    expect(names(realizePitches(c, numeral(5, 'dom7', { appliedTo: 2 }))))
      .toEqual(['A', 'C#', 'E', 'G']);
    // V/IV is C7, which needs a Bb that the key signature does not carry.
    expect(names(realizePitches(c, numeral(5, 'dom7', { appliedTo: 4 }))))
      .toEqual(['C', 'E', 'G', 'Bb']);
  });

  it('raises the leading tone when a minor key asks for a major dominant', () => {
    const cm = findKey('C_minor');
    // Degree 5 of C natural minor is G; a major triad there spells the B
    // natural that makes it a dominant, without the key having to say so.
    expect(names(realizePitches(cm, numeral(5, 'maj')))).toEqual(['G', 'B', 'D']);
    expect(names(realizePitches(cm, numeral(5, 'dom7')))).toEqual(['G', 'B', 'D', 'F']);
    // And the modal minor v is still available when it is wanted.
    expect(names(realizePitches(cm, numeral(5, 'min')))).toEqual(['G', 'Bb', 'D']);
  });

  it('spells a Neapolitan as a flattened second degree, keeping the letter', () => {
    const cm = findKey('C_minor');
    expect(names(realizePitches(cm, numeral(2, 'maj', { chromaticAlter: -1 }))))
      .toEqual(['Db', 'F', 'Ab']);
  });
});

describe('spelling invariants across every key', () => {
  it('puts each chord root on the staff step its degree requires', () => {
    for (const key of ALL_KEYS) {
      const tonicStep = diatonicOf(key.tonic) % 7;
      for (const d of DEGREES) {
        const root = degreeRoot(key, d);
        expect(diatonicOf(root) % 7, `${keyName(key)} degree ${d}`)
          .toBe((tonicStep + d - 1) % 7);
      }
    }
  });

  it('never needs a triple accidental, in any key, on any diatonic chord', () => {
    for (const key of ALL_KEYS) {
      const table = key.mode === 'major' ? DIATONIC_SEVENTHS.major : DIATONIC_SEVENTHS.minor;
      for (const d of DEGREES) {
        for (const p of realizePitches(key, numeral(d, table[d - 1]))) {
          expect(Math.abs(p.alter), `${keyName(key)} ${d}: ${pitchName(p)}`)
            .toBeLessThanOrEqual(2);
        }
      }
    }
  });

  // Cross-checks the numeral layer against the chord layer: two modules that
  // derived the same chord by different routes have to agree.
  it('produces chords that identifyChord reads back as the intended quality', () => {
    for (const key of ALL_KEYS) {
      const table = key.mode === 'major' ? DIATONIC_TRIADS.major : DIATONIC_TRIADS.minor;
      for (const d of DEGREES) {
        const typeId = table[d - 1];
        const pitches = realizePitches(key, numeral(d, typeId));
        const readings = identifyChord(pitches);
        expect(readings[0]?.type.id, `${keyName(key)} degree ${d}`).toBe(typeId);
        expect(readings[0].rootPc).toBe(((midiOf(pitches[0]) % 12) + 12) % 12);
      }
    }
  });

  it('spells every applied dominant with a real leading tone to its target', () => {
    for (const key of [...MAJOR_KEYS, ...MINOR_KEYS]) {
      for (const target of [2, 3, 4, 5, 6] as Degree[]) {
        const pitches = realizePitches(key, numeral(5, 'dom7', { appliedTo: target }));
        const targetRoot = degreeRoot(key, target);
        // The third of V/x sits a semitone below x's root.
        const third = pitches[1];
        expect((midiOf(targetRoot) - midiOf(third) + 1200) % 12, `${keyName(key)} V/${target}`)
          .toBe(1);
      }
    }
  });
});

describe('how a numeral is written', () => {
  it('carries quality in the case and inversion in the figures', () => {
    expect(numeralText(numeral(1, 'maj'))).toBe('I');
    expect(numeralText(numeral(2, 'min', { inversion: 1 }))).toBe('ii6');
    expect(numeralText(numeral(5, 'dom7'))).toBe('V7');
    expect(numeralText(numeral(5, 'dom7', { inversion: 1 }))).toBe('V65');
    expect(numeralText(numeral(5, 'dom7', { inversion: 3 }))).toBe('V42');
    expect(numeralText(numeral(7, 'dim', { inversion: 1 }))).toBe('viio6');
    expect(numeralText(numeral(7, 'm7b5'))).toBe('viiø7');
    expect(numeralText(numeral(1, 'maj', { inversion: 2 }))).toBe('I64');
    expect(numeralText(numeral(2, 'maj', { chromaticAlter: -1, inversion: 1 }))).toBe('bII6');
    expect(numeralText(numeral(5, 'dom7', { appliedTo: 5 }))).toBe('V7/V');
  });
});
