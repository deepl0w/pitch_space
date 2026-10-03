/**
 * What the home screen offers.
 *
 * The six exercise types are listed before any of them exists, with `ready`
 * saying which are real. A menu that only shows what is finished hides the
 * shape of the thing being built, and "not built yet" on the page is a more
 * honest status than a roadmap nobody opens.
 *
 * This is deliberately a plain list rather than a read of the exercise
 * registry: the registry is being written in another branch, and a menu that
 * cannot render until it lands would block the shell on it. When the registry
 * arrives, `ready` entries should come from it and this list keeps only the
 * ones still unbuilt.
 */
export interface MenuEntry {
  route: string;
  name: string;
  blurb: string;
  ready: boolean;
}

export const REFERENCE_MENU: readonly MenuEntry[] = [
  {
    route: 'scales',
    name: 'Scales',
    blurb: 'Twenty scale types in every key, spelled as the scale requires.',
    ready: true,
  },
  {
    route: 'chords',
    name: 'Chords',
    blurb: 'Twenty-four chord types, any inversion, close or open voicing.',
    ready: true,
  },
  {
    route: 'key-chords',
    name: 'Chords in a key',
    blurb: 'What each degree of a key supplies, numbered.',
    ready: true,
  },
  {
    route: 'rhythms',
    name: 'Rhythms',
    blurb: 'The named figures bars are built from, notated and played.',
    ready: true,
  },
];

export const EXERCISE_MENU: readonly MenuEntry[] = [
  {
    route: 'sight-reading',
    name: 'Sight reading',
    blurb: 'Read a generated line and play it. Scored on pitch and on timing.',
    ready: false,
  },
  {
    route: 'note-id',
    name: 'Note identification',
    blurb: 'Name a note you hear, or the interval between two of them.',
    ready: false,
  },
  {
    route: 'rhythm',
    name: 'Rhythm',
    blurb: 'Clap or play a generated rhythm back against the click.',
    ready: false,
  },
  {
    route: 'chord-id',
    name: 'Chord identification',
    blurb: 'Name the quality of a chord by ear.',
    ready: false,
  },
  {
    route: 'progression-id',
    name: 'Chord progressions',
    blurb: 'Follow a progression and name what each chord is doing.',
    ready: false,
  },
  {
    route: 'scale-id',
    name: 'Scale identification',
    blurb: 'Name a scale from hearing it.',
    ready: false,
  },
];
