/**
 * YIN fundamental-frequency estimation (de Cheveigné & Kawahara, 2002), with
 * the difference function computed through the FFT.
 *
 * Ported from the sibling tuner's `PitchDetector.kt`. That detector is the
 * reason this file is a port rather than a fresh implementation: picking the
 * loudest FFT peak is the obvious approach and the wrong one for strings,
 * because a plucked or bowed string often puts more energy into its second or
 * third partial than into its fundamental. The tuner measured a violin G♯3
 * whose fundamental sat at 0.064 of its second partial's amplitude, and a
 * cello C2 whose strongest partial during decay was its octave. YIN works on
 * periodicity rather than on spectral energy, so a weak fundamental does not
 * mislead it. The argument is in that repository's ADR 0001.
 *
 * ## The constants are measurements, not preferences
 *
 * Every tuned number below was fixed by probing real instrument recordings on
 * **Android, at 44.1 kHz, through an `UNPROCESSED` microphone**. None has been
 * re-measured in a browser, and there are three reasons that gap is not
 * cosmetic:
 *
 *  - A browser hands over whatever rate its hardware runs at — usually 48 kHz
 *    — and will not be argued with. Everything here that is a *ratio* survives
 *    that; everything counted in samples is derived from the measured rate
 *    rather than assumed, which is what `frameSizeFor` exists for.
 *  - A browser's microphone request applies echo cancellation, noise
 *    suppression and automatic gain control unless the capture layer turns
 *    them off. AGC in particular distorts a decaying string's pitch, which is
 *    the thing the tuner chose `UNPROCESSED` to avoid.
 *  - The tuner measured the *same tone on the same phone* 33 dB apart across
 *    two Android input sources. A browser is a third source nobody has
 *    measured, so any absolute level here is a guess until someone does.
 *
 * Changing one of these means re-running a recordings corpus, not reasoning
 * about it. Where no such corpus exists yet for the browser, the honest
 * position is that the number is inherited and unverified, and each is marked
 * that way below.
 *
 * Not reusable across streams: the scratch buffers are shared between calls,
 * so a detector belongs to exactly one analysis loop.
 */

import { Fft, type Samples, nextPow2 } from './fft';

/** One analysed frame. */
export interface PitchEstimate {
  /** Fundamental in Hz, or null when no stable pitch was found. */
  frequencyHz: number | null;
  /** 0..1 — how periodic the frame looked. Below ~0.8 the reading is shaky. */
  clarity: number;
  /** Frame level in dBFS, which is how silence is told from a quiet note. */
  levelDbfs: number;
}

/**
 * The lowest note the app needs to hear: B0, the bottom string of a five-string
 * bass. Inherited from the tuner's ADR 0004, where it is a fact about the
 * instrument catalogue rather than a tuning choice.
 */
export const LOWEST_NOTE_HZ = 30.87;

/**
 * The frame a detector needs, given the sample rate it actually got.
 *
 * YIN's integration window is half the frame, and the window has to hold
 * comfortably more than one period of the lowest note for the answer to be
 * stable — so the frame is four times the longest period, rounded up to a
 * power of two for the transform. The tuner tried half this and rejected it:
 * a 2048-sample window holds 1.4 periods of B0, which is below the point where
 * YIN is dependable down there (its ADR 0004).
 *
 * Derived rather than stored as 8192, because the browser decides the rate and
 * not us. At 44.1 kHz this reproduces the tuner's 8192 exactly; at 48 kHz it
 * is still 8192, and at 96 kHz it becomes 16384 without anyone having to
 * notice.
 */
export function frameSizeFor(sampleRate: number, lowestHz = LOWEST_NOTE_HZ): number {
  return nextPow2((4 * sampleRate) / lowestHz);
}

export interface PitchDetectorOptions {
  /** Measured, not assumed: whatever the capture layer reports. */
  sampleRate: number;
  frameSize?: number;
  /**
   * YIN's absolute threshold; lower is stricter about periodicity. Inherited
   * from the tuner unchanged, measured on Android.
   */
  threshold?: number;
  /** Search floor. Below B0 so a flat bottom string is still found. */
  minFrequencyHz?: number;
  /** Search ceiling, a little above the top of a violin's range. */
  maxFrequencyHz?: number;
}

/**
 * Minimum d′ at the candidate lag before an octave correction is considered.
 *
 * Inherited measurement, Android: probing real recordings put correct
 * detections at or below d′ ≈ 0.04 and genuine octave-up errors at 0.09 and
 * above. Below this floor the lag is already a true period and every multiple
 * of it looks equally good, so there is nothing to decide — and without the
 * guard a perfectly periodic tone gets dragged an octave down.
 */
const OCTAVE_CHECK_FLOOR = 0.02;

/**
 * How much better the longer period must look before the detector moves to it.
 * Inherited measurement, Android: correct detections got *worse* at twice the
 * lag, by ratios of 2.1 to 3.5; genuine octave errors collapsed to about 0.03.
 */
const OCTAVE_SWITCH_RATIO = 0.5;

/**
 * Below this RMS the frame is treated as digital silence and no pitch is
 * reported.
 *
 * Inherited, and the one number here that is absolute rather than a ratio, so
 * the one most exposed to the browser being a different input path. The tuner
 * records a 33 dB spread between two Android sources alone; this sits at
 * −120 dBFS, far below anything either of them produced, which is why it has
 * survived being inherited blind. It is a backstop against an all-zero buffer,
 * not a judgement about loudness — that judgement belongs to whatever gates
 * these estimates, where it can be made against a learned floor.
 */
const SILENCE_RMS = 1e-6;

export class PitchDetector {
  readonly sampleRate: number;
  readonly frameSize: number;

  private readonly windowSize: number;
  private readonly threshold: number;
  private readonly minTau: number;
  private readonly maxTau: number;

  private readonly fft: Fft;
  // Scratch, allocated once. `a` is the first half of the frame zero-padded,
  // `b` the whole frame; their cross-correlation is what the difference
  // function needs.
  private readonly aRe: Float64Array;
  private readonly aIm: Float64Array;
  private readonly bRe: Float64Array;
  private readonly bIm: Float64Array;
  private readonly centred: Float64Array;
  private readonly difference: Float64Array;
  private readonly normalised: Float64Array;

  constructor(options: PitchDetectorOptions) {
    const {
      sampleRate,
      threshold = 0.12,
      minFrequencyHz = 27,
      maxFrequencyHz = 4200,
    } = options;
    // The frame is sized for the search floor rather than for B0, because the
    // floor is what the detector will actually look for: a bass tuned a
    // semitone flat still has to be found.
    const frameSize = options.frameSize ?? frameSizeFor(sampleRate, minFrequencyHz);

    if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
      throw new Error(`Sample rate must be positive, got ${sampleRate}`);
    }
    this.sampleRate = sampleRate;
    this.frameSize = frameSize;
    this.threshold = threshold;
    this.windowSize = frameSize / 2;

    this.minTau = Math.max(2, Math.floor(sampleRate / maxFrequencyHz));
    this.maxTau = Math.floor(sampleRate / minFrequencyHz);
    // The tuner clamps the longest lag to the window instead of refusing, and
    // a detector that quietly stops searching below some frequency it was
    // asked about is one that will be blamed for the silence. A frame too
    // small for the range is a construction error: say so here rather than
    // return null for every bass note at run time.
    if (this.maxTau > this.windowSize - 1) {
      throw new Error(
        `A frame of ${frameSize} samples cannot hold a period of ${minFrequencyHz} Hz `
        + `at ${sampleRate} Hz`,
      );
    }
    if (this.maxTau <= this.minTau) {
      throw new Error(`Frequency range does not fit in a frame of ${frameSize} samples`);
    }

    this.fft = new Fft(frameSize);
    this.aRe = new Float64Array(frameSize);
    this.aIm = new Float64Array(frameSize);
    this.bRe = new Float64Array(frameSize);
    this.bIm = new Float64Array(frameSize);
    this.centred = new Float64Array(frameSize);
    this.difference = new Float64Array(this.windowSize);
    this.normalised = new Float64Array(this.windowSize);
  }

  /**
   * Analyses one frame. `samples` must hold at least `frameSize` values in
   * roughly [-1, 1]; anything beyond that is ignored.
   */
  analyse(samples: Samples): PitchEstimate {
    const { frameSize, centred } = this;
    if (samples.length < frameSize) {
      throw new Error(`Need ${frameSize} samples, got ${samples.length}`);
    }

    // Remove DC. A biased frame inflates d(τ) uniformly and drags the
    // normalised curve towards 1, which costs real detections on quiet notes.
    let sum = 0;
    for (let i = 0; i < frameSize; i++) sum += samples[i];
    const mean = sum / frameSize;

    let energy = 0;
    for (let i = 0; i < frameSize; i++) {
      const value = samples[i] - mean;
      centred[i] = value;
      energy += value * value;
    }

    const rms = Math.sqrt(energy / frameSize);
    const levelDbfs = rms <= 1e-9 ? -120 : 20 * Math.log10(rms);
    if (rms <= SILENCE_RMS) return { frequencyHz: null, clarity: 0, levelDbfs };

    this.computeDifference();
    this.cumulativeMeanNormalise();

    const tau = this.preferTrueFundamental(this.absoluteThreshold());
    if (tau < 0) return { frequencyHz: null, clarity: 0, levelDbfs };

    const refinedTau = this.parabolicInterpolate(tau);
    if (refinedTau <= 0) return { frequencyHz: null, clarity: 0, levelDbfs };

    return {
      frequencyHz: this.sampleRate / refinedTau,
      clarity: Math.min(1, Math.max(0, 1 - this.normalised[tau])),
      levelDbfs,
    };
  }

  /**
   * Fills `difference` with d(τ).
   *
   * Expanding the square gives
   * `d(τ) = Σⱼ x[j]² + Σⱼ x[j+τ]² − 2·Σⱼ x[j]·x[j+τ]`, where the first term is
   * constant, the second is a sliding window sum updated in O(1), and the
   * third is a cross-correlation obtained from one complex multiply between
   * two transforms. A naive d(τ) is O(W·τmax) — for an 8192 frame that is
   * 4096 × 4096 operations per frame, which is far too slow to run at the hop
   * rate on a phone and no faster in a worker.
   */
  private computeDifference(): void {
    const { frameSize, windowSize, centred, aRe, aIm, bRe, bIm, difference } = this;

    aIm.fill(0);
    bIm.fill(0);
    aRe.fill(0);
    bRe.set(centred);
    aRe.set(centred.subarray(0, windowSize));

    this.fft.forward(aRe, aIm);
    this.fft.forward(bRe, bIm);

    // conj(A)·B, then inverse — element m is Σⱼ a[j]·b[j+m]. Because a is zero
    // past windowSize and j+m never reaches frameSize, the circular
    // correlation agrees with the linear one over the τ range that is read.
    for (let i = 0; i < frameSize; i++) {
      const re = aRe[i] * bRe[i] + aIm[i] * bIm[i];
      const im = aRe[i] * bIm[i] - aIm[i] * bRe[i];
      aRe[i] = re;
      aIm[i] = im;
    }
    this.fft.inverse(aRe, aIm);

    let power = 0;
    for (let j = 0; j < windowSize; j++) power += centred[j] * centred[j];
    const power0 = power;

    difference[0] = 0;
    for (let tau = 1; tau < windowSize; tau++) {
      const entering = centred[tau + windowSize - 1];
      const leaving = centred[tau - 1];
      power += entering * entering - leaving * leaving;
      difference[tau] = Math.max(0, power0 + power - 2 * aRe[tau]);
    }
  }

  /** Converts d(τ) into YIN's cumulative mean normalised difference d′(τ). */
  private cumulativeMeanNormalise(): void {
    const { windowSize, difference, normalised } = this;
    normalised[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau < windowSize; tau++) {
      runningSum += difference[tau];
      normalised[tau] = runningSum <= 0 ? 1 : (difference[tau] * tau) / runningSum;
    }
  }

  /**
   * First τ whose d′(τ) dips below the threshold, walked down to the bottom of
   * that dip. Returns -1 when nothing in range is periodic enough.
   *
   * Taking the *first* qualifying dip rather than the global minimum is what
   * keeps YIN from reporting the octave above on harmonically rich strings.
   */
  private absoluteThreshold(): number {
    const { minTau, maxTau, normalised, threshold } = this;
    let tau = minTau;
    while (tau <= maxTau) {
      if (normalised[tau] < threshold) {
        while (tau + 1 <= maxTau && normalised[tau + 1] < normalised[tau]) tau++;
        return tau;
      }
      tau++;
    }
    return -1;
  }

  /**
   * Pulls a candidate back down to the real fundamental.
   *
   * YIN takes the first lag that dips below the threshold, which on a string
   * whose fundamental is weak can be half the true period — the app then shows
   * the note an octave high. The giveaway is that such a lag leaves the
   * fundamental unexplained, so d′ there stays well clear of zero while d′ at
   * twice the lag collapses.
   */
  private preferTrueFundamental(tau: number): number {
    const { minTau, maxTau, normalised } = this;
    if (tau < 0 || normalised[tau] < OCTAVE_CHECK_FLOOR) return tau;

    // Stop at the first multiple that qualifies. Once a lag is a true period
    // every multiple of it looks just as good, so continuing would keep
    // stepping down octaves for no reason.
    for (let multiple = 2; multiple <= 4; multiple++) {
      const centre = tau * multiple;
      if (centre > maxTau) break;
      // The true period is not necessarily an exact multiple of a lag that was
      // itself rounded, so look around the expected position.
      const radius = Math.max(1, Math.floor(centre / 20));
      const from = Math.max(minTau, centre - radius);
      const to = Math.min(maxTau, centre + radius);
      let candidate = from;
      for (let t = from; t <= to; t++) if (normalised[t] < normalised[candidate]) candidate = t;

      if (normalised[candidate] < normalised[tau] * OCTAVE_SWITCH_RATIO) return candidate;
    }
    return tau;
  }

  /** Sub-sample refinement of the dip, fitting a parabola to its neighbours. */
  private parabolicInterpolate(tau: number): number {
    const { windowSize, difference } = this;
    const left = Math.max(0, tau - 1);
    const right = Math.min(windowSize - 1, tau + 1);
    if (left === tau || right === tau) return tau;

    const s0 = difference[left];
    const s1 = difference[tau];
    const s2 = difference[right];
    const denominator = 2 * (2 * s1 - s2 - s0);
    if (denominator === 0) return tau;
    const shift = (s2 - s0) / denominator;
    // A well-formed dip shifts by well under half a sample; anything larger
    // means the parabola fit is bogus, so keep the integer lag.
    return shift > -1 && shift < 1 ? tau + shift : tau;
  }
}
