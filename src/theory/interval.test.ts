import { describe, expect, it } from 'vitest';
import { INTERVAL_MNEMONICS, SIMPLE_INTERVAL_NAMES, directedIntervalName, intervalBetween, intervalName, qualityOf } from './interval';
import { type Pitch, diatonicOf, midiOf, parsePitch, pitch, pitchFromDiatonic, pitchName } from './pitch';

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

describe('measuring either way round, swept', () => {
  // Every spelled pitch over two octaves, each pair both ways. The property is
  // the point here rather than any one pair: a caller comparing a played note
  // against the asked-for one hands them over in whichever order they arrive.
  const pitches: Pitch[] = [];
  for (let octave = 3; octave <= 5; octave++) {
    for (let letter = 0; letter < 7; letter++) {
      for (const alter of [-1, 0, 1]) pitches.push(pitch(letter as 0, alter, octave));
    }
  }

  it('reports the same size and the opposite direction', () => {
    for (const a of pitches) {
      for (const b of pitches) {
        if (diatonicOf(a) === diatonicOf(b)) continue; // a unison has no direction
        const there = intervalBetween(a, b);
        const back = intervalBetween(b, a);
        const where = `${pitchName(a)} <-> ${pitchName(b)}`;
        expect(back.number, where).toBe(there.number);
        expect(back.semitones, where).toBe(there.semitones);
        expect(back.direction, where).toBe(-there.direction);
        expect(intervalName(back), where).toBe(intervalName(there));
      }
    }
  });

  it('always names a positive interval, and never undefined', () => {
    for (const a of pitches) {
      for (const b of pitches) {
        const iv = intervalBetween(a, b);
        const where = `${pitchName(a)} -> ${pitchName(b)}`;
        expect(iv.number, where).toBeGreaterThanOrEqual(1);
        expect(intervalName(iv), where).toMatch(/^[dmPMA]\d+$/);
        expect(directedIntervalName(iv), where).not.toContain('undefined');
      }
    }
  });

  it('gives direction exactly when the two sit on different staff steps', () => {
    for (const a of pitches) {
      for (const b of pitches) {
        const sameStep = diatonicOf(a) === diatonicOf(b);
        const where = `${pitchName(a)} -> ${pitchName(b)}`;
        expect(intervalBetween(a, b).direction === 0, where).toBe(sameStep);
      }
    }
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

describe('intervals measured in either order', () => {
  const iv = (a: string, b: string) => intervalBetween(parsePitch(a), parsePitch(b));

  // The reported defect: the old signature stated its precondition only in the
  // names (low, high), and judging a played note against the asked-for one
  // breaks it constantly.
  it('measures downwards without producing nonsense', () => {
    expect(intervalName(iv('D4', 'C4'))).toBe('M2');
    expect(intervalName(iv('C5', 'C4'))).toBe('P8');
    expect(intervalName(iv('G4', 'B3'))).toBe('m6');
    // F down to B spans five letter names, so it is a diminished fifth; the
    // augmented fourth is F *up* to B. Same six semitones, different interval.
    expect(intervalName(iv('F5', 'B4'))).toBe('d5');
    expect(intervalName(iv('F4', 'B4'))).toBe('A4');
  });

  it('gives the same size either way, and the opposite direction', () => {
    for (const [a, b] of [['C4', 'G4'], ['E3', 'Bb5'], ['F#4', 'A4'], ['C4', 'C6']]) {
      const up = iv(a, b);
      const down = iv(b, a);
      expect(down.number).toBe(up.number);
      expect(down.semitones).toBe(up.semitones);
      expect(down.direction).toBe(-up.direction);
      expect(intervalName(down)).toBe(intervalName(up));
    }
  });

  it('calls a unison no direction, and lets the accidental carry the quality', () => {
    expect(iv('C4', 'C4').direction).toBe(0);
    expect(intervalName(iv('C4', 'C#4'))).toBe('A1');
    expect(intervalName(iv('C4', 'Cb4'))).toBe('d1');
  });

  it('says which way round it was, for feedback on a played answer', () => {
    expect(directedIntervalName(iv('C4', 'G4'))).toBe('P5 up');
    expect(directedIntervalName(iv('G4', 'C4'))).toBe('P5 down');
    expect(directedIntervalName(iv('C4', 'C4'))).toBe('P1');
  });
});
