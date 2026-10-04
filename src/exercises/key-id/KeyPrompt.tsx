import { useEffect, useRef } from 'react';
import { ALL_KEYS, findKey, keyId, keyName } from '../../theory/key';
import { cadenceVoices } from '../cadence';
import type { PromptProps } from '../types';
import { soundingKeyName, type KeyExercise, type KeyResponse, type KeySettings } from './keys';

/**
 * Asked by eye, the question is a signature on a staff and the prompt is
 * silent. Asked by ear, it is a cadence and the prompt has to play it.
 *
 * It did not. The exercise declared both presentations, `generate` filled
 * `pitches` with the establishing cadence for the heard one, and this file
 * opened with a comment explaining that it was "deliberately silent: this
 * is a reading exercise" — written when it was. So by ear the screen showed
 * a question about a signature it never drew, with nothing to listen to and
 * no control to ask for it. An exercise with no stimulus at all, offered
 * from the settings panel like any other. Found by the user role, by
 * putting the two modes side by side and seeing that one of them was empty.
 */
export function KeyPrompt({
  exercise, result, onRespond, audio,
}: PromptProps<KeySettings, KeyExercise, KeyResponse>) {
  const answered = result !== null;
  const listening = exercise.source === 'passage';
  const autoplayed = useRef(false);

  function play() {
    audio.play(cadenceVoices(findKey(exercise.keyId)));
  }

  useEffect(() => {
    if (!listening) return;
    if (autoplayed.current) return;
    autoplayed.current = true;
    play();
    // Mount only; the exercise cannot change without a remount (ADR 0015).
    // oxlint-disable-next-line exhaustive-deps
  }, []);

  return (
    <div className="prompt">
      <p className="question">
        {listening
          ? <>A cadence in one <strong>{exercise.mode}</strong> key. Which one?</>
          : <>Which <strong>{exercise.mode}</strong> key has this signature?</>}
      </p>

      {listening && (
        <div className="actions">
          <button type="button" onClick={play}>Play it again</button>
          <span className="secondary">a I–IV–V–I cadence</span>
        </div>
      )}

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
              {/*
                Both spellings by ear — "Gb / F# major" — because the sound
                has two and the listener may name either. On the page the
                spelling is the question, so it stays single. ADR 0020.
              */}
              {listening ? soundingKeyName(key) : keyName(key)}
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
