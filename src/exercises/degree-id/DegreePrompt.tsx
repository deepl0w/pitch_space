import { useEffect, useRef, useState } from 'react';
import { ALL_KEYS, keyId } from '../../theory/key';
import type { PromptProps } from '../types';
import {
  degreeLabelFor, degreeVoices,
  type DegreeExercise, type DegreeResponse, type DegreeSettings,
} from './degrees';
import { SoundBox } from '../SoundBox';

/** Out of the component, so the clock is not read where a render could. */
function latencySince(firstHeardAt: number | null): { latencyMs?: number } {
  return firstHeardAt === null ? {} : { latencyMs: Date.now() - firstHeardAt };
}

/**
 * Remounted per exercise by the screen, which is why there is no reset: a
 * fresh question is a fresh component.
 */
export function DegreePrompt({
  exercise, settings, result, onRespond, audio, moveOn,
}: PromptProps<DegreeSettings, DegreeExercise, DegreeResponse>) {
  const firstHeardAt = useRef<number | null>(null);
  const autoplayed = useRef(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const reading = exercise.presentation === 'read';
  const key = ALL_KEYS.find((k) => keyId(k) === exercise.keyId)!;

  // Moved on every play, so the box's wave follows the sound rather than
  // only its own button — a question sounds itself on Start.
  const [playedAt, setPlayedAt] = useState(0);

  function play() {
    setPlayedAt(Date.now());
    audio.play(degreeVoices(exercise));
    // From the first hearing, not the last: someone who needed three listens
    // has not answered quickly, and restarting the clock would record that
    // they had.
    firstHeardAt.current ??= Date.now();
  }

  useEffect(() => {
    if (reading) return;
    if (autoplayed.current) return;
    autoplayed.current = true;
    play();
    // Mount only; the exercise cannot change without a remount.
    // oxlint-disable-next-line exhaustive-deps
  }, []);

  function answer(degree: number) {
    // Guarded on `chosen` as well as `result`, which arrives a render later.
    if (result || chosen !== null) return;
    setChosen(degree);
    onRespond({ degree, ...latencySince(firstHeardAt.current) });
  }

  const answered = result !== null;

  return (
    <div className="prompt">
      <p className="question">
        {reading
          ? <>Which degree of <strong>{key.mode}</strong> is this note?</>
          : <>The key is established, then one note. Which degree was it?</>}
      </p>

      {!reading && (
        <SoundBox
          voices={degreeVoices(exercise)}
          onPlay={play}
          onStop={() => { audio.stopAll(); }}
          playedAt={playedAt}
          spectrum={audio.spectrum?.bind(audio)}
          label="Play it again"
          note={exercise.context.length > 0 ? 'cadence, then the note' : 'the note alone'}
        />
      )}

      <div className="actions">{moveOn}</div>

      <div className="choices" role="group" aria-label="Which degree was that?">
        {exercise.choices.map((degree) => {
          const right = answered && degree === exercise.degree;
          const wrong = answered && degree === chosen && degree !== exercise.degree;
          return (
            <button
              key={degree}
              className={`choice${right ? ' right' : ''}${wrong ? ' wrong' : ''}`}
              disabled={answered}
              onClick={() => answer(degree)}
            >
              {degreeLabelFor(degree, key.mode, settings.naming)}
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
