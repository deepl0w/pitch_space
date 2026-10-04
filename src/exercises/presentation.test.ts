// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES } from './registry';
import type { Voice } from '../audio/output/synth';
import type { AnyExerciseDefinition, Presentation } from './types';

/**
 * The by-eye / by-ear axis, asked of every exercise rather than of one.
 *
 * It arrived in a merge with nothing asserting it anywhere, which is the
 * shape of thing that works on the screen it was written for and quietly
 * does nothing on the next one.
 */

const PRESENTATIONS: Presentation[] = ['read', 'listen'];

function withPresentation(d: AnyExerciseDefinition, presentation: Presentation) {
  return { ...d.settings.defaults, presentation };
}

describe('how an exercise is asked', () => {
  it('declares at least one presentation, and only real ones', () => {
    for (const d of EXERCISE_TYPES) {
      expect(d.presentations.length, d.id).toBeGreaterThan(0);
      for (const p of d.presentations) expect(PRESENTATIONS).toContain(p);
      expect(new Set(d.presentations).size, `${d.id} lists one twice`).toBe(d.presentations.length);
    }
  });

  it('only offers a presentation it declares', () => {
    for (const d of EXERCISE_TYPES) {
      const field = d.settings.fields.find((f) => f.id === 'presentation');
      if (!field) continue;
      expect(field.kind).toBe('choice');
      if (field.kind !== 'choice') continue;
      for (const option of field.options) {
        expect(d.presentations, `${d.id} offers ${option.id}`).toContain(option.id as Presentation);
      }
    }
  });

  /**
   * The other direction, which is the one that had gone wrong.
   *
   * The check above skips an exercise with no presentation field, so
   * `interval-id` declared both presentations, implemented both — the prompt
   * suppresses playback when reading, and `intervalQuestionScore` engraves
   * the two notes — and offered neither. The home card and the exercise's own
   * subtitle both advertised reading intervals off the staff and there was no
   * way to get there; the clef picker beside it changed nothing, because
   * nothing was ever drawn.
   *
   * A capability declared and not reachable is worse than one not built: the
   * app says it can do something it cannot be made to do.
   */
  it('offers every presentation it declares', () => {
    for (const d of EXERCISE_TYPES) {
      if (d.presentations.length < 2) continue;

      const field = d.settings.fields.find((f) => f.id === 'presentation');
      expect(field, `${d.id} declares ${d.presentations.join(' and ')} and offers no choice`)
        .toBeDefined();
      if (field?.kind !== 'choice') continue;

      const offered = field.options.map((o) => o.id);
      for (const presentation of d.presentations) {
        expect(offered, `${d.id} declares ${presentation} with no way to pick it`)
          .toContain(presentation);
      }
    }
  });

  it('defaults to something it supports', () => {
    for (const d of EXERCISE_TYPES) {
      expect(d.presentations, d.id).toContain(d.settings.defaults.presentation);
    }
  });

  /**
   * The exercise carries how it was asked, rather than the screen reading the
   * setting back at render time — otherwise changing the setting mid-question
   * changes the question, and an attempt stops being comparable with one
   * asked the other way.
   */
  it('records on the exercise the presentation it was generated with', () => {
    for (const d of EXERCISE_TYPES) {
      for (const presentation of d.presentations) {
        for (let seed = 0; seed < 20; seed++) {
          const exercise = d.generate({ seed, settings: withPresentation(d, presentation) });
          expect(exercise.presentation, `${d.id} seed ${seed}`).toBe(presentation);
        }
      }
    }
  });

  it('shows the question on the staff when read, and nothing when heard', () => {
    for (const d of EXERCISE_TYPES) {
      if (!d.questionScore) continue;
      for (let seed = 0; seed < 20; seed++) {
        if (d.presentations.includes('read')) {
          const spec = d.questionScore(d.generate({ seed, settings: withPresentation(d, 'read') }));
          expect(spec, `${d.id} read seed ${seed}`).not.toBeNull();
          // Something to look at: notes, or a signature that is the question.
          expect(spec!.notes.length > 0 || spec!.key !== undefined).toBe(true);
        }
        if (d.presentations.includes('listen')) {
          const spec = d.questionScore(d.generate({ seed, settings: withPresentation(d, 'listen') }));
          expect(spec, `${d.id} listen seed ${seed} shows the answer`).toBeNull();
        }
      }
    }
  });

  it('still reproduces from its seed whichever way it is asked', () => {
    for (const d of EXERCISE_TYPES) {
      for (const presentation of d.presentations) {
        const settings = withPresentation(d, presentation);
        expect(JSON.stringify(d.generate({ seed: 4242, settings })))
          .toBe(JSON.stringify(d.generate({ seed: 4242, settings })));
      }
    }
  });

  // A guard against this whole file passing vacuously: if no exercise
  // declared both, every assertion above would hold without testing anything.
  it('covers an exercise that can be asked both ways', () => {
    expect(EXERCISE_TYPES.some((d) => d.presentations.length === 2)).toBe(true);
  });
});

/**
 * A declared presentation has to produce a question, not just an option.
 *
 * The check above asks whether the settings panel offers each presentation
 * the exercise declares. That is the shallow half, and it passed while key
 * identification's heard mode showed nothing at all: no staff, because
 * `questionScore` returns null for a heard question by design, and no
 * sound, because its prompt had been written as a reading exercise and
 * never took `audio`. The option was pickable and the screen behind it was
 * empty.
 *
 * So this asks the deeper question. **Whatever the presentation, something
 * has to reach the user.** Read means a score to look at; heard means audio
 * actually played. Nothing about an exercise's own internals is asserted —
 * only that choosing a mode the app offers gives you something to answer.
 *
 * Rendering the prompt is the only way to ask it, because "does this
 * sound" is not in `ExerciseDefinition` and should not be: an exercise
 * sounds by calling `audio.play`, which is behaviour rather than a
 * declaration, and a flag saying "I make noise" would be one more thing
 * that can disagree with the code.
 */
describe('every declared presentation gives the user something', () => {
  const SEEDS = [1, 7919, 104_729];

  for (const definition of EXERCISE_TYPES) {
    for (const presentation of definition.presentations) {
      it(`${definition.id} asked by ${presentation}`, () => {
        for (const seed of SEEDS) {
          const settings = definition.settings.coerce({
            ...(definition.settings.defaults as object), presentation,
          });
          const exercise = definition.generate({ seed, settings });

          const score = definition.questionScore?.(exercise) ?? null;
          const played: Voice[][] = [];
          const audio = { play: (voices: readonly Voice[]) => { played.push([...voices]); } };

          const root = createRoot(document.createElement('div'));
          // `createElement` rather than JSX so this stays a .ts file, which
          // the rest of it is.
          act(() => root.render(createElement(definition.Prompt, {
            exercise, settings, result: null, onRespond: () => {}, audio,
          })));
          const sounded = played.some((v) => v.length > 0);
          act(() => root.unmount());

          expect(
            score !== null || sounded,
            `${definition.id} asked by ${presentation} (seed ${seed}) shows no score and plays nothing`,
          ).toBe(true);

          // And the right one for the mode: a heard question that only
          // draws a staff is a reading question wearing the wrong label.
          if (presentation === 'listen') {
            expect(sounded, `${definition.id} by ear is silent`).toBe(true);

            // And audible, not merely scheduled. A voice outside the
            // instrument's range, or with no duration, is a `play` call
            // that satisfies "it sounded" and produces nothing a person
            // can hear — which is the same defect one layer down, and the
            // user role could not settle it from a microphone in a real
            // room. MIDI 21 to 108 is a piano; a quarter of a second is
            // the shortest thing worth calling a note here.
            for (const voice of played.flat()) {
              expect(
                voice.midi >= 21 && voice.midi <= 108,
                `${definition.id} plays MIDI ${voice.midi}, outside a piano`,
              ).toBe(true);
              expect(
                voice.duration >= 0.25,
                `${definition.id} plays a note lasting ${voice.duration}s`,
              ).toBe(true);
              expect(Number.isFinite(voice.start) && voice.start >= 0).toBe(true);
            }
          }
        }
      });
    }
  }
});

/**
 * A control that cannot affect the next question is not offered.
 *
 * Worse than a missing control, because it invites the user to set
 * something and then ignores them. Key identification asked by ear left
 * its clefs and its read-source enabled and inert — the question is a
 * cadence, no staff is drawn (ADR 0020), and neither field chooses
 * anything. Found by the user role configuring an exercise rather than
 * reading one.
 *
 * **The general form of this is not written here, and the reason is worth
 * keeping.** The obvious version — generate once per option and require
 * the questions to differ — fails on `degree-id`'s "Named as", which
 * chooses between numbers and solfège. That field changes what the
 * buttons say and not what is asked, which is legitimate and is not
 * inertness. The contract has no way to say "this one affects the
 * rendering rather than the question", so a sweep cannot tell a
 * display-only field from a dead one, and a test that cannot tell them
 * apart would either pass vacuously or fail on a working control. Written
 * out, tried, and abandoned rather than weakened.
 */
describe('settings that cannot change the question', () => {
  const keyId = EXERCISE_TYPES.find((d) => d.id === 'key-id')!;

  function shownWhen(presentation: Presentation): string[] {
    const settings = keyId.settings.coerce({
      ...(keyId.settings.defaults as object), presentation,
    });
    return keyId.settings.fields
      .filter((f) => f.relevant?.(settings) ?? true)
      .map((f) => f.id);
  }

  it('hides the clef and the source when the question is heard', () => {
    const heard = shownWhen('listen');
    expect(heard).not.toContain('clefs');
    expect(heard).not.toContain('readSource');
    // And still offers the one that decides what is asked.
    expect(heard).toContain('presentation');
  });

  it('shows them again when the question is read', () => {
    // Otherwise "hides them" would pass for a field nobody ever sees.
    const read = shownWhen('read');
    expect(read).toContain('clefs');
    expect(read).toContain('readSource');
  });
});
