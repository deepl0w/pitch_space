import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PromptProps } from '../types';
import { Score } from '../../ui/notation/Score';
import type { ScoreLayout } from '../render/toVexflow';
import { cursorAt } from './cursor';
import {
  beatSeconds, leadInSeconds, rhythmVoices, secondsAt,
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

type Phase = 'ready' | 'hearing' | 'tapping' | 'done';

export function RhythmPrompt({
  exercise, result, onRespond, audio, scores, moveOn,
}: PromptProps<RhythmSettings, RhythmExercise, RhythmResponse>) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [taps, setTaps] = useState<number[]>([]);
  const startedAt = useRef<number | null>(null);
  const answered = result !== null;

  const lead = leadInSeconds(exercise);
  /** The written rhythm's own length, from its first attack to its last. */
  const written = exercise.onsets[exercise.onsets.length - 1] ?? 0;
  const total = lead + written;

  /*
    What the clock's zero means, which differs by phase and is the one thing
    that would put the cursor and the sound in different places. Hearing
    starts on the first written note; tapping starts a count-in earlier,
    because that is when its sound starts.
  */
  const offset = phase === 'hearing' ? 0 : lead;

  const [layout, setLayout] = useState<ScoreLayout | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  /* The written events' start times, which is the cursor's time axis. */
  const times = useMemo(
    () => exercise.bars.flatMap((b) => b.events)
      .map((e) => secondsAt(e.startTick, exercise.tempo)),
    [exercise],
  );

  /** When each written event stops, so a note is lit for its own length. */
  const ends = useMemo(
    () => exercise.bars.flatMap((b) => b.events)
      .map((e) => secondsAt(e.startTick + e.durationTicks, exercise.tempo)),
    [exercise],
  );

  /*
    `onLayout` goes into the Score's effect dependencies, so an inline
    function would redraw the stave on every render — and every tick of the
    cursor is a render. VexFlow re-engraving sixty times a second is not a
    thing to find out about later.
  */
  const onLayout = useCallback((next: ScoreLayout) => setLayout(next), []);

  const cursorX = layout && elapsed !== null ? cursorAt(elapsed, times, layout) : null;

  /*
    Hear the rhythm, with the staff showing and the cursor running over it.

    The listening mode this replaced played the rhythm and drew nothing, so
    you could be wrong about it and never find out what it was. Playing it
    while the line crosses the notes you are hearing is the opposite trade:
    the sound and the notation teach each other, and the question is still
    "can you play this", which the tapping answers.

    Held for the whole thing because the whole thing is what sounds. It
    used to wait `total` while playing only the count-in, which left the
    button reading that it was playing for six seconds after the last
    click; now the wait and the sound are the same span by construction
    rather than by two numbers agreeing.
  */
  function hear() {
    setPhase('hearing');
    audio.play(rhythmVoices(exercise, { countIn: false }));
    startedAt.current = performance.now();
    window.setTimeout(() => setPhase('ready'), (written + SETTLE) * 1000);
  }

  /** Count in, then take taps. The count-in is what gives the answer a tempo. */
  function begin() {
    setTaps([]);
    setPhase('tapping');
    audio.play(rhythmVoices(exercise, { silent: true }));
    startedAt.current = performance.now();
  }

  /*
    The cursor is driven from the same `performance.now()` zero as the taps,
    for the reason in the note at the top of this file: it is the only clock
    this component can see, and taking the cursor from a second one would
    put the line and the measurement in different times. A cursor that
    disagrees with the grade is worse than no cursor.
  */
  const running = phase === 'hearing' || phase === 'tapping';
  useEffect(() => {
    // Clearing when playback stops, for the same reason as below: the
    // cursor is a view of a clock that is no longer running, and there is
    // no render-time value for "nothing is playing" that the phase does
    // not already carry.
    // oxlint-disable-next-line react/set-state-in-effect
    if (!running) { setElapsed(null); return; }
    let frame = 0;
    const step = () => {
      if (startedAt.current === null) return;
      /*
        The clock is the external system this effect synchronises with,
        which is the case the rule exempts: the value is not derivable
        during render — it is what time it is — and nothing but a frame
        callback can produce it. A render per frame is the intent.
      */
      // oxlint-disable-next-line react/set-state-in-effect
      setElapsed((performance.now() - startedAt.current) / 1000 - offset);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [running, offset]);

  /*
    The written notes, marked by how they were played, once there is a
    verdict. `ScoreNote.colour` has been in the renderer since it was
    written and nothing had ever set it.

    Keyed through `onsetCells`, which is how the grader credits a figure:
    an attack belongs to a cell, the cell gets one verdict, and every
    attack of that cell takes the cell's colour. Colouring per attack
    instead would claim a precision the grading does not have.
  */
  const markedScore = useMemo(() => {
    const base = scores?.questionScore ?? scores?.answerScore ?? null;
    if (!base || !result) return base;
    const verdict = new Map(result.outcomes.map((o) => [o.item, o.correct]));
    const events = exercise.bars.flatMap((b) => b.events);
    let attack = 0;
    return {
      ...base,
      notes: base.notes.map((note, i) => {
        const event = events[i];
        if (!event || event.isRest || event.tiedFromPrevious) return note;
        const cell = exercise.onsetCells[attack];
        attack += 1;
        const correct = cell === undefined ? undefined : verdict.get(`cell:${cell}`);
        if (correct === undefined) return note;
        return { ...note, colour: correct ? 'var(--right)' : 'var(--wrong)' };
      }),
    };
  }, [scores, result, exercise]);

  /*
    The note sounding right now, lit while the rhythm plays.

    The cursor says where in the bar you are; this says which written note
    the sound you just heard belongs to, which is the join between the two
    the exercise exists to teach. One note at a time and only while
    playing — a trail of lit notes would be a second, slower cursor saying
    the same thing less precisely.

    Not applied once there is a verdict: the marking is the more important
    thing to be looking at by then, and two colour schemes on one stave is
    a stave saying nothing.
  */
  const sounding = useMemo(() => {
    if (!markedScore || result || phase !== 'hearing' || elapsed === null) return markedScore;
    if (elapsed < 0) return markedScore;
    const events = exercise.bars.flatMap((b) => b.events);
    /*
      Lit for its own written length and no longer.

      This used to light the last note that had started, which meant a note
      followed by a rest stayed lit through the silence — the user role saw
      one burn for 2.3 seconds across a barline and reasonably read it as
      the playback having stalled. A quarter note that looks like a dotted
      half is the exercise teaching the wrong thing with its own feedback.

      A rest lights nothing, because lighting it would say the silence was
      a note. During one, nothing is lit and the cursor alone carries the
      time, which is what a rest looks like: the music moving on with
      nothing sounding.
    */
    const lit = events.findIndex(
      (e, i) => !e.isRest && times[i] <= elapsed && elapsed < ends[i],
    );
    if (lit < 0) return markedScore;
    return {
      ...markedScore,
      notes: markedScore.notes.map(
        (note, i) => (i === lit ? { ...note, colour: 'var(--accent)' } : note),
      ),
    };
  }, [markedScore, result, phase, elapsed, times, ends, exercise]);

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

      {sounding && (
        <Score spec={sounding} onLayout={onLayout} cursorX={cursorX} />
      )}

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
        <button type="button" onClick={hear} disabled={phase !== 'ready' || answered}>
          {phase === 'hearing' ? 'Playing…' : 'Hear it'}
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
      <div className="actions">{moveOn}</div>
    </div>
  );
}
