import { describe, expect, it } from 'vitest';
import {
  accidentalGlyph, centsOff, diatonicOf, freqOf, LETTER_NAMES, midiFromFreq,
  midiOf, parsePitch, pitch, pitchFromDiatonic, pitchFromMidi, pitchName,
  respell, vexKey,
} from './pitch';

describe('accidental glyphs', () => {
  // Regression: the glyphs were a table covering -2..+2, so anything spelled
  // past a double accidental rendered as the literal string "undefined".
  it('names a triple accidental rather than saying undefined', () => {
    expect(pitchName(pitch(6, -3, 4), false)).toBe('Bbbb');
    expect(pitchName(pitch(3, 3, 4), false)).toBe('F###');
  });

  it('never emits undefined in a name or a vexflow key', () => {
    for (let alter = -4; alter <= 4; alter++) {
      for (let letter = 0; letter < 7; letter++) {
        const p = pitch(letter as 0, alter, 4);
        expect(pitchName(p)).not.toContain('undefined');
        expect(vexKey(p)).not.toContain('undefined');
      }
    }
  });

  it('spells an accidental as repeated signs of one kind', () => {
    expect(accidentalGlyph(0)).toBe('');
    for (let alter = 1; alter <= 4; alter++) {
      expect(accidentalGlyph(alter)).toBe('#'.repeat(alter));
      expect(accidentalGlyph(-alter)).toBe('b'.repeat(alter));
    }
  });
});

describe('pitch arithmetic', () => {
  it('round trips every midi number through a spelling, sharp and flat', () => {
    for (let m = -12; m <= 140; m++) {
      for (const preferFlats of [false, true]) {
        expect(midiOf(pitchFromMidi(m, preferFlats))).toBe(m);
      }
    }
  });

  it('round trips staff positions, including below octave 0', () => {
    for (let d = -14; d <= 70; d++) expect(diatonicOf(pitchFromDiatonic(d))).toBe(d);
  });

  it('respells a staff position onto a given sounding pitch', () => {
    // F# and Gb are the same key; which one you get is decided by the staff step.
    expect(pitchName(respell(diatonicOf(pitch(3, 0, 4)), 66), false)).toBe('F#');
    expect(pitchName(respell(diatonicOf(pitch(4, 0, 4)), 66), false)).toBe('Gb');
  });

  it('places middle C and A440 where the standard puts them', () => {
    expect(midiOf(parsePitch('C4'))).toBe(60);
    expect(freqOf(69)).toBe(440);
    expect(midiFromFreq(440)).toBe(69);
  });

  it('measures cents against the nearest equal-tempered pitch', () => {
    const flat = centsOff(freqOf(69) * Math.pow(2, -20 / 1200));
    expect(flat.midi).toBe(69);
    expect(flat.cents).toBeCloseTo(-20, 6);
    // Just past the halfway point the nearest pitch is the next one up.
    expect(centsOff(freqOf(69) * Math.pow(2, 51 / 1200)).midi).toBe(70);
  });
});

describe('parsePitch', () => {
  it('accepts the spellings a user or a fixture would write', () => {
    const cases: Array<[string, number]> = [
      ['C4', 60], ['c4', 60], ['C#4', 61], ['Cb4', 59], ['Cbb4', 58],
      ['C##4', 62], ['Cx4', 62], ['B#3', 60], ['C-1', 0], ['G9', 127],
    ];
    for (const [text, midi] of cases) expect(midiOf(parsePitch(text))).toBe(midi);
  });

  it('round trips its own output', () => {
    for (const letter of LETTER_NAMES) {
      for (const glyph of ['', '#', 'b', '##', 'bb']) {
        const text = `${letter}${glyph}4`;
        expect(pitchName(parsePitch(text))).toBe(`${text}`);
      }
    }
  });

  it('refuses what it cannot spell rather than guessing', () => {
    for (const bad of ['H4', 'C', '4C', 'C#', 'Cbbb4', '']) {
      expect(() => parsePitch(bad)).toThrow(/Unparseable/);
    }
  });
});
