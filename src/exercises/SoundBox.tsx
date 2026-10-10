import { useEffect, useRef, useState } from 'react';
import type { Voice } from '../audio/output/synth';

/**
 * The listening half of a question, in the same box the reading half uses.
 *
 * **Consistency between the two modes, which is what it was asked for.** A
 * reading question puts its content in a bordered panel — the staff — and a
 * listening question put a bare button in the middle of the page, so the two
 * modes of one exercise looked like two different screens. The sound is the
 * content here, and it belongs in the place the content goes.
 *
 * **The wave says that sound is playing; it is not a picture of the sound.**
 * Worth being exact about, because a waveform that is not the waveform is
 * the kind of thing a reader trusts. Drawing the real signal means an
 * `AnalyserNode` on the output, and the output lives behind `AudioOut` —
 * which an exercise is deliberately not allowed to reach past (ADR 0029).
 * What this does honestly is run for exactly as long as the passage lasts,
 * taken from the voices themselves, so it starts and stops with the sound
 * even though its shape is its own.
 */
export function SoundBox({ voices, onPlay, onStop, playedAt, label = 'Play it', note }: {
  /** The passage about to sound, read only for how long it lasts. */
  voices: readonly Voice[];
  onPlay: () => void;
  onStop: () => void;
  /**
   * Changes every time the passage is sounded, including by the screen.
   *
   * **The box cannot own "is it playing", and the first version assumed it
   * could.** A question sounds itself on Start, before the learner has
   * touched anything, so a box watching only its own button showed nothing
   * while the thing it is a picture of was audible — reported as exactly
   * that. What it needs is to hear about every play, and the prompt is the
   * only thing that sees them all.
   */
  playedAt: number;
  label?: string;
  /** A word about the question — "ascending", "two octaves" — beside the bars. */
  note?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const until = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wave = useRef<HTMLDivElement | null>(null);
  const [bars, setBars] = useState(MIN_BARS);

  /*
    As many bars as the row is wide enough for, which is what makes it a
    wave rather than a strip: a fixed count is sparse on a desktop column
    and crowded on a phone, and the box is used at both. Measured rather
    than guessed from a breakpoint, because the box's width depends on the
    column it is in and not only on the screen.

    A `ResizeObserver` rather than a window listener: the row changes width
    when the panel beside it opens, which no resize event reports.
  */
  useEffect(() => {
    const element = wave.current;
    if (element === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setBars(Math.max(MIN_BARS, Math.floor(width / BAR_PITCH)));
    });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, []);

  useEffect(() => {
    // Nothing has sounded yet on a fresh mount; `playedAt` starts at zero
    // and the first real play moves it.
    if (playedAt === 0) return undefined;
    setPlaying(true);
    const timer = setTimeout(() => { setPlaying(false); }, lasts(voices) * 1000);
    until.current = timer;
    /*
      Cleared on the way out as well as reset on the way in: pressing again
      while a passage sounds restarts it — `AudioOut.play` cuts what is
      playing — so a timer from the earlier press would end the wave
      partway through the new one.
    */
    return () => { clearTimeout(timer); };
  }, [playedAt, voices]);

  function stop() {
    onStop();
    if (until.current !== null) clearTimeout(until.current);
    setPlaying(false);
  }

  return (
    <div className={`sound${playing ? ' sound-playing' : ''}`}>
      <div className="sound-row">
        <div className="sound-wave" ref={wave} aria-hidden="true">
          {/* Enough bars to read as a wave across a full-width box, each
              flexing so the row fills whatever width it is given rather
              than leaving a gap beside a fixed-width strip. The delays are
              staggered so they do not rise together, which would read as a
              bar chart. */}
          {Array.from({ length: bars }, (_, i) => (
            <span key={i} style={{ animationDelay: `${(i % 9) * 0.09}s` }} />
          ))}
        </div>
        {/*
          A play icon rather than a word, asked for in those terms, and a
          stop while it sounds — a control that does nothing when pressed
          mid-passage is one a learner presses twice and then distrusts.

          The label does not disappear: it becomes the accessible name, so
          a screen reader hears "Play it again" rather than "button". A
          control whose meaning is carried by a glyph needs that more than
          one with a word in it, not less.
        */}
        <button
          type="button"
          className="sound-play"
          onClick={playing ? stop : onPlay}
          aria-label={playing ? 'Stop' : label}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {playing
              ? <rect x="7" y="7" width="10" height="10" rx="1.5" />
              /* Nudged right of centre: a triangle centred on its bounding
                 box reads as sitting left, because its visual mass is at
                 the blunt end. */
              : <path d="M9 6.5 18 12l-9 5.5z" />}
          </svg>
        </button>
      </div>
      {note !== undefined && <span className="secondary">{note}</span>}
    </div>
  );
}

/**
 * How wide one bar and its gap are, in pixels.
 *
 * Seven: a four-pixel bar with three of space, which is the spacing the
 * stylesheet holds them at. Named here because the count is derived from it
 * — a pitch written in two places is one that stops matching.
 */
const BAR_PITCH = 7;

/** Enough to read as a wave on the narrowest phone, and the floor if the
 *  row cannot be measured. */
const MIN_BARS = 12;

/**
 * How long the passage lasts, from the voices rather than from a guess.
 *
 * The last note's end, not the sum: notes overlap in a chord and a
 * scheduled passage has gaps. Zero for an empty passage, which cannot
 * happen today and would otherwise leave the wave running forever.
 */
function lasts(voices: readonly Voice[]): number {
  return voices.reduce((end, voice) => Math.max(end, voice.start + voice.duration), 0);
}
