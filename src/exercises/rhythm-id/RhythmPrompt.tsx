import { useCallback, useEffect, useRef, useState } from 'react';
import type { PromptProps } from '../types';
import {
  beatSeconds, leadInSeconds, rhythmVoices,
  type RhythmExercise, type RhythmResponse, type RhythmSettings,
} from './rhythms';

/**
 * Tap it back.
 *
 * **Timed against `performance.now()`, started at the moment the taps
 * begin to matter.** The audio clock would be the better reference and
 * is not reachable from here: `AudioOut.play` is deliberately a
 * one-way door, and on a cold context the synth defers scheduling until
 * the hardware is awake, so there is no start time to hand back
 * synchronously. What this does instead is take its zero from the same
 * call that starts the sound and then measure only *differences* — the
 * grader aligns taps against written onsets, so a constant offset
 * between the two clocks moves every tap by the same amount and shows
 * up as lag, which the verdict already reports separately from scatter.
 *
 * That is honest but not free, and it is the reason this prompt does
 * not claim millisecond accuracy: a cold context can start late by more
 * than the tolerance window, so the first attempt of a session can read
 * as uniformly behind. Playing once before tapping warms it, which is
 * what the flow does anyway.
 */

/**
 * A moment after the last note before the controls come back.
 *
 * Fixed seconds, and deliberately not a fraction of a beat — every
 * other duration in this file is derived from the tempo and this one is
 * not, which the tester rightly asked about. Re-enabling a button is
 * not a musical event: it is the pause that stops a control flickering
 * back to life under the sound still decaying, and that pause is the
 * same length whether the piece was slow or fast. Derived from the
 * tempo it would be 1.5s at the bottom of the range and 0.28s at the
 * top, which is too long to wait and too short to read.
 */
const SETTLE = 0.6;

/** Space and Enter, because a rhythm is tapped with a thumb or a key. */
const TAP_KEYS = new Set([' ', 'Spacebar', 'Enter']);

type Phase = 'ready' | 'listening' | 'tapping' | 'done';

export function RhythmPrompt({
  exercise, result, onRespond, audio,
}: PromptProps<RhythmSettings, RhythmExercise, RhythmResponse>) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [taps, setTaps] = useState<number[]>([]);
  const startedAt = useRef<number | null>(null);
  const answered = result !== null;

  const lead = leadInSeconds(exercise);
  const total = lead + (exercise.onsets[exercise.onsets.length - 1] ?? 0);

  /*
    The count-in, on its own. The rhythm is on the staff, so sounding it
    would answer the question rather than ask it; what a player needs
    before tapping is the tempo, and that is what the clicks carry.

    Held for the count-in and not for the whole question. It used to wait
    `total`, the length of a rhythm it was not playing — about nine
    seconds at 84bpm over two bars against roughly three of clicks — so
    the controls stayed disabled and the button went on reading "Playing…"
    for six seconds after the last sound. A label that outlasts the thing
    it describes is worse than no label, because it is the one piece of
    evidence the page is still working.
  */
  function listen() {
    setPhase('listening');
    audio.play(rhythmVoices(exercise, { silent: true }));
    window.setTimeout(() => setPhase('ready'), (lead + SETTLE) * 1000);
  }

  /** Count in, then take taps. The count-in is what gives the answer a tempo. */
  function begin() {
    setTaps([]);
    setPhase('tapping');
    audio.play(rhythmVoices(exercise, { silent: true }));
    startedAt.current = performance.now();
  }

  const tap = useCallback(() => {
    if (startedAt.current === null) return;
    // Measured from the first written beat, which is where `onsets` is
    // measured from too — the count-in is lead-in and not part of the
    // answer.
    const at = (performance.now() - startedAt.current) / 1000 - lead;
    setTaps((previous) => [...previous, at]);
  }, [lead]);

  useEffect(() => {
    if (phase !== 'tapping') return;
    const onKey = (e: KeyboardEvent) => {
      if (!TAP_KEYS.has(e.key)) return;
      // Space scrolls the page and Enter re-presses the focused button;
      // both would make the control fight the thing it is driving.
      e.preventDefault();
      if (!e.repeat) tap();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, tap]);

  // The window closes a beat after the last written note, so a user who
  // stops tapping does not have to say that they have.
  useEffect(() => {
    if (phase !== 'tapping') return;
    // `total` already includes the count-in; adding `lead` again held the
    // window open for a second count-in's worth of silence after the last
    // note, which reads as the app having stopped responding.
    const ms = (total + beatSeconds(exercise.tempo) * 1.5) * 1000;
    const timer = window.setTimeout(() => {
      setPhase('done');
      setTaps((collected) => {
        onRespond({ taps: collected });
        return collected;
      });
    }, ms);
    return () => window.clearTimeout(timer);
    // Mount of the tapping phase only; a tap must not restart the window.
    // oxlint-disable-next-line exhaustive-deps
  }, [phase]);

  return (
    <div className="prompt">
      <p className="question">
        Read it, then play it back in time.
      </p>

      <div className="actions">
        {/*
          Something on screen names what is happening at every instant
          the controls are disabled. Not both buttons — the tester
          wrote a case from the sentence that used to be here, "both
          buttons say what they are doing", and it failed at once:
          while the rhythm sounds the hear button reads "Playing…" and
          the answer button sits disabled still reading "Tap it back".
          That is the right behaviour and the sentence was the wrong
          claim. One control speaking is legible; two saying it is
          noise.

          They are disabled while the rhythm is sounding — you cannot
          usefully tap over the thing you are copying — and a disabled
          button with its ordinary label and nothing beside it is
          indistinguishable from a broken one, which is what this
          looked like for the nine
          seconds a two-bar question takes at 84bpm.
        */}
        <button type="button" onClick={listen} disabled={phase !== 'ready' || answered}>
          {phase === 'listening' ? 'Counting you in…' : 'Count me in'}
        </button>
        <button type="button" onClick={begin} disabled={phase !== 'ready' || answered}>
          {phase === 'tapping' ? 'Listening for taps…' : 'Tap it back'}
        </button>
        <span className="secondary">
          {exercise.tempo} bpm, {exercise.meter}
        </span>
      </div>

      {phase === 'tapping' && (
        <>
          <button type="button" className="tap-pad" onClick={tap}>
            Tap — space or click
          </button>
          <p className="secondary">{taps.length} so far</p>
        </>
      )}

      {answered && (
        <p className={`verdict ${result.correct ? 'right' : 'wrong'}`}>{result.feedback}</p>
      )}
    </div>
  );
}
