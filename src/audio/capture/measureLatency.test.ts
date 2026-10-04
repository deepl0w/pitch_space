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

/**
 * A synth on a device with no audio at all — `prepare` rejects, as it does
 * under node and jsdom where there is no `AudioContext` to construct.
 *
 * **Not** "a synth that has never sounded", which is what this used to be
 * and which was the bug. The module read `synth.audioContext`, null until
 * something had played, and a fresh page therefore reported the browser as
 * unable to record — in a browser that was willing. The old fake had
 * `audioContext: null` and the tests below called that the failure path, so
 * the defect was pinned as behaviour. Found by the user role in a real
 * browser with a real microphone, which is the only place it was visible.
 */
const deadSynth = { prepare: () => Promise.reject(new Error('no AudioContext')) } as unknown as Synth;

/** A synth that has never sounded — what every first calibration meets. */
function freshSynth(): { synth: Synth; prepared: () => number } {
  let calls = 0;
  // An audio clock that runs, like a real one, and runs fast enough that
  // the wait is already over.
  //
  // `run` reads it twice — once for the recording's zero, once inside
  // `waitUntil` — and waits until the last click's echo would have
  // arrived, 5.35 s later. At one second per read that leaves 4.35 s
  // still to wait and the test genuinely slept for it: 4.4 s of a 5 s
  // default timeout, 88% of the budget, doing nothing. The comment here
  // used to claim the opposite. Ten seconds a read clears the target on
  // the second read, so the arithmetic is still exercised and the clamp
  // to zero does the waiting.
  let now = 0;
  const context = {
    sampleRate: 44_100,
    get currentTime() { now += 10; return now; },
    // Enough of a graph for `run` to get past construction; the recording
    // itself still needs a device and is not claimed here.
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
    createScriptProcessor: () => ({ connect() {}, disconnect() {}, onaudioprocess: null }),
    createGain: () => ({ gain: { value: 0 }, connect() {}, disconnect() {} }),
    destination: {},
  };
  const synth = {
    prepare: () => { calls += 1; return Promise.resolve(context as unknown as AudioContext); },
    play: () => {},
  } as unknown as Synth;
  return { synth, prepared: () => calls };
}

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
    const out = await measureInputLatency({ synth: deadSynth, getMedia: undefined });
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
        synth: deadSynth, getMedia: rejecting(thrown),
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
      synth: deadSynth, getMedia: rejecting('SomeFutureError'),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no-device');
  });
});

describe('a page where nothing has played yet', () => {
  /**
   * The bug the user role found, as a test.
   *
   * Calibration records the room *before* it hears anything back, so on
   * every first attempt the synth has never sounded. Reading a context that
   * is created lazily gives null, and the module reported "this browser
   * will not let the app record" to a browser that had just granted the
   * microphone. The fix is to ask the synth to wake rather than to look at
   * whether it is awake.
   */
  it('wakes the audio graph instead of declaring the browser incapable', async () => {
    const { synth, prepared } = freshSynth();
    const { stream } = fakeStream();
    const out = await measureInputLatency({
      synth, getMedia: () => Promise.resolve(stream),
    });

    expect(prepared(), 'the synth was never asked to wake').toBe(1);
    // It gets as far as recording and finds nothing, because there is no
    // device here. What it must not say is `unsupported`.
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).not.toBe('unsupported');
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
      synth: deadSynth, getMedia: () => Promise.resolve(stream),
    });

    // The run bails on a null context — the point is that it bailed *and*
    // still cleaned up.
    expect(out.ok).toBe(false);
    expect(stopped()).toBe(1);
  });

  it('does not leave a stream open when permission was refused', async () => {
    // Nothing to stop here, but the call must not throw on the way out.
    const out = await measureInputLatency({
      synth: deadSynth, getMedia: rejecting('NotAllowedError'),
    });
    expect(out.ok).toBe(false);
  });
});
