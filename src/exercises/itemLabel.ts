import { SIMPLE_INTERVAL_NAMES } from '../theory/interval';
import { ALL_KEYS, keyId, keyName } from '../theory/key';
import { CADENCE_NAMES, type CadenceType } from '../theory/roman';
import { INTERVAL_SLUGS } from './interval-id/intervals';
import type { ItemId } from './types';

/**
 * An item id, said out loud.
 *
 * Item ids are a compatibility commitment (ADR 0007): `interval:m3:up` keys
 * a user's whole history of that interval and can never be renamed. That is
 * a good reason for the id to stay a slug and no reason at all for the slug
 * to be what the user reads — the review panel was showing `progression:major:ii`
 * under a heading saying "How this has gone", which is the one place in the
 * app a learner is told what they know.
 *
 * So the translation lives here rather than in the readout: the readout is a
 * view, and the next thing that lists items — a progress screen, an export —
 * needs the same words rather than its own.
 *
 * The vocabulary is borrowed wherever the app already has one, so an interval
 * is named here exactly as the button that answered it was named.
 */

function signatureLabel(accidentals: number): string {
  if (accidentals === 0) return 'No sharps or flats';
  const n = Math.abs(accidentals);
  return `${n} ${accidentals > 0 ? 'sharp' : 'flat'}${n > 1 ? 's' : ''}`;
}

function intervalLabel(slug: string, direction?: string): string {
  const semitones = INTERVAL_SLUGS.indexOf(slug);
  if (semitones < 0) return '';
  const name = SIMPLE_INTERVAL_NAMES[semitones];
  // A unison carries no direction, so it is stored without one; anything
  // else that arrives without one is said plainly rather than guessed at.
  if (direction === 'up') return `${name}, ascending`;
  if (direction === 'down') return `${name}, descending`;
  return name;
}

/**
 * What to print for one item, or the id itself when nothing better is known.
 *
 * Falling back to the id rather than throwing: an id from a release that
 * added an item kind this build has never heard of is still in the user's
 * history, and the honest thing is to show it rather than to lose the row.
 */
export function itemLabel(item: ItemId): string {
  const [kind, ...rest] = item.split(':');
  switch (kind) {
    case 'interval':
      return intervalLabel(rest[0], rest[1]) || item;
    case 'key': {
      const key = ALL_KEYS.find((k) => keyId(k) === rest.join(':'));
      return key ? keyName(key) : item;
    }
    case 'signature': {
      const accidentals = Number(rest[0]);
      return Number.isInteger(accidentals) ? signatureLabel(accidentals) : item;
    }
    case 'degree':
      return rest[1] ? `Degree ${rest[0]} in ${rest[1]}` : item;
    case 'progression':
      return rest[1] ? `${rest[1]} in ${rest[0]}` : item;
    case 'cadence':
      return CADENCE_NAMES[rest[0] as CadenceType] ?? item;
    default:
      return item;
  }
}
