import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Voice } from '../audio/output/synth';
// From the leaf that holds the contract, not from the module that owns the
// `AudioContext`: `import type` is erased and a value import is not.
import { SPECTRUM_BANDS } from '../audio/output/spectrum';

/**
 * The listening half of a question, in the same box the reading half uses.
 *
 * **Consistency between the two modes, which is what it was asked for.** A
 * reading question puts its content in a bordered panel — the staff — and a
 * listening question put a bare button in the middle of the page, so the two
 * modes of one exercise looked like two different screens. The sound is the
 * content here, and it belongs in the place the content goes.
 *
 * **The wave is the sound now, where it used to be an animation shaped like
 * one.** It was a CSS keyframe that ran for as long as the passage lasted,
 * and the comment here said so plainly, because a waveform that is not the
 * waveform is the kind of thing a reader trusts. Drawing the real signal
 * needs an `AnalyserNode` on the output, and the output lives behind
 * `AudioOut`, which an exercise may not reach past — so the
 * output grew a method that fills an array of band levels, and nothing here
 * knows what an `AudioContext` is.
 *
 * The keyframe stays as the fallback. A platform whose context has no
 * analyser, a test double, or a passage that ends before the first frame
 * all land there, and a box that animates honestly-but-genericly is better
 * than one that shows a flat line while sound is audible.
 */
export function SoundBox({
  voices, onPlay, onStop, playedAt, spectrum, staff, label = 'Play it', note,
}: {
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
  /**
   * The answer's stave, once there is one, shown instead of the wave.
   *
   * **The same box, not a second one.** The screen used to put the revealed
   * stave in its own panel above this, so answering a listening question
   * added a box to the page and left this one animating a wave for a
   * passage nobody was going to play again. The box is the place the
   * question lives; what is in it changes when the question is answered.
   */
  staff?: ReactNode;
  /**
   * Fills an array with the output's band levels, or says it cannot.
   *
   * Optional because most of what renders a prompt in a test has no audio
   * at all, and because the box has a working fallback — passing nothing
   * is a supported state rather than a missing dependency.
   */
  spectrum?: (into: Uint8Array<ArrayBuffer>) => boolean;
  label?: string;
  /** A word about the question — "ascending", "two octaves" — beside the bars. */
  note?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const until = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wave = useRef<HTMLDivElement | null>(null);
  const [bars, setBars] = useState(MIN_BARS);
  const [drawn, setDrawn] = useState(false);

  /**
   * The passage and the tap, read when a play happens rather than tracked.
   *
   * **`voices` was in the effect's dependencies and is a fresh array on
   * every render.** Every prompt builds it inline — `intervalVoices(exercise)`
   * and its siblings — so any re-render at all gave the effect a new
   * identity and restarted the wave: pressing an answer button set it
   * going with nothing sounding, which is how it was reported ("the
   * visualisation seems to play whenever any button is pressed").
   *
   * A ref rather than a `useMemo` in five prompts: what the box actually
   * needs is the passage *as it was when the play happened*, and a value
   * read at that moment is the honest expression of that. Memoising each
   * caller would have made the dependency stable and left the box still
   * claiming to restart whenever the passage changes, which is not a thing
   * it should do either.
   */
  const latest = useRef(voices);
  const tap = useRef(spectrum);
  // After the render rather than during it: nothing here is read while
  // rendering, and writing a ref mid-render is how a component comes to
  // depend on a value React did not know had changed.
  useEffect(() => { latest.current = voices; tap.current = spectrum; });

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
    // `playedAt` alone: see `latest` above for why the passage is not a
    // dependency.
    // oxlint-disable-next-line exhaustive-deps
  }, [playedAt]);

  /**
   * Draw the output, one frame at a time, straight onto the bars.
   *
   * Through the DOM rather than through state: this runs sixty times a
   * second and a `setState` per frame would re-render the prompt that owns
   * this box sixty times a second with it. The element list is read once
   * per frame from a ref, which is cheap, and nothing React owns changes.
   *
   * `scaleY` rather than `height`, so each frame is a composited transform
   * rather than a layout of every bar in the row.
   */
  useEffect(() => {
    const element = wave.current;
    const read = tap.current;
    if (!playing || element === null || read === undefined) return undefined;
    if (typeof requestAnimationFrame !== 'function') return undefined;

    const bands = new Uint8Array(SPECTRUM_BANDS);
    let frame = 0;
    let live = true;
    // Flipped on the frame it changes rather than asserted every frame: a
    // `setState` sixty times a second is a re-render of the prompt sixty
    // times a second, even when React bails out of the second one.
    let showing = false;

    const paint = () => {
      if (!live) return;
      frame = requestAnimationFrame(paint);
      if (!read(bands)) {
        // No analyser on this platform. Hand the row back to the keyframe
        // rather than holding every bar at whatever it last showed.
        if (showing) { showing = false; setDrawn(false); }
        return;
      }
      if (!showing) { showing = true; setDrawn(true); }
      const spans = element.children;
      for (let i = 0; i < spans.length; i += 1) {
        /*
          The row is sampled across the bands rather than mapped one to
          one: there are as many bars as the box is wide enough for, and
          that is a different number from the band count at every width.
        */
        const band = bands[Math.floor((i * SPECTRUM_BANDS) / spans.length)] ?? 0;
        const span = spans[i] as HTMLElement;
        span.style.transform = `scaleY(${1 + (band / 255) * (TALLEST / SHORTEST - 1)})`;
      }
    };
    frame = requestAnimationFrame(paint);

    return () => {
      live = false;
      cancelAnimationFrame(frame);
      setDrawn(false);
      // Left as the stylesheet draws them, or the row keeps the last frame
      // of a passage that has stopped.
      for (const span of [...element.children]) (span as HTMLElement).style.transform = '';
    };
  }, [playing, bars]);

  function stop() {
    onStop();
    if (until.current !== null) clearTimeout(until.current);
    setPlaying(false);
  }

  return (
    <div className={`sound${playing ? ' sound-playing' : ''}${drawn ? ' sound-drawn' : ''}`}>
      {/*
        The stave takes the box over once the answer is in it.

        Rendered *instead of* the row rather than above it: the question is
        answered, so a wave nobody is going to set going again is a control
        that has stopped meaning anything, and leaving it there is what made
        the page grow a second box in the first place. The box stays the
        size it was, which is what keeps answering from shifting everything
        under it.
      */}
      {staff ?? (
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
      )}
      {note !== undefined && <span className="secondary">{note}</span>}
    </div>
  );
}

/** The resting height of a bar, matching `.sound-wave > span` in the CSS. */
const SHORTEST = 6;

/** What a band at full scale reaches, matching the keyframe's peak. */
const TALLEST = 40;

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
