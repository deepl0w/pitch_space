import { describe, expect, it } from 'vitest';
import { rhythmIdentification } from './index';
import { TEMPO_CHOICES } from './rhythms';
import { detectOnsets, MIN_SEPARATION_SECONDS } from '../../audio/dsp/onsetDetector';
import { separationForOnsets } from '../../audio/capture/listen';
import { alignRhythm, toleranceFor } from '../../audio/dsp/rhythmAlign';
import { beatSeconds } from './rhythms';
import { pluckSequence, seeded } from '../../audio/testing/signals';
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
    /*
      The bar that wrote it is named with it. A failure here means the
      generator's floor moved, and "it no longer writes anything that
      fast" is not diagnosable on its own — which cells were in play is.
      The bar rather than the cell: the tightest pair can straddle two of
      them, and attributing it to one would be a guess.
    */
    let fastest = Infinity;
    let wrote = '';
    for (const tempo of TEMPO_CHOICES) {
      const settings = at(tempo);
      for (let seed = 0; seed < 200; seed += 1) {
        const exercise = rhythmIdentification.generate({ seed, settings }) as {
          onsets?: readonly number[]; bars?: readonly { cellIds: readonly string[] }[];
        };
        const onsets = exercise.onsets ?? [];
        if (onsets.length < 2) continue;
        const gap = shortestGap(onsets);
        if (gap < fastest) {
          fastest = gap;
          const cells = (exercise.bars ?? []).flatMap((bar) => [...bar.cellIds]);
          wrote = `${tempo} bpm seed ${seed}, from a bar of [${cells.join(' ')}]`;
        }
      }
    }
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
    expect(fastest, `generator floor ${(fastest * 1000).toFixed(1)} ms (${wrote})`
      + ` against the detector's ${MIN_SEPARATION_SECONDS * 1000} ms default window`)
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

/**
 * How much of a player's error the derived window survives.
 *
 * `separationForOnsets` takes half the shortest written gap, and the
 * question it was built under is whether half is the right fraction. It is
 * answerable rather than a matter of taste, because the geometry is fixed:
 * two notes written `g` apart, each displaced by up to `j·g`, can land
 * `g(1 − 2j)` apart, and a window of `f·g` merges them exactly when
 * `f ≥ 1 − 2j`. So the fraction is not "half" for any reason of its own —
 * **it is one minus twice the timing error the chain intends to tolerate**,
 * and choosing it is choosing that.
 *
 * Half therefore tolerates a quarter of a gap. A third tolerates a third,
 * and a quarter tolerates three eighths. Measured below rather than argued,
 * because the prediction is about a detector and not about arithmetic.
 */
describe('the window derived from the written music', () => {
  /** The written times, played with each note displaced by up to `jitter·gap`. */
  function played(take: readonly number[], jitter: number, seed: number): number[] {
    const rng = seeded(seed);
    const gap = shortestGap(take);
    return take
      .map((t, i) => (i === 0 ? t : t + (rng.next() * 2 - 1) * jitter * gap))
      .map((t) => Math.max(0, t))
      .sort((a, b) => a - b);
  }

  /**
   * Notes lost, with the window the production code derives.
   *
   * Deliberately through `separationForOnsets` rather than through the
   * fraction below: the fraction cases are about the geometry and would go
   * on passing if the derivation changed under them, which is the whole
   * failure mode this file exists to catch.
   */
  function lostWithDerivedWindow(tempo: number): number {
    let lost = 0;
    for (const take of takes(tempo, 8)) {
      const signal = pluckSequence({
        atSeconds: take, frequencyHz: 220, seed: 7,
        seconds: take[take.length - 1] + 1, sampleRate: RATE, decaySeconds: 0.4,
      });
      const got = detectOnsets(signal, {
        sampleRate: RATE, minSeparationSeconds: separationForOnsets(take),
      }).onsets.map((o) => o.timeSeconds);
      lost += take.filter((w) => w > 0.02)
        .filter((w) => !got.some((g) => Math.abs(g - w) < 0.03)).length;
    }
    return lost;
  }

  function lostAt(tempo: number, fraction: number, jitter: number): number {
    let lost = 0;
    for (const [i, take] of takes(tempo, 8).entries()) {
      const performance = played(take, jitter, 1000 + i);
      const signal = pluckSequence({
        atSeconds: performance, frequencyHz: 220, seed: 7,
        seconds: performance[performance.length - 1] + 1, sampleRate: RATE, decaySeconds: 0.4,
      });
      const got = detectOnsets(signal, {
        sampleRate: RATE, minSeparationSeconds: shortestGap(take) * fraction,
      }).onsets.map((o) => o.timeSeconds);
      lost += performance.filter((w) => w > 0.02)
        .filter((w) => !got.some((g) => Math.abs(g - w) < 0.03)).length;
    }
    return lost;
  }

  it('recovers the notes the fixed window lost, at the tempo that lost them', () => {
    // The point of the mechanism, asked at 160 bpm where the default merges.
    // Through the production derivation, so a change to it is felt here.
    expect(lostWithDerivedWindow(160)).toBe(0);
  });

  it('is what the written music says rather than a constant', () => {
    /*
      The relation, not the fraction. This pinned `gap / 2` and went red
      when the fraction moved to a third on the strength of the geometry
      measured two cases below — which is the fraction being tuning and
      the relation being the claim, so only the relation is asserted:
      narrower than the gap it was derived from, and scaling with it.
    */
    const take = takes(160, 1)[0];
    const window = separationForOnsets(take)!;
    expect(window, 'wider than the gap would merge two written notes')
      .toBeLessThan(shortestGap(take));
    expect(window, 'a window of nothing merges nothing').toBeGreaterThan(0);

    // Scales with the music rather than being a constant in disguise: a
    // slower take has wider gaps and must get a wider window.
    const slower = takes(96, 1)[0];
    expect(shortestGap(slower)).toBeGreaterThan(shortestGap(take));
    expect(separationForOnsets(slower)!).toBeGreaterThan(window);

    // Fewer than two attacks is not a gap, and the caller must fall back
    // rather than be handed a window of zero.
    expect(separationForOnsets([1])).toBeUndefined();
    expect(separationForOnsets([])).toBeUndefined();
  });

  it('keeps a window the detector\'s own precision cannot defeat', () => {
    /*
      The guard on the derivation itself, and the one the relation above
      cannot give.

      Asserting that the window is narrower than the gap is right — the
      fraction is tuning and should not be pinned — but "narrower" admits
      nine tenths, and nine tenths loses notes to a player off by five
      milliseconds. The whole suite passes with the derivation at `0.9`,
      which is the hole this closes.

      The figure is not invented for the occasion. `TOLERANCE_CEILING_SECONDS`
      already reasons from "the 20 ms or so the detector itself places an
      attack to", and a merge window defeated by less than the detector's
      own precision is indefensible whatever the fraction: it would be
      merging notes that are only together because the detector said so.

      A tolerance rather than a fraction, so retuning between a quarter and
      a half stays free. Measured at 160 bpm, where the gaps are shortest:

          ±20 ms jitter   f=1/4  0 lost   f=1/3  0   f=1/2  0   f=0.9  3
          ±5 ms  jitter   f=1/4  0 lost   f=1/3  0   f=1/2  0   f=0.9  1
    */
    const DETECTOR_PRECISION_SECONDS = 0.02;
    const lost = (window: (take: readonly number[]) => number | undefined) => {
      let total = 0;
      for (const [i, take] of takes(160, 8).entries()) {
        const rng = seeded(1000 + i);
        const performance = take
          .map((t, k) => (k === 0 ? t
            : t + (rng.next() * 2 - 1) * DETECTOR_PRECISION_SECONDS))
          .map((t) => Math.max(0, t))
          .sort((a, b) => a - b);
        const signal = pluckSequence({
          atSeconds: performance, frequencyHz: 220, seed: 7,
          seconds: performance[performance.length - 1] + 1,
          sampleRate: RATE, decaySeconds: 0.4,
        });
        const got = detectOnsets(signal, {
          sampleRate: RATE, minSeparationSeconds: window(take),
        }).onsets.map((o) => o.timeSeconds);
        total += performance.filter((w) => w > 0.02)
          .filter((w) => !got.some((g) => Math.abs(g - w) < 0.03)).length;
      }
      return total;
    };

    expect(lost(separationForOnsets),
      'the derived window merges notes the detector itself placed').toBe(0);
    // The control: a window this harness cannot be defeated by proves
    // nothing. Nine tenths of the gap is what the relation above permits
    // and what this refuses.
    expect(lost((take) => shortestGap(take) * 0.9),
      'the harness cannot register a loss at all').toBeGreaterThan(0);
  });

  it('survives a third of a gap of human error, which is what a third buys', () => {
    /*
      The prediction, measured: `f = 1/2` holds to `j = 1/4` and starts
      losing notes beyond it. At ±30% it loses one in seventy-one, at ±20%
      none. A third holds through ±50%, the widest displacement worth
      simulating, and so does a quarter.

      Recorded because the number is a *choice about tolerance* and nothing
      said so. If the chain should accept a note displaced by a third of a
      gap — and the grading window currently accepts very much more than
      that, see below — then the fraction has to come down to match, and
      this is the case that would have to be rewritten to say it.
    */
    expect(lostAt(160, 0.5, 0.2), 'half, within the error half buys').toBe(0);
    expect(lostAt(160, 1 / 3, 0.5), 'a third, at the widest error simulated').toBe(0);
    // The control: a zero above has to be this harness finding nothing to
    // lose rather than this harness unable to lose anything. A window at
    // nine tenths of the gap is past `1 − 2j` for any of these, and does.
    expect(lostAt(160, 0.9, 0.3), 'the harness cannot register a loss at all')
      .toBeGreaterThan(0);
  });
});

/**
 * The two windows in the chain, which have never been compared.
 *
 * `toleranceFor` decides how far a played attack may be from its written
 * time and still be that note. `separationForOnsets` decides how close two
 * attacks may be before they are one. They are both about the same distance
 * between the same two notes, they are set in different files, and nothing
 * relates them — so the chain can accept a note that it has already
 * destroyed.
 */
describe('the grading window against the shortest value written', () => {
  it('is wider than the gap it is grading, at the tempos that read fastest', () => {
    /*
      `TOLERANCE_BEATS`'s own comment predicts this and understates it. It
      says the window is "as wide as a whole sixteenth" at a tempo fast
      enough to read sixteenths, and proposes the repair — "a separate
      window keyed to the shortest value the exercise actually contains…
      it wants the exercise to say what that value is".

      Measured, it reaches twice the shortest value rather than once,
      because the cell library writes tuplets and the comment reasons about
      sixteenths:

          96 bpm   tolerance 100.0 ms   shortest gap 78.1 ms   ratio 1.28
          132 bpm  tolerance 100.0 ms   shortest gap 56.8 ms   ratio 1.76
          160 bpm  tolerance  93.8 ms   shortest gap 46.9 ms   ratio 2.00

      The value the repair wants the exercise to say is now computed:
      `separationForOnsets` reads it off the written onsets.
    */
    const ratios = [96, 132, 160].map((tempo) => {
      const gap = Math.min(...takes(tempo, 200).map(shortestGap));
      return toleranceFor(beatSeconds(tempo)) / gap;
    });
    for (const ratio of ratios) expect(ratio).toBeGreaterThan(1);
    expect(ratios[2], '160 bpm').toBeGreaterThan(1.9);
  });

  it('scores a note played a whole subdivision late as half right', () => {
    /*
      What the ratio costs, as a grade rather than as a number. The note is
      moved onto the written time of the one after it — as unambiguously
      wrong as a rhythm can be without adding or dropping an attack — and
      the alignment stays one-to-one, nothing is missed, nothing is extra,
      and it scores 0.5.

      The alignment is not at fault and the comment is right that no note is
      double-counted. What the one-to-one match hides is that the score
      underneath it has stopped meaning anything at this scale.
    */
    const take = takes(160, 200).reduce((a, b) => (shortestGap(b) < shortestGap(a) ? b : a));
    const gap = shortestGap(take);
    const at = take.findIndex((t, i) => i > 0 && Math.abs(t - take[i - 1] - gap) < 1e-9);
    const performance = [...take];
    performance[at - 1] += gap;

    const alignment = alignRhythm(take, [...performance].sort((a, b) => a - b), {
      beatSeconds: beatSeconds(160),
    });
    const moved = alignment.matched.find((m) => m.expectedIndex === at - 1);
    expect(moved, 'the displaced note went unmatched, which would be the honest answer')
      .toBeDefined();
    expect(alignment.missed, 'nothing was reported missing').toEqual([]);
    expect(alignment.extra, 'nothing was reported extra').toEqual([]);
    expect(moved!.score, 'a note a whole subdivision out still scores')
      .toBeGreaterThan(0.4);
  });
});
