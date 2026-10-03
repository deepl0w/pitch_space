import { defineExercise } from '../types';
import { IntervalPrompt } from './IntervalPrompt';
import {
  generateInterval, gradeInterval, intervalScoreNotes, intervalSettingsSchema,
  INTERVAL_EXERCISE_ID,
  type IntervalExercise, type IntervalResponse, type IntervalSettings,
} from './intervals';

/**
 * Interval identification by ear. Naming an interval between two notes is
 * family; naming a single played note against a reference and identifying a
 * written note on the staff belong here too, and each is another
 * `defineExercise` call plus a prompt.
 */
export const intervalRecognition = defineExercise<
  IntervalSettings, IntervalExercise, IntervalResponse
>({
  id: INTERVAL_EXERCISE_ID,
  name: 'Interval identification',
  description: 'Two notes sound; say how far apart they were.',
  settings: intervalSettingsSchema,
  generate: generateInterval,
  grade: gradeInterval,
  Prompt: IntervalPrompt,
  answerScore: (exercise) => ({ notes: intervalScoreNotes(exercise), clef: exercise.clef }),
});

export * from './intervals';
