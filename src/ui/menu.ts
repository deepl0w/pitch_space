import { EXERCISE_FAMILIES } from '../exercises/registry';

/**
 * What the home screen offers, and the single source of every title on it.
 *
 * A screen's name is not written twice. For an exercise it comes from the
 * exercise's own definition, which is what `PracticeScreen` puts in its
 * heading, so the card and the page it opens cannot drift apart. For a
 * reference screen the entry here is what the screen imports for its own
 * heading. Two strings that happen to match today are two strings that will
 * stop matching the first time one is edited.
 */
export interface MenuEntry {
  route: string;
  /** The card title, and the heading of the screen it opens. */
  name: string;
  /** One line on the card. */
  blurb: string;
  /** The longer line under the heading, where the screen wants one. */
  lede?: string;
  /**
   * The route to go back to, when it is not the home screen.
   *
   * Set where a screen is reached from somewhere other than home: audio
   * calibration lives inside settings now, and its back link still said
   * "Everything" and jumped two levels, which contradicts the hierarchy
   * the cog had just established. The user role found it the hour after
   * the cog landed.
   */
  parent?: string;
  ready: boolean;
}

/**
 * Blurbs live here rather than on the definition because they are a property
 * of the menu, not of the exercise. The *name* is the thing both the card and
 * the screen have to agree on, and that comes from the family.
 */
const BLURBS: Record<string, string> = {
  'note-id': 'Name a note — by the distance to a reference, or by what it is '
    + 'doing in a key. By ear or on the staff.',
  // Signature only. The by-ear mode went in ADR 0028 — it asked for absolute
  // pitch — and the notes-without-signature mode went with it, because what
  // it drew was a plain ascending scale whose answer is its own first note.
  // The blurb outlived both and still offered all three.
  'key-id': 'Read a key signature and name the key it belongs to.',
  'progression-id': 'Hear a progression and name what each chord is doing in the key.',
  'scale-id': 'Name a scale from twenty types, in any key — by ear or off the staff.',
  'chord-id': 'Name a chord\u2019s quality, and its bass note if you want the harder question.',
  rhythm: 'Read or hear a rhythm, then tap it back in time. Scored per figure.',
};

/**
 * A card for each built *family*, titled by the family.
 *
 * One card per kind of practice rather than one per way of asking it: the
 * brief names six kinds, and a home screen listing nine cards for them
 * describes the implementation instead of the subject. Which way a question
 * is asked is chosen on the practice screen, where the rest of that
 * exercise's settings already are.
 */
const BUILT: MenuEntry[] = EXERCISE_FAMILIES.map((family) => ({
  route: family.id,
  name: family.name,
  blurb: BLURBS[family.id] ?? family.members[0].description,
  ready: true,
}));

/** Listed before they exist, so the shape of the app is visible. */
const PLANNED: MenuEntry[] = [
  {
    route: 'sight-reading',
    name: 'Sight reading',
    blurb: 'Read a generated line and play it. Scored on pitch and on timing.',
    ready: false,
  },
];

/** Built first, then the rest in the order the brief lists them. */
export const EXERCISE_MENU: readonly MenuEntry[] = [
  ...BUILT,
  ...PLANNED.filter((entry) => !BUILT.some((built) => built.route === entry.route)),
];

/**
 * Not an exercise and not a reference — and no longer drawn on the home
 * screen at all.
 *
 * These two were cards under a "Setup" heading, which offered the same
 * destination twice: Settings links to calibration and names it in its own
 * blurb. Settings is now a cog in the home header and calibration is reached
 * from inside it, so this list is no longer a menu. It stays because
 * `entryFor` is where both screens read their own title and lede, which is
 * what keeps a heading from drifting away from the thing that opened it.
 *
 * So adding an entry here does *not* put it on screen. Whatever route it
 * names has to be reachable from somewhere, or it is a screen with a title
 * and no door.
 */
export const SETUP_MENU: readonly MenuEntry[] = [
  {
    route: 'settings',
    name: 'Settings',
    blurb: 'Theme, volume, audio calibration, and what the app knows about you.',
    lede: 'The preferences that are not about a particular exercise. What an '
      + 'exercise asks lives in its own panel, beside the question it changes.',
    ready: true,
  },
  {
    route: 'calibration',
    parent: 'settings',
    name: 'Audio calibration',
    blurb: 'Measure what your device\'s microphone delay costs, so timing is judged fairly.',
    lede: 'Your device takes a moment to get sound from the microphone into '
      + 'the app, and it will not say how long. Measuring it once makes rhythm '
      + 'judged against what you played rather than against your hardware.',
    ready: true,
  },
];

export const REFERENCE_MENU: readonly MenuEntry[] = [
  {
    route: 'scales',
    name: 'Scales',
    blurb: 'Twenty scale types in every key, spelled as the scale requires.',
    lede: 'Twenty scale types in every key, spelled the way the scale requires '
      + 'rather than by whichever accidental is nearer.',
    ready: true,
  },
  {
    route: 'chords',
    name: 'Chords',
    blurb: 'Twenty-four chord types, any inversion, close or open voicing.',
    lede: 'Twenty-four chord types, in any inversion, on any root. The voicing '
      + 'shown is the one that sounds.',
    ready: true,
  },
  {
    route: 'key-chords',
    name: 'Chords in a key',
    blurb: 'What each degree of a key supplies, numbered.',
    lede: 'Every chord the key supplies, numbered by degree. A minor key shows '
      + 'its natural form — the raised leading tone is a choice the harmony '
      + 'makes, not a property of the key.',
    ready: true,
  },
  {
    route: 'circle',
    name: 'The circle of fifths',
    blurb: 'How the keys relate, and which chords each one supplies.',
    lede: 'Major keys outside, their relative minors inside, one sharp or one '
      + 'flat per step. Pick any key to see what stands next to it and what '
      + 'chords it gives you.',
    ready: true,
  },
  {
    route: 'rhythms',
    name: 'Rhythms',
    blurb: 'Named patterns and the figures bars are built from, metre by metre.',
    lede: 'Pick a time signature to hear what it sounds like: the patterns '
      + 'players know by name, and the beat-level figures its bars are built '
      + 'from. Nothing here is generated — this is the stock itself.',
    ready: true,
  },
];

/** The entry for a route, so a screen can title itself from the same object. */
export function entryFor(route: string): MenuEntry {
  const found = maybeEntryFor(route);
  if (!found) throw new Error(`No menu entry for route: ${route}`);
  return found;
}

/** The same lookup, for callers that have a route which may not be a screen. */
export function maybeEntryFor(route: string): MenuEntry | undefined {
  return [...EXERCISE_MENU, ...REFERENCE_MENU, ...SETUP_MENU].find((e) => e.route === route);
}

/** Where a screen's back link goes, and what it is called. */
export function backFrom(route: string): { route: string; label: string } {
  const parent = maybeEntryFor(route)?.parent;
  const to = parent ? maybeEntryFor(parent) : undefined;
  return to ? { route: to.route, label: to.name } : { route: '', label: 'Everything' };
}
