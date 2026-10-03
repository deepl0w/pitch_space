import { intervalRecognition } from './note-id';
import type { AnyExerciseDefinition } from './types';

/**
 * Every exercise type the app has, listed once.
 *
 * This file is the seam. The screen, the settings panel and the attempt log
 * know about `ExerciseDefinition` and about this array, and about no
 * particular exercise — so adding the sixth type is one import and one array
 * entry, and nothing else in the app changes.
 *
 * Listed explicitly rather than discovered by globbing the directory. A glob
 * would make the order of the home screen depend on the filesystem, and the
 * set of shipped exercises depend on what happened to be left in the tree.
 */
export const EXERCISE_TYPES: readonly AnyExerciseDefinition[] = [
  intervalRecognition,
];

export function findExerciseType(id: string): AnyExerciseDefinition | undefined {
  return EXERCISE_TYPES.find((type) => type.id === id);
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
