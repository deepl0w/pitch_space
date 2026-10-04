import { detectOnsets, type Onset } from './onsetDetector';
import type { Samples } from './fft';

/**
 * Measuring what the round trip costs, which the browser will not tell us.
 *
 * ADR 0014: `AudioContext` exposes `baseLatency` and `outputLatency` and no
 * input-latency property at all, while `toleranceFor` fixes the rhythm
 * matching window at a 100 ms half-width across the whole of normal practice
 * tempo. An uncorrected offset of the same order does not degrade judging
 * gracefully — past the window every expected note reads as missed and every
 * attack as extra — so the number has to come from somewhere, and the only
 * place left is measuring it.
 *
 * The method is the obvious one: emit a click at a known moment, listen, and
 * see when it comes back. What is not obvious is what to do with the answer,
 * and that is most of this file.
 *
 * **Pure.** Clicks in, samples in, a number or a refusal out. No
 * `AudioContext`, no `getUserMedia`, nothing that needs a device — so the
 * estimator is testable against synthesised signals with known offsets, and
 * the part that cannot be tested off-device is reduced to "record this".
 */

/** One click, and where the capture says it landed. */
export interface CalibrationTrial {
  /**
   * When the click was scheduled, in the same timeline as the recording's
   * first sample.
   *
   * The caller owes this correspondence; it is the one thing the estimator
   * cannot check. Getting it wrong shifts every trial by the same amount,
   * which looks like a plausible latency rather than like an error — the
   * reason the caller's own comment about it is worth more than a runtime
   * guard that cannot fire.
   */
  emittedAtSeconds: number;
}

export interface CalibrationInput {
  samples: Samples;
  /** Measured, not assumed: whatever the capture layer reports. */
  sampleRate: number;
  trials: readonly CalibrationTrial[];
}

export type CalibrationOutcome =
  | {
    ok: true;
    /** What to subtract from a captured attack's time. Always positive. */
    latencySeconds: number;
    /** Half the interquartile range, as an honest ± for the user. */
    spreadSeconds: number;
    /** How many clicks were heard, out of how many were sent. */
    heard: number;
    sent: number;
  }
  | { ok: false; reason: CalibrationFailure; heard: number; sent: number };

export type CalibrationFailure =
  /** Nothing came back loud enough to be an attack. */
  | 'nothing-heard'
  /** Too few clicks landed to trust a median. */
  | 'too-few'
  /** The clicks disagree by more than the thing being measured. */
  | 'inconsistent'
  /** A delay no device has; the detector found something else. */
  | 'implausible';

/**
 * How much a measurement may wander before it is not a measurement.
 *
 * The matching window these numbers feed is a 100 ms half-width, so a
 * calibration whose own trials disagree by more than a quarter of that is
 * not telling us the thing we would be correcting by. Refusing is the point:
 * a bad offset is worse than none, because none is visibly absent and a bad
 * one looks authoritative and silently drills the user for the room they are
 * in.
 */
const MAX_SPREAD_SECONDS = 0.025;

/**
 * The longest a real round trip can take.
 *
 * Generous because Bluetooth genuinely is bad — 300 ms is a real figure for
 * a cheap headset — but a second is not latency, it is the detector having
 * found the next click, or a cough.
 *
 * There is no floor, and the first version's `MIN_PLAUSIBLE_SECONDS = 0` was
 * dead code: `matchDeltas` drops every negative delta, so the median cannot
 * be below zero and the check could not fire. It was there for a real
 * hazard — a negative result would mean the trials and the recording are not
 * on the same clock, which is the one correspondence this file says it
 * cannot verify — but a guard that cannot fire does not cover it. What
 * actually happens to a mismatched clock is `nothing-heard`, whose message
 * then offers the wrong remedy; that is recorded rather than fixed, because
 * detecting it needs something this function is not given.
 */
const MAX_PLAUSIBLE_SECONDS = 0.5;

/** Below this many usable trials a median is one opinion wearing a crowd's hat. */
const MIN_TRIALS = 3;

/**
 * How many frames the capture layer buffers before handing them over.
 *
 * Declared here rather than in `capture/`, which is where it is used,
 * because this is the size of the error when the caller gets the one thing
 * wrong that {@link CalibrationTrial} says it cannot check. A recording
 * whose first sample is one buffer later than the caller believes shifts
 * every delta by this much, equally — and an interquartile range over
 * equally-shifted numbers is unchanged, so the result moves 92.9 ms at
 * 44.1 kHz and reports the same confidence to six decimal places.
 *
 * It lives in `dsp/` because both halves need it and only this direction is
 * allowed: `capture/` may import from here and this layer may import
 * nothing above itself. The alternative was the number written out twice in
 * files that cannot see each other, where changing one leaves the other
 * silently stale — which is the thing the tests about this very defect
 * would then be measuring wrongly.
 */
export const RECORDER_BUFFER_FRAMES = 4096;

/**
 * How far after its click an onset may be and still be that click's echo.
 *
 * Wider than any plausible latency, so a slow device is not silently scored
 * as a miss, and narrower than the gap the caller leaves between clicks, so
 * one click's echo cannot be attributed to the next one's.
 */
const MATCH_WINDOW_SECONDS = 0.6;

export function estimateInputLatency(input: CalibrationInput): CalibrationOutcome {
  const { samples, sampleRate, trials } = input;
  const sent = trials.length;
  if (sent === 0) return { ok: false, reason: 'too-few', heard: 0, sent: 0 };

  const { onsets } = detectOnsets(samples, { sampleRate });
  if (onsets.length === 0) return { ok: false, reason: 'nothing-heard', heard: 0, sent };

  const deltas = matchDeltas(trials, onsets);
  if (deltas.length === 0) return { ok: false, reason: 'nothing-heard', heard: 0, sent };
  // Not `Math.min(MIN_TRIALS, sent)`, which was the first version: it lowers
  // the bar to whatever was asked for, so a single click cleared it and came
  // back ok with a spread of exactly zero — the most confident claim the type
  // can make, from one sample, applied silently to every attempt afterwards.
  // The caller sends six, so it was latent; the function is exported and the
  // next caller need not.
  if (deltas.length < MIN_TRIALS) {
    return { ok: false, reason: 'too-few', heard: deltas.length, sent };
  }

  const sorted = [...deltas].sort((a, b) => a - b);
  const latencySeconds = median(sorted);
  // Half the interquartile range rather than a standard deviation: one bad
  // trial should widen the reported uncertainty, not dominate it.
  const spreadSeconds = (quantile(sorted, 0.75) - quantile(sorted, 0.25)) / 2;

  if (latencySeconds > MAX_PLAUSIBLE_SECONDS) {
    return { ok: false, reason: 'implausible', heard: deltas.length, sent };
  }
  if (spreadSeconds > MAX_SPREAD_SECONDS) {
    return { ok: false, reason: 'inconsistent', heard: deltas.length, sent };
  }
  return { ok: true, latencySeconds, spreadSeconds, heard: deltas.length, sent };
}

/**
 * Each click paired with the first onset after it, and each onset used once.
 *
 * First-after rather than nearest, because an onset *before* its click is not
 * a late echo of that one — it is an early echo of nothing, or the previous
 * click's. Used once because the alternative lets a single loud noise satisfy
 * every trial and report a confident answer from one event, which is the same
 * mistake nearest-neighbour rhythm matching makes and which ADR 0009 rejects
 * for the same reason.
 */
function matchDeltas(
  trials: readonly CalibrationTrial[], onsets: readonly Onset[],
): number[] {
  const taken = new Set<number>();
  const deltas: number[] = [];
  // In time order, so an earlier click gets first claim on an onset they
  // could both reach.
  const ordered = [...trials].sort((a, b) => a.emittedAtSeconds - b.emittedAtSeconds);

  for (const trial of ordered) {
    for (let i = 0; i < onsets.length; i++) {
      if (taken.has(i)) continue;
      const delta = onsets[i].timeSeconds - trial.emittedAtSeconds;
      if (delta < 0) continue;
      if (delta > MATCH_WINDOW_SECONDS) break;
      taken.add(i);
      deltas.push(delta);
      break;
    }
  }
  return deltas;
}

function median(sorted: readonly number[]): number {
  return quantile(sorted, 0.5);
}

/** Linear interpolation between neighbours, on an already-sorted array. */
function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** What to tell the user, which is the only reason the failures are named. */
export const CALIBRATION_MESSAGES: Record<CalibrationFailure, string> = {
  'nothing-heard':
    'Nothing came back. Check the microphone is allowed and that the sound is '
    + 'playing out loud rather than through headphones.',
  'too-few':
    'Only some of the clicks came back. Try again somewhere quieter, or turn '
    + 'the volume up.',
  inconsistent:
    'The clicks came back at different delays, so there is no one number to '
    + 'use. Something else may be making noise nearby.',
  implausible:
    'That measured longer than any device takes, so it probably heard '
    + 'something else. Try again in a quieter room.',
};
