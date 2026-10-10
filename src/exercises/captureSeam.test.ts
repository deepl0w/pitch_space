import { describe, expect, it } from 'vitest';
import { analyse } from '../audio/capture/listen';
import { mix, pluckedString, silence, startingAt } from '../audio/testing/signals';
import { freqOf } from '../theory/pitch';
import type { AudioIn, PlayedNote } from './types';

/**
 * The seam capture arrives through, checked before anything uses it.
 *
 * `AudioIn` is declared in `exercises/types.ts` rather than imported from
 * `audio/capture`, the same way `AudioOut` is — that is what keeps a
 * microphone out of the exercise layer and lets a prompt render under
 * jsdom. The cost of declaring a shape instead of importing it is that
 * the two can drift, and the drift would surface at the one adapter that
 * joins them, in a file nobody is reading, on the day it is written.
 *
 * **The strongest form of the claim is that there is nothing to adapt.**
 * If a real `ListenResult` satisfies `AudioIn.listen`'s return type
 * unchanged, then `PlayedNote` is a structural subset of `HeardNote` and
 * the future adapter is `async () => analyse(...)`. That is asserted
 * below by assignment rather than by comparing field lists: adding a
 * field to `PlayedNote` that capture does not produce stops this file
 * compiling, and `npm run typecheck` is in the commit gate.
 *
 * It cannot flip the home screen's claim test, which is the one thing to
 * be careful of here — checked rather than assumed: `appIsWiredToCapture`
 * filters `.test.ts` out, because capture reached from a test shows the
 * chain can be driven and not that a learner's answer travels it.
 */

const RATE = 44_100;
const PLAYED = [440, 523.25, 659.25];

/** Three plucked notes, the fixture the capture tests already judge by. */
function threeNotes(): Float32Array {
  const note = (hz: number, at: number, seed: number) => startingAt(
    // Seeded, so a tolerance failure here is reproducible rather than a
    // different burst of excitation noise every run.
    pluckedString({ frequencyHz: hz, seconds: 0.7, sampleRate: RATE, amplitude: 0.5, seed }),
    at, RATE,
  );
  return mix(note(PLAYED[0], 0.2, 1), note(PLAYED[1], 1.0, 2), note(PLAYED[2], 1.8, 3),
    silence(2.8, RATE));
}

/**
 * The adapter, as it will be: nothing.
 *
 * Typed as `AudioIn` deliberately — this assignment is the test. If the
 * two shapes drift, the compiler refuses it here instead of at whichever
 * screen first wires a microphone up.
 */
const microphone: AudioIn = { listen: async () => analyse(threeNotes(), RATE) };

describe('what capture hands an exercise', () => {
  it('arrives as the interface describes it, with nothing in between', async () => {
    const { notes } = await microphone.listen(3);

    // The population. Every assertion below is over this list, and a
    // detector that returned nothing would satisfy all of them.
    expect(notes.length, 'capture produced no notes to check').toBe(PLAYED.length);
  });

  /**
   * And the three fields a prompt will read carry what was played.
   *
   * Not a shape check: a `PlayedNote` whose fields were all present and
   * all null would satisfy the assignment above and tell an exercise
   * nothing. What makes the seam worth having is that the values survive
   * it, so they are asserted against the notes the fixture actually
   * contains.
   */
  it('carries a time, a length and a pitch for each note', async () => {
    const { notes } = await microphone.listen(3);

    notes.forEach((note, i) => {
      const where = `note ${i}`;
      expect(note.startSeconds, where).toBeGreaterThanOrEqual(0);
      expect(note.durationSeconds, where).toBeGreaterThan(0);
      expect(note.frequencyHz, where).not.toBeNull();
      // A quarter tone, which is the tolerance the capture tests use: far
      // wider than the detector's error and far narrower than a semitone,
      // so this fails on a wrong note and not on a real room.
      const cents = 1200 * Math.log2(note.frequencyHz! / PLAYED[i]);
      expect(Math.abs(cents), `${where} is ${cents.toFixed(0)} cents out`).toBeLessThan(50);
    });

    // In order, because a prompt grading a performance reads them as a
    // sequence and nothing else restores it.
    const starts = notes.map((n) => n.startSeconds);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  /**
   * The subset claim stated once in the other direction, so a reader who
   * changes `PlayedNote` finds out why the compiler objected.
   *
   * `freqOf` is here only to make the note concrete: what a prompt gets
   * is a frequency, not a MIDI number, and the exercise layer converts.
   */
  it('gives a frequency an exercise can name, not a note it has already named', async () => {
    const { notes } = await microphone.listen(3);
    const first: PlayedNote = notes[0];
    expect(typeof first.frequencyHz).toBe('number');
    expect(first.frequencyHz).toBeCloseTo(freqOf(69), -1);
  });
});
