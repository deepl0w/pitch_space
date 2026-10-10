import { describe, expect, it } from 'vitest';
import { analyse, listen, listenFor } from './listen';
import { RecordedSource } from './recorded';
import { framesOf, type CaptureFrame, type CaptureSource } from './source';
import { mix, pluckSequence, pluckedString, silence, startingAt } from '../testing/signals';
import { frameSizeFor } from '../dsp/pitchDetector';

/**
 * What the capture path owes, off-device.
 *
 * The detectors have their own tests and this does not repeat them. What
 * is new here is the *stream*: frames instead of one buffer, a note that
 * spans several of them, and the join between an onset and the pitch that
 * belongs to it. That join is where a capture path goes wrong, and it is
 * invisible to a detector handed one tidy buffer.
 *
 * Plucked strings rather than sine waves, for ADR 0008's reason: a
 * synthetic tone has no attack and no decay, so it finds no real defect.
 * A pluck has both, which is what makes the attack-skip in `pitchOver`
 * testable at all.
 */

const RATE = 44_100;
const FRAME = 1024;

/**
 * A4, C5 and E5 struck at 0.2s, 1.0s and 1.8s.
 *
 * Mixed at absolute positions rather than concatenated. Concatenation
 * stacks the offsets — the second note lands 0.8s after the first *ends*
 * rather than after the take starts — which put a fourth attack in the
 * signal and had this file reporting a detector fault that was mine.
 */
function threeNotes(): Float32Array {
  const note = (hz: number, at: number, seed: number) => startingAt(
    // A fixed seed per note, so the excitation burst is the same every
    // run: a pluck is seeded noise through a delay loop, and an unseeded
    // one would make a tolerance failure unreproducible.
    pluckedString({ frequencyHz: hz, seconds: 0.7, sampleRate: RATE, amplitude: 0.5, seed }),
    at, RATE,
  );
  return mix(
    note(440, 0.2, 1), note(523.25, 1.0, 2), note(659.25, 1.8, 3),
    silence(2.8, RATE),
  );
}

describe('framing a signal the way a device would', () => {
  it('reconstructs the signal exactly, with no gap and no overlap', () => {
    /*
      The claim the rest depends on. A gap loses audio and an overlap
      counts it twice, and either reads downstream as the player being
      early or late rather than as a bug in here — which is the most
      expensive kind of defect this layer can have.
    */
    const signal = pluckedString({ frequencyHz: 220, seconds: 0.5, sampleRate: RATE, seed: 7 });
    const frames = [...framesOf(signal, FRAME, RATE)];
    const rejoined = new Float32Array(frames.length * FRAME);
    frames.forEach((f, i) => rejoined.set(f.samples, i * FRAME));
    expect(rejoined.subarray(0, signal.length)).toEqual(signal);
  });

  it('pads the last frame rather than dropping the tail', () => {
    // Dropping it would silently shorten every take, which makes an onset
    // near the end untestable and is inaudible in the frames themselves.
    const odd = pluckedString({ frequencyHz: 220, seconds: 0.3, sampleRate: RATE, seed: 7 })
      .subarray(0, FRAME * 2 + 7);
    const frames = [...framesOf(odd, FRAME, RATE)];
    expect(frames).toHaveLength(3);
    expect(frames[2].samples).toHaveLength(FRAME);
    expect(frames[2].samples.subarray(0, 7)).toEqual(odd.subarray(FRAME * 2));
    expect([...frames[2].samples.subarray(7)].every((s) => s === 0)).toBe(true);
  });

  it('times each frame from the samples, not from a clock', () => {
    // Every grading path measures differences between onsets, so the
    // spacing has to be exact rather than however long a consumer took.
    const frames = [...framesOf(new Float32Array(FRAME * 4), FRAME, RATE)];
    frames.forEach((f, i) => expect(f.startSeconds).toBeCloseTo((i * FRAME) / RATE, 10));
  });
});

describe('hearing a take', () => {
  it('reports one note per attack, not one per frame it spans', () => {
    /*
      A 0.7s note covers about thirty frames. The failure this guards
      against is reporting thirty notes, which no exercise could grade and
      which a detector test cannot see.
    */
    const heard = analyse(threeNotes(), RATE);
    expect(heard.notes.length, `heard ${heard.notes.length} notes`).toBe(3);
  });

  it('names what was played, within a quarter tone', () => {
    // A quarter tone is about 3%, which is far wider than the detector's
    // own accuracy and far narrower than a semitone — so this fails on a
    // wrong note and not on a real room.
    const heard = analyse(threeNotes(), RATE);
    for (const [i, expected] of [440, 523.25, 659.25].entries()) {
      const got = heard.notes[i]?.frequencyHz;
      expect(got, `note ${i} had no pitch`).not.toBeNull();
      expect(Math.abs(1200 * Math.log2(got! / expected)), `note ${i}`).toBeLessThan(50);
    }
  });

  it('puts each attack where it was played', () => {
    const heard = analyse(threeNotes(), RATE);
    for (const [i, at] of [0.2, 1.0, 1.8].entries()) {
      expect(heard.notes[i].startSeconds, `note ${i}`).toBeCloseTo(at, 1);
    }
  });

  it('hears the same thing through a source as from the samples', () => {
    /*
      The seam's whole promise: what the analysis concludes must not
      depend on whether the audio arrived in one buffer or in frames.

      Compared on the unaligned signal, which it could not be when this
      was written. A source pads its last frame to the full size and so
      genuinely makes the take longer, and the final note's pitch window
      used to be a quarter of the way into "onset to end of take" — so
      padding moved it, and this case had to align the length to say
      anything at all. The window is bounded by the attack now rather
      than by the take, which makes the padding stop mattering and lets
      the claim be made about the signal a device would actually hand
      over. See the run-on case below for the measurement.
    */
    const signal = threeNotes();
    const direct = analyse(signal, RATE);
    return listen(new RecordedSource({ samples: signal, sampleRate: RATE, frameSize: FRAME }))
      .then((streamed) => {
        expect(streamed.notes.map((n) => n.frequencyHz))
          .toEqual(direct.notes.map((n) => n.frequencyHz));
      });
  });

  it('finds nothing in silence rather than inventing a note', () => {
    const heard = analyse(silence(1.5, RATE), RATE);
    expect(heard.notes).toEqual([]);
  });

  it('stops delivering when told to, mid-take', () => {
    // A consumer stops in response to what it just heard; delivering the
    // rest afterwards is the difference between stopping and stopping
    // eventually.
    const source = new RecordedSource({
      samples: threeNotes(), sampleRate: RATE, frameSize: FRAME,
    });
    let seen = 0;
    return source.start(() => { seen += 1; if (seen === 5) source.stop(); })
      .then(() => expect(seen).toBe(5));
  });
});

/**
 * What the player did, as against how long they left the tape running.
 *
 * A note's pitch is read over a window, and that window used to start a
 * quarter of the way through the note's span — which for the last note of a
 * take is "from its onset to wherever recording stopped". So the same three
 * notes, identical samples, read correctly with half a second of run-on and
 * not at all with a second of it: the skip landed past the decay and every
 * frame after it was gated as silence.
 *
 * It is the last note of every attempt, which makes it the worst one to get
 * wrong. A learner hears nothing about it; they stop playing, the take ends
 * when it ends, and the grade changes.
 */
describe('a note at the end of a take', () => {
  /** One pitch struck three times, with the take running on afterwards. */
  const withRunOn = (trailing: number, decaySeconds: number) => pluckSequence({
    atSeconds: [0.2, 0.6, 1.0], frequencyHz: 220, seed: 1301,
    seconds: 1.0 + trailing, sampleRate: RATE, decaySeconds,
  });

  it('is read the same however long the recording runs on', () => {
    /*
      The property, and it is about a quantity the player does not control.
      Before the window was bounded, a second of run-on read NULL at every
      decay while half a second read 220 Hz.
    */
    for (const decaySeconds of [0.3, 1.5, 3]) {
      const readings = [0.3, 0.5, 0.8, 1.2, 2].map((trailing) => {
        const heard = analyse(withRunOn(trailing, decaySeconds), RATE);
        return heard.notes[heard.notes.length - 1].frequencyHz;
      });
      for (const reading of readings) {
        expect(reading, `decay ${decaySeconds}: run-on changed the reading`)
          .toBeCloseTo(220, 0);
      }
    }
  });

  it('is read at all when the take stops promptly, while the note still sounds', () => {
    /*
      The band just above one analysis frame, which exists because the skip
      is capped rather than proportional — and which is recovered by reading
      across the attack when nothing fits after it.

      A reading taken over the attack is worse than one taken after it and
      better than none. Measured: at 0.19 s of run-on this is 220 Hz with
      that fallback and nothing without it, for a note still ringing.
    */
    const heard = analyse(withRunOn(0.19, 1.5), RATE);
    const last = heard.notes[heard.notes.length - 1];
    expect(last.frequencyHz, 'a note that is still sounding went unread').not.toBeNull();
    expect(last.frequencyHz!).toBeCloseTo(220, 0);
  });

  it('has no pitch when the take leaves less audio than one analysis frame', () => {
    /*
      Not a defect, and pinned so that it is not mistaken for one.

      YIN needs four periods of the lowest note it is asked to find, which is
      `frameSizeFor` — 8192 samples, 186 ms at 44.1 kHz. A note with less
      audio after it than that cannot be pitched by any window over it, and
      the honest answer is `null` rather than a guess. The temptation on
      seeing the case above is to shrink the frame, which would buy this note
      a reading and cost every low one its accuracy.

      Derived from `frameSizeFor` rather than written as a number, so the
      claim stays about the relationship if the lowest note moves.
    */
    const frameSeconds = frameSizeFor(RATE) / RATE;
    const heard = analyse(withRunOn(frameSeconds * 0.8, 3), RATE);
    const last = heard.notes[heard.notes.length - 1];
    expect(last.durationSeconds).toBeLessThan(frameSeconds);
    expect(last.frequencyHz).toBeNull();
    // And the clarity says which of the two silences this is: no frame was
    // examined, rather than frames examined and found unconvincing.
    expect(last.clarity).toBe(0);
  });
});

/**
 * What the capture layer's choice of sample rate is actually worth.
 *
 * `MicrophoneSource` reports the *context's* rate rather than the track's,
 * because the two disagree — 48000 against 44100 on Chrome, for one stream
 * — and the worklet times its frames from the context. That is the right
 * choice and it is argued where it is made; what was not available there is
 * what the wrong choice costs, so it was estimated, and the estimate was
 * out by a factor of fifteen.
 *
 * Every second downstream is counted in the rate the analysis is handed, so
 * a rate 8.8% high reads every frequency 8.8% high. That is not a tenth of
 * a semitone. It is 147 cents — the difference between A and B, and the
 * difference between an exercise that works and one that is wrong about
 * every note it hears.
 */
describe('the rate the analysis is told', () => {
  const TRUE_RATE = 44_100;
  /** What Chrome reported for the same stream, context against track. */
  const CONTEXT_RATE = 48_000;

  const played = () => pluckSequence({
    atSeconds: [0.3, 0.9, 1.5], frequencyHz: 440, seed: 11,
    seconds: 2.4, sampleRate: TRUE_RATE, decaySeconds: 1.2,
  });

  it('is what every reported frequency is measured against', () => {
    const right = analyse(played(), TRUE_RATE).notes[0];
    expect(right.frequencyHz!).toBeCloseTo(440, 0);

    const wrong = analyse(played(), CONTEXT_RATE).notes[0];
    const cents = 1200 * Math.log2(wrong.frequencyHz! / 440);
    /*
      Asserted as a range rather than a figure: the claim is the order of
      magnitude of the mistake, and pinning 147 would make retuning the
      detector a failure here for no reason. A semitone is the useful floor
      — below it the error could be argued as tuning, above it the exercise
      is naming a different note.
    */
    expect(Math.abs(cents), 'a rate error this size is more than a tuning quibble')
      .toBeGreaterThan(100);
    expect(Math.abs(cents)).toBeLessThan(200);
  });

  it('is what every reported time is counted in', () => {
    // The same mistake seen as rhythm: a take read 8.8% fast is a take
    // whose every attack arrives early, by more than a sixteenth by the
    // end of a bar.
    const right = analyse(played(), TRUE_RATE);
    const wrong = analyse(played(), CONTEXT_RATE);
    expect(wrong.durationSeconds / right.durationSeconds)
      .toBeCloseTo(TRUE_RATE / CONTEXT_RATE, 3);
    const drift = right.onsets[2].timeSeconds - wrong.onsets[2].timeSeconds;
    expect(drift, 'the last attack of a bar barely moved').toBeGreaterThan(0.1);
  });
});

/**
 * A take bounded by seconds, which is the only kind a live source can give.
 *
 * `listen` ends its take when `source.start` resolves, and that is a
 * property of `RecordedSource` rather than of the interface: `CaptureSource`
 * documents `start` as *beginning*, and a microphone settles its promise the
 * moment permission is granted with every frame still to come. So `listen`
 * handed a real device returns an empty take immediately, and the length has
 * to come from the caller instead.
 */
describe('a take of a fixed length', () => {
  const FRAME = 1024;

  /**
   * A source shaped like a microphone rather than like a recording.
   *
   * The difference is the whole point and it is one line: `start` keeps the
   * callback and resolves, and frames arrive afterwards. A first version of
   * this delivered them inside `start`, which made it a `RecordedSource` by
   * another name — `listen` handled it perfectly well and the control case
   * below failed, which is the test saying the double was wrong.
   */
  function live(samples: Float32Array) {
    let onFrame: ((frame: { samples: Float32Array; startSeconds: number }) => void) | null = null;
    let stopped = 0;
    return {
      stopped: () => stopped,
      /** What passes while the device streams. Stands in for the clock. */
      stream() {
        for (const frame of framesOf(samples, FRAME, RATE)) onFrame?.(frame);
      },
      source: {
        sampleRate: RATE,
        frameSize: FRAME,
        start(handler: (frame: { samples: Float32Array; startSeconds: number }) => void) {
          onFrame = handler;
          return Promise.resolve();
        },
        stop() {
          stopped += 1;
          onFrame = null;
        },
      },
    };
  }

  it('hears a source whose frames arrive after its start resolves', async () => {
    const device = live(threeNotes());

    const result = await listenFor(device.source, 2, {
      // The injected clock is where the device's time goes.
      wait: async () => { device.stream(); },
    });

    // The same three `analyse` finds in this signal when it is handed the
    // samples whole, which is the point: the route the audio took must not
    // change what was heard.
    expect(result.notes.length, 'a live-shaped source gave an empty take')
      .toBe(analyse(threeNotes(), RATE).notes.length);
  });

  it('is the case `listen` cannot serve, which is why this exists', async () => {
    /*
      The control. Without it the case above is just another passing test
      and nothing records why `listenFor` is not simply `listen`. `listen`
      treats `start` resolving as the take being over, which for a device
      that has only just been granted permission is a take of nothing.
    */
    const device = live(threeNotes());

    expect((await listen(device.source)).notes, 'listen now handles a live source')
      .toEqual([]);
  });

  it('releases the device when the take ends', async () => {
    const device = live(threeNotes());

    await listenFor(device.source, 2, { wait: async () => { device.stream(); } });

    expect(device.stopped(), 'the device was left open').toBe(1);
  });

  it('releases the device even when the wait goes wrong', async () => {
    const device = live(threeNotes());

    await expect(listenFor(device.source, 2, {
      wait: () => Promise.reject(new Error('interrupted')),
    })).rejects.toThrow('interrupted');
    expect(device.stopped(), 'a failed take held the microphone open').toBe(1);
  });

  it('waits the length it was given', async () => {
    const device = live(threeNotes());
    const asked: number[] = [];

    await listenFor(device.source, 3.5, {
      wait: (seconds) => { asked.push(seconds); device.stream(); return Promise.resolve(); },
    });

    expect(asked, 'the take did not wait, or waited for something else').toEqual([3.5]);
  });
});

/**
 * What `listenFor` does to the device when the take goes wrong.
 *
 * The `finally` around the wait exists because "a source left running holds
 * the microphone open, and the recording indicator stays on, whatever went
 * wrong" — and `await source.start(...)` sits outside it. A `start` that
 * acquires the stream, delivers a frame and *then* rejects therefore skips
 * the release entirely: the light stays on, with nothing listening.
 *
 * Not hypothetical for a real device. `MicrophoneSource.start` resolves once
 * the worklet is wired, and everything it does before that point — the
 * permission prompt, opening the context, loading the module — can fail
 * after the stream has been granted.
 *
 * `stop()` is null-safe at every step, so calling it on a source that never
 * finished starting releases whatever it did acquire and does nothing where
 * there is nothing to release.
 */
describe('a take that cannot be finished', () => {
  /** A source that hands over a frame and then fails, as a device can. */
  function failing(): CaptureSource & { stopped: number } {
    const self = {
      sampleRate: 44_100,
      stopped: 0,
      async start(onFrame: (frame: CaptureFrame) => void) {
        onFrame({ samples: new Float32Array(8192), startSeconds: 0 });
        throw new Error('device went away');
      },
      stop() { self.stopped += 1; },
    };
    return self as unknown as CaptureSource & { stopped: number };
  }

  /** A source that starts cleanly and never delivers anything. */
  function silent(): CaptureSource & { stopped: number } {
    const self = { sampleRate: 44_100, stopped: 0, async start() {}, stop() { self.stopped += 1; } };
    return self as unknown as CaptureSource & { stopped: number };
  }

  it('releases the device when starting fails part-way through', async () => {
    const source = failing();
    await expect(listenFor(source, 0.01, { wait: async () => {} }))
      .rejects.toThrow(/device went away/);
    expect(source.stopped, 'the microphone was left open after a failed start').toBe(1);
  });

  it('still reports the failure rather than swallowing it', async () => {
    // Releasing the device must not turn a broken take into an empty one:
    // an empty take is an answer, and a device that fell over is not.
    const source = failing();
    await expect(listenFor(source, 0.01, { wait: async () => {} })).rejects.toThrow();
  });

  it('analyses a take that produced no frames at all, rather than throwing', async () => {
    // The wait can finish before anything arrives — a device that is slow to
    // deliver, or a take short enough to beat the first frame. Zero samples
    // has to reach `analyse` safely, because the alternative is an exception
    // on the path whose whole purpose is to fail softly.
    const source = silent();
    const result = await listenFor(source, 0.01, { wait: async () => {} });

    expect(result.notes).toEqual([]);
    expect(result.durationSeconds).toBe(0);
    expect(result.sampleRate).toBe(44_100);
    expect(source.stopped, 'the device was not released after an empty take').toBe(1);
  });
});
