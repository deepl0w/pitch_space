import { ALL_KEYS, type Key, type Mode, keyId, keyName, relativeKey } from './key';
import { pitchClass } from './pitch';

/**
 * The circle of fifths, derived rather than written out.
 *
 * A position on the circle *is* a key signature: one step clockwise adds a
 * sharp, one step anticlockwise adds a flat, and twelve steps bring you back
 * where you started. So the position of a key is its accidental count modulo
 * twelve, and the enharmonic pairs — six sharps against six flats, seven
 * against five — fall out of that arithmetic instead of being special cases
 * someone has to remember to list.
 */

export interface CirclePosition {
  /** 0 at C, counting clockwise in fifths. */
  index: number;
  /** Major keys written at this position: one, or two when enharmonic. */
  major: Key[];
  /** Their relative minors, in the same order. */
  minor: Key[];
}

function positionOf(key: Key): number {
  return ((key.accidentals % 12) + 12) % 12;
}

export const CIRCLE: readonly CirclePosition[] = Array.from({ length: 12 }, (_, index) => {
  const major = ALL_KEYS
    .filter((k) => k.mode === 'major' && positionOf(k) === index)
    // Fewest accidentals first, so the ordinary spelling leads and the
    // enharmonic twin sits behind it.
    .sort((a, b) => Math.abs(a.accidentals) - Math.abs(b.accidentals));
  return { index, major, minor: major.map(relativeKey) };
});

export function positionFor(key: Key): CirclePosition {
  return CIRCLE[positionOf(key)];
}

/** How one key stands to another, which is what the wheel is for reading off. */
export type Relation =
  | 'self' | 'relative' | 'parallel' | 'dominant' | 'subdominant' | 'enharmonic' | 'none';

export const RELATION_LABELS: Record<Relation, string> = {
  self: 'this key',
  relative: 'relative',
  parallel: 'parallel',
  dominant: 'dominant',
  subdominant: 'subdominant',
  enharmonic: 'the same sound, spelled differently',
  none: '',
};

/**
 * The relation of `other` to `from`.
 *
 * Deliberately ordered: a key can satisfy more than one of these at once —
 * in C major, A minor is both the relative and a step round the wheel — and
 * the first match is the one a musician would name.
 */
export function relationBetween(from: Key, other: Key): Relation {
  if (keyId(from) === keyId(other)) return 'self';
  if (keyId(relativeKey(from)) === keyId(other)) return 'relative';
  if (pitchClass(from.tonic) === pitchClass(other.tonic)) {
    return from.mode === other.mode ? 'enharmonic' : 'parallel';
  }
  const here = positionOf(from);
  const there = positionOf(other);
  if (from.mode === other.mode) {
    if (there === (here + 1) % 12) return 'dominant';
    if (there === (here + 11) % 12) return 'subdominant';
  }
  return 'none';
}

/** Every key worth pointing at from here, with the name of the relation. */
export function neighboursOf(key: Key): Array<{ key: Key; relation: Relation }> {
  const out: Array<{ key: Key; relation: Relation }> = [];
  for (const other of ALL_KEYS) {
    const relation = relationBetween(key, other);
    if (relation !== 'none' && relation !== 'self') out.push({ key: other, relation });
  }
  // Stable and musical rather than alphabetical: the order is the order a
  // teacher names them in.
  const rank: Record<Relation, number> = {
    self: 0, relative: 1, parallel: 2, dominant: 3, subdominant: 4, enharmonic: 5, none: 6,
  };
  return out.sort((a, b) => rank[a.relation] - rank[b.relation] || keyName(a.key).localeCompare(keyName(b.key)));
}

export type { Key, Mode };
