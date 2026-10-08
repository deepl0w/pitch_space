// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { PracticeScreen } from './ui/screens/PracticeScreen';
import { EXERCISE_TYPES } from './exercises/registry';
import type { AudioOut } from './exercises/types';

/**
 * What a sample pack will have to cover, measured from the app rather than
 * decided.
 *
 * `docs/instrument-pack-format.md` gives a pack a note table of recorded
 * semitones and leaves the player to resample the rest from the nearest. A
 * pack whose lowest recording sits above the lowest note an exercise can ask
 * for does not fail: it transposes something a long way and keeps playing,
 * which is the quiet kind of wrong — the note sounds, the learner answers
 * what they heard, and the app marks them down.
 *
 * So the number that pack has to satisfy is a property of the generators,
 * and the honest way to get it is to ask the app what it plays rather than
 * to write a range down beside them. This collects every pitch the app asks
 * to be sounded, through the path a user takes: the practice screen, the
 * settings panel, the Start button, and whatever the prompt then hands to
 * `audio.play`.
 *
 * **What this is not.** A sample of the seeds that came up, not a proof
 * about every seed. It is a *floor* — a pack must cover at least this — and
 * the manifest check that lands with the builder should be written against
 * the generators' declared range if one ever exists. Said plainly because a
 * floor read as a ceiling is how a pack ends up sized from a lucky draw.
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The compass a sampled instrument can physically hold: A0 to C8, the 88
 * keys of a piano. Not a tuning choice — it is the widest thing anybody is
 * going to record, so a generator asking outside it cannot be sampled at
 * all, only synthesised.
 */
const COMPASS = { lowest: 21, highest: 108 };

/** How many rounds to draw per exercise. Each mount is a fresh seed. */
const ROUNDS = 4;

/**
 * Every pitch the app asked to be sounded, by exercise.
 *
 * Driven rather than read: the settings are widened by pressing the chips
 * that are off, the way a user would, so the sweep covers the pool the app
 * can actually be put into rather than the defaults it starts at. Pressing
 * rather than writing to the store is also what keeps a field that refuses
 * a selection — an empty pool is not a setting — refusing it here too.
 */
function pitchesAsked(): Map<string, { midi: number[]; offersListening: boolean }> {
  const byExercise = new Map<string, { midi: number[]; offersListening: boolean }>();

  for (const definition of EXERCISE_TYPES) {
    const midi: number[] = [];
    let offersListening = false;
    for (let round = 0; round < ROUNDS * 2; round += 1) {
      /*
        Half the rounds as the exercise starts, half with every chip
        pressed on. Both, rather than only the widest, because widening is
        itself a thing that can go wrong: pressing every chip on the rhythm
        exercise leaves it asking for no pitches at all, so a sweep that
        only ever widened would have dropped a whole exercise from the
        measurement and read as five of seven rather than as a gap.
      */
      const widen = round % 2 === 1;
      const audio: AudioOut = {
        play: (voices) => { for (const voice of voices) midi.push(voice.midi); },
      };
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      act(() => root.render(
        <PracticeScreen exerciseId={definition.id} audio={audio} />,
      ));

      const press = (match: (text: string) => boolean) => {
        const button = [...host.querySelectorAll('button')]
          .find((b) => match(b.textContent ?? ''));
        if (button) act(() => button.click());
      };

      // Heard rather than read, where the exercise offers the choice: a
      // question nobody listens to asks for no pitches at all.
      offersListening ||= [...host.querySelectorAll('button')]
        .some((b) => b.textContent === 'Listening');
      press((text) => text === 'Listening');

      /*
        Twice, because turning one chip on can offer chips that were not
        there before — a tonic the previous mode could not build — and a
        single pass would leave those off. Not to a fixed point: a third
        pass changed nothing on any exercise here, and a loop that ran
        until nothing moved would hide a field that oscillated.
      */
      for (let pass = 0; widen && pass < 2; pass += 1) {
        for (const chip of [...host.querySelectorAll('.chips button')]) {
          const button = chip as HTMLButtonElement;
          if (button.getAttribute('aria-pressed') === 'false' && !button.disabled) {
            act(() => button.click());
          }
        }
      }

      press((text) => text === 'Start');
      act(() => root.unmount());
      host.remove();
    }
    byExercise.set(definition.id, { midi, offersListening });
  }
  return byExercise;
}

/**
 * Whether a pack's note table reaches everything in `asked`.
 *
 * Written now, against the field names
 * `docs/instrument-pack-format.md` fixes, so that the check waiting for the
 * builder is one line rather than a design. Returns what is missing rather
 * than a boolean: "the pack does not cover this" is not a useful failure
 * message, and the two ends come apart — a pack can be short at the bottom
 * and fine at the top.
 */
export function uncovered(
  notes: readonly { midi: number }[],
  asked: readonly number[],
): { below: number[]; above: number[] } {
  const recorded = notes.map((n) => n.midi);
  const lowest = Math.min(...recorded);
  const highest = Math.max(...recorded);
  return {
    below: [...new Set(asked.filter((m) => m < lowest))].sort((a, b) => a - b),
    above: [...new Set(asked.filter((m) => m > highest))].sort((a, b) => a - b),
  };
}

describe('the range a sampled pack will have to cover', () => {
  const asked = pitchesAsked();
  const everything = [...asked.values()].flatMap((a) => a.midi);

  /**
   * The population first, because every case below is satisfied by an empty
   * one. A screen that stopped playing on Start, or a chip rename that made
   * the sweep press nothing, would leave this file green and measuring
   * nothing at all — which is the failure this suite has shipped before and
   * the reason the count is asserted rather than assumed.
   */
  it('is measured from exercises that actually asked for pitches', () => {
    /*
      Which exercises should have been heard is the app's own answer, not a
      number kept here: an exercise that offers a Listening chip is saying
      it can be answered by ear, and one that offers it and then asks for no
      pitches is either a silent question or a sweep that stopped working.
      Either way it is this file's business to say so rather than to pass
      with a smaller population than it thinks it has.
    */
    const silent = [...asked]
      .filter(([, a]) => a.offersListening && a.midi.length === 0)
      .map(([id]) => id);
    expect(silent, 'offers listening and played nothing').toEqual([]);
    expect([...asked].filter(([, a]) => a.midi.length > 0).length).toBeGreaterThan(4);
    expect(everything.length).toBeGreaterThan(100);
  });

  /**
   * The constraint. Everything the app asks for is a note an instrument
   * could have been recorded playing — otherwise no pack can serve it and
   * the sampled voice has a hole the synthesised one does not.
   */
  it('is inside the compass an instrument can be recorded over', () => {
    const outside = [...asked].flatMap(([id, { midi }]) => midi
      .filter((m) => m < COMPASS.lowest || m > COMPASS.highest)
      .map((m) => `${id} asked for MIDI ${m}`));
    expect([...new Set(outside)]).toEqual([]);
  });

  /**
   * And it is wide enough to be worth the arithmetic: an app that only ever
   * played one octave would not need resampling at all, and a sweep that had
   * collapsed to a single note would satisfy every case above.
   */
  it('spans more than an octave', () => {
    expect(Math.max(...everything) - Math.min(...everything)).toBeGreaterThan(12);
  });

  /**
   * The check that is waiting for a manifest, exercised against tables built
   * here so that it is a check rather than a declaration. Both directions,
   * because a pack short at one end and generous at the other is the likely
   * mistake — five octaves placed an octave too high is still five octaves.
   */
  it('is the thing a note table will be compared against', () => {
    const lowest = Math.min(...everything);
    const highest = Math.max(...everything);

    // Every third semitone, which is what the format says VCSL gives.
    const table = (from: number, to: number) => {
      const notes = [];
      for (let midi = from; midi <= to; midi += 3) notes.push({ midi });
      return notes;
    };

    expect(uncovered(table(lowest - 3, highest + 3), everything))
      .toEqual({ below: [], above: [] });

    const short = uncovered(table(lowest + 12, highest + 12), everything);
    expect(short.below.length, 'a pack an octave too high covers the bottom')
      .toBeGreaterThan(0);
    expect(short.above, 'and has room to spare at the top').toEqual([]);
  });
});
