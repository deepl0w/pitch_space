import { useEffect, useRef, useState } from 'react';
import { scaleType } from '../../theory/scale';
import { pitchName } from '../../theory/pitch';
import { useCountdown } from '../countdown';
import { namePlayed, steadyNotes } from '../played';
import type { PromptProps } from '../types';
import {
  DIRECTION_LABELS, scalePlayed, scaleVoices,
  type ScaleExercise, type ScaleResponse, type ScaleSettings,
} from './scales';
import { SoundBox } from '../SoundBox';

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

/**
 * How long a continuously-open microphone waits for a scale.
 *
 * A ceiling rather than a wait: the take ends when a complete scale has
 * been heard, so this is only reached by a learner who did not play one.
 * Longer than the interval's because a scale is eight notes and somebody
 * finding them on an unfamiliar instrument is not hurrying.
 */
const OPEN_SECONDS = 30;

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
  exercise, result, onRespond, audio, audioIn, capture, moveOn,
}: PromptProps<ScaleSettings, ScaleExercise, ScaleResponse>) {
  const firstHeardAt = useRef<number | null>(null);
  const autoplayed = useRef(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const secondsLeft = useCountdown(listening, TAKE_SECONDS);
  const [aside, setAside] = useState<string | null>(null);
  const reading = exercise.presentation === 'read';

  // Moved on every play, so the box's wave follows the sound rather than
  // only its own button — a question sounds itself on Start.
  const [playedAt, setPlayedAt] = useState(0);

  function play() {
    setPlayedAt(Date.now());
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
      /*
        A continuous take ends when a whole scale has arrived, which is a
        stronger test than the interval's count and a better one: the same
        function that grades the answer decides there is one. So a learner
        is answered the instant they land the octave rather than waiting
        out a window, and a run still climbing is not mistaken for a
        finished one.
      */
      const take = capture === 'continuous'
        ? await audioIn.listenUntil(
          (notes) => scalePlayed(notes, exercise.choices) !== null,
          OPEN_SECONDS,
        )
        : await audioIn.listen(TAKE_SECONDS);
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
        <SoundBox
          voices={scaleVoices(exercise)}
          onPlay={play}
          onStop={() => { audio.stopAll(); }}
          playedAt={playedAt}
          label="Play it again"
          note={DIRECTION_LABELS[exercise.direction].toLowerCase()}
        />
      )}

      <div className="actions">
        <button
          type="button"
          onClick={() => { void playAnswer(); }}
          disabled={answered || listening}
        >
          {listening ? `Listening… ${secondsLeft}s` : 'Play your answer'}
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
      <div className="actions">{moveOn}</div>
    </div>
  );
}
