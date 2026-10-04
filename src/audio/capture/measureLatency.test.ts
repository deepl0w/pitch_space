import { describe, expect, it } from 'vitest';
import { measureInputLatency } from './measureLatency';
import type { Synth } from '../output/synth';

/**
 * What can be checked without a microphone, which is less than the whole
 * thing and more than nothing.
 *
 * The recording needs a device and these tests do not pretend otherwise.
 * What they cover is the half that decides **what a user sees when
 * calibration fails** — four refusals, four different remedies — and the
 * promise the module makes about letting go of the microphone afterwards.
 * Both are reachable through the injected `getMedia`.
 *
 * Reachable at all because `synth.audioContext` is null until something has
 * played: in a fresh run the function gets past permissions, finds no
 * context, and returns `unsupported`. That is the failure path, and it is
 * the one most likely to be taken in anger, so the cleanup promise is worth
 * pinning exactly there.
 */

/** A synth that has never sounded, which is what a fresh page has. */
const coldSynth = { audioContext: null } as unknown as Synth;

/** A stream whose tracks remember whether anybody stopped them. */
function fakeStream(): { stream: MediaStream; stopped: () => number } {
  let stops = 0;
  const track = { stop: () => { stops += 1; }, kind: 'audio' };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  return { stream, stopped: () => stops };
}

function rejecting(name: string) {
  return () => Promise.reject(Object.assign(new Error(name), { name }));
}

describe('what the user is told when calibration cannot run', () => {
  /**
   * Each refusal names a different remedy, and the remedies are not
   * interchangeable: one is a permission to grant, one is a device to plug
   * in, one is a browser that will never do it. Telling the user the wrong
   * one sends them to fix something that is not broken.
   */
  it('says unsupported when there is no capture API at all', async () => {
    const out = await measureInputLatency({ synth: coldSynth, getMedia: undefined });
    // Only meaningful where the environment has no navigator.mediaDevices
    // either, which is the case under node.
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('unsupported');
  });

  it('tells a refusal from a missing device', async () => {
    const cases: Array<[string, string]> = [
      ['NotAllowedError', 'no-permission'],
      ['SecurityError', 'no-permission'],
      ['NotFoundError', 'no-device'],
      ['OverconstrainedError', 'no-device'],
    ];
    for (const [thrown, expected] of cases) {
      const out = await measureInputLatency({
        synth: coldSynth, getMedia: rejecting(thrown),
      });
      expect(out.ok, thrown).toBe(false);
      if (!out.ok) expect(out.reason, thrown).toBe(expected);
    }
  });

  /**
   * Pinned precisely *because* it is a guess.
   *
   * An unrecognised error is reported as "No microphone was available",
   * which is a claim rather than a shrug — and if the claim is wrong then so
   * is the remedy it offers. Worth a test so that changing the guess is a
   * decision somebody makes rather than a line somebody edits.
   */
  it('guesses no-device for an error it does not recognise', async () => {
    const out = await measureInputLatency({
      synth: coldSynth, getMedia: rejecting('SomeFutureError'),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no-device');
  });
});

describe('letting go of the microphone', () => {
  /**
   * The promise in the module's own comment: "a live microphone after a
   * settings screen has closed is the kind of thing a user notices in their
   * browser's tab indicator and does not forgive."
   *
   * Nothing checked it until now. The `finally` exists for exactly this and
   * a `finally` is easy to lose in a refactor that adds an early return.
   */
  it('stops every track even when the measurement never starts', async () => {
    const { stream, stopped } = fakeStream();
    const out = await measureInputLatency({
      synth: coldSynth, getMedia: () => Promise.resolve(stream),
    });

    // The run bails on a null context — the point is that it bailed *and*
    // still cleaned up.
    expect(out.ok).toBe(false);
    expect(stopped()).toBe(1);
  });

  it('does not leave a stream open when permission was refused', async () => {
    // Nothing to stop here, but the call must not throw on the way out.
    const out = await measureInputLatency({
      synth: coldSynth, getMedia: rejecting('NotAllowedError'),
    });
    expect(out.ok).toBe(false);
  });
});
