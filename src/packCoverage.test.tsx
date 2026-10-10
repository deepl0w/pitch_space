// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { PracticeScreen } from './ui/screens/PracticeScreen';
import { EXERCISE_TYPES } from './exercises/registry';
import type { AudioOut } from './exercises/types';
import {
  COMPASS, FURTHEST_SHIFT, nearestRecorded, parsePack, uncovered, withinReach,
} from './audio/output/pack';
import type { PackNote } from './audio/output/pack';
import { PACKS } from './audio/output/sampled';

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
 * Each built pack's note table, read out of the pack itself.
 *
 * From `public/packs/`, not from `packs.json`: the index carries a count and
 * the table is inside the binary, and it is the table that decides how far a
 * note gets resampled. Read with `node:fs` under jsdom, which works because
 * vitest runs the file in node and only the globals are the browser's.
 */
const PACK_NOTES: Record<string, readonly PackNote[]> = Object.fromEntries(
  PACKS.map((pack) => [
    pack.id,
    parsePack(new Uint8Array(readFileSync(join('public', 'packs', pack.file)))).manifest.notes,
  ]),
);

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

  /**
   * And against the packs that actually shipped, which is the half this file
   * was missing.
   *
   * Everything above builds its own note tables, so it tests `uncovered` and
   * says nothing about any real pack. That is how four packs shipped an
   * octave sharp: the arithmetic was right, the tables were made up, and
   * nothing in the suite ever looked at `packs.json`. Reading the built index
   * is what turns this from a check of a function into a check of the
   * product.
   *
   * **Not a demand that every pack cover everything**, which is the version
   * of this test that would have been wrong. A pack is allowed to stop where
   * its instrument stops — a concert flute has no notes below middle C and a
   * violin none below the G under it — and `withinReach` is what keeps those
   * notes from being answered by a recording dragged an octave and a half
   * down. So the property is the one that actually has to hold: of the notes
   * a pack does claim, none is further than `FURTHEST_SHIFT` from a
   * recording, and the ones it declines are declined for a reason this file
   * can state.
   */
  it('either reaches a note honestly or declines it', () => {
    expect(PACKS.length, 'no packs are built').toBeGreaterThan(0);
    const overreaching = PACKS.flatMap((pack) => everything
      .filter((midi) => withinReach(PACK_NOTES[pack.id], midi))
      .filter((midi) => Math.abs(nearestRecorded(PACK_NOTES[pack.id], midi).midi - midi)
        > FURTHEST_SHIFT)
      .map((midi) => `${pack.id} claims MIDI ${midi}`));
    expect([...new Set(overreaching)]).toEqual([]);

    /*
      And the declining is real rather than vacuous. A pack that declined
      everything would satisfy the case above and leave the app silently
      synthesised, which is the failure that hides behind a green guard.

      Named notes rather than counts over `everything`, because the sweep
      above draws fresh seeds and does not promise to ask for a bass note on
      any given run — a first version of this asserted that the flute
      declined something and passed or failed with the draw. These are
      properties of the packs themselves: the octave around middle C is what
      every instrument has, and the bottom of the compass is below all six by
      more than an octave.
    */
    for (const pack of PACKS) {
      const notes = PACK_NOTES[pack.id];
      expect(withinReach(notes, COMPASS.lowest),
        `${pack.id} claims to reach MIDI ${COMPASS.lowest}`).toBe(false);
      for (const midi of [60, 64, 67, 72]) {
        expect(withinReach(notes, midi), `${pack.id} cannot reach MIDI ${midi}`).toBe(true);
      }
    }
  });
});
