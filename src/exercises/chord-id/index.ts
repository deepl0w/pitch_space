import { defineExercise } from '../types';
import { ChordPrompt } from './ChordPrompt';
import {
  CHORD_EXERCISE_ID, chordItems, chordQuestionSpec, chordScoreSpec, chordSettingsSchema,
  generateChord, gradeChord,
  type ChordExercise, type ChordResponse, type ChordSettings,
} from './chords';

/**
 * Name the quality of a chord, from twenty-four types, on any root.
 *
 * Separate from progression identification on purpose, and the split is
 * what lets both stay answerable. There the question is what a chord is
 * *doing* in a key and the answer is a numeral; here it is what the chord
 * *is*, with no key to be in. A progression exercise that also asked for
 * qualities would need a palette of thirty buttons, which is why it
 * reduces every seventh to its triad and leaves this question to this
 * exercise.
 */
export const chordIdentification = defineExercise<
  ChordSettings, ChordExercise, ChordResponse
>({
  id: CHORD_EXERCISE_ID,
  name: 'Chord identification',
  description: 'Hear or read a chord and name its quality.',
  presentations: ['listen', 'read'],
  settings: chordSettingsSchema,
  generate: generateChord,
  items: chordItems,
  grade: gradeChord,
  Prompt: ChordPrompt,
  questionScore: chordQuestionSpec,
  answerScore: chordScoreSpec,
});

export { CHORD_EXERCISE_ID };
