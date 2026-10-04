import { ALL_KEYS, keyId, keyName } from '../../theory/key';
import type { PromptProps } from '../types';
import type { KeyExercise, KeyResponse, KeySettings } from './keys';

/**
 * A signature on a staff, and a row of key names. Nothing sounds.
 *
 * This prompt had an ear branch: a I–IV–V–I cadence, then "which key?".
 * It was added because the exercise declared a listening presentation and
 * played nothing — a real bug, found by the user role, and fixed by
 * making the cadence audible. That fix was correct and the exercise it
 * fixed should not have existed. Naming a key from a cadence with no
 * reference pitch is absolute pitch and nothing else, so the mode asked
 * for a faculty most musicians do not have and cannot train. See ADR 0028.
 *
 * What is left is the exercise this screen was always best at, and the
 * one that keeps the registry honest about exercises with nothing to
 * hear.
 */
export function KeyPrompt({
  exercise, result, onRespond,
}: PromptProps<KeySettings, KeyExercise, KeyResponse>) {
  const answered = result !== null;

  return (
    <div className="prompt">
      <p className="question">
        {exercise.source === 'signature'
          ? <>Which <strong>{exercise.mode}</strong> key has this signature?</>
          : <>These notes are a <strong>{exercise.mode}</strong> scale. Which key?</>}
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
