import { intervalIdentification } from './interval-id';
import { keyIdentification } from './key-id';
import { scaleIdentification } from './scale-id';
import { chordIdentification } from './chord-id';
import { rhythmIdentification } from './rhythm-id';
import { degreeIdentification } from './degree-id';
import { progressionIdentification } from './progression-id';
import type { AnyExerciseDefinition } from './types';

/**
 * Every exercise type the app has, listed once, grouped the way the brief
 * groups them.
 *
 * This file is the seam. The screen, the settings panel and the attempt log
 * know about `ExerciseDefinition`, about this file, and about no particular
 * exercise — so adding the next type is one import and one entry, and
 * nothing else in the app changes.
 *
 * **A family is one of the six kinds of practice; a type is one way of
 * asking it.** Naming a note is one kind, and naming the distance to a
 * reference, naming the note outright and naming its degree in a key are
 * three ways of asking it. They are separate *types* because their settings,
 * their answers and their grading have nothing in common — and one *family*
 * because a learner choosing what to practise is choosing between six
 * things, not between nine.
 *
 * Grouping here rather than in the menu because the grouping is a fact about
 * the exercises and the menu is a view of it. The home screen shows one card
 * per family, and the practice screen offers the family's types in a
 * selector; a family of one shows no selector at all.
 *
 * **Each type keeps its own id**, which is what the attempt log stores and
 * what every recorded item is keyed by, so regrouping them costs no history.
 * That is the reason this is a grouping and not a merge: folding three types
 * into one would orphan everything a user had learned under the two ids that
 * disappeared, to save them one click.
 */
export interface ExerciseFamily {
  /** The route, and a compatibility commitment once a link exists. */
  id: string;
  /** The card title and the screen heading. */
  name: string;
  members: readonly AnyExerciseDefinition[];
}

/**
 * Listed explicitly rather than discovered by globbing the directory. A glob
 * would make the order of the home screen depend on the filesystem, and the
 * set of shipped exercises depend on what happened to be left in the tree.
 */
export const EXERCISE_FAMILIES: readonly ExerciseFamily[] = [
  {
    id: 'note-id',
    name: 'Note identification',
    // Relative, functional, and — when it is built — absolute. What is being
    // named is the same thing each time; what differs is what help you get.
    members: [intervalIdentification, degreeIdentification],
  },
  {
    id: 'progression-id',
    name: progressionIdentification.name,
    members: [progressionIdentification],
  },
  {
    id: 'key-id',
    name: keyIdentification.name,
    members: [keyIdentification],
  },
  {
    id: 'chord-id',
    name: chordIdentification.name,
    members: [chordIdentification],
  },
  {
    id: 'scale-id',
    name: scaleIdentification.name,
    members: [scaleIdentification],
  },
  {
    id: 'rhythm',
    name: rhythmIdentification.name,
    members: [rhythmIdentification],
  },
];

/** Every type, flattened, for the callers that genuinely want all of them. */
export const EXERCISE_TYPES: readonly AnyExerciseDefinition[] =
  EXERCISE_FAMILIES.flatMap((family) => family.members);

export function findExerciseType(id: string): AnyExerciseDefinition | undefined {
  return EXERCISE_TYPES.find((type) => type.id === id);
}

/**
 * The family a route names, whether the route is the family's own id or one
 * of its members'.
 *
 * Both are accepted because a member id *was* a route before the families
 * existed, and a bookmark or a reload should not land on the home screen.
 */
export function findFamily(route: string): ExerciseFamily | undefined {
  return EXERCISE_FAMILIES.find(
    (family) => family.id === route || family.members.some((m) => m.id === route),
  );
}

/**
 * The type to open on within a family, given whatever the user last chose.
 *
 * Total: a stored id belonging to another family, or to a release that had
 * an exercise this one does not, falls back to the family's first rather
 * than leaving the screen with nothing.
 */
export function memberOr(family: ExerciseFamily, id: string | null): AnyExerciseDefinition {
  return family.members.find((m) => m.id === id) ?? family.members[0];
}

/**
 * The type to open on, given whatever the user last chose.
 *
 * Total: a stored id from a release that had an exercise this one does not
 * falls back to the first rather than leaving the screen with nothing.
 */
export function exerciseTypeOr(id: string | null, fallback = EXERCISE_TYPES[0]): AnyExerciseDefinition {
  return (id === null ? undefined : findExerciseType(id)) ?? fallback;
}
