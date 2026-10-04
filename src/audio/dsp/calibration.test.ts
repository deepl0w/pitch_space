import { describe, expect, it } from 'vitest';
import { estimateInputLatency, type CalibrationTrial } from './calibration';
import { detectOnsets } from './onsetDetector';
import { concat, noiseFloor, pluckedString, silence } from '../testing/signals';

/**
 * The estimator, against recordings built with a latency we chose.
 *
 * The point of keeping it pure: the answer is known before the test runs, so
 * "did it measure 80 ms" is a real assertion rather than a snapshot of
 * whatever it happened to say. Nothing here needs a device, which is also
 * the honest limit — this proves the arithmetic and the refusals, and proves
 * nothing about whether a phone's microphone behaves.
 *
 * Clicks are plucked strings rather than impulses. ADR 0008's complaint
 * about synthetic tones applies here too: a mathematical impulse has an
 * attack no instrument has and no room ever produces, and an onset detector
 * finds it far too easily to be evidence of anything.
 */

const RATE = 44_100;

/** A click: short, bright, and gone before the next one. */
function click(): Float32Array {
  return pluckedString({ frequencyHz: 1760, seconds: 0.08, sampleRate: RATE, seed: 7 });
}

/**
 * A recording of `count` clicks, each arriving `latency` after it was played.
 *
 * The trials describe when each click was *emitted*; the samples contain it
 * `latency` later. That gap is the whole quantity under test.
 */
function recording(options: {
  count: number;
  latencySeconds: number;
  gapSeconds?: number;
  /** Per-click jitter, in seconds, applied in order. */
  jitter?: readonly number[];
  noiseDbfs?: number;
}): { samples: Float32Array; trials: CalibrationTrial[] } {
  const gap = options.gapSeconds ?? 1;
  const trials: CalibrationTrial[] = [];
  const parts: Float32Array[] = [];
  let writtenSeconds = 0;

  for (let i = 0; i < options.count; i++) {
    const emittedAtSeconds = 0.25 + i * gap;
    const jitter = options.jitter?.[i] ?? 0;
    const arrivesAt = emittedAtSeconds + options.latencySeconds + jitter;
    parts.push(silence(arrivesAt - writtenSeconds, RATE));
    const c = click();
    parts.push(c);
    writtenSeconds = arrivesAt + c.length / RATE;
    trials.push({ emittedAtSeconds });
  }
  parts.push(silence(0.5, RATE));

  let samples = concat(...parts);
  if (options.noiseDbfs !== undefined) {
    const floor = noiseFloor({
      seconds: samples.length / RATE, sampleRate: RATE, levelDbfs: options.noiseDbfs, seed: 11,
    });
    const mixed = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) mixed[i] = samples[i] + floor[i];
    samples = mixed;
  }
  return { samples, trials };
}

describe('measuring the round trip', () => {
  it('recovers a latency it was given', () => {
    for (const latencySeconds of [0.02, 0.05, 0.12, 0.2]) {
      const { samples, trials } = recording({ count: 5, latencySeconds });
      const out = estimateInputLatency({ samples, sampleRate: RATE, trials });

      expect(out.ok, `${latencySeconds}s was refused`).toBe(true);
      if (!out.ok) continue;
      // Within an onset frame's resolution. The detector reports a frame
      // centre, so finer than that would be asserting precision the method
      // does not have.
      expect(out.latencySeconds).toBeCloseTo(latencySeconds, 2);
      expect(out.heard).toBe(5);
      expect(out.sent).toBe(5);
    }
  });

  it('is unbothered by a noise floor a room would have', () => {
    const { samples, trials } = recording({ count: 5, latencySeconds: 0.08, noiseDbfs: -50 });
    const out = estimateInputLatency({ samples, sampleRate: RATE, trials });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.latencySeconds).toBeCloseTo(0.08, 2);
  });

  /**
   * The reason the middle is taken rather than the mean.
   *
   * One click heard very late — a door, a chair — must move the answer by
   * nothing much. A mean would carry a quarter of the error into every
   * judgement the user makes afterwards.
   */
  it('ignores one trial that went wrong', () => {
    const { samples, trials } = recording({
      count: 5, latencySeconds: 0.06, jitter: [0, 0, 0.25, 0, 0],
    });
    const out = estimateInputLatency({ samples, sampleRate: RATE, trials });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.latencySeconds).toBeCloseTo(0.06, 2);
  });

  it('reports a spread that narrows when the trials agree', () => {
    const tight = recording({ count: 7, latencySeconds: 0.08 });
    const loose = recording({
      count: 7, latencySeconds: 0.08, jitter: [0, 0.006, -0.005, 0.007, -0.006, 0.005, 0],
    });
    const a = estimateInputLatency({ ...tight, sampleRate: RATE });
    const b = estimateInputLatency({ ...loose, sampleRate: RATE });

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.spreadSeconds).toBeLessThan(b.spreadSeconds);
  });
});

describe('refusing to answer', () => {
  /**
   * Each refusal matters more than the measurement does. A wrong offset is
   * applied silently to every attempt afterwards and looks like the user
   * being late; no offset is visibly absent.
   */
  it('says nothing was heard when the recording is empty', () => {
    const out = estimateInputLatency({
      samples: silence(3, RATE), sampleRate: RATE,
      trials: [{ emittedAtSeconds: 0.25 }, { emittedAtSeconds: 1.25 }, { emittedAtSeconds: 2.25 }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('nothing-heard');
  });

  it('says too few when most of the clicks did not come back', () => {
    // Five sent, one heard: the recording holds a single click.
    const { samples } = recording({ count: 1, latencySeconds: 0.05 });
    const trials = Array.from({ length: 5 }, (_, i) => ({ emittedAtSeconds: 0.25 + i }));
    const out = estimateInputLatency({ samples, sampleRate: RATE, trials });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe('too-few');
      expect(out.sent).toBe(5);
    }
  });

  it('says inconsistent when the trials disagree by more than the answer is worth', () => {
    const { samples, trials } = recording({
      count: 6, latencySeconds: 0.08,
      jitter: [-0.05, 0.05, -0.04, 0.045, -0.05, 0.05],
    });
    const out = estimateInputLatency({ samples, sampleRate: RATE, trials });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('inconsistent');
  });

  it('says implausible rather than reporting a delay no device has', () => {
    const { samples, trials } = recording({ count: 4, latencySeconds: 0.55, gapSeconds: 2 });
    const out = estimateInputLatency({ samples, sampleRate: RATE, trials });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('implausible');
  });

  it('refuses an empty run rather than dividing by nothing', () => {
    const out = estimateInputLatency({ samples: silence(1, RATE), sampleRate: RATE, trials: [] });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('too-few');
  });
});

describe('matching clicks to what came back', () => {
  /**
   * The mistake ADR 0009 rejects for rhythm, in its calibration form.
   *
   * One loud noise must not answer every trial. Nearest-neighbour matching
   * would let it, and would then report a confident latency derived from a
   * single event — which is exactly the shape of a measurement nobody can
   * tell is wrong.
   */
  it('never counts more clicks than there were sounds to hear', () => {
    // Counted against what the detector actually found rather than against
    // the number of clicks played: a plucked string is not one onset — this
    // recording holds a single click and the detector reports two peaks in
    // it — so "one sound" would have been the test's assumption rather than
    // the signal's property. The invariant is that no onset answers twice.
    const { samples } = recording({ count: 1, latencySeconds: 0.05 });
    const { onsets } = detectOnsets(samples, { sampleRate: RATE });
    const trials = Array.from({ length: 8 }, (_, i) => ({ emittedAtSeconds: 0.25 + i * 0.05 }));

    const out = estimateInputLatency({ samples, sampleRate: RATE, trials });
    expect(out.heard).toBeLessThanOrEqual(onsets.length);
    expect(out.heard).toBeLessThan(trials.length);
  });

  it('does not credit a click with a noise that arrived before it', () => {
    // The sound is at ~0.3 s and the click is emitted at 2 s, so there is
    // nothing after it: a matcher ignoring direction would report -1.7 s.
    const { samples } = recording({ count: 1, latencySeconds: 0.05 });
    const out = estimateInputLatency({
      samples, sampleRate: RATE, trials: [{ emittedAtSeconds: 2 }],
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.heard).toBe(0);
  });
});
