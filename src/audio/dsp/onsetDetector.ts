/**
 * Where the notes started.
 *
 * Spectral flux: the amount by which each frame's magnitude spectrum has
 * *risen* over the one before it, summed across bins. Rises only, because a
 * note ending is a fall and is not an onset — half-wave rectifying is what
 * separates "something new was struck" from "something stopped".
 *
 * Flux rather than a level envelope because the player is answering an
 * exercise on a real instrument, where the next note is struck while the last
 * one is still ringing. A level envelope barely moves at the second pluck of a
 * sustaining chord; the spectrum does, because new partials appear.
 *
 * ## These constants are not inherited measurements
 *
 * Unlike the pitch detector next door, nothing here comes from the tuner —
 * the tuner never needed onsets. The numbers below were chosen against the
 * synthesised plucks in `audio/testing/signals.ts` and have never met a
 * recording of anybody playing anything. The tuner's ADR 0008 is explicit
 * about what that is worth: every defect its pitch tracking ever had was
 * invisible to synthetic audio. These should be re-measured against real
 * playing before anyone trusts them to judge a performance, and the first
 * thing to re-measure is the threshold, which is the number deciding whether
 * a quiet note counts as played.
 */

import { Fft, type Samples, hannWindow, nearestPow2 } from './fft';

export interface Onset {
  /** Seconds from the start of the signal. */
  timeSeconds: number;
  /** Height of the flux peak over its local threshold; bigger is clearer. */
  strength: number;
}

export interface OnsetOptions {
  /** Measured, not assumed: whatever the capture layer reports. */
  sampleRate: number;
  frameSize?: number;
  hopSize?: number;
  /** Half-width of the window the adaptive threshold takes its median over. */
  medianSpanSeconds?: number;
  /** How far above the local median a peak has to stand. */
  thresholdFactor?: number;
  /** How far above the whole signal's average flux a peak has to stand. */
  thresholdFloor?: number;
  /** Two peaks closer than this are one attack seen twice. */
  minSeparationSeconds?: number;
}

export interface OnsetAnalysis {
  onsets: Onset[];
  /** The novelty curve itself, one value per frame. Returned so a test, or a
   * future tuning pass, can look at what the threshold was applied to. */
  flux: Float64Array;
  threshold: Float64Array;
  frameSize: number;
  hopSize: number;
  /** Time of frame `i`, which is its centre. See `onsetTime` below. */
  frameTimeSeconds: (frame: number) => number;
}

/**
 * The analysis frame, as a duration rather than a sample count.
 *
 * 1024 samples at 44.1 kHz — 23 ms. Short, because this is a question about
 * *when*, not about *what*: the frame only has to be long enough for a
 * spectrum to be meaningful, and every sample it is longer smears the attack
 * it is trying to locate. Expressed in seconds because the browser picks the
 * rate; at 48 kHz the nearest power of two to 23 ms is still 1024, and at
 * 96 kHz it becomes 2048, which is the same 23 ms.
 */
export const ONSET_FRAME_SECONDS = 1024 / 44_100;

/** A quarter of the frame: 256 samples, 5.8 ms, at 44.1 kHz. */
export const ONSET_HOP_FRACTION = 4;

/**
 * Two attacks closer together than this are the same attack.
 *
 * Not arbitrary: at 200 bpm a sixteenth note is 75 ms, which is faster than
 * anybody sight-reads, so 50 ms cannot swallow a note the exercise asked for.
 * What it does swallow is the double-trigger a plectrum produces when the
 * pick noise and the string's first period land in different frames.
 */
const MIN_SEPARATION_SECONDS = 0.05;

/**
 * Half-width of the median window, in seconds.
 *
 * The threshold has to follow the music — a loud passage raises the floor
 * under it — without following a single note, which would hide that note
 * behind itself. A tenth of a second either way spans several frames and no
 * whole note at any practised tempo.
 */
const MEDIAN_SPAN_SECONDS = 0.1;

/** A peak must stand this far above the local median to count. */
const THRESHOLD_FACTOR = 1.5;

/**
 * …and this far above the average flux of the whole signal.
 *
 * The median term alone cannot tell a quiet room from a quiet passage: in
 * near-silence the local median is near zero, so any fluctuation clears
 * `factor × 0`. This second term is what stops a noise floor reading as a
 * performance. It is scaled by the signal's own average flux rather than
 * being an absolute level, so a recording made 30 dB quieter gives the same
 * answer — which the tuner's ADR 0002 is the standing argument for: the same
 * tone through two input sources measured 33 dB apart.
 */
const THRESHOLD_FLOOR = 1;

export function frameSizeFor(sampleRate: number): number {
  return nearestPow2(ONSET_FRAME_SECONDS * sampleRate);
}

function median(values: Float64Array, from: number, to: number, scratch: Float64Array): number {
  const count = to - from;
  for (let i = 0; i < count; i++) scratch[i] = values[from + i];
  const slice = scratch.subarray(0, count).sort();
  const middle = count >> 1;
  return count % 2 === 1 ? slice[middle] : (slice[middle - 1] + slice[middle]) / 2;
}

/**
 * Half-wave rectified spectral flux, frame by frame, with an adaptive
 * threshold and peak picking.
 *
 * The time reported for a peak is the *centre* of its frame, not the start.
 * A Hann-windowed frame weights its middle most heavily, so the flux between
 * two frames rises fastest when the attack is sitting at the window's centre
 * — reporting the frame start would put every onset half a frame early, which
 * at 1024 samples is 12 ms and is a quarter of the tightest tolerance the
 * rhythm aligner uses.
 */
export function detectOnsets(samples: Samples, options: OnsetOptions): OnsetAnalysis {
  const { sampleRate } = options;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error(`Sample rate must be positive, got ${sampleRate}`);
  }
  const frameSize = options.frameSize ?? frameSizeFor(sampleRate);
  const hopSize = options.hopSize ?? Math.max(1, Math.round(frameSize / ONSET_HOP_FRACTION));
  const medianSpanSeconds = options.medianSpanSeconds ?? MEDIAN_SPAN_SECONDS;
  const thresholdFactor = options.thresholdFactor ?? THRESHOLD_FACTOR;
  const thresholdFloor = options.thresholdFloor ?? THRESHOLD_FLOOR;
  const minSeparationSeconds = options.minSeparationSeconds ?? MIN_SEPARATION_SECONDS;

  const frameTimeSeconds = (frame: number) => (frame * hopSize + frameSize / 2) / sampleRate;

  const frames = samples.length < frameSize
    ? 0
    : Math.floor((samples.length - frameSize) / hopSize) + 1;
  const flux = new Float64Array(Math.max(0, frames));
  const threshold = new Float64Array(flux.length);
  const empty: OnsetAnalysis = {
    onsets: [], flux, threshold, frameSize, hopSize, frameTimeSeconds,
  };
  if (frames < 3) return empty;

  const fft = new Fft(frameSize);
  const window = hannWindow(frameSize);
  const windowed = new Float64Array(frameSize);
  const bins = frameSize / 2 + 1;
  let previous = new Float64Array(bins);
  let current = new Float64Array(bins);

  for (let t = 0; t < frames; t++) {
    const start = t * hopSize;
    for (let i = 0; i < frameSize; i++) windowed[i] = samples[start + i] * window[i];
    fft.magnitudes(windowed, current);

    if (t > 0) {
      let rise = 0;
      for (let k = 0; k < bins; k++) {
        const change = current[k] - previous[k];
        if (change > 0) rise += change;
      }
      flux[t] = rise;
    }
    const swap = previous;
    previous = current;
    current = swap;
  }

  let total = 0;
  for (let t = 0; t < frames; t++) total += flux[t];
  const average = total / frames;
  if (average === 0) return empty;

  const span = Math.max(1, Math.round((medianSpanSeconds * sampleRate) / hopSize));
  const scratch = new Float64Array(2 * span + 1);
  for (let t = 0; t < frames; t++) {
    const from = Math.max(0, t - span);
    const to = Math.min(frames, t + span + 1);
    threshold[t] = thresholdFactor * median(flux, from, to, scratch)
      + thresholdFloor * average;
  }

  // A peak, not merely a crossing. Without the local-maximum test a single
  // attack reports once per frame for as long as its flux stays above the
  // threshold, which at a 5.8 ms hop is four or five onsets where one was
  // played — and the separation rule below would then keep the earliest,
  // which is the frame where the attack had only partly entered the window.
  const onsets: Onset[] = [];
  for (let t = 1; t < frames - 1; t++) {
    if (flux[t] <= threshold[t]) continue;
    if (flux[t] < flux[t - 1] || flux[t] < flux[t + 1]) continue;
    const last = onsets[onsets.length - 1];
    const strength = flux[t] - threshold[t];
    if (last !== undefined && frameTimeSeconds(t) - last.timeSeconds < minSeparationSeconds) {
      // Keep whichever of the two is the clearer peak: a pick noise and the
      // string behind it land a few frames apart, and the louder of them is
      // the one a player would call the attack.
      if (strength > last.strength) {
        onsets[onsets.length - 1] = { timeSeconds: frameTimeSeconds(t), strength };
      }
      continue;
    }
    onsets.push({ timeSeconds: frameTimeSeconds(t), strength });
  }

  return { onsets, flux, threshold, frameSize, hopSize, frameTimeSeconds };
}
