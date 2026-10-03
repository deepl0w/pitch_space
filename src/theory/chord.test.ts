import { describe, expect, it } from 'vitest';
import {
  CHORD_TYPES, chord, chordSymbol, chordType, identifyChord, spellChord, voiceChord,
} from './chord';
import { type Pitch, midiOf, parsePitch, pitchClass, pitchName } from './pitch';
import { diatonicOf } from './pitch';

const ROOTS = ['C4', 'G4', 'Bb4', 'F#4', 'Eb4'].map(parsePitch);
const names = (ps: readonly Pitch[]) => ps.map((p) => pitchName(p, false)).join(' ');

describe('chord types', () => {
  it('give every tone a distinct pitch class and a distinct staff step', () => {
    // Both are assumed by the voicing and by identification: two tones sharing
    // either one would collide on the staff or make an inversion ambiguous.
    for (const type of CHORD_TYPES) {
      const pcs = type.semitones.map((s) => ((s % 12) + 12) % 12);
      expect(new Set(pcs).size, `${type.id} pitch classes`).toBe(pcs.length);
      const steps = type.steps.map((s) => s % 7);
      expect(new Set(steps).size, `${type.id} staff steps`).toBe(steps.length);
    }
  });

  it('have unique ids that chordType resolves', () => {
    expect(new Set(CHORD_TYPES.map((t) => t.id)).size).toBe(CHORD_TYPES.length);
    for (const type of CHORD_TYPES) expect(chordType(type.id)).toBe(type);
    expect(() => chordType('nope')).toThrow(/Unknown chord type/);
  });
});

describe('spellChord', () => {
  it('lands each tone on the staff step and the semitone the type asks for', () => {
    for (const type of CHORD_TYPES) {
      for (const root of ROOTS) {
        const spelled = spellChord(chord(root, type));
        spelled.forEach((p, i) => {
          const where = `${type.id} on ${pitchName(root, false)} tone ${i}`;
          expect(midiOf(p) - midiOf(root), where).toBe(type.semitones[i]);
          expect(diatonicOf(p) - diatonicOf(root), where).toBe(type.steps[i]);
        });
      }
    }
  });

  it('spells the familiar chords the way a reader expects', () => {
    const c = parsePitch('C4');
    expect(names(spellChord(chord(c, chordType('maj'))))).toBe('C E G');
    expect(names(spellChord(chord(c, chordType('dim7'))))).toBe('C Eb Gb Bbb');
    expect(names(spellChord(chord(c, chordType('aug'))))).toBe('C E G#');
    expect(names(spellChord(chord(c, chordType('dom7s9'))))).toBe('C E G Bb D#');
  });
});

describe('voiceChord inversions', () => {
  // Regression: the inversion was applied by lifting the bottom `n` tones one
  // octave. For a chord whose top tone already sits above the octave — every
  // ninth, eleventh and thirteenth — that leaves the root in the bass, so the
  // chord the exercise sounded was not the chord it claimed.
  it('puts the requested chord tone in the bass', () => {
    for (const type of CHORD_TYPES) {
      for (const root of ROOTS) {
        const tones = spellChord(chord(root, type));
        for (let inversion = 0; inversion < tones.length; inversion++) {
          const voiced = voiceChord(chord(root, type, inversion));
          const where = `${type.id} on ${pitchName(root, false)} inversion ${inversion}`;
          expect(pitchClass(voiced[0]), where).toBe(pitchClass(tones[inversion]));
        }
      }
    }
  });

  it('names the bass in the slash symbol', () => {
    expect(chordSymbol(chord(parsePitch('C4'), chordType('maj'), 1))).toBe('C/E');
    expect(chordSymbol(chord(parsePitch('C4'), chordType('dom9'), 4))).toBe('C9/D');
    expect(chordSymbol(chord(parsePitch('C4'), chordType('maj')))).toBe('C');
  });

  it('keeps one voice per chord tone, in ascending order, with no collisions', () => {
    for (const type of CHORD_TYPES) {
      for (const root of ROOTS) {
        for (let inversion = 0; inversion < type.semitones.length; inversion++) {
          for (const open of [false, true]) {
            const voiced = voiceChord(chord(root, type, inversion), { open });
            const where = `${type.id} on ${pitchName(root, false)} inv ${inversion} open=${open}`;
            expect(voiced.length, where).toBe(type.semitones.length);
            const midis = voiced.map(midiOf);
            expect(new Set(midis).size, `${where} collision`).toBe(midis.length);
            expect([...midis].sort((a, b) => a - b), where).toEqual(midis);
          }
        }
      }
    }
  });

  it('stacks a close inversion within an octave of its bass', () => {
    // Root position is allowed to be wide — a thirteenth chord spans two
    // octaves by construction — but an inversion is a close voicing.
    const voiced = voiceChord(chord(parsePitch('C4'), chordType('dom9'), 4));
    expect(names(voiced)).toBe('D E G Bb C');
    expect(midiOf(voiced[voiced.length - 1]) - midiOf(voiced[0])).toBeLessThanOrEqual(12);
  });

  it('treats the inversion number as cyclic', () => {
    const triad = chordType('maj');
    const root = parsePitch('C4');
    const second = voiceChord(chord(root, triad, 2)).map(midiOf);
    expect(voiceChord(chord(root, triad, 5)).map(midiOf)).toEqual(second);
    expect(voiceChord(chord(root, triad, -1)).map(midiOf)).toEqual(second);
  });
});

describe('identifyChord', () => {
  it('recognises every chord it can voice, in every inversion', () => {
    for (const type of CHORD_TYPES) {
      for (const root of ROOTS) {
        for (let inversion = 0; inversion < type.semitones.length; inversion++) {
          const voiced = voiceChord(chord(root, type, inversion));
          const where = `${type.id} on ${pitchName(root, false)} inversion ${inversion}`;
          const reading = identifyChord(voiced)
            .find((r) => r.type.id === type.id && r.rootPc === pitchClass(root));
          expect(reading, `${where} not identified`).toBeDefined();
          expect(reading!.inversion, `${where} inversion`).toBe(inversion);
        }
      }
    }
  });

  it('returns every genuine reading of an ambiguous set', () => {
    // C6 and Am7 are the same four notes; marking either wrong would be a lie.
    const readings = identifyChord(voiceChord(chord(parsePitch('C4'), chordType('maj6'))));
    const ids = readings.map((r) => `${r.rootPc}:${r.type.id}`);
    expect(ids).toContain(`${pitchClass(parsePitch('C4'))}:maj6`);
    expect(ids).toContain(`${pitchClass(parsePitch('A4'))}:min7`);
  });

  it('offers all four roots of a diminished seventh', () => {
    const readings = identifyChord(voiceChord(chord(parsePitch('C4'), chordType('dim7'))))
      .filter((r) => r.type.id === 'dim7');
    expect(new Set(readings.map((r) => r.rootPc))).toEqual(new Set([0, 3, 6, 9]));
  });

  // The old version of this asked for the first reading of a major triad in
  // first inversion, which has exactly one reading — so it could not fail, and
  // reversing the comparator left it green. Only a four-note set has readings
  // in two families, so only a four-note set exercises the ordering at all.
  it('offers the simpler family first when a set has two readings', () => {
    // C E G A is C6 and Am7 at once. CHORD_TYPES ranks seventh above sixth, so
    // the seventh is the primary answer and the sixth is still offered.
    const readings = identifyChord(voiceChord(chord(parsePitch('C4'), chordType('maj6'))));
    expect(readings.map((r) => r.type.family)).toEqual(['seventh', 'sixth']);
    expect(readings[0].type.id).toBe('min7');
    expect(readings[0].rootPc).toBe(pitchClass(parsePitch('A4')));
  });

  it('breaks a tie within a family towards root position', () => {
    const readings = identifyChord(voiceChord(chord(parsePitch('C4'), chordType('dim7'))));
    expect(readings.map((r) => r.inversion)).toEqual([0, 1, 2, 3]);
    expect(readings[0].rootPc).toBe(pitchClass(parsePitch('C4')));
  });

  it('returns the readings already ordered, never needing a re-sort', () => {
    for (const typeId of ['maj6', 'min6', 'dim7', 'sus2', 'maj']) {
      for (let inversion = 0; inversion < 3; inversion++) {
        const readings = identifyChord(voiceChord(chord(parsePitch('C4'), chordType(typeId), inversion)));
        const families = readings.map((r) => r.type.family);
        // Within one family the inversions ascend; across families the order
        // never goes back to a family already left behind.
        const seen: string[] = [];
        for (const family of families) {
          if (seen[seen.length - 1] !== family) {
            expect(seen, `${typeId} inv ${inversion}`).not.toContain(family);
            seen.push(family);
          }
        }
      }
    }
  });

  it('declines to name fewer than three distinct pitch classes', () => {
    expect(identifyChord([parsePitch('C4'), parsePitch('E4')])).toEqual([]);
    expect(identifyChord([parsePitch('C4'), parsePitch('C5')])).toEqual([]);
    expect(identifyChord([])).toEqual([]);
  });
});
