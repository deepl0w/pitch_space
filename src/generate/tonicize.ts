import type { Key } from '../theory/key';
import type { Pitch } from '../theory/pitch';
import { spellChord } from '../theory/chord';
import { type Degree, numeral, realizeNumeral } from '../theory/roman';

/**
 * Putting a key in the listener's ear.
 *
 * Needed wherever an exercise asks a question that only means something
 * inside a tonality: which key is this, which degree was that. Shared rather
 * than copied, because the choice of *how* to establish a key is a musical
 * claim and two exercises disagreeing about it would be two different
 * questions wearing one name.
 */

/**
 * I–IV–V–I, rather than a scale.
 *
 * A scale names its tonic only to someone who already knows where it started;
 * a cadence puts the tonic somewhere the ear cannot miss, which is the whole
 * job. In minor the dominant is major, because the raised leading tone is
 * most of what tells a listener the mode — the modal minor v leaves the
 * question genuinely ambiguous.
 */
export function establishingCadence(key: Key, octave = 4): Pitch[][] {
  const tonic = { ...key.tonic, octave };
  const quality = key.mode === 'major'
    ? ['maj', 'maj', 'maj', 'maj']
    : ['min', 'min', 'maj', 'min'];
  const degrees: Degree[] = [1, 4, 5, 1];
  return degrees.map((degree, i) =>
    spellChord(realizeNumeral({ ...key, tonic }, numeral(degree, quality[i]))));
}

/** The same cadence as one flat list, for a caller that wants to sound it. */
export function cadencePitches(key: Key, octave = 4): Pitch[] {
  return establishingCadence(key, octave).flat();
}
