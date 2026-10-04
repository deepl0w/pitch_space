import { defineExercise } from '../types';
import { KeyPrompt } from './KeyPrompt';
import {
  KEY_EXERCISE_ID, coerceKeySettings, generateKey, gradeKey, keyItems, keyQuestionSpec, keyScoreSpec, keySettingsSchema, type KeyExercise, type KeyResponse, type KeySettings,
} from './keys';

/**
 * Key identification by sight: read a signature, name the key.
 *
 * The only exercise so far with nothing to listen to, which is why it is
 * worth having second — it is the one that proves the contract does not
 * quietly assume every exercise sounds.
 */
export const keyIdentification = defineExercise<KeySettings, KeyExercise, KeyResponse>({
  id: KEY_EXERCISE_ID,
  name: 'Key identification',
  description: 'Name the key — from its signature, from the notes, or by ear.',
  // All three: the signature and the bare accidentals are read, a passage is
  // heard. Declaring both is what puts the choice in the settings panel.
  presentations: ['read', 'listen'],
  settings: keySettingsSchema,
  generate: generateKey,
  items: keyItems,
  grade: gradeKey,
  Prompt: KeyPrompt,
  questionScore: keyQuestionSpec,
  // The signature *is* the question, so the same stave serves as the answer.
  answerScore: keyScoreSpec,
});

export { KEY_EXERCISE_ID, coerceKeySettings, keyScoreSpec };
