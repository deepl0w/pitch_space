import { describe, expect, it } from 'vitest';
import {
  ALL_KEYS, MAJOR_KEYS, MINOR_KEYS, findKey, keyId, keyName, keyPitchClasses,
  keyPitches, keysUpTo, relativeKey, signatureLetters, vexKeySignature,
} from './key';
import { LETTER_NAMES, pitchName } from './pitch';

describe('the key table', () => {
  it('covers every signature from seven flats to seven sharps in both modes', () => {
    for (const pool of [MAJOR_KEYS, MINOR_KEYS]) {
      expect(pool.map((k) => k.accidentals)).toEqual(
        [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
      );
    }
  });

  it('gives every key a unique id that findKey resolves', () => {
    expect(new Set(ALL_KEYS.map(keyId)).size).toBe(ALL_KEYS.length);
    for (const k of ALL_KEYS) expect(findKey(keyId(k))).toBe(k);
    expect(() => findKey('H_major')).toThrow(/Unknown key/);
  });

  it('slices by accidental count for the difficulty settings', () => {
    expect(keysUpTo(0).map(keyName)).toEqual(['C major', 'A minor']);
    expect(keysUpTo(1, ['major']).map(keyName)).toEqual(['F major', 'C major', 'G major']);
    expect(keysUpTo(7)).toHaveLength(ALL_KEYS.length);
  });
});

describe('key signatures agree with the spelled scale', () => {
  // The signature and the notes are computed by different code — one from a
  // count of accidentals, the other by spelling a scale — so this is the test
  // that would catch either drifting from the other.
  it('alters exactly the letters the signature carries', () => {
    for (const k of ALL_KEYS) {
      const altered = keyPitches(k).filter((p) => p.alter !== 0);
      const where = keyName(k);
      expect(altered.map((p) => LETTER_NAMES[p.letter]).sort(), where)
        .toEqual([...signatureLetters(k)].sort());
      expect(altered.length, `${where} count`).toBe(Math.abs(k.accidentals));
      for (const p of altered) {
        expect(p.alter, `${where}: ${pitchName(p, false)}`).toBe(Math.sign(k.accidentals));
      }
    }
  });

  it('writes the accidentals in the order a copyist writes them', () => {
    expect(signatureLetters(findKey('D_major'))).toEqual(['F', 'C']);
    expect(signatureLetters(findKey('Eb_major'))).toEqual(['B', 'E', 'A']);
    expect(signatureLetters(findKey('C_major'))).toEqual([]);
    expect(signatureLetters(findKey('A_minor'))).toEqual([]);
    expect(signatureLetters(findKey('C#_minor'))).toEqual(['F', 'C', 'G', 'D']);
  });

  it('gives seven flats and seven sharps the spellings they are named for', () => {
    expect(keyPitches(findKey('Cb_major')).map((p) => pitchName(p, false)))
      .toEqual(['Cb', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb']);
    expect(keyPitches(findKey('C#_major')).map((p) => pitchName(p, false)))
      .toEqual(['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#']);
    expect(keyPitches(findKey('Ab_minor')).map((p) => pitchName(p, false)))
      .toEqual(['Ab', 'Bb', 'Cb', 'Db', 'Eb', 'Fb', 'Gb']);
  });

  it('gives a key seven distinct pitch classes', () => {
    for (const k of ALL_KEYS) expect(keyPitchClasses(k).size, keyName(k)).toBe(7);
  });
});

describe('relatives and vexflow signatures', () => {
  it('pairs each key with the other mode on the same signature', () => {
    for (const k of ALL_KEYS) {
      const relative = relativeKey(k);
      expect(relative.accidentals, keyName(k)).toBe(k.accidentals);
      expect(relative.mode, keyName(k)).not.toBe(k.mode);
      expect(keyPitchClasses(relative), keyName(k)).toEqual(keyPitchClasses(k));
      expect(relativeKey(relative)).toBe(k);
    }
  });

  it('names a signature by its major key, as vexflow wants it', () => {
    expect(vexKeySignature(findKey('A_minor'))).toBe('C');
    expect(vexKeySignature(findKey('C#_minor'))).toBe('E');
    expect(vexKeySignature(findKey('Ab_minor'))).toBe('Cb');
    for (const k of ALL_KEYS) {
      expect(vexKeySignature(k), keyName(k)).toBe(pitchName(relativeKey(k).mode === 'major'
        ? relativeKey(k).tonic : k.tonic, false));
    }
  });
});
