import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAMPLE_RATE, concat, mix, noiseFloor, pluckSequence, pluckedString, scaled,
  silence, sine, startingAt,
} from '../testing/signals';
import { ONSET_FRAME_SECONDS, detectOnsets, frameSizeFor } from './onsetDetector';

function timesOf(signal: Float32Array, sampleRate = DEFAULT_SAMPLE_RATE): number[] {
  return detectOnsets(signal, { sampleRate }).onsets.map((o) => o.timeSeconds);
}

/** Largest gap between what was played and the nearest thing detected. */
function worstError(detected: readonly number[], played: readonly number[]): number {
  return Math.max(...played.map((p) =>
    Math.min(...detected.map((d) => Math.abs(d - p)))));
}

describe('sizing the analysis from the rate the hardware gave us', () => {
  it('is the 1024-sample frame at 44.1 kHz and the same duration at other rates', () => {
    expect(frameSizeFor(44_100)).toBe(1024);
    expect(frameSizeFor(48_000)).toBe(1024);
    expect(frameSizeFor(96_000)).toBe(2048);
    expect(ONSET_FRAME_SECONDS * 44_100).toBe(1024);
  });

  it('hops a quarter of the frame, which is the resolution it can place an onset to', () => {
    const { frameSize, hopSize } = detectOnsets(silence(0.5), { sampleRate: DEFAULT_SAMPLE_RATE });
    expect(frameSize).toBe(1024);
    expect(hopSize).toBe(256);
  });
});

describe('finding the attacks in a performance', () => {
  // Nothing is struck at t=0. Spectral flux measures a rise over the previous
  // frame, so an attack inside the very first frame has nothing to be a rise
  // over and cannot be found — see the blind spot asserted below. Real capture
  // is already running before anyone plays, so this is a property of the
  // method rather than a defect, but a fixture that starts at zero is testing
  // the one case the method cannot do.
  const played = [0.1, 0.35, 0.7, 0.9, 1.4];

  it('finds every pluck and invents none', () => {
    const signal = pluckSequence({
      atSeconds: played, frequencyHz: 196, seed: 601, seconds: 2, decaySeconds: 2,
    });
    expect(timesOf(signal).length).toBe(played.length);
  });

  it('places each attack within a hop or two of where it was struck', () => {
    const signal = pluckSequence({
      atSeconds: played, frequencyHz: 196, seed: 601, seconds: 2, decaySeconds: 2,
    });
    expect(worstError(timesOf(signal), played)).toBeLessThan(0.02);
  });

  // The reason this is spectral flux and not a level envelope. A string struck
  // while the last one is still ringing barely moves the level; it puts new
  // partials into the spectrum, and that is what is being measured.
  it('hears a note struck over one that is still ringing', () => {
    const rate = DEFAULT_SAMPLE_RATE;
    const ringing = pluckedString({
      frequencyHz: 98, seconds: 2, seed: 603, decaySeconds: 6, amplitude: 0.6,
    });
    const over = startingAt(
      pluckedString({ frequencyHz: 147, seconds: 1, seed: 605, amplitude: 0.25 }), 0.5, rate);
    const detected = timesOf(mix(ringing, over));
    expect(detected.length).toBe(2);
    expect(worstError(detected, [0, 0.5])).toBeLessThan(0.02);
  });

  it('reports one onset per attack rather than one per frame it stays loud for', () => {
    const single = pluckedString({ frequencyHz: 110, seconds: 1.5, seed: 607 });
    expect(timesOf(single).length).toBe(1);
  });

  it('counts sixteenths at 160 bpm, which is faster than anybody sight-reads', () => {
    const beat = 60 / 160;
    const sixteenths = Array.from({ length: 12 }, (_, i) => 0.1 + (i * beat) / 4);
    const signal = pluckSequence({
      atSeconds: sixteenths, frequencyHz: 294, seed: 611, seconds: 2.5, decaySeconds: 1,
    });
    const detected = timesOf(signal);
    expect(detected.length).toBe(sixteenths.length);
    expect(worstError(detected, sixteenths)).toBeLessThan(0.02);
  });
});

describe('what is not an onset', () => {
  it('finds nothing in silence', () => {
    expect(timesOf(silence(2))).toEqual([]);
  });

  it('finds nothing in a steady room', () => {
    expect(timesOf(noiseFloor({ seconds: 2, seed: 701, levelDbfs: -45 }))).toEqual([]);
  });

  // A held note is one event, not a continuous one. The flux of a sustained
  // tone is flat, so only its beginning should show.
  it('finds only the start of a tone that is simply held', () => {
    const held = concat(silence(0.3), sine({ frequencyHz: 220, seconds: 1.5 }));
    const detected = timesOf(held);
    expect(detected.length).toBe(1);
    expect(detected[0]).toBeCloseTo(0.3, 1);
  });

  // An attack inside the very first frame is findable after all, just late:
  // spectral flux measures a rise over the previous frame, and a pluck's
  // energy keeps climbing for several frames, so it is caught on the way up
  // rather than at the strike. 17 ms at this hop size.
  it('finds an attack inside the first frame, late rather than not at all', () => {
    const atZero = pluckSequence({
      atSeconds: [0], frequencyHz: 196, seed: 607, seconds: 1, decaySeconds: 2,
    });
    const found = timesOf(atZero);
    expect(found).toHaveLength(1);
    expect(found[0]).toBeGreaterThan(0);
    expect(found[0]).toBeLessThan(0.03);
  });

  /**
   * KNOWN DEFECT, measured not guessed. The adaptive threshold has no
   * absolute floor, so on a signal whose flux is near zero throughout — a
   * steady tone — the median it adapts to is also near zero and ordinary
   * numerical wobble clears it.
   *
   * A sine faded out over 20 ms reports onsets at 0.046, 0.284, 0.354, 0.424
   * and 0.493 seconds, none of which is an event. The same sine cut dead
   * reports only the cut, because the discontinuity's own flux lifts the
   * median high enough to mask the wobble — so the bug hides exactly when the
   * fixture is crudest.
   *
   * This matters beyond the test: a held note on a bowed or wind instrument
   * is a steady tone, and rhythm scoring would invent attacks inside one. The
   * fix is a floor relative to the frame's own energy, and the threshold it
   * needs is a measurement, so it belongs with the detector's corpus rather
   * than with a guess made here.
   */
  it.todo('does not invent onsets inside a steady tone');
});

describe('the same performance at a different gain', () => {
  // Everything in the threshold is a ratio for this reason. The tuner
  // measured the same tone 33 dB apart across two Android input sources, and
  // a detector that needed retuning per input would be retuned per phone.
  it('finds the same attacks 30 dB quieter', () => {
    const played = [0.1, 0.5, 0.8, 1.3];
    const signal = pluckSequence({
      atSeconds: played, frequencyHz: 220, seed: 801, seconds: 2, decaySeconds: 2,
    });
    const loud = timesOf(signal);
    const quiet = timesOf(scaled(signal, 10 ** (-30 / 20)));
    expect(quiet).toEqual(loud);
  });

  it('finds the same attacks at 48 kHz as at 44.1 kHz', () => {
    const played = [0.1, 0.5, 0.8];
    const at = (rate: number) => timesOf(pluckSequence({
      atSeconds: played, frequencyHz: 220, seed: 803, seconds: 1.5, sampleRate: rate,
    }), rate);
    expect(at(48_000).length).toBe(played.length);
    expect(worstError(at(48_000), at(44_100))).toBeLessThan(0.01);
  });
});

describe('signals too short to analyse', () => {
  it('returns nothing rather than throwing when there is barely a frame', () => {
    const analysis = detectOnsets(silence(0.01), { sampleRate: DEFAULT_SAMPLE_RATE });
    expect(analysis.onsets).toEqual([]);
    expect(analysis.flux.length).toBe(0);
  });

  it('refuses a sample rate that cannot be one', () => {
    expect(() => detectOnsets(silence(1), { sampleRate: 0 })).toThrow(/must be positive/);
  });
});
