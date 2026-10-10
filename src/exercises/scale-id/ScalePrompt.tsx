import { useEffect, useRef, useState } from 'react';
import { scaleType } from '../../theory/scale';
import { pitchName } from '../../theory/pitch';
import { namePlayed, steadyNotes } from '../played';
import type { PromptProps } from '../types';
import {
  DIRECTION_LABELS, scalePlayed, scaleVoices,
  type ScaleExercise, type ScaleResponse, type ScaleSettings,
} from './scales';

/**
 * How long the microphone is open for a played scale.
 *
 * Longer than the interval exercise's four seconds because the answer is
 * eight notes rather than two, and a learner finding them on an instrument
 * is not playing to a metronome. Eight seconds is a slow scale at about a
 * note a second with room to start late; the take is analysed only once it
 * ends, so this is also how long the answer takes to come back.
 */
const TAKE_SECONDS = 8;

/** What to say when there was no take at all, by the two reasons there are. */
const REFUSALS: Record<'refused' | 'unavailable', string> = {
  refused:
    'The microphone was not allowed, so I could not hear you play. '
    + 'You can still answer with the buttons.',
  unavailable:
    'No microphone was available. You can still answer with the buttons.',
};

/** Out of the component, so the clock is not read where a render could. */
function latencySince(firstHeardAt: number | null): { latencyMs?: number } {
  return firstHeardAt === null ? {} : { latencyMs: Date.now() - firstHeardAt };
}

export function ScalePrompt({
  exercise, result, onRespond, audio, audioIn,
}: PromptProps<ScaleSettings, ScaleExercise, ScaleResponse>) {
  const firstHeardAt = useRef<number | null>(null);
  const autoplayed = useRef(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [aside, setAside] = useState<string | null>(null);
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

  /**
   * Take the answer from the instrument: play the scale back.
   *
   * The most direct form the brief's promise takes in this exercise — a
   * learner who can play the scale they heard has demonstrated more than
   * one who can pick its name off six buttons, and it is what they would
   * do at an instrument anyway.
   *
   * Three outcomes, one of which is an answer. A microphone that was
   * refused or is absent says so; a take that did not contain a readable
   * octave is a take where nothing was answered, and `scalePlayed`
   * refuses rather than naming the nearest scale. Neither is graded.
   */
  async function playAnswer() {
    if (result || chosen !== null || listening) return;
    setListening(true);
    setAside(null);
    try {
      const take = await audioIn.listen(TAKE_SECONDS);
      if (!take.heard) {
        setAside(REFUSALS[take.reason]);
        return;
      }
      const typeId = scalePlayed(take.notes, exercise.choices);
      if (typeId === null) {
        const heard = steadyNotes(take.notes);
        setAside(
          // Named for the same reason the interval prompt names them:
          // nothing here can hear a real instrument, so what the app
          // thought it heard is the only evidence anyone gets.
          `${heard.length > 0 ? `I heard ${namePlayed(heard)}, and could` : 'I could'}`
          + ' not read a scale in that. Play it one note at a time, up to the'
          + ' octave, without repeating a note.',
        );
        return;
      }
      setAside(`Heard ${scaleType(typeId).name}.`);
      answer(typeId);
    } finally {
      // In a `finally` so a thrown adapter cannot leave the control dead.
      setListening(false);
    }
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

      <div className="actions">
        <button
          type="button"
          onClick={() => { void playAnswer(); }}
          disabled={answered || listening}
        >
          {listening ? 'Listening…' : 'Play your answer'}
        </button>
      </div>

      {aside && <p className="played-aside" role="status">{aside}</p>}

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
