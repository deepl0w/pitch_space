import { describe, expect, it } from 'vitest';
import {
  SCALE_TYPES, degreeLabel, scaleLadder, scalePitchClasses, scaleType, spellScale,
} from './scale';
import { type Pitch, diatonicOf, midiOf, parsePitch, pitchClass, pitchName } from './pitch';

const ROOTS = ['C4', 'G4', 'Bb4', 'F#4', 'Eb4', 'A#4', 'Cb4'].map(parsePitch);
const names = (ps: readonly Pitch[]) => ps.map((p) => pitchName(p, false)).join(' ');

describe('the scale table', () => {
  it('keeps the semitone and staff-step patterns the same length', () => {
    for (const type of SCALE_TYPES) {
      expect(type.steps.length, type.id).toBe(type.semitones.length);
    }
  });

  it('ascends, starts on the root, and stays inside the octave', () => {
    for (const type of SCALE_TYPES) {
      expect(type.semitones[0], type.id).toBe(0);
      expect(type.steps[0], type.id).toBe(0);
      for (let i = 1; i < type.semitones.length; i++) {
        expect(type.semitones[i], `${type.id} semitone ${i}`).toBeGreaterThan(type.semitones[i - 1]);
        expect(type.steps[i], `${type.id} step ${i}`).toBeGreaterThanOrEqual(type.steps[i - 1]);
      }
      expect(type.semitones[type.semitones.length - 1], type.id).toBeLessThan(12);
      expect(type.steps[type.steps.length - 1], type.id).toBeLessThan(7);
    }
  });

  it('has unique ids that scaleType resolves', () => {
    expect(new Set(SCALE_TYPES.map((s) => s.id)).size).toBe(SCALE_TYPES.length);
    for (const type of SCALE_TYPES) expect(scaleType(type.id)).toBe(type);
    expect(() => scaleType('nope')).toThrow(/Unknown scale type/);
  });
});

describe('spellScale', () => {
  it('lands each degree on the staff step and the semitone the type asks for', () => {
    for (const type of SCALE_TYPES) {
      for (const root of ROOTS) {
        spellScale(root, type).forEach((p, i) => {
          const where = `${type.id} on ${pitchName(root, false)} degree ${i}`;
          expect(midiOf(p) - midiOf(root), where).toBe(type.semitones[i]);
          expect(diatonicOf(p) - diatonicOf(root), where).toBe(type.steps[i]);
        });
      }
    }
  });

  it('uses one letter per degree, except where the scale asks for two', () => {
    // The blues scale and the two octatonics deliberately put two notes on one
    // staff step; everything else repeating a letter would be a spelling bug.
    for (const type of SCALE_TYPES) {
      const repeats = type.steps.length - new Set(type.steps).size;
      for (const root of ROOTS) {
        const letters = spellScale(root, type).map((p) => p.letter);
        expect(letters.length - new Set(letters).size, `${type.id} on ${pitchName(root, false)}`)
          .toBe(repeats);
      }
    }
  });

  it('spells the flat fifth of the blues scale as a lowered fifth', () => {
    // Gb and G, not F# and G: the point of the scale is the two fifths.
    expect(names(spellScale(parsePitch('C4'), scaleType('blues')))).toBe('C Eb F Gb G Bb');
    expect(names(spellScale(parsePitch('C4'), scaleType('altered')))).toBe('C Db Eb Fb Gb Ab Bb');
    expect(names(spellScale(parsePitch('C4'), scaleType('lydian')))).toBe('C D E F# G A B');
  });
});

describe('degreeLabel', () => {
  it('names the degrees of the scales people learn by their degree names', () => {
    const label = (id: string) =>
      scaleType(id).semitones.map((_, i) => degreeLabel(scaleType(id), i)).join(' ');
    expect(label('major')).toBe('1 2 3 4 5 6 7');
    expect(label('natural_minor')).toBe('1 2 b3 4 5 b6 b7');
    expect(label('blues')).toBe('1 b3 4 b5 5 b7');
    expect(label('whole_tone')).toBe('1 2 3 #4 #5 #6');
    expect(label('altered')).toBe('1 b2 b3 b4 b5 b6 b7');
  });

  it('agrees with how the degree is actually spelled against the major scale', () => {
    // The label claims an alteration; the spelling is what the user sees on the
    // staff. They are computed separately, so they are worth cross-checking.
    const major = scaleType('major');
    for (const type of SCALE_TYPES) {
      const root = parsePitch('C4');
      spellScale(root, type).forEach((p, i) => {
        const label = degreeLabel(type, i);
        const degree = Number(label.replace(/[^0-9]/g, ''));
        const alteration = (label.match(/[#b]/g) ?? []).length * (label.startsWith('b') ? -1 : 1);
        const plain = spellScale(root, major)[degree - 1];
        const where = `${type.id} degree ${i} labelled ${label}`;
        expect(p.letter, where).toBe(plain.letter);
        expect(midiOf(p) - midiOf(plain), where).toBe(alteration);
      });
    }
  });
});

describe('scaleLadder', () => {
  it('fills the requested range with the scale and nothing else', () => {
    for (const type of SCALE_TYPES) {
      for (const root of ROOTS) {
        const ladder = scaleLadder(root, type, 36, 84);
        const where = `${type.id} on ${pitchName(root, false)}`;
        const midis = ladder.map(midiOf);
        expect(midis, `${where} not ascending`).toEqual([...midis].sort((a, b) => a - b));
        for (const m of midis) {
          expect(m, `${where} out of range`).toBeGreaterThanOrEqual(36);
          expect(m, `${where} out of range`).toBeLessThanOrEqual(84);
        }
        const inScale = scalePitchClasses(root, type);
        for (const p of ladder) {
          expect(inScale.has(pitchClass(p)), `${where}: ${pitchName(p)} is not in the scale`).toBe(true);
        }
        // Four octaves of range should hold four octaves of the scale.
        for (const pc of inScale) {
          expect(midis.some((m) => ((m % 12) + 12) % 12 === pc), `${where}: pc ${pc} missing`).toBe(true);
        }
        expect(ladder.length, `${where} length`).toBe(
          midis.filter((m) => m >= 36 && m <= 84).length,
        );
      }
    }
  });

  it('spells a ladder note the same way the one-octave scale does', () => {
    for (const type of SCALE_TYPES) {
      const root = parsePitch('C4');
      const octave = spellScale(root, type);
      for (const p of scaleLadder(root, type, 36, 84)) {
        const match = octave.find((q) => pitchClass(q) === pitchClass(p));
        expect(p.letter, `${type.id}: ${pitchName(p)}`).toBe(match!.letter);
        expect(p.alter, `${type.id}: ${pitchName(p)}`).toBe(match!.alter);
      }
    }
  });

  it('returns nothing for an empty range', () => {
    expect(scaleLadder(parsePitch('C4'), scaleType('major'), 61, 61)).toEqual([]);
  });
});
