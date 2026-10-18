import { ALL_KEYS, keyId, type Mode } from '../theory/key';
import { SCALE_TYPES } from '../theory/scale';
import { CHORD_TYPES } from '../theory/chord';
import { CELLS } from '../generate/cells';
import { INTERVAL_DIRECTIONS, INTERVAL_SLUGS } from '../exercises/interval-id/intervals';
import type { ItemId } from '../exercises/types';

/**
 * Where in the theory reference an answered item is explained.
 *
 * Asked for as "a small button taking you to information on that specific
 * thing" after a question. Keyed on item ids, the strings an exercise already
 * reports about itself, so the exercise needs to know nothing about the
 * reference and the coverage question is a sweep over the ids rather than a
 * hope (the same reasoning as the song table in `exercises/songs.ts`).
 *
 * `focus` is in the page's own terms — a scale id, a key id, a metre — rather
 * than the item id handed on, so no reference page has to parse an
 * exercise's ids, and a page that changes its ids is checked here.
 *
 * Here and not under `exercises/`: it names reference routes, which are the
 * app's, and ADR 0029 keeps an exercise's plain modules out of `ui/`.
 */
export type ReferenceRoute = 'intervals' | 'scales' | 'chords' | 'key-chords' | 'circle' | 'rhythms';

export interface ReferenceTarget {
  readonly route: ReferenceRoute;
  readonly focus: string;
}

/** The tonic a mode's page opens on, when the item names a mode and no key. */
const TONIC_KEY: Readonly<Record<Mode, string>> = { major: 'C_major', minor: 'A_minor' };
const MODE_SCALE: Readonly<Record<Mode, string>> = { major: 'major', minor: 'natural_minor' };
/** The metre a rhythm figure is shown in, by the kind of beat it fills. */
const KIND_METRE = { simple: '4/4', compound: '6/8' } as const;

function isMode(value: string | undefined): value is Mode {
  return value === 'major' || value === 'minor';
}

/**
 * The reference page for an item, or nothing.
 *
 * Nothing is a real answer and shows no button: a cadence is graded by no
 * exercise yet and has no page, and an id this release does not recognise —
 * history outlives the code that wrote it — should cost a button rather than
 * open a page at an arbitrary default that claims to be about it.
 */
export function referenceFor(item: ItemId): ReferenceTarget | null {
  const [kind, ...rest] = item.split(':');
  switch (kind) {
    case 'interval': {
      const [slug, direction] = rest;
      if (!INTERVAL_SLUGS.includes(slug)) return null;
      if (direction !== undefined && !(INTERVAL_DIRECTIONS as readonly string[]).includes(direction)) {
        return null;
      }
      return { route: 'intervals', focus: direction === undefined ? slug : `${slug}:${direction}` };
    }
    case 'scale':
      return SCALE_TYPES.some((t) => t.id === rest[0]) ? { route: 'scales', focus: rest[0] } : null;
    case 'chord':
      return CHORD_TYPES.some((t) => t.id === rest[0])
        ? { route: 'chords', focus: rest.join(':') } : null;
    case 'degree':
      // A degree is heard against its scale, and the scale page labels each
      // note with the degree it is.
      return isMode(rest[1]) ? { route: 'scales', focus: MODE_SCALE[rest[1]] } : null;
    case 'progression':
      // The item carries the mode and the numeral and not the key, so the
      // page opens on the mode's plainest key: every diatonic chord the
      // numeral could be is on it.
      return isMode(rest[0]) ? { route: 'key-chords', focus: TONIC_KEY[rest[0]] } : null;
    case 'key':
      return ALL_KEYS.some((k) => keyId(k) === rest.join(':'))
        ? { route: 'circle', focus: rest.join(':') } : null;
    case 'signature': {
      const accidentals = Number(rest[0]);
      const major = ALL_KEYS.find((k) => k.mode === 'major' && k.accidentals === accidentals);
      return major ? { route: 'circle', focus: keyId(major) } : null;
    }
    case 'cell': {
      const cell = CELLS.find((c) => c.id === rest[0]);
      return cell ? { route: 'rhythms', focus: KIND_METRE[cell.kind] } : null;
    }
    default:
      return null;
  }
}
