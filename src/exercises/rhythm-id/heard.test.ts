import { describe, expect, it } from 'vitest';
import { rhythmIdentification } from './index';
import { TEMPO_CHOICES } from './rhythms';
import { detectOnsets, MIN_SEPARATION_SECONDS } from '../../audio/dsp/onsetDetector';
import { pluckSequence } from '../../audio/testing/signals';
import { applyValue, widestSettings, type AnyField } from '../../testing/settingsSpace';

/**
 * Can the app hear the rhythm it just asked for?
 *
 * Every other test of the detector hands it a signal someone wrote by hand,
 * and every other test of the generator reads the ticks it produced. The
 * question neither asks is whether the two agree — and they are joined in
 * production, because a rhythm exercise generates onsets, plays them, and
 * grades what it hears against them.
 *
 * The signal here is the generated rhythm played *perfectly*: the same times
 * the exercise would mark correct, struck cleanly, with no human error in
 * them at all. Anything lost between the two is lost by the chain rather
 * than by the player.
 */

const RATE = 44_100;

/**
 * The exercise at one tempo, every vocabulary switch open and one bar long.
 *
 * One bar because the claim is about the gap between two adjacent notes and
 * a bar holds plenty of those, while eight bars is nine seconds of audio to
 * synthesise and transform per seed. Tuplets stay on: they are what writes
 * the short gaps.
 */
function at(tempo: number): unknown {
  const field = (rhythmIdentification.settings.fields as AnyField[])
    .find((f) => f.id === 'tempo')!;
  return rhythmIdentification.settings.coerce(
    applyValue(field, widestSettings(rhythmIdentification, { bars: 1 }), `${tempo}`),
  );
}

/** Every generated bar's onset times, over a seed sweep. */
function takes(tempo: number, seeds: number): number[][] {
  const settings = at(tempo);
  const out: number[][] = [];
  for (let seed = 0; seed < seeds; seed += 1) {
    const exercise = rhythmIdentification.generate({ seed, settings }) as {
      onsets?: readonly number[];
    };
    if ((exercise.onsets?.length ?? 0) >= 2) out.push([...exercise.onsets!]);
  }
  return out;
}

const shortestGap = (take: readonly number[]) => take
  .slice(1).reduce((m, t, i) => Math.min(m, t - take[i]), Infinity);

describe('the gap between two notes the generator can write', () => {
  it('is shorter than the window the detector merges across', () => {
    /*
      The measurement that makes the case below a defect rather than a
      preference, and it is about this repository rather than about music.

      `MIN_SEPARATION_SECONDS` argues for 50 ms from a general fact — "at
      200 bpm a sixteenth note is 75 ms, which is faster than anybody
      sight-reads". The app's fastest tempo is 160, so that bound is never
      tested; but the cell library writes tuplets, and a tuplet at 160 bpm
      goes below the window. The comment reasons about music the app does
      not generate and concludes something false about music it does.
    */
    const fastest = Math.min(...TEMPO_CHOICES.map((tempo) =>
      Math.min(...takes(tempo, 200).map(shortestGap))));
    /*
      Red in either direction, and the direction says which thing moved.

      If the generator stops writing anything that fast, the defect below is
      gone and this should go with it. If the *constant* has been lowered to
      clear the generator, that is the wrong fix arriving — the same window
      is what refuses a hammer's attack cluster, which wants it wider — and
      this is where it should be argued rather than quietly applied. The fix
      the comment in `onsetDetector.ts` proposes moves the number at the call
      site and leaves the default alone, so it leaves this green and turns
      the case below red, which is what a fix should do.
    */
    expect(fastest, 'generator floor against the detector\'s default window')
      .toBeLessThan(MIN_SEPARATION_SECONDS);
  });
});

describe('a generated rhythm played back exactly', () => {
  /** Struck at the written times, cleanly, with nothing else in the signal. */
  function heard(take: readonly number[]): number[] {
    const signal = pluckSequence({
      atSeconds: take, frequencyHz: 220, seed: 7,
      seconds: take[take.length - 1] + 1, sampleRate: RATE, decaySeconds: 0.4,
    });
    return detectOnsets(signal, { sampleRate: RATE }).onsets.map((o) => o.timeSeconds);
  }

  /**
   * The first onset is excluded rather than counted as lost.
   *
   * A bar starts at tick zero, and spectral flux is a rise *between* two
   * frames — there is no frame before the first one, so an attack at t=0 is
   * not something this detector can find and is not what this case is
   * about. In production a count-in puts the music after the start, which
   * is the mechanism that makes it a non-issue rather than an argument
   * that it would be fine.
   */
  const audible = (take: readonly number[]) => take.filter((t) => t > 0.02);

  it('keeps every note at the tempos a reader can follow', () => {
    for (const tempo of TEMPO_CHOICES.filter((t) => t <= 132)) {
      for (const take of takes(tempo, 6)) {
        const want = audible(take);
        const got = heard(take);
        const lost = want.filter((w) => !got.some((g) => Math.abs(g - w) < 0.03));
        expect(lost, `${tempo} bpm lost notes at`).toEqual([]);
      }
    }
  });

  it.fails('keeps every note at the fastest tempo it offers — known defect', () => {
    /*
      **A known defect, recorded as failing rather than softened**, in the
      shape `recorded.test.ts` established: this goes red the day it starts
      passing.

      At 160 bpm the generator writes tuplets 47 ms apart and the detector
      merges anything closer than 50 ms, so the app marks a perfectly played
      bar as missing notes it chose itself. Measured on seed 1: wanted
      attacks at 1.219 1.313 1.359 1.406 1.500, heard 1.219 1.358 1.498.

      **It is not a mistuned number, and lowering the window is not the
      fix.** The same constant is doing two unrelated jobs: refusing the
      double-trigger a plectrum or a hammer produces, which wants a *wider*
      window — a recorded piano note fragments into as many as 24 — and not
      merging notes this exercise generated, which wants a narrower one.
      Those have different right answers, and `detectOnsets` already accepts
      `minSeparationSeconds` per call. The caller knows the tempo and the
      detector cannot; the fix belongs at the call site, and it changes
      rhythm grading, which is why it is recorded here rather than taken.
    */
    for (const take of takes(160, 24)) {
      const want = audible(take);
      const got = heard(take);
      const lost = want.filter((w) => !got.some((g) => Math.abs(g - w) < 0.03));
      expect(lost, '160 bpm lost notes at').toEqual([]);
    }
  });
});
