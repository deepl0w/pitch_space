import { useEffect, useRef, useState } from 'react';
import { INVERSION_LABELS, chordType } from '../../theory/chord';
import { pitchName } from '../../theory/pitch';
import type { PromptProps } from '../types';
import {
  SOUNDING_LABELS, chordVoicesFor,
  type ChordExercise, type ChordResponse, type ChordSettings,
} from './chords';
import { SoundBox } from '../SoundBox';

/** Out of the component, so the clock is not read where a render could. */
function latencySince(firstHeardAt: number | null): { latencyMs?: number } {
  return firstHeardAt === null ? {} : { latencyMs: Date.now() - firstHeardAt };
}

export function ChordPrompt({
  exercise, result, onRespond, audio, moveOn,
}: PromptProps<ChordSettings, ChordExercise, ChordResponse>) {
  const firstHeardAt = useRef<number | null>(null);
  const autoplayed = useRef(false);
  const [quality, setQuality] = useState<string | null>(null);
  const [bass, setBass] = useState<number | null>(null);
  const reading = exercise.presentation === 'read';
  const asking = exercise.inversionChoices.length > 0;

  // Moved on every play, so the box's wave follows the sound rather than
  // only its own button — a question sounds itself on Start.
  const [playedAt, setPlayedAt] = useState(0);

  function play() {
    setPlayedAt(Date.now());
    audio.play(chordVoicesFor(exercise));
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

  /*
    Two answers go in as one response, so the quality click does not submit
    while the bass is still unchosen. Grading is a pure function of
    `(exercise, response)` and there is no half-response in that contract —
    which is the right contract, and the reason the waiting happens here.
  */
  function send(typeId: string, inversion: number | null) {
    if (result) return;
    onRespond({
      typeId,
      ...(inversion === null ? {} : { inversion }),
      ...latencySince(firstHeardAt.current),
    });
  }

  function chooseQuality(typeId: string) {
    if (result || quality !== null) return;
    setQuality(typeId);
    if (!asking) send(typeId, null);
    else if (bass !== null) send(typeId, bass);
  }

  function chooseBass(inversion: number) {
    if (result || bass !== null) return;
    setBass(inversion);
    if (quality !== null) send(quality, inversion);
  }

  const answered = result !== null;

  return (
    <div className="prompt">
      <p className="question">
        {reading
          ? <>Which chord is written here?</>
          : <>A chord. Which one?</>}
      </p>

      {!reading && (
        <SoundBox
          voices={chordVoicesFor(exercise)}
          onPlay={play}
          onStop={() => { audio.stopAll(); }}
          playedAt={playedAt}
          spectrum={audio.spectrum?.bind(audio)}
          label="Play it again"
          note={SOUNDING_LABELS[exercise.sounding].toLowerCase()}
        />
      )}

      <div className="actions">{moveOn}</div>

      <div className="choices" role="group" aria-label="Which chord was that?">
        {exercise.choices.map((id) => {
          const right = answered && id === exercise.typeId;
          const wrong = answered && id === quality && id !== exercise.typeId;
          return (
            <button
              key={id}
              className={`choice${right ? ' right' : ''}${wrong ? ' wrong' : ''}`}
              disabled={answered || (quality !== null && quality !== id)}
              onClick={() => chooseQuality(id)}
            >
              {chordType(id).name}
            </button>
          );
        })}
      </div>

      {asking && (
        <>
          <p className="question">And which note is in the bass?</p>
          <div className="choices" role="group" aria-label="Which note is in the bass?">
            {exercise.inversionChoices.map((inv) => {
              const right = answered && inv === exercise.inversion;
              const wrong = answered && inv === bass && inv !== exercise.inversion;
              return (
                <button
                  key={inv}
                  className={`choice${right ? ' right' : ''}${wrong ? ' wrong' : ''}`}
                  disabled={answered || (bass !== null && bass !== inv)}
                  onClick={() => chooseBass(inv)}
                >
                  {INVERSION_LABELS[inv]}
                </button>
              );
            })}
          </div>
        </>
      )}

      {answered && (
        <p className={`verdict ${result.correct ? 'right' : 'wrong'}`}>{result.feedback}</p>
      )}
      {answered && (
        <p className="secondary">
          {exercise.pitches.map((p) => pitchName(p, false)).join(' – ')}
        </p>
      )}
    </div>
  );
}
