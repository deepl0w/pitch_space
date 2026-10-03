import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES } from './registry';
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
