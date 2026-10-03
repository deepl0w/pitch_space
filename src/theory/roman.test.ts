import { describe, expect, it } from 'vitest';
import { ALL_KEYS, MAJOR_KEYS, MINOR_KEYS, findKey, keyName } from './key';
import { type Pitch, diatonicOf, midiOf, pitchName } from './pitch';
import { chordType, identifyChord, spellChord, voiceChord } from './chord';
import {
  DIATONIC_SEVENTHS, DIATONIC_TRIADS, type Degree, degreeRoot, numeral,
  numeralText, realizeNumeral, realizePitches,
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

  // The figure and the chord that sounds are decided in two places: figures()
  // clamped the inversion, voiceChord() takes it modulo the number of tones.
  // Out of range they disagreed, and a negative one indexed off the end of the
  // figure table and printed the word "undefined".
  it('figures an out-of-range inversion as the chord that actually sounds', () => {
    const triad = numeral(1, 'maj', { inversion: 3 });
    expect(numeralText(triad)).toBe('I');
    expect(numeralText(numeral(1, 'maj', { inversion: 4 }))).toBe('I6');
    expect(numeralText(numeral(1, 'maj', { inversion: -1 }))).toBe('I64');
    expect(numeralText(numeral(5, 'dom7', { inversion: 4 }))).toBe('V7');
    expect(numeralText(numeral(5, 'dom7', { inversion: -1 }))).toBe('V42');
  });

  it('never prints undefined, whatever inversion it is handed', () => {
    for (const typeId of ['maj', 'dom7', 'dom9']) {
      for (let inversion = -6; inversion <= 8; inversion++) {
        const text = numeralText(numeral(1, typeId, { inversion }));
        expect(text, `${typeId} inversion ${inversion}`).not.toContain('undefined');
      }
    }
  });

  it('agrees with the bass the chord is voiced on', () => {
    for (const typeId of ['maj', 'dom7']) {
      const size = chordType(typeId).semitones.length;
      for (let inversion = -4; inversion <= 6; inversion++) {
        const n = numeral(1, typeId, { inversion });
        const key = findKey('C_major');
        const bass = voiceChord(realizeNumeral(key, n))[0];
        const wanted = spellChord(realizeNumeral(key, numeral(1, typeId)))[
          ((inversion % size) + size) % size
        ];
        expect(pitchName(bass, false), `${typeId} inversion ${inversion}`)
          .toBe(pitchName(wanted, false));
        expect(numeralText(n), `${typeId} inversion ${inversion}`)
          .toBe(numeralText(numeral(1, typeId, { inversion: ((inversion % size) + size) % size })));
      }
    }
  });
});
