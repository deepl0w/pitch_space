import { ALL_KEYS, keyId, keyName, type Key, type Mode } from '../../theory/key';
import { pitchName, type Pitch } from '../../theory/pitch';
import type { Clef } from '../../exercises/render/toVexflow';

/** Option lists shared by the reference screens, so they stay consistent. */

export const CLEFS: ReadonlyArray<{ value: Clef; label: string }> = [
  { value: 'treble', label: 'Treble' },
  { value: 'bass', label: 'Bass' },
  { value: 'alto', label: 'Alto' },
  { value: 'tenor', label: 'Tenor' },
];

export const OCTAVES = [2, 3, 4, 5].map((o) => ({ value: o, label: String(o) }));

export function signatureLabel(accidentals: number): string {
  if (accidentals === 0) return 'no accidentals';
  const n = Math.abs(accidentals);
  return `${n} ${accidentals > 0 ? 'sharp' : 'flat'}${n > 1 ? 's' : ''}`;
}

export function keyOptions() {
  return ALL_KEYS.map((k) => ({
    value: keyId(k),
    label: `${keyName(k)} (${signatureLabel(k.accidentals)})`,
  }));
}

/**
 * The distinct notes a scale can be built on.
 *
 * Not `keyOptions`: thirty keys share eighteen tonic spellings, so offering
 * keys where only the tonic is used lists A♭ twice — once as A♭ major and
 * once as A♭ minor — and the two produce the *same* scale whenever the scale
 * is chosen separately. A picker whose two entries differ in what they claim
 * and not in what they draw is one the reader has to be wrong about.
 */
export const TONICS: readonly Pitch[] = ALL_KEYS.reduce<Pitch[]>((out, k) => {
  if (!out.some((t) => pitchName(t, false) === pitchName(k.tonic, false))) out.push(k.tonic);
  return out;
}, []);

export function tonicFor(name: string): Pitch {
  return TONICS.find((t) => pitchName(t, false) === name) ?? TONICS[0];
}

/**
 * The mode a scale type is written in, for the two that are written in one.
 *
 * Everything else — the modes, the pentatonics, the symmetric and exotic
 * scales — has no key signature of its own, and inventing one for it would
 * put accidentals in the signature that the scale then has to cancel.
 */
const SIGNATURE_MODE: Readonly<Record<string, Mode>> = {
  major: 'major',
  natural_minor: 'minor',
};

/**
 * The key a scale on this tonic is written in, or nothing.
 *
 * Nothing is a real answer and the honest one for most scales: `Chords`
 * already draws its staves without a signature for exactly this reason, and
 * a C blues scale has no signature to draw. Returning `undefined` leaves the
 * accidentals on the notes, where they belong.
 */
export function signatureKey(tonic: Pitch, scaleId: string): Key | undefined {
  const mode = SIGNATURE_MODE[scaleId];
  if (mode === undefined) return undefined;
  return ALL_KEYS.find(
    (k) => k.mode === mode && pitchName(k.tonic, false) === pitchName(tonic, false),
  );
}

/** Tonics, each annotated with the signature it gives *this* scale. */
export function tonicOptions(scaleId: string) {
  return TONICS.map((tonic) => {
    const key = signatureKey(tonic, scaleId);
    const name = pitchName(tonic, false);
    return {
      value: name,
      label: key ? `${name} (${signatureLabel(key.accidentals)})` : name,
    };
  });
}
