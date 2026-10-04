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
  'key-id': 'Name the key, from its signature, from the notes, or by ear.',
  'progression-id': 'Hear a progression and name what each chord is doing in the key.',
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
  {
    route: 'rhythm',
    name: 'Rhythm',
    blurb: 'Clap or play a rhythm back — read from the staff, or copied by ear.',
    ready: false,
  },
  {
    route: 'chord-id',
    name: 'Chord identification',
    blurb: 'Name the quality of a chord — by ear, or read off the staff.',
    ready: false,
  },
  {
    route: 'scale-id',
    name: 'Scale identification',
    blurb: 'Name a scale — by ear, or read off the staff.',
    ready: false,
  },
];

/** Built first, then the rest in the order the brief lists them. */
export const EXERCISE_MENU: readonly MenuEntry[] = [
  ...BUILT,
  ...PLANNED.filter((entry) => !BUILT.some((built) => built.route === entry.route)),
];

/**
 * Not an exercise and not a reference, so it gets its own list rather than
 * being wedged into one of theirs. One entry today; the shape is here so the
 * next thing that is neither does not have to invent it.
 */
export const SETUP_MENU: readonly MenuEntry[] = [
  {
    route: 'calibration',
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
  const found = [...EXERCISE_MENU, ...REFERENCE_MENU, ...SETUP_MENU]
    .find((e) => e.route === route);
  if (!found) throw new Error(`No menu entry for route: ${route}`);
  return found;
}
