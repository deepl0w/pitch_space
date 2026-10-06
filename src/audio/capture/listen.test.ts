import { describe, expect, it } from 'vitest';
import { analyse, listen } from './listen';
import { RecordedSource } from './recorded';
import { framesOf } from './source';
import { mix, pluckedString, silence, startingAt } from '../testing/signals';

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

      Compared on a frame-aligned signal, because a source pads its last
      frame to the full size and that genuinely makes the take longer —
      which moves the final note's end and so the window its pitch is
      read over. That is the source behaving correctly, not a difference
      in the analysis, so aligning the length is what isolates the claim
      this case is making rather than papering over one it is not.
    */
    const unaligned = threeNotes();
    const signal = unaligned.subarray(0, Math.floor(unaligned.length / FRAME) * FRAME);
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
