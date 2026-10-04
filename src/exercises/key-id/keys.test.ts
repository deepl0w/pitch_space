import { describe, expect, it } from 'vitest';
import {
  KEY_DEFAULTS, generateKey, gradeKey, keyPool, soundingKeyName, soundingPool,
  type KeySettings,
} from './keys';
import { cadencePitches } from '../../generate/tonicize';
import { ALL_KEYS, type Key, type Mode, findKey, keyId, keyName } from '../../theory/key';
import { midiOf } from '../../theory/pitch';
import type { Difficulty } from '../types';

/**
 * What the two presentations of this exercise are allowed to ask.
 *
 * `keys.ts` opens by saying a key signature does not name a key, and that an
 * exercise accepting only one of two right answers would be marking a correct
 * answer wrong. It then did exactly that by ear: all fifteen spellings in the
 * pool, a I–IV–V–I cadence as the only evidence, and six pairs that sound
 * identical. ADR 0020 collapses the heard pool to the sounding key; ADR 0022
 * stops the heard attempt recording a signature nobody was shown.
 *
 * The reading paths are the other half and must not move: six flats and six
 * sharps are different signatures, and telling them apart is the skill.
 */

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];
const MODES: Mode[] = ['major', 'minor'];

const heard = (over: Partial<KeySettings> = {}): KeySettings =>
  ({ ...KEY_DEFAULTS, presentation: 'listen', difficulty: 5, ...over });
const read = (over: Partial<KeySettings> = {}): KeySettings =>
  ({ ...KEY_DEFAULTS, presentation: 'read', difficulty: 5, ...over });

/**
 * What a key sounds like, as pitch classes.
 *
 * Pitch classes and not MIDI, which is the trap: `Cb4` sounds at MIDI 59 and
 * `B4` at 71, so grouping cadences by absolute pitch silently drops the Cb/B
 * pair and reports five collisions where there are six. Both the original
 * report and its first verification did exactly that.
 */
const sound = (key: Key) =>
  cadencePitches(key).map((p) => ((midiOf(p) % 12) + 12) % 12).join(',');

describe('which spelling stands for a sound', () => {
  it('is the one the circle of fifths already names, pinned here by name', () => {
    // The six-against-six ties — Gb against F#, Eb minor against D# minor —
    // are broken by `ALL_KEYS` order and by nothing written down. That order
    // is now load-bearing, because the canonical spelling is the item id a
    // learner's by-ear history is filed under, so reordering the array would
    // refile it silently. This fails instead.
    expect(soundingPool(heard(), 'major').map(keyId)).toContain('Gb_major');
    expect(soundingPool(heard(), 'major').map(keyId)).not.toContain('F#_major');

    const major = soundingPool(heard(), 'major').map(keyId);
    const minor = soundingPool(heard(), 'minor').map(keyId);
    for (const id of ['B_major', 'Gb_major', 'Db_major']) expect(major).toContain(id);
    for (const id of ['Cb_major', 'F#_major', 'C#_major']) expect(major).not.toContain(id);
    for (const id of ['G#_minor', 'Eb_minor', 'Bb_minor']) expect(minor).toContain(id);
    for (const id of ['Ab_minor', 'D#_minor', 'A#_minor']) expect(minor).not.toContain(id);
  });

  it('names both spellings on the button, canonical first', () => {
    // So a listener who hears the sound and calls it F# finds their answer
    // rather than concluding the app disagrees with them.
    expect(soundingKeyName(findKey('Gb_major'))).toBe('Gb / F# major');
    expect(soundingKeyName(findKey('B_major'))).toBe('B / Cb major');
    expect(soundingKeyName(findKey('Eb_minor'))).toBe('Eb / D# minor');
    // A sound with one spelling is said once.
    expect(soundingKeyName(findKey('D_major'))).toBe('D major');
    expect(soundingKeyName(findKey('A_minor'))).toBe('A minor');
  });
});

describe('the pool a question draws from', () => {
  it('offers no two choices that sound the same, at any difficulty', () => {
    // The defect, stated as the property. Nothing below this line is about
    // how many keys there are; it is about the question having one answer.
    for (const difficulty of DIFFICULTIES) {
      for (const mode of MODES) {
        const pool = soundingPool(heard({ difficulty }), mode);
        const sounds = pool.map(sound);
        expect(new Set(sounds).size, `difficulty ${difficulty} ${mode}`).toBe(pool.length);
      }
    }
  });

  it('loses no sounding key when it collapses the spellings', () => {
    // The cost feared when this was framed as narrowing difficulty 5, and
    // not paid: the collapsed entries are duplicates, not hard keys.
    for (const difficulty of DIFFICULTIES) {
      for (const mode of MODES) {
        const settings = heard({ difficulty });
        expect(new Set(soundingPool(settings, mode).map(sound)))
          .toEqual(new Set(keyPool(settings, mode).map(sound)));
      }
    }
  });

  it('is twelve per mode at the far side of the circle, where reading is fifteen', () => {
    for (const mode of MODES) {
      expect(soundingPool(heard(), mode)).toHaveLength(12);
      expect(keyPool(read(), mode)).toHaveLength(15);
    }
  });

  it('leaves the reading pools exactly as they were', () => {
    // Spelled accidentals and a printed signature both separate enharmonics,
    // so neither reading form has the ambiguity and neither may lose a key.
    for (const difficulty of DIFFICULTIES) {
      for (const mode of MODES) {
        for (const readSource of ['signature', 'accidentals'] as const) {
          const settings = read({ difficulty, readSource });
          const ids = new Set<string>();
          for (let seed = 0; seed < 300; seed += 1) {
            ids.add(generateKey({ seed, settings: { ...settings, modes: [mode] } }).keyId);
          }
          expect([...ids].sort()).toEqual(keyPool(settings, mode).map(keyId).sort());
        }
      }
    }
  });
});

describe('a question asked by ear', () => {
  const byEar = (seed: number, over: Partial<KeySettings> = {}) =>
    generateKey({ seed, settings: heard(over) });

  it('draws only keys the pool collapsed to, and offers only those', () => {
    for (const mode of MODES) {
      const allowed = new Set(soundingPool(heard(), mode).map(keyId));
      for (let seed = 0; seed < 300; seed += 1) {
        const ex = byEar(seed, { modes: [mode] });
        expect(ex.source).toBe('passage');
        expect(allowed, `seed ${seed}`).toContain(ex.keyId);
        expect([...ex.choices].sort()).toEqual([...allowed].sort());
      }
    }
  });

  it('records what was asked and not the signature nobody saw', () => {
    // ADR 0022. An outcome is a claim the user was asked, and by ear the
    // signature is not merely untested but unanswerable: six flats against
    // six sharps is the very distinction the question collapsed.
    for (let seed = 0; seed < 60; seed += 1) {
      const ex = byEar(seed);
      const result = gradeKey(ex, { keyId: ex.keyId });
      expect(result.outcomes.map((o) => o.item)).toEqual([`key:${ex.keyId}`]);
      // The item list still carries it: that is what the question contained,
      // as against what the response tested.
      expect(ex.items).toContain(`signature:${findKey(ex.keyId).accidentals}`);
    }
  });

  it('claims no signature in its feedback either, but still says how it is written', () => {
    // Two things at once, and they pull apart. 0022 removes the claim that a
    // signature was on screen — "That signature is 6 flats (...)" after a
    // question that drew nothing. 0020 keeps the bridge from the ear to the
    // page, which is what the accidentals are *for* here. So: never the
    // word, always the count.
    for (let seed = 0; seed < 60; seed += 1) {
      const ex = byEar(seed);
      for (const response of [{ keyId: ex.keyId }, { keyId: 'C_major' }]) {
        const { feedback } = gradeKey(ex, response);
        expect(feedback, `seed ${seed}`).not.toMatch(/signature/i);
        expect(feedback, `seed ${seed}`).toMatch(/written with (no sharps or flats|\d+ (sharp|flat))/);
      }
    }
  });

  it('names the spelling that sounded, and the other one it could be written as', () => {
    const gb = byEar(0, { modes: ['major'] });
    const exercise = { ...gb, keyId: 'Gb_major' };
    const feedback = gradeKey(exercise, { keyId: 'Gb_major' }).feedback;
    expect(feedback).toContain('Gb major');
    expect(feedback).toContain('F# major');
  });
});

describe('a question asked by eye', () => {
  it('still records the signature, which is what it showed', () => {
    for (const readSource of ['signature', 'accidentals'] as const) {
      const ex = generateKey({ seed: 11, settings: read({ readSource }) });
      const result = gradeKey(ex, { keyId: ex.keyId });
      const key = ALL_KEYS.find((k) => keyId(k) === ex.keyId)!;
      expect(result.outcomes.map((o) => o.item))
        .toEqual([`key:${ex.keyId}`, `signature:${key.accidentals}`]);
    }
  });

  it('still tells the reader what the signature was', () => {
    const ex = generateKey({ seed: 11, settings: read() });
    expect(gradeKey(ex, { keyId: ex.keyId }).feedback).toMatch(/sharp|flat/);
    expect(gradeKey(ex, { keyId: ex.keyId }).feedback).toContain(keyName(findKey(ex.keyId)));
  });
});
