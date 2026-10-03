import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAMPLE_RATE, concat, faded, mix, noiseFloor, pluckSequence, pluckedString,
  sawtooth, scaled, silence, sine, startingAt,
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
    const ringing = startingAt(pluckedString({
      frequencyHz: 98, seconds: 2, seed: 603, decaySeconds: 6, amplitude: 0.6,
    }), 0.2, rate);
    const over = startingAt(
      pluckedString({ frequencyHz: 147, seconds: 1, seed: 605, amplitude: 0.25 }), 0.7, rate);
    const detected = timesOf(mix(ringing, over));
    expect(detected.length).toBe(2);
    expect(worstError(detected, [0.2, 0.7])).toBeLessThan(0.02);
  });

  it('reports one onset per attack rather than one per frame it stays loud for', () => {
    const single = startingAt(pluckedString({ frequencyHz: 110, seconds: 1.5, seed: 607 }), 0.2);
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

  /**
   * The blind spot, pinned at its boundary rather than described.
   *
   * Spectral flux measures a rise over the previous frame, so an attack
   * inside the very first frame has nothing to be a rise over. It used to be
   * reported anyway — the flux curve of a note already sounding wobbles, and
   * before the spectral floor landed that wobble cleared the threshold. The
   * reported time was then the first wobble, which happened to be early, not
   * the strike.
   *
   * The same pluck a fifth of a second later is found exactly, which is what
   * makes this a boundary and not an outage. Real capture is running before
   * anyone plays, so the case the detector cannot do is one the app does not
   * produce.
   */
  it('cannot find an attack that fell before the first frame, and says so by silence', () => {
    const atZero = pluckSequence({
      atSeconds: [0], frequencyHz: 196, seed: 607, seconds: 1, decaySeconds: 2,
    });
    expect(timesOf(atZero)).toEqual([]);

    const leadIn = pluckSequence({
      atSeconds: [0.2], frequencyHz: 196, seed: 607, seconds: 1.2, decaySeconds: 2,
    });
    const found = timesOf(leadIn);
    expect(found).toHaveLength(1);
    expect(worstError(found, [0.2])).toBeLessThan(0.02);
  });

  /**
   * Was a known defect. The adaptive threshold was made entirely out of the
   * flux curve — a local median and the whole signal's average — so on a
   * signal whose flux is near zero throughout, the yardstick was near zero
   * too and ordinary numerical wobble cleared it. A held 220 Hz sine reported
   * eighteen onsets about 52 ms apart.
   *
   * The fixture has to be a tone with no event in it at all. The obvious
   * fixture — a tone that starts after some silence — hides the bug rather
   * than showing it, because the start's own flux lifts the average term high
   * enough to mask the wobble behind it; `finds only the start of a tone that
   * is simply held` above was green throughout. The crudest fixture looked
   * the healthiest, which is why these begin partway into a note.
   *
   * It matters beyond the test: a held note on a bowed or wind instrument is
   * a steady tone, and rhythm scoring would have invented attacks inside one.
   */
  it('invents nothing inside a tone that is simply sounding', () => {
    expect(timesOf(sine({ frequencyHz: 220, seconds: 1 }))).toEqual([]);
    expect(timesOf(sine({ frequencyHz: 440, seconds: 1 }))).toEqual([]);
    expect(timesOf(sawtooth({ frequencyHz: 196, seconds: 1 }))).toEqual([]);
  });

  it('invents nothing when that tone is released rather than cut', () => {
    const released = faded(sine({ frequencyHz: 220, seconds: 1 }), { outSeconds: 0.02 });
    expect(timesOf(released)).toEqual([]);
  });

  // The floor is a ratio for the same reason every other term is. Were it an
  // absolute level it would hold at one input gain and either go deaf or go
  // mad at the next, which is the failure the tuner's ADR 0002 records.
  it('invents nothing inside a steady tone 30 dB quieter either', () => {
    const quiet = scaled(sine({ frequencyHz: 220, seconds: 1 }), 10 ** (-30 / 20));
    expect(timesOf(quiet)).toEqual([]);
  });

  // Which term is doing the work, asked of the detector rather than asserted
  // in a comment. Turning the spectral floor off is the detector as it was,
  // and it reported eighteen onsets in this tone. If a later tuning pass makes
  // this pass with the floor off, the floor has stopped being the thing that
  // fixed it and the two can be reasoned about separately again.
  it('is the spectral floor and not the other two terms that silences it', () => {
    const held = sine({ frequencyHz: 220, seconds: 1 });
    const unfloored = detectOnsets(held, {
      sampleRate: DEFAULT_SAMPLE_RATE, spectralFloor: 0,
    });
    expect(unfloored.onsets.length).toBeGreaterThan(0);
  });
});

/**
 * The other half of the trade. A floor that silences a held tone can just as
 * easily silence a soft attack, and that failure is the harder one to notice
 * — a missing onset reads as the player having not played, which is a thing
 * players do.
 */
describe('what the floor must not cost', () => {
  it('still hears a pluck a fifth of the amplitude of the room it sits in', () => {
    const room = noiseFloor({ seconds: 2, seed: 901, levelDbfs: -60 });
    const faint = startingAt(
      pluckedString({ frequencyHz: 220, seconds: 1.4, seed: 903, amplitude: 0.005 }), 0.5);
    const detected = timesOf(mix(room, faint));
    expect(detected).toHaveLength(1);
    expect(worstError(detected, [0.5])).toBeLessThan(0.02);
  });

  // A bowed or blown note has no strike, only a crescendo. 100 ms of one is
  // still an event and still has to be found.
  it('still hears a note that fades in over 100 ms rather than being struck', () => {
    const bowed = concat(
      silence(0.3), faded(sine({ frequencyHz: 220, seconds: 0.8 }), {
        inSeconds: 0.1, outSeconds: 0.05,
      }),
      silence(0.1), faded(sine({ frequencyHz: 294, seconds: 0.8 }), {
        inSeconds: 0.1, outSeconds: 0.05,
      }));
    expect(timesOf(bowed)).toHaveLength(2);
  });
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
