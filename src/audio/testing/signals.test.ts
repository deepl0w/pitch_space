import { describe, expect, it } from 'vitest';
import { Fft, hannWindow } from '../dsp/fft';
import {
  DEFAULT_SAMPLE_RATE, concat, levelDbfs, mix, noiseFloor, pluckSequence, pluckedString, rms,
  sawtooth, scaled, silence, sine, startingAt,
} from './signals';

/**
 * Period of a signal, measured by plain autocorrelation over many periods at
 * once.
 *
 * Deliberately not YIN: a fixture checked with the detector it exists to test
 * proves only that the two agree. Correlating at a lag of roughly fifty
 * periods and dividing the refined peak by fifty puts the interpolation error
 * fifty times further from the answer, which is what makes this precise
 * enough to catch the five-cent mistuning that whole-sample Karplus–Strong
 * would have.
 */
function measuredFrequency(
  signal: Float32Array,
  nominalHz: number,
  sampleRate = DEFAULT_SAMPLE_RATE,
): number {
  const period = sampleRate / nominalHz;
  const periods = Math.max(4, Math.floor(0.1 * sampleRate / period));
  const centre = Math.round(period * periods);
  const from = Math.round(0.05 * sampleRate);
  const span = Math.floor(sampleRate * 0.25);
  if (from + span + centre + period > signal.length) {
    throw new Error('signal is too short to measure');
  }

  let mean = 0;
  for (let i = from; i < from + span + centre + period; i++) mean += signal[i];
  mean /= span + centre + period;

  const correlate = (lag: number): number => {
    let sum = 0;
    for (let i = 0; i < span; i++) {
      sum += (signal[from + i] - mean) * (signal[from + i + lag] - mean);
    }
    return sum;
  };

  const radius = Math.max(2, Math.round(period / 4));
  let best = centre;
  let bestValue = -Infinity;
  for (let lag = centre - radius; lag <= centre + radius; lag++) {
    const value = correlate(lag);
    if (value > bestValue) { bestValue = value; best = lag; }
  }
  const left = correlate(best - 1);
  const right = correlate(best + 1);
  const denominator = 2 * (2 * bestValue - left - right);
  const refined = denominator === 0 ? best : best + (right - left) / denominator;
  return (sampleRate * periods) / refined;
}

function cents(measured: number, nominal: number): number {
  return 1200 * Math.log2(measured / nominal);
}

/** Energy in the bins nearest a frequency, from a Hann-windowed frame. */
function energyAt(
  signal: Float32Array,
  offsetSamples: number,
  frequencyHz: number,
  size = 8192,
  sampleRate = DEFAULT_SAMPLE_RATE,
): number {
  const window = hannWindow(size);
  const frame = new Float64Array(size);
  for (let i = 0; i < size; i++) frame[i] = (signal[offsetSamples + i] ?? 0) * window[i];
  const mags = new Fft(size).magnitudes(frame);
  const bin = Math.round((frequencyHz * size) / sampleRate);
  let total = 0;
  for (let k = Math.max(0, bin - 2); k <= Math.min(mags.length - 1, bin + 2); k++) {
    total += mags[k] * mags[k];
  }
  return total;
}

/** Where the spectrum's weight sits, in Hz. Falls as a string goes dull. */
function spectralCentroid(
  signal: Float32Array,
  offsetSamples: number,
  size = 8192,
  sampleRate = DEFAULT_SAMPLE_RATE,
): number {
  const window = hannWindow(size);
  const frame = new Float64Array(size);
  for (let i = 0; i < size; i++) frame[i] = (signal[offsetSamples + i] ?? 0) * window[i];
  const mags = new Fft(size).magnitudes(frame);
  let weighted = 0;
  let total = 0;
  for (let k = 1; k < mags.length; k++) {
    weighted += ((k * sampleRate) / size) * mags[k];
    total += mags[k];
  }
  return total === 0 ? 0 : weighted / total;
}

/** How well one period of the signal predicts the next, in [-1, 1]. */
function periodicity(signal: Float32Array, offsetSamples: number, period: number): number {
  const span = Math.round(period);
  let cross = 0;
  let first = 0;
  let second = 0;
  for (let i = 0; i < span; i++) {
    const a = signal[offsetSamples + i];
    const b = signal[offsetSamples + i + span];
    cross += a * b;
    first += a * a;
    second += b * b;
  }
  return cross / Math.sqrt(first * second);
}

describe('a plucked string', () => {
  const A2 = 110;

  it('sounds at the pitch it was asked for, not at the nearest whole-sample delay', () => {
    // 110 Hz at 44.1 kHz wants a 400.9-sample loop. A whole-sample delay line
    // would round that and land about four cents out, which is the error this
    // fixture must not hand to a detector test as if it were the truth.
    for (const hz of [82.41, 110, 146.83, 220, 329.63, 440]) {
      const note = pluckedString({ frequencyHz: hz, seconds: 1, seed: 7 });
      expect(Math.abs(cents(measuredFrequency(note, hz), hz)), `${hz} Hz`).toBeLessThan(3);
    }
  });

  it('decays, so a frame late in the note is quieter than a frame at the start', () => {
    const note = pluckedString({ frequencyHz: A2, seconds: 2, seed: 11, decaySeconds: 1 });
    const tenth = Math.floor(note.length / 10);
    const head = rms(note.subarray(0, tenth));
    const tail = rms(note.subarray(note.length - tenth));
    expect(levelDbfs(note.subarray(0, tenth)) - levelDbfs(note.subarray(note.length - tenth)))
      .toBeGreaterThan(20);
    expect(tail).toBeLessThan(head);
  });

  // The property a sum of sines cannot have, and the one the tuner's ADR 0008
  // says every real defect lived in: the timbre changes through the note, so
  // the fundamental outlives its partials and a detector that leans on
  // spectral energy reads the wrong octave as the note dies.
  it('loses its upper partials faster than its fundamental', () => {
    const note = pluckedString({ frequencyHz: A2, seconds: 3, seed: 13, decaySeconds: 3 });
    const relative = (offset: number, harmonic: number) =>
      energyAt(note, offset, A2 * harmonic) / energyAt(note, offset, A2);
    const late = Math.floor(1.8 * DEFAULT_SAMPLE_RATE);
    expect(relative(late, 8)).toBeLessThan(relative(2000, 8) / 4);
    expect(relative(late, 2)).toBeGreaterThan(relative(2000, 2) / 2);
  });

  it('gets duller as it rings, which is the whole point of not using a sine', () => {
    const note = pluckedString({ frequencyHz: A2, seconds: 3, seed: 13, decaySeconds: 3 });
    const early = spectralCentroid(note, 2000);
    const late = spectralCentroid(note, Math.floor(1.8 * DEFAULT_SAMPLE_RATE));
    expect(late).toBeLessThan(early / 2);
  });

  // An attack is the other thing a sine has not got. The pick transient never
  // enters the loop, so unlike everything after it, it does not repeat: the
  // first period of the signal does not predict the second.
  it('begins with something aperiodic before it settles into a period', () => {
    const period = DEFAULT_SAMPLE_RATE / A2;
    const note = pluckedString({ frequencyHz: A2, seconds: 1, seed: 17 });
    const bare = pluckedString({ frequencyHz: A2, seconds: 1, seed: 17, pickNoise: 0 });
    expect(periodicity(note, 0, period)).toBeLessThan(0.95);
    // The pick is what does it, not the loop settling: without the transient
    // the first period already predicts the second nearly perfectly.
    expect(periodicity(note, 0, period)).toBeLessThan(periodicity(bare, 0, period));
    expect(periodicity(note, 20000, period)).toBeGreaterThan(0.999);
  });

  it('plucks the same way twice from the same seed and differently from another', () => {
    const spec = { frequencyHz: A2, seconds: 0.2, seed: 5 };
    expect([...pluckedString(spec)]).toEqual([...pluckedString(spec)]);
    expect([...pluckedString(spec)]).not.toEqual([...pluckedString({ ...spec, seed: 6 })]);
  });

  it('peaks at the amplitude it was given', () => {
    const note = pluckedString({ frequencyHz: A2, seconds: 0.5, seed: 3, amplitude: 0.25 });
    let peak = 0;
    for (const v of note) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeCloseTo(0.25, 6);
  });

  it('refuses a pitch whose period is shorter than the loop can represent', () => {
    expect(() => pluckedString({ frequencyHz: 20000, seconds: 0.1, seed: 1, sampleRate: 44100 }))
      .toThrow(/too high to pluck/);
  });
});

describe('the simple waveforms', () => {
  it('puts a sine on one bin and nothing else', () => {
    const size = 2048;
    const bin = 64;
    const tone = sine({ frequencyHz: (bin * DEFAULT_SAMPLE_RATE) / size, seconds: 0.1 });
    const mags = new Fft(size).magnitudes(tone.subarray(0, size));
    for (let k = 0; k < mags.length; k++) {
      if (Math.abs(k - bin) > 1) expect(mags[k]).toBeLessThan(mags[bin] / 50);
    }
  });

  it('gives a sawtooth every harmonic at one over its number, and none above Nyquist', () => {
    const size = 8192;
    const f = DEFAULT_SAMPLE_RATE / size * 50; // exactly on a bin, so nothing leaks
    const saw = sawtooth({ frequencyHz: f, seconds: 0.3 });
    const mags = new Fft(size).magnitudes(saw.subarray(0, size));
    const first = mags[50];
    for (const k of [2, 3, 4, 5, 8]) {
      expect(mags[50 * k] / first).toBeCloseTo(1 / k, 2);
    }
    // Aliasing would show as energy between the harmonics; a band-limited sum
    // leaves those bins empty.
    for (const k of [75, 125, 175]) expect(mags[k]).toBeLessThan(first / 1000);
  });

  it('lays down a noise floor at the level it was asked for', () => {
    for (const target of [-80, -60, -40]) {
      const floor = noiseFloor({ seconds: 0.5, seed: 21, levelDbfs: target });
      expect(levelDbfs(floor)).toBeCloseTo(target, 6);
    }
  });

  it('reports digital silence as the floor rather than as minus infinity', () => {
    expect(levelDbfs(silence(0.1))).toBe(-120);
    expect(rms(silence(0.1))).toBe(0);
  });
});

describe('putting signals together', () => {
  it('mixes to the longest signal and sums where they overlap', () => {
    const a = Float32Array.from([1, 1, 1]);
    const b = Float32Array.from([2, 2]);
    expect([...mix(a, b)]).toEqual([3, 3, 1]);
  });

  it('delays a signal by padding it with silence rather than by trimming it', () => {
    const delayed = startingAt(Float32Array.from([1, 1]), 1, 4);
    expect([...delayed]).toEqual([0, 0, 0, 0, 1, 1]);
  });

  it('joins signals end to end and scales one without touching the original', () => {
    const a = Float32Array.from([1, 2]);
    expect([...concat(a, Float32Array.from([3]))]).toEqual([1, 2, 3]);
    expect([...scaled(a, 0.5)]).toEqual([0.5, 1]);
    expect([...a]).toEqual([1, 2]);
  });

  it('lets a pluck still be ringing when the next one lands', () => {
    const rate = DEFAULT_SAMPLE_RATE;
    const played = pluckSequence({
      atSeconds: [0, 0.3, 0.6], frequencyHz: 196, seed: 31, seconds: 1.2, decaySeconds: 2,
    });
    expect(played.length).toBe(Math.round(1.2 * rate));
    // Energy just before the second pluck is the first one's tail, not silence.
    const justBefore = rms(played.subarray(Math.round(0.28 * rate), Math.round(0.3 * rate)));
    expect(justBefore).toBeGreaterThan(0.01);
    // Each attack is louder than the moment before it, which is what gives an
    // onset detector something to find.
    for (const at of [0.3, 0.6]) {
      const before = rms(played.subarray(Math.round((at - 0.02) * rate), Math.round(at * rate)));
      const after = rms(played.subarray(Math.round(at * rate), Math.round((at + 0.02) * rate)));
      expect(after).toBeGreaterThan(before);
    }
  });
});
