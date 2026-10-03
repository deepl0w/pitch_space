import { useEffect, useRef, useState } from 'react';
import { SIMPLE_INTERVAL_NAMES } from '../../theory/interval';
import type { PromptProps } from '../types';
import {
  intervalVoices,
  type IntervalExercise, type IntervalResponse, type IntervalSettings,
} from './intervals';

/**
 * The one part of an exercise type that has to be written by hand.
 *
 * It owns nothing but the interaction: which buttons, when they sound, and
 * what the user tapped. Generation and grading are pure functions next door,
 * and the attempt is recorded by the screen — so the only thing that can go
 * wrong in here is the thing a test of this component would actually catch.
 *
 * Remounted per exercise by the screen (`key`), which is why there is no
 * reset logic: a fresh exercise is a fresh component, and the alternative is
 * three pieces of state that have to be cleared in step.
 */
export function IntervalPrompt({
  exercise, settings, result, onRespond, audio,
}: PromptProps<IntervalSettings, IntervalExercise, IntervalResponse>) {
  const [chosen, setChosen] = useState<number | null>(null);
  const firstHeardAt = useRef<number | null>(null);
  const autoplayed = useRef(false);

  function play() {
    audio.play(intervalVoices(exercise));
    // Measured from the first hearing rather than the last. A user who needs
    // three listens has not answered quickly, and restarting the clock on
    // each replay would record that they had — which is precisely the signal
    // the scheduler is meant to read (docs/ROADMAP.md).
    firstHeardAt.current ??= Date.now();
  }

  useEffect(() => {
    // Guarded against StrictMode's deliberate double-mount, which would
    // otherwise play the interval twice over itself.
    if (autoplayed.current) return;
    autoplayed.current = true;
    play();
    // Mount only: the exercise cannot change without the component being
    // remounted, so there is nothing else this could depend on.
    // oxlint-disable-next-line exhaustive-deps
  }, []);

  function answer(semitones: number) {
    // `chosen` as well as `result`, because the result arrives from above:
    // between the tap and the screen handing the grade back down there is a
    // render in which the buttons are still live, and a second response to
    // an exercise is a second attempt at one the user has already answered.
    if (result || chosen !== null) return;
    setChosen(semitones);
    onRespond({ semitones, ...latencySince(firstHeardAt.current) });
  }

  const answered = result !== null;

  return (
    <div className="prompt">
      <div className="actions">
        <button type="button" onClick={play}>Play it again</button>
        <span className="secondary">{PRESENTATION[exercise.direction]}</span>
      </div>

      <div className="choices" role="group" aria-label="Which interval was that?">
        {settings.semitones.map((semitones) => (
          <button
            key={semitones}
            type="button"
            className={choiceClass(semitones, exercise.semitones, chosen, answered)}
            disabled={answered}
            onClick={() => answer(semitones)}
          >
            {SIMPLE_INTERVAL_NAMES[semitones]}
          </button>
        ))}
      </div>

      {result && (
        <p className={result.correct ? 'verdict right' : 'verdict wrong'}>{result.feedback}</p>
      )}
    </div>
  );
}

/**
 * Omitted rather than zero when the exercise was never heard, because the
 * scheduler reads latency as evidence of hesitation and a zero would be the
 * strongest possible evidence of the opposite.
 */
function latencySince(firstHeardAt: number | null): { latencyMs?: number } {
  return firstHeardAt === null ? {} : { latencyMs: Date.now() - firstHeardAt };
}

const PRESENTATION: Record<IntervalExercise['direction'], string> = {
  up: 'ascending', down: 'descending', harmonic: 'both notes together',
};

/**
 * After an answer the right one is always marked, and a wrong choice is
 * marked as well. Showing only the correct answer leaves the user to
 * remember what they pressed, which is the one thing they are least likely
 * to recall a second after pressing it.
 */
function choiceClass(
  semitones: number, correct: number, chosen: number | null, answered: boolean,
): string {
  if (!answered) return 'choice';
  if (semitones === correct) return 'choice right';
  return semitones === chosen ? 'choice wrong' : 'choice';
}
