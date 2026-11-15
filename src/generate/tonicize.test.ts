import { describe, expect, it } from 'vitest';
import { establishingCadence } from './tonicize';
import { ALL_KEYS, keyId, keyPitchClasses } from '../theory/key';
import { midiOf, pitchClass } from '../theory/pitch';

/**
 * The one thing two exercises share about what a key *sounds* like.
 *
 * `degree-id` and `progression-id` both play this before asking a question
 * that only means something inside a tonality, and the file says why it is
 * shared rather than copied: how you establish a key is a musical claim, and
 * two exercises disagreeing about it would be two questions wearing one
 * name. Nothing checked the claim — the function was named in no test in the
 * suite, while being what tells a learner which key they are in.
 *
 * Asserted as properties over every key rather than as a progression,
 * deliberately. I–IV–V–I is a choice someone may retune to I–vi–ii–V–I
 * without breaking anything these exercises need; what they need is that the
 * ear lands on the tonic and that the mode is not left ambiguous, which is
 * what the prose claims and what these cases hold.
 */
describe('the cadence that puts a key in the ear', () => {
  const cadence = (k: typeof ALL_KEYS[number]) => establishingCadence(k);

  it('starts and ends on the tonic, so the ear has somewhere to land', () => {
    for (const key of ALL_KEYS) {
      const chords = cadence(key);
      for (const [where, chord] of [['first', chords[0]], ['last', chords.at(-1)!]] as const) {
        expect(chord[0].letter, `${keyId(key)}: the ${where} chord is not spelt on the tonic`)
          .toBe(key.tonic.letter);
        expect(pitchClass(chord[0]), `${keyId(key)}: the ${where} chord is not on the tonic`)
          .toBe(pitchClass(key.tonic));
      }
    }
  });

  it('opens and closes in the mode it claims to be in', () => {
    for (const key of ALL_KEYS) {
      const want = key.mode === 'major' ? 4 : 3;
      for (const chord of [cadence(key)[0], cadence(key).at(-1)!]) {
        expect(midiOf(chord[1]) - midiOf(chord[0]),
          `${keyId(key)}: the tonic triad's third does not match the mode`).toBe(want);
      }
    }
  });

  /**
   * The claim the file singles out: in minor the dominant is major, because
   * the raised leading tone is most of what tells a listener the mode, and
   * the modal minor `v` leaves it genuinely ambiguous.
   *
   * Stated as what the raising *is* rather than as a chord quality — a
   * semitone below the tonic, and in minor a note the key's own scale does
   * not contain. A cadence built on the natural minor passes a quality check
   * on some other chord and fails this.
   */
  it('sounds the leading tone, raised out of the scale where minor needs it', () => {
    for (const key of ALL_KEYS) {
      const lead = (pitchClass(key.tonic) + 11) % 12;
      const sounded = cadence(key).flat().some((p) => pitchClass(p) === lead);
      expect(sounded, `${keyId(key)}: nothing a semitone below the tonic is sounded`).toBe(true);

      const diatonic = keyPitchClasses(key).has(lead);
      expect(diatonic, `${keyId(key)}: the leading tone is ${key.mode === 'minor'
        ? 'already in the scale, so nothing was raised'
        : 'not in the scale, which a major key cannot be'}`)
        .toBe(key.mode === 'major');
    }
  });

  /**
   * Spelling, which is where this would fail quietly rather than audibly.
   *
   * G# minor's leading tone is F##, not G: both sound the same and only one
   * is the seventh degree of the key. An enharmonic substitution keeps every
   * pitch-class assertion above green and puts a letter on the stave that
   * the key signature cannot account for.
   */
  it('spells the leading tone as the key’s own seventh degree', () => {
    for (const key of ALL_KEYS) {
      const lead = (pitchClass(key.tonic) + 11) % 12;
      const letters = new Set(cadence(key).flat()
        .filter((p) => pitchClass(p) === lead).map((p) => p.letter));
      expect([...letters], `${keyId(key)}: the leading tone is not spelt on the seventh degree`)
        .toEqual([(key.tonic.letter + 6) % 7]);
    }
  });

  it('moves by an octave when it is asked to', () => {
    for (const key of ALL_KEYS) {
      const low = establishingCadence(key, 3).flat().map(midiOf);
      const high = establishingCadence(key, 4).flat().map(midiOf);
      expect(high, `${keyId(key)}: an octave up is not an octave up`)
        .toEqual(low.map((m) => m + 12));
    }
  });
});
