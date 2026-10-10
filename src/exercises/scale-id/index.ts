import { defineExercise } from '../types';
import { ScalePrompt } from './ScalePrompt';
import {
  SCALE_EXERCISE_ID, generateScale, gradeScale, scaleItems, scaleQuestionSpec,
  scaleScoreSpec, scaleSettingsSchema,
  type ScaleExercise, type ScaleResponse, type ScaleSettings,
} from './scales';

/**
 * Name the scale, from twenty types, in any key.
 *
 * The root moves and the answer does not name it: what is being learned is
 * the shape, and a learner who only ever hears the modes from C has learned
 * the white notes instead. Read rather than heard, the spelling carries the
 * question — a blues scale wants its flat fifth written as a flat fifth —
 * which is why the staff shows what `spellScale` produced and not a
 * respelling of it.
 */
export const scaleIdentification = defineExercise<
  ScaleSettings, ScaleExercise, ScaleResponse
>({
  id: SCALE_EXERCISE_ID,
  name: 'Scale identification',
  description: 'Hear or read a scale and name which one it is.',
  presentations: ['listen', 'read'],
  // Exact: an item is a projection of a setting, so narrowing to one
  // is invertible rather than approximate. See ExerciseSpec.prefer.
  aims: 'exact',
  settings: scaleSettingsSchema,
  generate: generateScale,
  items: scaleItems,
  grade: gradeScale,
  Prompt: ScalePrompt,
  questionScore: scaleQuestionSpec,
  // The answer's stave goes inside the sound box, in place of the wave.
  promptDrawsAnswerStaff: true,
  answerScore: scaleScoreSpec,
});

export { SCALE_EXERCISE_ID };
