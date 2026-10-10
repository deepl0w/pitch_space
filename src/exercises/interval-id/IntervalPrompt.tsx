import { useEffect, useRef, useState } from 'react';
import { SIMPLE_INTERVAL_NAMES } from '../../theory/interval';
import { useCountdown } from '../countdown';
import { namePlayed } from '../played';
import type { PlayedNote, PromptProps } from '../types';
import {
  intervalPlayed, intervalVoices, readableNotes,
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
  exercise, result, onRespond, audio, audioIn,
}: PromptProps<IntervalSettings, IntervalExercise, IntervalResponse>) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const secondsLeft = useCountdown(listening, TAKE_SECONDS);
  const [aside, setAside] = useState<string | null>(null);
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

  const reading = exercise.presentation === 'read';

  useEffect(() => {
    // Nothing sounds when the exercise is being read: the notes are on the
    // staff and playing them would answer the question.
    if (reading) return;
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

  /**
   * Take an answer from the instrument instead of from the buttons.
   *
   * Three outcomes and only one of them is an answer, which is the whole
   * care in this function. A microphone that was refused or is not there
   * says so and leaves the question open; a take that came back without two
   * pitched notes in it is a take where nothing was answered, and is
   * likewise not a wrong answer — see `intervalPlayed`. Only a real reading
   * goes to `onRespond`, where it is graded and recorded exactly as a tap
   * would be.
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
      const semitones = intervalPlayed(take.notes);
      if (semitones === null) {
        setAside(unreadable(readableNotes(take.notes)));
        return;
      }
      setAside(`Heard ${nameOf(semitones)}.`);
      answer(semitones);
    } finally {
      // In a `finally` so a thrown adapter cannot leave the button dead.
      // `AudioIn` promises not to reject, and a control that depends on
      // every implementation keeping that promise is one bug from stuck.
      setListening(false);
    }
  }

  const answered = result !== null;

  return (
    <div className="prompt">
      <div className="actions">
        {!reading && <button type="button" onClick={play}>Play it again</button>}
        <button
          type="button"
          onClick={() => { void playAnswer(); }}
          disabled={answered || listening}
        >
          {listening ? `Listening… ${secondsLeft}s` : 'Play your answer'}
        </button>
        <span className="secondary">{PRESENTATION[exercise.direction]}</span>
      </div>

      {aside && <p className="played-aside" role="status">{aside}</p>}

      <div className="choices" role="group" aria-label="Which interval was that?">
        {exercise.choices.map((semitones) => (
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
 * How long the microphone is open for an answer.
 *
 * Four seconds: long enough to find the instrument and play two notes
 * without hurrying, short enough that someone who pressed it by accident is
 * not left watching a recording indicator. The take is analysed only once it
 * ends — `listen.ts` says why the onset threshold needs the whole take — so
 * this is also how long the answer takes to arrive, and a figure twice this
 * would be felt as the app being slow rather than as being generous.
 */
const TAKE_SECONDS = 4;

/**
 * What to say when there was no take, by the only two reasons there are.
 *
 * Each names a remedy, because the two are not the same problem and neither
 * is guessable from the other: one is a permission to grant and the other is
 * a device that is not there. Neither says anything about the interval,
 * since nothing was heard about it.
 */
const REFUSALS: Record<'refused' | 'unavailable', string> = {
  refused:
    'The microphone was not allowed, so I could not hear you play. '
    + 'You can still answer with the buttons.',
  unavailable:
    'No microphone was available. You can still answer with the buttons.',
};

/**
 * Why a take could not be read, which is not one message.
 *
 * **Naming them is also the only instrument anyone has.** Nothing here can
 * hear a real instrument, so a learner reporting that their two notes read
 * as four is a bug report; the app saying *which* four is a diagnosis.
 *
 * **Saying "I did not hear two notes" to someone who played three is the
 * app telling them the wrong thing about their own playing.** That was the
 * finding: re-striking a note before committing to it is an ordinary thing
 * to do on a real instrument, and the player was told only that they were
 * wrong — same wording, same tally, same tone as a clean miss, with nothing
 * anywhere saying a third note had arrived. The ambiguity is the machine's
 * and it has to read as the machine's.
 *
 * Neither message is scored, and both leave the buttons live. What they
 * differ in is what to do next, which is the only reason to have two.
 */
function unreadable(heard: readonly PlayedNote[]): string {
  if (heard.length > 2) {
    return `I heard ${heard.length} notes — ${namePlayed(heard)} — so I cannot tell `
      + 'which two were the answer. Play just the two, or answer with the buttons.';
  }
  return 'I did not hear two notes. Play them one after the other, '
    + 'and leave the second ringing.';
}

/**
 * Compound intervals have no name in the table, and saying so beats an
 * `undefined` in the sentence. `intervalPlayed` deliberately does not fold
 * them into an octave, so this is reachable the first time someone answers
 * a second with a ninth.
 */
function nameOf(semitones: number): string {
  return SIMPLE_INTERVAL_NAMES[semitones] ?? `${semitones} semitones`;
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
