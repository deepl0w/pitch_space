import { defineExercise } from '../types';
import { IntervalPrompt } from './IntervalPrompt';
import {
  INTERVAL_EXERCISE_ID, generateInterval, gradeInterval, intervalItems, intervalQuestionScore, intervalScoreNotes, intervalSettingsSchema, type IntervalExercise, type IntervalResponse, type IntervalSettings,
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
  // Both: the same interval read off the staff and heard are different
  // skills, and a learner is routinely fluent at one and lost at the other.
  presentations: ['listen', 'read'],
  description: 'Say how far apart two notes are, by ear or from the staff.',
  settings: intervalSettingsSchema,
  generate: generateInterval,
  items: intervalItems,
  grade: gradeInterval,
  Prompt: IntervalPrompt,
  questionScore: intervalQuestionScore,
  answerScore: (exercise) => ({ notes: intervalScoreNotes(exercise), clef: exercise.clef }),
});

export * from './intervals';
