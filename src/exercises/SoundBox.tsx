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
        <div className="sound-wave" aria-hidden="true">
          {/* Nine bars, which is enough to read as a wave and few enough to
              stay a wave on a phone. Each is given its own delay so they do
              not rise together, which would read as a bar chart. */}
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.09}s` }} />
          ))}
        </div>
      </div>
      {note !== undefined && <span className="secondary">{note}</span>}
    </div>
  );
}

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
