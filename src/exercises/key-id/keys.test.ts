import { describe, expect, it } from 'vitest';
import {
  ACCIDENTAL_CHOICES, KEY_DEFAULTS, MAX_ACCIDENTALS, generateKey, gradeKey, keyItems,
  type KeySettings,
} from './keys';
import { keyIdentification } from './index';
import { ALL_KEYS, type Mode, findKey, keyId, keyName } from '../../theory/key';

/**
 * What this exercise is allowed to ask, now that it asks one thing.
 *
 * It had an ear mode, and most of this file used to be about marking it
 * fairly: ADR 0020 collapsed the six enharmonic pairs because they sound
 * identical, and 0022 stopped a heard attempt recording a signature
 * nobody had been shown. Both were right about the question they were
 * asked. Neither could reach the one underneath — that naming a key from
 * a cadence with no reference pitch is absolute pitch, so the exercise
 * was asking for a faculty most musicians cannot train and marking them
 * down for lacking it. ADR 0028 removes the mode; those tests went with
 * the code they described, and the first case below is what replaced
 * them.
 *
 * The reading paths are untouched and must stay so: six flats and six
 * sharps are different signatures, and telling them apart is the skill.
 */

/** Every limit the circle has, not the five a table used to expose. */
const LIMITS = ACCIDENTAL_CHOICES;
const MODES: Mode[] = ['major', 'minor'];

const read = (over: Partial<KeySettings> = {}): KeySettings =>
  ({ ...KEY_DEFAULTS, presentation: 'read', maxAccidentals: MAX_ACCIDENTALS, ...over });

describe('the mode this exercise does not have', () => {
  /*
    A guard against the ear mode coming back by accident, and a place to
    write down what would have to be true for it to come back on purpose.

    It is not that key identification can never be heard. It is that the
    question as asked — a cadence, no reference, name the key — is
    answerable only with absolute pitch. Sounding a named reference first
    would make it answerable by relative pitch, and would also make it a
    transposition exercise rather than this one. Either is a decision
    somebody should take deliberately; neither should arrive because a
    presentation got added back to a list.
  */
  it('declares reading and nothing else', () => {
    expect(keyIdentification.presentations).toEqual(['read']);
  });

  it('cannot be put into one by a stored setting either', () => {
    // A document written by a release that had the ear mode is still on
    // somebody's device.
    expect(keyIdentification.settings.coerce({ presentation: 'listen' }).presentation)
      .toBe('read');
  });

  it('never generates a question with nothing on the staff', () => {
    // What the ear mode produced for two days before anyone noticed: a
    // question about a signature that was never drawn, with nothing to
    // listen to. Asserted over the whole settings space rather than the
    // default, because that is where it hid.
    for (const mode of MODES) {
      for (const maxAccidentals of LIMITS) {
        const settings = read({ modes: [mode], maxAccidentals });
        for (let seed = 0; seed < 40; seed += 1) {
          const exercise = generateKey({ seed, settings });
          expect(
            keyIdentification.questionScore?.(exercise),
            `${mode} ${maxAccidentals} seed ${seed}`,
          ).not.toBeNull();
        }
      }
    }
  });

  it('counts both the key and its signature as askable, in every limit', () => {
    // Both are credited by `gradeKey`, so both belong in the schedule's
    // denominator. When the ear mode existed this list had to branch, and
    // the branch was wrong for two days — it promised five signature
    // items that listening could never answer.
    for (const maxAccidentals of LIMITS) {
      const items = keyItems(read({ maxAccidentals, modes: MODES }));
      expect(items.some((i) => i.startsWith('key:')), `${maxAccidentals}`).toBe(true);
      expect(items.some((i) => i.startsWith('signature:')), `${maxAccidentals}`).toBe(true);
    }
  });
});

describe('a question asked by eye', () => {
  it('still records the signature, which is what it showed', () => {
    const ex = generateKey({ seed: 11, settings: read() });
    const result = gradeKey(ex, { keyId: ex.keyId });
    const key = ALL_KEYS.find((k) => keyId(k) === ex.keyId)!;
    expect(result.outcomes.map((o) => o.item))
      .toEqual([`key:${ex.keyId}`, `signature:${key.accidentals}`]);
  });

  it('still tells the reader what the signature was', () => {
    const ex = generateKey({ seed: 11, settings: read() });
    expect(gradeKey(ex, { keyId: ex.keyId }).feedback).toMatch(/sharp|flat/);
    expect(gradeKey(ex, { keyId: ex.keyId }).feedback).toContain(keyName(findKey(ex.keyId)));
  });
});
