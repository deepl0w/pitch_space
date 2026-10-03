import { defineExercise } from '../types';
import { IntervalPrompt } from './IntervalPrompt';
import {
  generateInterval, gradeInterval, intervalScoreNotes, intervalSettingsSchema,
  INTERVAL_EXERCISE_ID,
  type IntervalExercise, type IntervalResponse, type IntervalSettings,
} from './intervals';

/**
 * Interval identification by ear: naming the distance between two notes.
 *
 * Distinct from note identification, which names a single note — on its own
 * or against a reference. Naming the gap and naming the note are different
 * skills, and a learner can be fluent at one and hopeless at the other, so
 * they are separate exercises rather than modes of one.
 */
export const intervalIdentification = defineExercise<
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
