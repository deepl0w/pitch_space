import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAMPLE_RATE, mix, noiseFloor, pluckedString, sawtooth, silence, sine,
} from '../testing/signals';
import { LOWEST_NOTE_HZ, PitchDetector, frameSizeFor } from './pitchDetector';

function cents(measured: number, nominal: number): number {
  return 1200 * Math.log2(measured / nominal);
}

/** One frame out of a signal, taken past the attack unless told otherwise. */
function frameOf(
  detector: PitchDetector,
  signal: Float32Array,
  atSeconds = 0.2,
  sampleRate = DEFAULT_SAMPLE_RATE,
): Float32Array {
  const from = Math.round(atSeconds * sampleRate);
  return signal.subarray(from, from + detector.frameSize);
}

describe('sizing a frame from the rate the hardware gave us', () => {
  // Android opens the microphone at 44.1 kHz; a browser hands over whatever
  // its hardware runs at and will not be argued with. The frame is therefore
  // derived rather than stored, and this is the derivation agreeing with the
  // tuner's measured 8192 at the rate the tuner measured it on.
  it('reproduces the tuner s 8192 at 44.1 kHz and follows the rate upwards', () => {
    expect(frameSizeFor(44_100)).toBe(8192);
    expect(frameSizeFor(48_000)).toBe(8192);
    expect(frameSizeFor(96_000)).toBe(16_384);
    expect(frameSizeFor(22_050)).toBe(4096);
  });

  it('always holds at least four periods of the lowest note, at any rate', () => {
    for (const rate of [16_000, 22_050, 32_000, 44_100, 48_000, 88_200, 96_000]) {
      const size = frameSizeFor(rate);
      expect(size & (size - 1), `${rate} Hz gave ${size}`).toBe(0);
      expect(size).toBeGreaterThanOrEqual((4 * rate) / LOWEST_NOTE_HZ);
    }
  });

  it('sizes itself for the search floor when one is given, not for B0', () => {
    expect(frameSizeFor(44_100, 80)).toBe(4096);
  });
});

describe('finding the pitch of a plucked string', () => {
  const detector = new PitchDetector({ sampleRate: DEFAULT_SAMPLE_RATE });

  it('reads a guitar s open strings to within a few cents of where they were plucked', () => {
    // E2 A2 D3 G3 B3 E4 — the whole point of synthesising a pluck rather than
    // a sine is that these have a real attack and a real decay.
    for (const hz of [82.41, 110, 146.83, 196, 246.94, 329.63]) {
      const note = pluckedString({ frequencyHz: hz, seconds: 1, seed: 101 });
      const estimate = detector.analyse(frameOf(detector, note));
      expect(estimate.frequencyHz, `${hz} Hz went missing`).not.toBeNull();
      expect(Math.abs(cents(estimate.frequencyHz as number, hz)), `${hz} Hz`).toBeLessThan(5);
      expect(estimate.clarity).toBeGreaterThan(0.8);
    }
  });

  // The bottom of the range is what the 8192-sample frame is bought for. A
  // 4096 frame holds 1.4 periods of B0 and the tuner found YIN undependable
  // down there (its ADR 0004), so this is the test that would notice the
  // frame quietly shrinking.
  it('reaches B0, which is the note the frame size was chosen for', () => {
    const note = pluckedString({
      frequencyHz: LOWEST_NOTE_HZ, seconds: 1.5, seed: 103, decaySeconds: 4, damping: 1,
    });
    const estimate = detector.analyse(frameOf(detector, note, 0.3));
    expect(estimate.frequencyHz).not.toBeNull();
    expect(Math.abs(cents(estimate.frequencyHz as number, LOWEST_NOTE_HZ))).toBeLessThan(10);
  });

  it('still finds the note through a room 15 dB below it', () => {
    const note = pluckedString({ frequencyHz: 196, seconds: 1, seed: 107, amplitude: 0.3 });
    const dirty = mix(note, noiseFloor({ seconds: 1, seed: 109, levelDbfs: -50 }));
    const frame = frameOf(detector, dirty);
    // The note has decayed to about −35 dBFS by the time this frame is taken,
    // so the signal-to-noise ratio here is around 15 dB, not 50.
    const estimate = detector.analyse(frame);
    expect(estimate.frequencyHz).not.toBeNull();
    expect(Math.abs(cents(estimate.frequencyHz as number, 196))).toBeLessThan(10);
    expect(estimate.clarity).toBeGreaterThan(0.9);
  });

  // The limit measured rather than hoped for: at about 5 dB the detector stops
  // finding it. What matters is which way it fails — a wrong frequency with a
  // confident clarity would be displayed to the player as a note they did not
  // play, whereas null is something the gate above can simply not show.
  it('gives up rather than guessing once the room is as loud as the note', () => {
    const note = pluckedString({ frequencyHz: 196, seconds: 1, seed: 107, amplitude: 0.3 });
    const buried = mix(note, noiseFloor({ seconds: 1, seed: 109, levelDbfs: -30 }));
    const estimate = detector.analyse(frameOf(detector, buried));
    if (estimate.frequencyHz !== null) {
      expect(estimate.clarity).toBeLessThan(0.8);
    }
  });

  it('reads a sawtooth, where every harmonic is present and the fundamental is strongest', () => {
    const saw = sawtooth({ frequencyHz: 220, seconds: 0.5 });
    const estimate = detector.analyse(frameOf(detector, saw, 0.1));
    expect(Math.abs(cents(estimate.frequencyHz as number, 220))).toBeLessThan(1);
    expect(estimate.clarity).toBeGreaterThan(0.95);
  });
});

describe('the octave the fundamental is not in', () => {
  const detector = new PitchDetector({ sampleRate: DEFAULT_SAMPLE_RATE });

  /**
   * The defect the correction exists for, in its purest form: harmonics two
   * through eight and no fundamental at all. A spectral peak picker reads the
   * octave above; the tuner measured a violin G♯3 doing exactly this with a
   * fundamental at 0.064 of its second partial.
   */
  it('reports the fundamental of a tone that does not contain one', () => {
    const f0 = 196;
    const partials = [2, 3, 4, 5, 6, 7, 8].map((k) =>
      sine({ frequencyHz: f0 * k, seconds: 0.5, amplitude: 0.4 / k }));
    const estimate = detector.analyse(frameOf(detector, mix(...partials), 0.1));
    expect(estimate.frequencyHz).not.toBeNull();
    expect(Math.abs(cents(estimate.frequencyHz as number, f0))).toBeLessThan(5);
  });

  // The other side of the same guard. A pure tone is periodic at its own
  // period and at every multiple of it, so a correction that always preferred
  // the longer period would drag it down an octave for nothing. That is what
  // OCTAVE_CHECK_FLOOR is holding back.
  it('leaves a perfectly periodic tone where it is rather than halving it', () => {
    for (const hz of [110, 220, 440]) {
      const estimate = detector.analyse(
        frameOf(detector, sine({ frequencyHz: hz, seconds: 0.5 }), 0.1));
      expect(Math.abs(cents(estimate.frequencyHz as number, hz)), `${hz} Hz`).toBeLessThan(1);
    }
  });
});

describe('frames with no note in them', () => {
  const detector = new PitchDetector({ sampleRate: DEFAULT_SAMPLE_RATE });

  it('reports no pitch and the floor level for digital silence', () => {
    const estimate = detector.analyse(silence(0.5));
    expect(estimate.frequencyHz).toBeNull();
    expect(estimate.clarity).toBe(0);
    expect(estimate.levelDbfs).toBe(-120);
  });

  it('is not confident about noise, whatever lag it happens to like', () => {
    const estimate = detector.analyse(
      noiseFloor({ seconds: 0.5, seed: 211, levelDbfs: -30 }).subarray(0, detector.frameSize));
    expect(estimate.clarity).toBeLessThan(0.8);
  });

  it('measures the level of a frame it cannot find a pitch in', () => {
    const floor = noiseFloor({ seconds: 0.5, seed: 213, levelDbfs: -55 });
    expect(detector.analyse(floor.subarray(0, detector.frameSize)).levelDbfs)
      .toBeCloseTo(-55, 0);
  });

  it('refuses a frame shorter than it was built for rather than reading past it', () => {
    expect(() => detector.analyse(silence(0.01))).toThrow(/Need 8192 samples/);
  });
});

describe('a detector reused across a stream', () => {
  // The scratch buffers are shared between calls, which is what keeps a frame
  // allocation-free and is exactly how state leaks from one frame into the
  // next. An answer that depends on what was analysed before it would be a
  // detector that disagreed with itself on a replay of the same recording.
  it('gives the same answer for a frame whatever it analysed before it', () => {
    const detector = new PitchDetector({ sampleRate: DEFAULT_SAMPLE_RATE });
    const a = frameOf(detector, pluckedString({ frequencyHz: 110, seconds: 1, seed: 301 }));
    const b = frameOf(detector, pluckedString({ frequencyHz: 440, seconds: 1, seed: 302 }));

    const alone = detector.analyse(a);
    detector.analyse(b);
    detector.analyse(silence(0.5));
    const afterOthers = detector.analyse(a);

    expect(afterOthers).toEqual(alone);
  });
});

describe('a rate the detector did not choose', () => {
  // Everything tuned in this detector is a ratio, so changing the rate must
  // move the frame size and nothing else. A browser decides this, not us.
  it('reads the same note at 48 kHz as at 44.1 kHz', () => {
    for (const rate of [44_100, 48_000]) {
      const detector = new PitchDetector({ sampleRate: rate });
      const note = pluckedString({ frequencyHz: 146.83, seconds: 1, seed: 401, sampleRate: rate });
      const estimate = detector.analyse(frameOf(detector, note, 0.2, rate));
      expect(Math.abs(cents(estimate.frequencyHz as number, 146.83)), `${rate} Hz`)
        .toBeLessThan(5);
    }
  });

  // A frame too small for the range is the failure that does not announce
  // itself: clamping the longest lag to the window leaves a detector that
  // searches down to 350 Hz while claiming 27, and every bass note simply
  // comes back null.
  it('refuses a frame too small for the lowest note it was asked about', () => {
    expect(() => new PitchDetector({ sampleRate: 44_100, frameSize: 256 }))
      .toThrow(/cannot hold a period of 27 Hz/);
    expect(() => new PitchDetector({ sampleRate: 44_100, frameSize: 256, minFrequencyHz: 400 }))
      .not.toThrow();
  });
});
