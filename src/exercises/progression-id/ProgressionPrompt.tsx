import { useEffect, useRef, useState } from 'react';
import { keyName } from '../../theory/key';
import type { PromptProps } from '../types';
import {
  keyFor, progressionVoices,
  type ProgressionExercise, type ProgressionResponse, type ProgressionSettings,
} from './progressions';

/** Out of the component, so the clock is not read where a render could. */
function latencySince(firstHeardAt: number | null): { latencyMs?: number } {
  return firstHeardAt === null ? {} : { latencyMs: Date.now() - firstHeardAt };
}

/**
 * A progression is answered a chord at a time, which makes this the first
 * prompt in the app with a partial answer to manage.
 *
 * Slots fill left to right rather than by selecting one and then a numeral.
 * Two taps per chord against one is the whole difference, and the order a
 * progression is heard in is the order it is answered in — a picker that let
 * you fill the fourth chord first would be inviting you to work backwards
 * from the cadence, which is a real technique but not the one being drilled.
 *
 * Tapping a filled slot clears it and everything after it. Clearing only
 * that slot would leave a gap, and a gap means deciding what a half-answered
 * progression means; rewinding is one rule instead of two and matches what
 * the mistake usually is, which is having lost the thread at some chord and
 * wanting to go back to it.
 *
 * Remounted per exercise by the screen, which is why there is no reset: a
 * fresh question is a fresh component.
 */
export function ProgressionPrompt({
  exercise, result, onRespond, audio,
}: PromptProps<ProgressionSettings, ProgressionExercise, ProgressionResponse>) {
  const firstHeardAt = useRef<number | null>(null);
  const autoplayed = useRef(false);
  const [filled, setFilled] = useState<string[]>([]);
  const reading = exercise.presentation === 'read';
  const key = keyFor(exercise);
  const answered = result !== null;

  function play() {
    audio.play(progressionVoices(exercise));
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

  const complete = filled.length === exercise.numerals.length;

  function choose(numeral: string) {
    if (answered || complete) return;
    setFilled([...filled, numeral]);
  }

  function clearFrom(index: number) {
    if (answered) return;
    setFilled(filled.slice(0, index));
  }

  function submit() {
    if (answered || !complete) return;
    onRespond({ numerals: filled, ...latencySince(firstHeardAt.current) });
  }

  return (
    <div className="prompt">
      <p className="question">
        {reading
          ? <>Name what each chord is doing in <strong>{keyName(key)}</strong>.</>
          : <>The key is established, then the progression. Name each chord.</>}
      </p>

      {!reading && (
        <div className="actions">
          <button type="button" onClick={play}>Play it again</button>
          <span className="secondary">
            cadence in {keyName(key)}, then {exercise.numerals.length} chords
          </span>
        </div>
      )}

      {/*
        The answer so far, as the progression reads: one slot per chord, in
        order, with the empty ones visible. Showing the length is not a
        giveaway — the number of chords is audible, and hiding it would make
        the exercise partly a counting test.
      */}
      <ol className="slots" aria-label="Your answer, chord by chord">
        {exercise.numerals.map((want, i) => {
          const said = answered ? exercise.numerals[i] : filled[i];
          const mine = filled[i];
          const right = answered && mine === want;
          const wrong = answered && mine !== want;
          return (
            <li key={i}>
              <button
                type="button"
                className={`slot${right ? ' right' : ''}${wrong ? ' wrong' : ''}`}
                disabled={answered || i >= filled.length}
                aria-label={`Chord ${i + 1}${mine ? `, ${mine}` : ', not yet named'}`}
                onClick={() => clearFrom(i)}
              >
                {answered && wrong
                  // Both, when they differ: the answer alone does not tell
                  // you what you thought it was, and that is the part worth
                  // seeing.
                  ? <><s>{mine || '–'}</s> {said}</>
                  : (mine || said || '·')}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="choices" role="group" aria-label="Chords available in this key">
        {exercise.palette.map((numeral) => (
          <button
            key={numeral}
            className="choice"
            disabled={answered || complete}
            onClick={() => choose(numeral)}
          >
            {numeral}
          </button>
        ))}
      </div>

      {!answered && (
        <div className="actions">
          <button type="button" disabled={!complete} onClick={submit}>
            {complete
              ? 'Check'
              : `${exercise.numerals.length - filled.length} to go`}
          </button>
        </div>
      )}

      {answered && (
        <p className={`verdict ${result.correct ? 'right' : 'wrong'}`}>{result.feedback}</p>
      )}
    </div>
  );
}
