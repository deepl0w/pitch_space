import { ALL_KEYS, keyId, keyName } from '../../theory/key';
import type { PromptProps } from '../types';
import type { KeyExercise, KeyResponse, KeySettings } from './keys';

/**
 * The prompt is deliberately silent: this is a reading exercise, so there is
 * nothing to play and no Listen button to suggest otherwise.
 */
export function KeyPrompt({ exercise, result, onRespond }: PromptProps<KeySettings, KeyExercise, KeyResponse>) {
  const answered = result !== null;

  return (
    <div className="prompt">
      <p className="question">
        Which <strong>{exercise.mode}</strong> key has this signature?
      </p>
      <div className="choices">
        {exercise.choices.map((id) => {
          const key = ALL_KEYS.find((k) => keyId(k) === id)!;
          const isAnswer = id === exercise.keyId;
          return (
            <button
              key={id}
              className={`choice${answered && isAnswer ? ' right' : ''}`}
              disabled={answered}
              onClick={() => onRespond({ keyId: id })}
            >
              {keyName(key)}
            </button>
          );
        })}
      </div>
      {answered && (
        <p className={`verdict ${result.correct ? 'right' : 'wrong'}`}>{result.feedback}</p>
      )}
    </div>
  );
}
