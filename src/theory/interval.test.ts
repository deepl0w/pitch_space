import { describe, expect, it } from 'vitest';
import {
  INTERVAL_MNEMONICS, SIMPLE_INTERVAL_NAMES, intervalBetween, intervalName, qualityOf,
} from './interval';
import { midiOf, parsePitch, pitchFromDiatonic } from './pitch';

const between = (low: string, high: string) =>
  intervalName(intervalBetween(parsePitch(low), parsePitch(high)));

describe('intervalBetween', () => {
  it('names the simple intervals from C', () => {
    const cases: Array<[string, string]> = [
      ['C4', 'P1'], ['Db4', 'm2'], ['D4', 'M2'], ['Eb4', 'm3'], ['E4', 'M3'],
      ['F4', 'P4'], ['Gb4', 'd5'], ['G4', 'P5'], ['Ab4', 'm6'], ['A4', 'M6'],
      ['Bb4', 'm7'], ['B4', 'M7'], ['C5', 'P8'],
    ];
    for (const [high, want] of cases) expect(between('C4', high), high).toBe(want);
  });

  it('tells an augmented fourth from a diminished fifth', () => {
    // Six semitones either way; only the spelling decides which it is, and an
    // exercise that calls them the same teaches the wrong thing.
    expect(between('C4', 'F#4')).toBe('A4');
    expect(between('C4', 'Gb4')).toBe('d5');
    expect(midiOf(parsePitch('F#4'))).toBe(midiOf(parsePitch('Gb4')));
  });

  it('handles altered unisons and the awkward spellings', () => {
    expect(between('C4', 'C#4')).toBe('A1');
    expect(between('C4', 'Cb4')).toBe('d1');
    expect(between('C4', 'Fb4')).toBe('d4');
    expect(between('C4', 'B#4')).toBe('A7');
    expect(between('B3', 'C4')).toBe('m2');
    expect(between('Cb4', 'C4')).toBe('A1');
  });

  it('counts compound intervals past the octave', () => {
    expect(between('C4', 'D5')).toBe('M9');
    expect(between('C4', 'E5')).toBe('M10');
    expect(between('C4', 'F#5')).toBe('A11');
    expect(between('C4', 'C6')).toBe('P15');
  });

  it('gives the perfect sizes a perfect quality and the rest a major one', () => {
    // Every unaltered interval above C: 1 4 5 8 are perfect, the others major.
    for (let step = 0; step <= 14; step++) {
      const high = pitchFromDiatonic(28 + step);
      const quality = qualityOf(intervalBetween(parsePitch('C4'), high));
      const perfect = [0, 3, 4, 7, 10, 11, 14].includes(step);
      expect(quality, `step ${step}`).toBe(perfect ? 'perf' : 'maj');
    }
  });

  it('widening by a semitone widens the quality', () => {
    // A third: Ebb dim, Eb min, E maj, E# aug.
    expect(between('C4', 'Ebb4')).toBe('d3');
    expect(between('C4', 'Eb4')).toBe('m3');
    expect(between('C4', 'E4')).toBe('M3');
    expect(between('C4', 'E#4')).toBe('A3');
    // A fifth has no major or minor: Gb dim, G perfect, G# augmented.
    expect(between('C4', 'Gb4')).toBe('d5');
    expect(between('C4', 'G4')).toBe('P5');
    expect(between('C4', 'G#4')).toBe('A5');
  });
});

describe('the ear-training tables', () => {
  it('names every semitone distance up to the octave', () => {
    for (let semitones = 0; semitones <= 12; semitones++) {
      expect(SIMPLE_INTERVAL_NAMES[semitones], `${semitones}`).toBeTypeOf('string');
    }
  });

  it('offers a mnemonic for every interval it names, bar the unison', () => {
    for (let semitones = 1; semitones <= 12; semitones++) {
      expect(INTERVAL_MNEMONICS[semitones], `${semitones}`).toBeTypeOf('string');
    }
  });
});
