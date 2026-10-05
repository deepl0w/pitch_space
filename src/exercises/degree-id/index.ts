import { defineExercise } from '../types';
import { DegreePrompt } from './DegreePrompt';
import {
  DEGREE_EXERCISE_ID, degreeItems, degreeQuestionSpec, degreeScoreSpec, degreeSettingsSchema, generateDegree, gradeDegree, type DegreeExercise, type DegreeResponse, type DegreeSettings,
} from './degrees';

/**
 * Functional ear training: hear a key, then name what a note is doing in it.
 *
 * The counterpart to interval identification rather than a replacement. The
 * movable-do tradition holds that intervals heard in isolation do not
 * transfer to reading real music and that hearing a pitch's function does;
 * that is a claim about what training works, not about what is worth
 * offering, so the app offers both and lets a learner find out.
 */
export const degreeIdentification = defineExercise<
  DegreeSettings, DegreeExercise, DegreeResponse
>({
  id: DEGREE_EXERCISE_ID,
  name: 'Scale degrees',
  description: 'Hear a key established, then name what a note is doing in it.',
  presentations: ['listen', 'read'],
  // Exact, which corrects the prediction in docs/IN-FLIGHT.md: that was
  // about the rejected focus(settings) seam. See ExerciseSpec.prefer.
  aims: 'exact',
  settings: degreeSettingsSchema,
  generate: generateDegree,
  items: degreeItems,
  grade: (exercise, response) => gradeDegree(exercise, response),
  Prompt: DegreePrompt,
  questionScore: degreeQuestionSpec,
  answerScore: degreeScoreSpec,
});

export { DEGREE_EXERCISE_ID };
