/**
 * Synthesised audio for the DSP tests.
 *
 * The sibling tuner's ADR 0008 is the reason this file leads with a plucked
 * string rather than a sine. Every defect that tuner ever had in pitch
 * tracking — a violin reading an octave high, a cello flicking up as it
 * decayed, an onset locking onto a partial nobody played, a gate that climbed
 * until the app went deaf — was invisible to a synthesised sine wave, because
 * a sine has no attack, no decay, no room, and a fundamental that never
 * weakens. A fixture that cannot fail is not a fixture.
 *
 * Karplus–Strong is not a real recording either, and this file does not
 * pretend otherwise: there is no room, no body resonance and no second note.
 * What it does have is the three things a sine lacks. There is a pick
 * transient that is genuinely aperiodic; the loop's lowpass damps the high
 * partials far faster than the low ones, so the fundamental outlives its
 * harmonics and the timbre changes through the note; and the whole thing
 * decays. That is enough to exercise the paths a sine walks straight past.
 *
 * Nothing here reads entropy or a clock. Every randomised signal takes a seed
 * and spends it through `makeRng`, so a failure reproduces exactly — the same
 * bargain ADR 0002 strikes for the generator, for the same reason.
 */

import { makeRng, type Rng } from '../../theory/rng';

/** Where no caller says otherwise. Not a measurement; just a round number. */
export const DEFAULT_SAMPLE_RATE = 44_100;

export interface ToneSpec {
  frequencyHz: number;
  seconds: number;
  sampleRate?: number;
  /** Peak amplitude after normalisation, in [0, 1]. */
  amplitude?: number;
}

export interface PluckSpec extends ToneSpec {
  /** Spends this seed on the excitation burst. Same seed, same pluck. */
  seed: number;
  /**
   * Nominal time to fall 60 dB. The loop's own lowpass takes more off the top
   * than this accounts for, so a high note dies sooner than a low one at the
   * same setting — which is what a real string does.
   */
  decaySeconds?: number;
  /**
   * 1 is a hard plectrum (full-bandwidth burst), towards 0 a thumb (the burst
   * is lowpassed before it enters the loop). It changes which partials are
   * present at the attack, which is the part of a pluck a detector trips over.
   */
  brightness?: number;
  /**
   * How many two-point averages the loop closes through. Each takes more off
   * a high partial than a low one, so this is the knob that decides how fast
   * the note goes from bright to dull. One — textbook Karplus–Strong — barely
   * damps anything at a bass pitch, because the filter runs once per period
   * and a period is four hundred samples down there.
   */
  damping?: number;
  /**
   * Amplitude of the pick transient, relative to the string's. This is the
   * part of a pluck that is not periodic at all, and the tuner's ADR 0002
   * records what it costs to ignore: the attack is pick noise, louder than
   * the note it introduces, and one frame of it was enough to display a note
   * nobody had played.
   */
  pickNoise?: number;
}

function samplesFor(seconds: number, sampleRate: number): number {
  return Math.max(0, Math.round(seconds * sampleRate));
}

/**
 * A plucked string, by Karplus–Strong with a fractionally tuned delay line.
 *
 * The loop is a delay line of `sampleRate / frequencyHz` samples closed
 * through a cascade of two-point averaging filters. Plain Karplus–Strong can
 * only tune in whole samples, which at A4 and 44.1 kHz misses by about five
 * cents — enough for a detector test to be asserting against the wrong answer
 * rather than against the detector. So the delay is read with linear
 * interpolation between two taps, and the half-sample each averaging stage
 * contributes is subtracted from the delay the line has to supply.
 *
 * The cascade is what makes the damping audible. One averaging stage is the
 * textbook form and is far too gentle at a bass pitch: its per-trip gain is
 * `cos(π·f/rate)`, and with four hundred samples to a period the eighth
 * partial of a low A loses a fifth of a decibel a second. Stacking stages
 * multiplies that while keeping the filter linear-phase, so the string gets
 * duller as it rings without the pitch moving.
 */
export function pluckedString(spec: PluckSpec): Float32Array {
  const sampleRate = spec.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const amplitude = spec.amplitude ?? 0.5;
  const brightness = spec.brightness ?? 1;
  const decaySeconds = spec.decaySeconds ?? 2.5;
  const stages = Math.max(1, Math.round(spec.damping ?? 4));
  const total = samplesFor(spec.seconds, sampleRate);

  const loopDelay = sampleRate / spec.frequencyHz - stages / 2;
  if (loopDelay < 2) {
    throw new Error(`${spec.frequencyHz} Hz is too high to pluck at ${sampleRate} Hz`);
  }
  const wholeDelay = Math.floor(loopDelay);
  const fraction = loopDelay - wholeDelay;
  const length = wholeDelay + 2;

  // One round trip of the loop is one period, so 60 dB over `decaySeconds`
  // is 60 dB over `frequencyHz · decaySeconds` trips. Capped below 1 because
  // a loop at unity gain never stops. The averaging stages take their own cut
  // on top of this, so a bright high note dies sooner than the figure says —
  // as a real string does.
  const loopGain = Math.min(0.99999, 1e-3 ** (1 / (spec.frequencyHz * decaySeconds)));

  const rng = makeRng(spec.seed);
  const history = new Float64Array(length);
  let smoothed = 0;
  for (let i = 0; i < length; i++) {
    smoothed = brightness * (rng.next() * 2 - 1) + (1 - brightness) * smoothed;
    history[i] = smoothed;
  }

  const string = new Float64Array(total);
  const previous = new Float64Array(stages);
  let write = 0;
  let peak = 0;
  for (let n = 0; n < total; n++) {
    const near = history[(write - wholeDelay + length) % length];
    const far = history[(write - wholeDelay - 1 + length) % length];
    let value = near * (1 - fraction) + far * fraction;
    for (let s = 0; s < stages; s++) {
      const averaged = 0.5 * (value + previous[s]);
      previous[s] = value;
      value = averaged;
    }
    value *= loopGain;
    history[write] = value;
    write = (write + 1) % length;
    string[n] = value;
    if (Math.abs(value) > peak) peak = Math.abs(value);
  }

  const out = new Float32Array(total);
  const gain = peak > 0 ? amplitude / peak : 0;
  for (let n = 0; n < total; n++) out[n] = string[n] * gain;

  // The pick itself: a few milliseconds of noise that never enters the loop,
  // so it is the one part of the signal with no period at all. `amplitude`
  // describes the string, and the transient is allowed to stand above it,
  // because on a real instrument it does.
  const pickNoise = spec.pickNoise ?? 0.6;
  if (pickNoise > 0) {
    const transient = Math.min(total, Math.round(0.006 * sampleRate));
    const decay = transient / 3;
    for (let n = 0; n < transient; n++) {
      out[n] += (rng.next() * 2 - 1) * pickNoise * amplitude * Math.exp(-n / decay);
    }
  }
  return out;
}

/** A pure tone. Useful for proving a transform, useless for proving a detector. */
export function sine(spec: ToneSpec & { phase?: number }): Float32Array {
  const sampleRate = spec.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const amplitude = spec.amplitude ?? 0.5;
  const phase = spec.phase ?? 0;
  const out = new Float32Array(samplesFor(spec.seconds, sampleRate));
  const step = (2 * Math.PI * spec.frequencyHz) / sampleRate;
  for (let n = 0; n < out.length; n++) out[n] = amplitude * Math.sin(step * n + phase);
  return out;
}

/**
 * A sawtooth, summed from its harmonics up to Nyquist rather than taken from
 * a ramp.
 *
 * A naive ramp folds everything above Nyquist back down as inharmonic
 * rubbish, and a pitch detector handed one is being tested against aliasing
 * rather than against a sawtooth. Summing the harmonics costs more and is the
 * signal the name promises.
 */
export function sawtooth(spec: ToneSpec): Float32Array {
  const sampleRate = spec.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const amplitude = spec.amplitude ?? 0.5;
  const out = new Float32Array(samplesFor(spec.seconds, sampleRate));
  const harmonics = Math.max(1, Math.floor(sampleRate / 2 / spec.frequencyHz));
  let peak = 0;
  for (let n = 0; n < out.length; n++) {
    let value = 0;
    for (let k = 1; k <= harmonics; k++) {
      value += Math.sin((2 * Math.PI * k * spec.frequencyHz * n) / sampleRate) / k;
    }
    out[n] = value;
    if (Math.abs(value) > peak) peak = Math.abs(value);
  }
  if (peak > 0) for (let n = 0; n < out.length; n++) out[n] *= amplitude / peak;
  return out;
}

/**
 * Room tone at a stated level.
 *
 * Levels are given in dBFS RMS because that is the unit every gate in the
 * chain is written in, and because the tuner's ADR 0002 records the thing
 * that makes it matter: the same tone through two Android input sources
 * measured 33 dB apart, so a fixture that specifies a level in linear
 * amplitude is specifying nothing a threshold can be reasoned about.
 */
export function noiseFloor(spec: {
  seconds: number;
  seed: number;
  sampleRate?: number;
  levelDbfs?: number;
}): Float32Array {
  const sampleRate = spec.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const targetRms = 10 ** ((spec.levelDbfs ?? -60) / 20);
  const rng = makeRng(spec.seed);
  const out = new Float32Array(samplesFor(spec.seconds, sampleRate));
  for (let n = 0; n < out.length; n++) out[n] = rng.next() * 2 - 1;
  // Scale by what the burst actually measured rather than by the uniform
  // distribution's nominal 1/sqrt(3): a short burst does not reach its own
  // expectation, and the fixture's level should be the level it has.
  const actual = rms(out);
  if (actual > 0) for (let n = 0; n < out.length; n++) out[n] *= targetRms / actual;
  return out;
}

export function silence(seconds: number, sampleRate = DEFAULT_SAMPLE_RATE): Float32Array {
  return new Float32Array(samplesFor(seconds, sampleRate));
}

/** The same signal, delayed by a lead-in of silence. */
export function startingAt(
  signal: Float32Array,
  startSeconds: number,
  sampleRate = DEFAULT_SAMPLE_RATE,
): Float32Array {
  const offset = samplesFor(startSeconds, sampleRate);
  const out = new Float32Array(offset + signal.length);
  out.set(signal, offset);
  return out;
}

/**
 * A raised-cosine fade in, out, or both.
 *
 * A tone that simply stops mid-cycle is not a note ending, it is an edit: the
 * truncation splatters energy across the whole spectrum, and anything looking
 * for a change in the spectrum will find one. Real playing has a release, and
 * a fixture that does not have one tests the detector against an artefact.
 */
export function faded(
  signal: Float32Array,
  spec: { inSeconds?: number; outSeconds?: number; sampleRate?: number } = {},
): Float32Array {
  const sampleRate = spec.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const rise = Math.min(signal.length, samplesFor(spec.inSeconds ?? 0, sampleRate));
  const fall = Math.min(signal.length - rise, samplesFor(spec.outSeconds ?? 0, sampleRate));
  const out = Float32Array.from(signal);
  for (let n = 0; n < rise; n++) out[n] *= 0.5 * (1 - Math.cos((Math.PI * n) / rise));
  for (let n = 0; n < fall; n++) {
    out[out.length - 1 - n] *= 0.5 * (1 - Math.cos((Math.PI * n) / fall));
  }
  return out;
}

export function scaled(signal: Float32Array, gain: number): Float32Array {
  const out = new Float32Array(signal.length);
  for (let n = 0; n < signal.length; n++) out[n] = signal[n] * gain;
  return out;
}

/**
 * Sums any number of signals, padding the shorter ones with silence.
 *
 * Deliberately does not clip or normalise. A fixture that quietly rescales
 * itself when two notes overlap would change the level a gate sees without
 * the test saying so, and levels are what half the chain is thresholded on.
 */
export function mix(...signals: readonly Float32Array[]): Float32Array {
  const length = signals.reduce((longest, s) => Math.max(longest, s.length), 0);
  const out = new Float32Array(length);
  for (const signal of signals) {
    for (let n = 0; n < signal.length; n++) out[n] += signal[n];
  }
  return out;
}

/** One signal after another, in order. */
export function concat(...signals: readonly Float32Array[]): Float32Array {
  const length = signals.reduce((total, s) => total + s.length, 0);
  const out = new Float32Array(length);
  let at = 0;
  for (const signal of signals) {
    out.set(signal, at);
    at += signal.length;
  }
  return out;
}

/**
 * Plucks of one pitch at given times, mixed into one signal.
 *
 * The onset and alignment tests need a performance rather than a note, and
 * they need the notes to overlap the way plucks on a real instrument do —
 * a string is still ringing when the next one is struck, which is what makes
 * spectral flux a harder problem than a level gate.
 */
export function pluckSequence(spec: {
  atSeconds: readonly number[];
  frequencyHz: number;
  seed: number;
  seconds: number;
  sampleRate?: number;
  amplitude?: number;
  decaySeconds?: number;
}): Float32Array {
  const sampleRate = spec.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const total = samplesFor(spec.seconds, sampleRate);
  const out = new Float32Array(total);
  spec.atSeconds.forEach((start, index) => {
    // A different seed per pluck, derived from the sequence's one seed, so
    // two notes in a row are not bit-identical and the whole thing still
    // reproduces from a single number.
    const note = pluckedString({
      frequencyHz: spec.frequencyHz,
      seconds: spec.seconds - start,
      sampleRate,
      amplitude: spec.amplitude,
      decaySeconds: spec.decaySeconds,
      seed: (spec.seed + index * 0x9e3779b1) >>> 0,
    });
    const offset = samplesFor(start, sampleRate);
    for (let n = 0; n < note.length && offset + n < total; n++) out[offset + n] += note[n];
  });
  return out;
}

export function rms(signal: Float32Array): number {
  let energy = 0;
  for (let n = 0; n < signal.length; n++) energy += signal[n] * signal[n];
  return signal.length === 0 ? 0 : Math.sqrt(energy / signal.length);
}

/** Level in dBFS, floored where the tuner's detector floors it. */
export function levelDbfs(signal: Float32Array): number {
  const level = rms(signal);
  return level <= 1e-9 ? -120 : 20 * Math.log10(level);
}

/** Exposed so a test can spend a seed of its own without reaching into theory/. */
export function seeded(seed: number): Rng {
  return makeRng(seed);
}
