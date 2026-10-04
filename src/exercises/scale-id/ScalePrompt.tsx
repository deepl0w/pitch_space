import { useEffect, useRef, useState } from 'react';
import { scaleType } from '../../theory/scale';
import { pitchName } from '../../theory/pitch';
import type { PromptProps } from '../types';
import {
  DIRECTION_LABELS, scaleVoices,
  type ScaleExercise, type ScaleResponse, type ScaleSettings,
} from './scales';

/** Out of the component, so the clock is not read where a render could. */
function latencySince(firstHeardAt: number | null): { latencyMs?: number } {
  return firstHeardAt === null ? {} : { latencyMs: Date.now() - firstHeardAt };
}

export function ScalePrompt({
  exercise, result, onRespond, audio,
}: PromptProps<ScaleSettings, ScaleExercise, ScaleResponse>) {
  const firstHeardAt = useRef<number | null>(null);
  const autoplayed = useRef(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const reading = exercise.presentation === 'read';

  function play() {
    audio.play(scaleVoices(exercise));
    // From the first hearing, not the last: three listens is not a fast
    // answer, and restarting the clock would record that it was.
    firstHeardAt.current ??= Date.now();
  }

  useEffect(() => {
    if (reading) return;
    if (autoplayed.current) return;
    autoplayed.current = true;
    play();
    // Mount only; the exercise cannot change without a remount (ADR 0015).
    // oxlint-disable-next-line exhaustive-deps
  }, []);

  function answer(typeId: string) {
    // Guarded on `chosen` as well as `result`, which arrives a render later.
    if (result || chosen !== null) return;
    setChosen(typeId);
    onRespond({ typeId, ...latencySince(firstHeardAt.current) });
  }

  const answered = result !== null;

  return (
    <div className="prompt">
      <p className="question">
        {reading
          ? <>Which scale is written here?</>
          : <>A scale, from <strong>{pitchName(exercise.root, false)}</strong>. Which one?</>}
      </p>

      {!reading && (
        <div className="actions">
          <button type="button" onClick={play}>Play it again</button>
          <span className="secondary">
            {DIRECTION_LABELS[exercise.direction].toLowerCase()}
          </span>
        </div>
      )}

      <div className="choices" role="group" aria-label="Which scale was that?">
        {exercise.choices.map((id) => {
          const right = answered && id === exercise.typeId;
          const wrong = answered && id === chosen && id !== exercise.typeId;
          return (
            <button
              key={id}
              className={`choice${right ? ' right' : ''}${wrong ? ' wrong' : ''}`}
              disabled={answered}
              onClick={() => answer(id)}
            >
              {scaleType(id).name}
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
