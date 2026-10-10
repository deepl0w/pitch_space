import { describe, expect, it } from 'vitest';
import { analyse } from '../audio/capture/listen';
import { mix, pluckedString, silence, startingAt } from '../audio/testing/signals';
import { freqOf } from '../theory/pitch';
import { intervalPlayed } from './interval-id/intervals';
import type { AudioIn, PlayedNote } from './types';
import { alwaysHears } from './testing/audioIn';

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
 * The adapter, as it will be: a spread and one added bit.
 *
 * Typed as `AudioIn` deliberately — this assignment is the test. If the
 * two shapes drift, the compiler refuses it here instead of at whichever
 * screen first wires a microphone up.
 *
 * **It was the identity function when this was written, and ADR 0047
 * changed that an hour later.** The seam now reports *whether it heard*
 * as well as what, because a refused microphone and a silent room are
 * different answers and scoring the first as the second would reset a
 * line's streak. Capture cannot supply that bit — only whoever asked for
 * the microphone knows — so the adapter is no longer nothing.
 *
 * What the assignment still proves is the part that mattered: a real
 * `ListenResult` reaches an exercise with **no per-field work**, so
 * `PlayedNote` is a structural subset of `HeardNote` and adding a field
 * to one fails here rather than at a call site. The wrapper is one known
 * constant, visible in this line; adaptation would be the spread growing.
 */
const microphone: AudioIn = alwaysHears({ heard: true, ...analyse(threeNotes(), RATE) });

/** The notes from a take that was heard, or a failure saying it was not. */
async function notesFrom(audio: AudioIn): Promise<readonly PlayedNote[]> {
  const take = await audio.listen(3);
  // Narrowing rather than a cast: if the seam ever stops carrying the bit,
  // this stops compiling instead of quietly reading an absent field.
  if (!take.heard) throw new Error(`expected a heard take, got ${take.reason}`);
  return take.notes;
}

describe('what capture hands an exercise', () => {
  it('arrives as the interface describes it, with nothing in between', async () => {
    const notes = await notesFrom(microphone);

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
    const notes = await notesFrom(microphone);

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
    const notes = await notesFrom(microphone);
    const first: PlayedNote = notes[0];
    expect(typeof first.frequencyHz).toBe('number');
    expect(first.frequencyHz).toBeCloseTo(freqOf(69), -1);
  });
});

/**
 * The distinction ADR 0047 bought, asserted rather than carried in a type.
 *
 * `notesFrom` narrows on `heard` and that is right, but a helper that
 * narrows is not a claim that narrowing is *required* — it reads as
 * defensive style, and the next helper written beside it may well cast
 * instead. What 0047 actually bought is that a refused microphone and a
 * silent room cannot be confused, and the way it bought it is that the
 * refused arm has no `notes` to read at all.
 *
 * So the claim is stated as the thing the compiler forbids.
 * `@ts-expect-error` fails to compile when the error it names does *not*
 * occur, which makes it the one way to assert a negative about types in a
 * file that has to stay green — and `npm run typecheck` is in the commit
 * gate, so flattening `Heard` into `{ heard: boolean; notes?: ... }` would
 * be caught here rather than by whoever later reads an absent field as an
 * empty take.
 */
describe('a take that was not heard', () => {
  const refused: AudioIn = alwaysHears({ heard: false, reason: 'refused' });
  const silentRoom: AudioIn = alwaysHears({ heard: true, notes: [] });

  it('offers no notes to read, so it cannot be scored as a silent one', async () => {
    const take = await refused.listen(3);
    // @ts-expect-error a take that was not heard has no notes
    void take.notes;
    expect(take.heard).toBe(false);
  });

  /**
   * And the two really are different answers, which is the defect the
   * record exists to prevent: scoring a refusal as a silent take resets
   * the item's streak and drags the figure the home screen reports.
   */
  it('is not the same answer as a take that heard nothing', async () => {
    const nothing = await silentRoom.listen(3);
    const none = await refused.listen(3);

    expect(nothing.heard).toBe(true);
    expect(none.heard).toBe(false);
    // The silent room has an answer — an empty one. Asserted through the
    // same narrowing a consumer has to do, so this case fails the same way
    // a consumer would if the bit went away.
    if (!nothing.heard) throw new Error('a silent take should still be heard');
    expect(nothing.notes).toEqual([]);
    if (none.heard) throw new Error('a refused take should not be heard');
    expect(none.reason).toBe('refused');
  });

  /**
   * The reason is for the screen rather than for the exercise, and it is
   * a closed set — a free-text reason would be a string nobody could
   * branch on and every screen would spell differently.
   */
  it('says why, in words a screen can act on', async () => {
    const take = await refused.listen(3);
    if (take.heard) throw new Error('expected a refused take');
    expect(['refused', 'unavailable']).toContain(take.reason);
  });
});

/**
 * Two attacks at one pitch reach the exercise as two notes.
 *
 * `intervalPlayed` now takes **exactly** two readable notes, so what a
 * learner is told depends on how many the chain delivers — and every unit
 * test of that rule hands it a note list built by hand. Nothing checked
 * that a real take produces the count those tests assume.
 *
 * The risk sits on top of a deliberate decision. ADR 0035 merges two
 * attacks that agree about pitch and did not get louder, and names the
 * hazard it accepts: *the same pitch struck twice looks exactly like a
 * cluster*. A unison is the one interval a learner answers by doing
 * precisely that.
 *
 * **What this holds, and how much room it has.** Measured from 0.12s to
 * 1.2s apart: the chain delivers two notes at every spacing, so a played
 * unison answers. The room varies enormously with spacing, and the tight
 * end is tight — raising `NEW_NOTE_RISE` from 2 to **3** merges the pair
 * struck 0.12s apart, while the widely spaced ones survive past 30. So
 * this *is* a guard on the merge rule, bounded by its closest case.
 *
 * **Two earlier versions of this paragraph were wrong, in opposite
 * directions, and the second is the instructive one.** The first claimed
 * tightening the rule would break the unison; a mutation showed it did
 * not, at the spacings then tested. The second recorded the margin as
 * "about a thousand" — measured on that three-spacing fixture and left
 * standing when 0.12s and 0.25s were added to it, so the figure described
 * a test that no longer existed. A number taken before the thing it
 * describes was changed is the shape of staleness this repository warns
 * about, arriving inside the comment that was correcting the first error.
 *
 * What it does hold is the end-to-end claim no unit test can: that a
 * played unison arrives as two notes and answers, where every test of
 * `intervalPlayed` is fed a note list built by hand. A change anywhere in
 * the chain that collapsed them — a different detector, a different onset
 * threshold, a rewritten `assemble` — fails here.
 */
describe('a unison answered by playing it', () => {
  const pluck = (hz: number, at: number, seed: number) => startingAt(
    pluckedString({ frequencyHz: hz, seconds: 0.7, sampleRate: RATE, amplitude: 0.5, seed }),
    at, RATE,
  );

  it.each([0.12, 0.25, 0.6, 1.2])('survives assembly when the two are %ss apart', (gap) => {
    const take = analyse(
      mix(pluck(440, 0.2, 1), pluck(440, 0.2 + gap, 2), silence(0.2 + gap + 1, RATE)),
      RATE,
    );

    expect(take.notes, `two strikes ${gap}s apart were merged into one`).toHaveLength(2);
    expect(intervalPlayed(take.notes), 'a played unison did not answer').toBe(0);
  });

  /**
   * And the hesitation is still three, which is what makes the rule above
   * worth having rather than an artefact of the fixtures. If assembly ever
   * merged the re-strike, refusing on a count would be guarding a case the
   * chain no longer produces.
   */
  it('is not what a re-struck note arrives as', () => {
    const take = analyse(
      mix(pluck(440, 0.2, 1), pluck(440, 1.1, 2), pluck(554.365, 2.0, 3), silence(3, RATE)),
      RATE,
    );

    /*
      The durable half: the chain delivers three notes. True whatever is
      decided about what to do with them, because it is a fact about
      assembly rather than about grading — and it is what makes a rule
      based on the count worth having at all. If a re-strike were merged,
      nothing downstream would ever see the ambiguity.
    */
    expect(take.notes.length, 'the hesitation was merged, so no rule can see it')
      .toBeGreaterThan(2);

    /*
      **And the half that moves.** Refusing is the current answer and not
      the only defensible one: ignoring repeated attacks on one pitch would
      remove the same symptom and grade the learner correctly, which is
      friendlier, and that choice is back with the person whose call it is.
      Under that resolution this line becomes `toBe(4)` rather than
      `toBeNull()`, and nothing else in this file changes.

      Marked rather than loosened. A test that fails loudly when the
      behaviour moves is the point; what it should not do is make somebody
      work out which of its assertions was the decision.
    */
    expect(intervalPlayed(take.notes), 'three attacks were graded anyway').toBeNull();
  });
});

/**
 * What capture makes of a chord today, which is the other side of the
 * predicate that keeps a played unison answerable.
 *
 * `MERGE_CENTS` and `NEW_NOTE_RISE` merge two attacks that agree about
 * pitch and did not get louder. A played unison needs them not to; **a
 * chord is a cluster of simultaneous pitches and would need the opposite
 * from the same code.** ADR 0035 accepts that hazard in the abstract —
 * *the same pitch struck twice looks exactly like a cluster* — and this is
 * what it costs once an exercise layer wants both readings.
 *
 * **Measured, and worse than merging.** A struck C major triad does not
 * come back as one of its three notes: it comes back as a single reading
 * around 66 Hz, two octaves below the root, which is the common
 * periodicity of the cluster and a pitch nobody played. Rolled, it is
 * three onsets of which two are unreadable and the third is that same
 * subharmonic.
 *
 * So this is not a gap to be closed by relaxing the merge. Chord
 * identification answered by playing needs a chroma feature the
 * repository does not have — `audio/dsp/` holds five modules and none is
 * chroma, which is itself a claim that has been got wrong five times by
 * reading the directory tree as an inventory.
 *
 * **What is asserted is the safety, not the figure.** The frequency is a
 * property of this synthesis and pinning it would pin a measurement with
 * no ground truth. What has to hold is that nothing downstream turns this
 * into an answer: `intervalPlayed` refuses, rather than grading a learner
 * on a pitch the detector invented.
 */
describe('a chord played into a monophonic chain', () => {
  const pluck = (hz: number, at: number, seed: number) => startingAt(
    pluckedString({ frequencyHz: hz, seconds: 0.9, sampleRate: RATE, amplitude: 0.4, seed }),
    at, RATE,
  );
  const TRIAD = [261.63, 329.63, 392.0];
  const near = (hz: number | null) => hz !== null
    && TRIAD.some((played) => Math.abs(1200 * Math.log2(hz / played)) < 50);

  it.each([
    ['struck together', 0],
    ['rolled, as a guitarist would', 0.06],
  ])('is not heard as the notes it contains when %s', (_name, spread) => {
    const take = analyse(
      mix(...TRIAD.map((hz, i) => pluck(hz, 0.2 + i * spread, i + 1)), silence(1.4, RATE)),
      RATE,
    );

    const readable = take.notes.filter((note) => note.frequencyHz !== null);
    expect(readable.length, 'the chain read every note of the chord')
      .toBeLessThan(TRIAD.length);
    expect(readable.filter((note) => near(note.frequencyHz)), 'a reading matched a played note')
      .toEqual([]);
  });

  /**
   * And the safety that matters today: nothing turns it into an answer.
   * A chord played at an interval question is ambiguous input, and the
   * rule that refuses a hesitation refuses this too — for the same reason
   * and without knowing it is a chord.
   */
  it('is refused rather than graded on a pitch nobody played', () => {
    for (const spread of [0, 0.06]) {
      const take = analyse(
        mix(...TRIAD.map((hz, i) => pluck(hz, 0.2 + i * spread, i + 1)), silence(1.4, RATE)),
        RATE,
      );
      expect(intervalPlayed(take.notes), `spread ${spread}`).toBeNull();
    }
  });
});
