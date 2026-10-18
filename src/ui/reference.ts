import { ALL_KEYS, keyId, type Key, type Mode } from '../theory/key';
import { pitchName } from '../theory/pitch';
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
  /** The note a scale page starts on, when the question had a key. */
  readonly tonic?: string;
}

/** The tonic a mode's page opens on, when the item names a mode and no key. */
const TONIC_KEY: Readonly<Record<Mode, string>> = { major: 'C_major', minor: 'A_minor' };
const MODE_SCALE: Readonly<Record<Mode, string>> = { major: 'major', minor: 'natural_minor' };
/** The metre a rhythm figure is shown in, by the kind of beat it fills. */
const KIND_METRE = { simple: '4/4', compound: '6/8' } as const;

function isMode(value: string | undefined): value is Mode {
  return value === 'major' || value === 'minor';
}

/** The asked key, if it is one and in the item's own mode. */
function askedIn(asked: string | undefined, mode: Mode): Key | undefined {
  return ALL_KEYS.find((k) => keyId(k) === asked && k.mode === mode);
}

/**
 * The reference page for an item, or nothing.
 *
 * `asked` is the key the question was in (`ExerciseBase.keyId`). Progression
 * and degree items name a mode and not a key, so without it their page opens
 * on C major or A minor; with it, on the key the learner just heard. A second
 * argument rather than a richer id, because the id is what history is keyed
 * on and the key is only where to point. Required though it may be
 * `undefined`: optional, leaving it out compiled and silently sent every
 * look-up to C, which is how the seed on `songHint` was lost the day before.
 *
 * Nothing is a real answer and shows no button: a cadence is graded by no
 * exercise yet and has no page, and an id this release does not recognise —
 * history outlives the code that wrote it — should cost a button rather than
 * open a page at an arbitrary default that claims to be about it.
 */
export function referenceFor(item: ItemId, asked: string | undefined): ReferenceTarget | null {
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
      if (!isMode(rest[1])) return null;
      return {
        route: 'scales',
        focus: MODE_SCALE[rest[1]],
        ...withTonic(askedIn(asked, rest[1])),
      };
    case 'progression':
      // The key the question was in, or the mode's plainest key when the
      // caller has none: every diatonic chord the numeral could be is on it.
      if (!isMode(rest[0])) return null;
      return { route: 'key-chords', focus: keyIdOf(askedIn(asked, rest[0])) ?? TONIC_KEY[rest[0]] };
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

function withTonic(key: Key | undefined): { tonic?: string } {
  return key ? { tonic: pitchName(key.tonic, false) } : {};
}

function keyIdOf(key: Key | undefined): string | undefined {
  return key ? keyId(key) : undefined;
}
