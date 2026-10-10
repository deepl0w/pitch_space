import { defineExercise } from '../types';
import { ProgressionPrompt } from './ProgressionPrompt';
import {
  PROGRESSION_EXERCISE_ID, generateProgression, gradeProgression, progressionItems, progressionQuestionSpec, progressionScoreSpec, progressionSettings, type ProgressionExercise, type ProgressionResponse, type ProgressionSettings,
} from './progressions';

/**
 * Follow a progression and name what each chord is doing.
 *
 * The exercise the harmony generator was built for. Everything it needs
 * already existed — the corpus of real progressions, the phrase planner, the
 * cadence enforcement, the rule against V moving to a predominant — so this
 * contributes a question and an answer rather than any new music.
 *
 * It is also the exercise ADR 0011 named as the trigger for deciding what to
 * do about the three templates the default path cannot reach. The answer
 * turned out to be a setting rather than a deletion: the planner only ever
 * asks for a half or a perfect authentic cadence, so letting the exercise
 * ask for any of the five reaches the other three — and a learner who only
 * ever hears V–I never learns to hear a deceptive close as deceptive, which
 * makes it worth having for its own sake.
 */
export const progressionIdentification = defineExercise<
  ProgressionSettings, ProgressionExercise, ProgressionResponse
>({
  id: PROGRESSION_EXERCISE_ID,
  name: 'Chord progressions',
  description: 'Hear a key established, then a progression. Name each chord by degree.',
  presentations: ['listen', 'read'],
  /*
    None, and that is the honest answer rather than a gap. A roman numeral
    is an *outcome* of harmony generation and a rhythm cell an outcome of
    the filler — there is no input meaning "ask me a viio", and there
    could not be one without the generator becoming a search. The wish is
    ignored; the schedule reconciles against exercise.items.
  */
  aims: 'none',
  settings: progressionSettings,
  generate: generateProgression,
  items: progressionItems,
  grade: gradeProgression,
  Prompt: ProgressionPrompt,
  questionScore: progressionQuestionSpec,
  // The answer's stave goes inside the sound box, in place of the wave.
  promptDrawsAnswerStaff: true,
  answerScore: progressionScoreSpec,
});

export { PROGRESSION_EXERCISE_ID };
