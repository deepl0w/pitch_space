import { defineExercise } from '../types';
import { RhythmPrompt } from './RhythmPrompt';
import {
  RHYTHM_EXERCISE_ID, coerceRhythmSettings, generateRhythmExercise, gradeRhythm, rhythmItems,
  rhythmQuestionSpec, rhythmScoreSpec, rhythmSettingsSchema,
  type RhythmExercise, type RhythmResponse, type RhythmSettings,
} from './rhythms';

/**
 * Read or hear a rhythm, then play it back in time.
 *
 * The one exercise whose answer is a performance rather than a choice,
 * which is why it is the only one with no row of buttons. Naming a
 * rhythm off a list tests reading one; what a musician practises is
 * placing it, so the user taps it and the alignment that grades a
 * microphone will grade the taps — `alignRhythm` does not care where
 * the attacks came from.
 */
export const rhythmIdentification = defineExercise<
  RhythmSettings, RhythmExercise, RhythmResponse
>({
  id: RHYTHM_EXERCISE_ID,
  name: 'Rhythm',
  description: 'Read or hear a rhythm, then play it back in time.',
  presentations: ['read'],
  /*
    None, and that is the honest answer rather than a gap. A roman numeral
    is an *outcome* of harmony generation and a rhythm cell an outcome of
    the filler — there is no input meaning "ask me a viio", and there
    could not be one without the generator becoming a search. The wish is
    ignored; the schedule reconciles against exercise.items.
  */
  aims: 'none',
  // The stave carries a moving cursor and the marks for how it was played,
  // so it belongs inside the component holding the clock. See PromptDrawnScores.
  promptDrawsScores: true,
  settings: rhythmSettingsSchema,
  generate: generateRhythmExercise,
  items: rhythmItems,
  grade: gradeRhythm,
  Prompt: RhythmPrompt,
  questionScore: rhythmQuestionSpec,
  answerScore: rhythmScoreSpec,
});

export { RHYTHM_EXERCISE_ID, coerceRhythmSettings };
