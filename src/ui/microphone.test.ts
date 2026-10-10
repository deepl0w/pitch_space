import { describe, expect, it } from 'vitest';
import { LONGEST_TAKE_SECONDS, microphoneIn } from './microphone';
import { RecordedSource } from '../audio/capture/recorded';
import type { CaptureFrame, CaptureSource } from '../audio/capture/source';
import { concat, silence, sine } from '../audio/testing/signals';

/**
 * The adapter between a device and the one method an exercise is allowed to
 * see, and specifically the half of it that is not the happy path.
 *
 * ADR 0047 is the reason this file exists at all. A refused microphone that
 * reaches an exercise as a take containing no notes is a wrong answer: it
 * resets the item's streak, drops it down the review ladder and drags the
 * figure on the home card, for a question the player never got to answer.
 * Those two outcomes are one boolean apart here and nowhere else.
 */

const RATE = 44_100;
const FRAME = 1024;

/** A device that is there and has something in it. */
function recorded(samples: Float32Array): CaptureSource {
  return new RecordedSource({ samples, sampleRate: RATE, frameSize: FRAME });
}

/** A device that refuses, the way a browser refuses one. */
function refusing(name: string): CaptureSource {
  return {
    sampleRate: RATE,
    frameSize: FRAME,
    start: () => {
      const error = new Error('no');
      error.name = name;
      return Promise.reject(error);
    },
    stop: () => {},
  };
}

/** Two notes, so a take that works has something to show for it. */
function twoNotes(): Float32Array {
  return concat(
    sine({ frequencyHz: 440, seconds: 0.6, sampleRate: RATE }),
    silence(0.15, RATE),
    sine({ frequencyHz: 554.37, seconds: 0.6, sampleRate: RATE }),
  );
}

/** Passing the time without spending it. */
const instantly = () => Promise.resolve();

/** Every case here asks for a take; none of them waits one out. */
const heardFrom = (source: () => CaptureSource, seconds = 2) =>
  microphoneIn({ source, wait: instantly }).listen(seconds);

describe('the microphone, as an exercise sees it', () => {
  it('hands back what it heard, with the bit saying it did', async () => {
    const take = await heardFrom(() => recorded(twoNotes()));

    expect(take.heard, 'a working device reported as no device').toBe(true);
    if (!take.heard) return;
    expect(take.notes.length, 'nothing was heard, so nothing below is asserted')
      .toBeGreaterThanOrEqual(2);
    for (const note of take.notes) {
      expect(note.startSeconds).toBeGreaterThanOrEqual(0);
      expect(note.durationSeconds).toBeGreaterThan(0);
    }
  });

  /*
    The two refusals, separately, because the remedies are different: one is
    a permission to grant and the other is a device to plug in, and a player
    told the wrong one is sent to fix something that is not broken.
  */
  it.each([
    ['NotAllowedError', 'refused'],
    ['SecurityError', 'refused'],
    ['NotFoundError', 'unavailable'],
    ['OverconstrainedError', 'unavailable'],
    ['TypeError', 'unavailable'],
  ])('reports %s as %s', async (name, reason) => {
    const take = await heardFrom(() => refusing(name));

    expect(take.heard).toBe(false);
    if (take.heard) return;
    expect(take.reason).toBe(reason);
  });

  /**
   * The case ADR 0047 is about, stated as the thing that must never happen
   * rather than as the thing that does.
   *
   * A refusal and a silent room are both "the player did not get it right"
   * from a grader's point of view, and they are not the same event. This
   * asserts the shape the type already makes unrepresentable, because the
   * type is what someone will reach for `as any` around in a hurry.
   */
  it('never reports a refusal as a take that happened to be empty', async () => {
    const take = await heardFrom(() => refusing('NotAllowedError'));

    expect(take).not.toHaveProperty('notes');
    expect(Object.hasOwn(take, 'heard') && take.heard).toBe(false);
  });

  it('resolves rather than rejecting, whatever the device did', async () => {
    const exploding: CaptureSource = {
      sampleRate: RATE,
      frameSize: FRAME,
      start: () => { throw new Error('the worklet did not load'); },
      stop: () => {},
    };

    await expect(heardFrom(() => exploding)).resolves.toBeTruthy();
  });

  /**
   * A device left running holds the recording indicator on. Asserted rather
   * than trusted because the release is in a `finally` whose `try` is two
   * files away, and nothing a user can see would tell them it had stopped
   * happening until their camera light stayed lit.
   */
  it('releases the device even when the take goes wrong', async () => {
    let stopped = 0;
    const source: CaptureSource = {
      sampleRate: RATE,
      frameSize: FRAME,
      start: (onFrame: (frame: CaptureFrame) => void) => {
        onFrame({ samples: new Float32Array(FRAME), startSeconds: 0 });
        return Promise.resolve();
      },
      stop: () => { stopped += 1; },
    };

    await heardFrom(() => source);
    expect(stopped, 'the device was never released').toBeGreaterThan(0);
  });

  it('will not hold a device open for longer than it has a use for', () => {
    // A ceiling rather than a chosen length; the exercise passes its own.
    // Asserted so that raising it is a decision rather than a typo.
    expect(LONGEST_TAKE_SECONDS).toBeLessThanOrEqual(60);
    expect(LONGEST_TAKE_SECONDS).toBeGreaterThan(4);
  });

  /**
   * The guard on this file's own instrument.
   *
   * Every case above passes just as well against a take that really slept,
   * and `heardFrom` is the only thing stopping them. If the injected clock
   * ever stops being used, this is what says so — a real one would sit here
   * for thirty seconds and fail the suite's own patience rather than any
   * assertion.
   */
  it('passes the length of a take without spending it', async () => {
    const started = Date.now();
    await heardFrom(() => recorded(twoNotes()), LONGEST_TAKE_SECONDS);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
