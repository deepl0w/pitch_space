import { defineExercise } from '../types';
import { KeyPrompt } from './KeyPrompt';
import {
  KEY_EXERCISE_ID, coerceKeySettings, generateKey, gradeKey, keyItems, keyQuestionSpec, keyScoreSpec, keySettingsSchema, type KeyExercise, type KeyResponse, type KeySettings,
} from './keys';

/**
 * Key identification by sight: read a signature, name the key.
 *
 * The only exercise with nothing to listen to, which is why it earns its
 * place in the registry twice over — it is the one that proves the
 * contract does not quietly assume every exercise sounds.
 */
export const keyIdentification = defineExercise<KeySettings, KeyExercise, KeyResponse>({
  id: KEY_EXERCISE_ID,
  name: 'Key identification',
  // Signature only. The notes-without-signature mode went with the by-ear
  // one; this line outlived both and was still offering a question the
  // exercise cannot ask, which the user role confirmed over 19 starts.
  description: 'Read a key signature and name the key it belongs to.',
  // Reading only. An ear mode was offered and removed: naming a key from a
  // cadence with no reference pitch is absolute pitch, which most
  // musicians do not have and cannot train. See ADR 0028.
  presentations: ['read'],
  // Exact, which corrects the prediction in docs/IN-FLIGHT.md: that was
  // about the rejected focus(settings) seam. See ExerciseSpec.prefer.
  aims: 'exact',
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
