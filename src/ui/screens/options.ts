import { ALL_KEYS, keyId, keyName } from '../../theory/key';
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
