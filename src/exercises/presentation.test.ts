// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES } from './registry';
import type { Voice } from '../audio/output/synth';
import { PRESENTATION_LABELS } from './types';
import type { AnyExerciseDefinition, Presentation } from './types';
import { widestSettings } from '../testing/settingsSpace';

/**
 * The by-eye / by-ear axis, asked of every exercise rather than of one.
 *
 * It arrived in a merge with nothing asserting it anywhere, which is the
 * shape of thing that works on the screen it was written for and quietly
 * does nothing on the next one.
 */

/*
  Derived from the labels rather than written out, because a second copy of
  this list is a copy that goes stale: adding "Playing" left a hardcoded
  pair here failing for the right reason and the wrong one — the exercises
  were correct and the test's own idea of what exists was not. Every
  presentation the UI knows how to name is a real one.

  Not `STORED_PRESENTATIONS` in `state/schema.ts`, which is a different list
  on purpose: that one is a compatibility commitment and may outlive a mode
  the UI has dropped.
*/
const PRESENTATIONS = Object.keys(PRESENTATION_LABELS) as Presentation[];

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
            exercise,
            settings,
            result: null,
            onRespond: () => {},
            audio,
            // This asks what each prompt *sounds* on mount. A microphone
            // reporting a silent room would be an answer, which is the one
            // thing that would change what is being measured here.
            audioIn: { listen: async () => ({ heard: false as const, reason: 'unavailable' as const }) },
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
            // room. MIDI 21 to 108 is a piano.
            //
            // The length floor is 40ms, not a quarter of a second. A
            // quarter second was right while every exercise played
            // pitches — you cannot hear what a note *is* in less — and
            // it is wrong for one that plays time: a metronome click is
            // meant to be a click, and at 160bpm a sixteenth is 93ms, so
            // a 250ms attack would run over the next two. The quarter
            // second is kept below for the exercises it is about, told
            // apart by whether they sound more than one pitch.
            for (const voice of played.flat()) {
              expect(
                voice.midi >= 21 && voice.midi <= 108,
                `${definition.id} plays MIDI ${voice.midi}, outside a piano`,
              ).toBe(true);
              expect(
                voice.duration >= 0.04,
                `${definition.id} plays something lasting ${voice.duration}s, which is silence`,
              ).toBe(true);
              expect(Number.isFinite(voice.start) && voice.start >= 0).toBe(true);
            }

            /*
              And the quarter second, for the exercises it is actually
              about: the ones asking what a pitch *is*, which cannot be
              heard in less.

              Named rather than detected. The obvious detection — "it
              only ever sounds one pitch" — is wrong for the rhythm
              exercise, which sounds two: the figure and a count-in
              click an octave above it, so the count-in is not mistaken
              for the rhythm. A rule that tried to infer the intent from
              the output would have to understand that, and would be
              guessing. The list below is a fact about the test, like
              `registry.test.ts`'s table of wrong answers, and the case
              after it fails if an entry stops naming a real exercise.
            */
            if (!PERCUSSIVE.has(definition.id)) {
              for (const voice of played.flat()) {
                expect(
                  voice.duration >= 0.25,
                  `${definition.id} plays a pitch for only ${voice.duration}s`,
                ).toBe(true);
              }
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
/**
 * Exercises whose sound is struck rather than sustained.
 *
 * One, so far. Its attacks have to be shorter than the gap to the next
 * one or the rhythm is unreadable — at 160bpm a sixteenth is 93ms — and
 * its count-in is a click, which is a click on purpose.
 */
const PERCUSSIVE = new Set(['rhythm-id']);

describe('what a percussive exercise is exempt from', () => {
  it('names only exercises that exist', () => {
    // So the exemption cannot outlive the thing it exempts, which is how
    // a carve-out quietly becomes a hole.
    for (const id of PERCUSSIVE) {
      expect(EXERCISE_TYPES.map((d) => d.id), `${id} is exempted and does not exist`)
        .toContain(id);
    }
  });
});

describe('settings that cannot change the question', () => {
  /*
    Swept over every exercise rather than demonstrated on one.

    It used to be demonstrated on `key-id`, whose clef and read-source
    were inert whenever the question was heard. That exercise has no
    heard question any more (ADR 0028), so the example went — and an
    example going is a bad reason for a property to stop being checked.
    The property is about any field that declares itself conditional:
    it has to be hidden somewhere and shown somewhere, or the predicate
    is either hiding a working control or decorating one that is always
    on.
  */
  const settingsFor = (d: AnyExerciseDefinition, over: object) =>
    d.settings.coerce({ ...(d.settings.defaults as object), ...over });

  const shown = (d: AnyExerciseDefinition, over: object) => d.settings.fields
    .filter((f) => f.relevant?.(settingsFor(d, over)) ?? true)
    .map((f) => f.id);

  /**
   * Settings shapes a user can actually reach.
   *
   * Presentation is not the only thing a field can depend on — the
   * Picardy third waits on a minor key being in play — so a sweep over
   * the two modes alone would call that field "never shown" and be
   * wrong about a control that works. Widening the other axes is the
   * same lesson the palette sweeps keep teaching.
   */
  const SHAPES = [
    { presentation: 'listen' as const },
    { presentation: 'read' as const },
    { presentation: 'listen' as const, modes: ['major', 'minor'] },
    { presentation: 'read' as const, modes: ['major', 'minor'] },
  ];

  /**
   * And the same two presentations with everything else opened up, derived
   * rather than listed.
   *
   * The four shapes above are a hand-written axis list, which is the habit
   * that keeps costing: adding `relevant: (s) => s.borrowed` to the
   * Neapolitan sixth made it invisible in all four and failed this sweep for
   * a control that works perfectly well once borrowing is on. Deriving the
   * widest shape from the schema means a field conditional on a switch
   * nobody thought of here is still seen.
   */
  const widestShapes = (d: AnyExerciseDefinition) => d.presentations
    .map((presentation) => widestSettings(d, { presentation }));

  it('declares a conditional field somewhere, or this sweep is idle', () => {
    const conditional = EXERCISE_TYPES.flatMap(
      (d) => d.settings.fields.filter((f) => f.relevant !== undefined).map((f) => `${d.id}:${f.id}`),
    );
    expect(conditional.length).toBeGreaterThan(2);
  });

  it('hides every conditional field in at least one mode, and shows it in another', () => {
    for (const d of EXERCISE_TYPES) {
      const modes = d.presentations;
      const reachable = SHAPES.filter((shape) => modes.includes(shape.presentation));
      for (const field of d.settings.fields) {
        if (field.relevant === undefined) continue;
        const where = [
          ...reachable.map((shape) => shown(d, shape).includes(field.id)),
          ...widestShapes(d).map((settings) => (field.relevant?.(settings) ?? true)),
        ];
        // A field conditional on something other than presentation —
        // the Picardy third, which waits on a mode being in play — is
        // allowed to be visible in both, so the only thing forbidden is
        // being visible in none.
        expect(where.some(Boolean), `${d.id}: ${field.id} is never shown`).toBe(true);
      }
    }
  });

  it('hides what a heard question cannot use, and shows it again when read', () => {
    // The concrete case, kept because the sweep above would pass over an
    // app where nothing happened to be presentation-dependent. Scale
    // identification has one of each: a clef that only a reader needs,
    // and a playback direction only a listener hears.
    const scale = EXERCISE_TYPES.find((d) => d.id === 'scale-id')!;
    expect(shown(scale, { presentation: 'listen' })).toContain('direction');
    expect(shown(scale, { presentation: 'listen' })).not.toContain('clef');
    expect(shown(scale, { presentation: 'read' })).toContain('clef');
    expect(shown(scale, { presentation: 'read' })).not.toContain('direction');
  });
});
