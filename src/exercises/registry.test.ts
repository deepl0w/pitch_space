import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES, exerciseTypeOr, findExerciseType } from './registry';
import type { AnyExerciseDefinition } from './types';

/**
 * The contract, asked of every registered exercise type.
 *
 * This is the test that keeps the promise the registry makes: that adding
 * the sixth exercise costs an import and an array entry. Everything asserted
 * here is something the screen, the settings panel or the attempt log
 * assumes without checking, so a new type that breaks one of them fails here
 * rather than on the one screen nobody clicked.
 */

/** Seeds from both ends of what `makeRng` accepts, plus an ordinary one. */
const SEEDS = [0, 1, 7919, 0xffffffff];

/** The shape docs/ROADMAP.md gives: colon-joined, lower-case kind first. */
const ITEM_ID = /^[a-z]+(:[A-Za-z0-9_#+-]+)+$/;

const RUBBISH: unknown[] = [
  undefined, null, 0, '', 'nonsense', [], {}, { nothing: 'recognisable' },
];

function each(run: (definition: AnyExerciseDefinition) => void) {
  for (const definition of EXERCISE_TYPES) run(definition);
}

describe('the exercise registry', () => {
  it('has something in it', () => {
    // A registry that silently guards nothing would let every assertion
    // below pass vacuously.
    expect(EXERCISE_TYPES.length).toBeGreaterThan(0);
  });

  it('gives every type a distinct id', () => {
    const ids = EXERCISE_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps those ids in the form that is safe to store', () => {
    // An id names a settings slot and appears on every recorded attempt, so
    // it is as much a compatibility commitment as an item id.
    each((d) => expect(d.id).toMatch(/^[a-z][a-z0-9-]*$/));
  });

  it('says what it is, for the screen that has to offer it', () => {
    each((d) => {
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
    });
  });

  it('finds a type by id, and does not invent one', () => {
    each((d) => expect(findExerciseType(d.id)).toBe(d));
    expect(findExerciseType('no-such-exercise')).toBeUndefined();
  });

  it('falls back rather than leaving the screen with nothing', () => {
    // A stored preference can name an exercise a later release removed.
    expect(exerciseTypeOr(null)).toBe(EXERCISE_TYPES[0]);
    expect(exerciseTypeOr('withdrawn-in-a-later-release')).toBe(EXERCISE_TYPES[0]);
    each((d) => expect(exerciseTypeOr(d.id)).toBe(d));
  });
});

describe('every exercise type’s settings', () => {
  it('coerces anything at all into something usable', () => {
    each((d) => {
      for (const stored of RUBBISH) expect(() => d.settings.coerce(stored)).not.toThrow();
    });
  });

  it('coerces an absent document to its own defaults', () => {
    each((d) => expect(d.settings.coerce(undefined)).toEqual(d.settings.defaults));
  });

  it('coerces its own defaults unchanged', () => {
    // Otherwise the first write after a first run rewrites the document,
    // and "has the user configured anything" becomes unanswerable.
    each((d) => expect(d.settings.coerce(d.settings.defaults)).toEqual(d.settings.defaults));
  });

  it('is idempotent, so a round trip through storage changes nothing', () => {
    each((d) => {
      for (const stored of RUBBISH) {
        const once = d.settings.coerce(stored);
        expect(d.settings.coerce(JSON.parse(JSON.stringify(once)))).toEqual(once);
      }
    });
  });

  it('describes every field well enough for the generic panel to render it', () => {
    each((d) => {
      const ids = d.settings.fields.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const field of d.settings.fields) {
        expect(field.label.length).toBeGreaterThan(0);
        if (field.kind === 'toggle') continue;
        expect(field.options.length).toBeGreaterThan(0);
        const optionIds = field.options.map((o) => o.id);
        expect(new Set(optionIds).size).toBe(optionIds.length);
        for (const option of field.options) expect(option.label.length).toBeGreaterThan(0);
      }
    });
  });

  it('starts every field on a value that is one of its own options', () => {
    // A select whose value matches no option renders blank, and the first
    // change writes a setting the user never chose.
    each((d) => {
      for (const field of d.settings.fields) {
        if (field.kind === 'choice') {
          expect(field.options.map((o) => o.id)).toContain(field.selected(d.settings.defaults));
        }
        if (field.kind === 'multi') {
          const known = field.options.map((o) => o.id);
          for (const chosen of field.selected(d.settings.defaults)) expect(known).toContain(chosen);
        }
      }
    });
  });

  it('can read back what each of its controls writes', () => {
    each((d) => {
      for (const field of d.settings.fields) {
        if (field.kind !== 'choice') continue;
        for (const option of field.options) {
          const next = field.apply(d.settings.defaults, option.id);
          expect(field.selected(next)).toBe(option.id);
          // And the written settings must survive storage, or the control
          // springs back the next time the app opens.
          expect(field.selected(d.settings.coerce(next))).toBe(option.id);
        }
      }
    });
  });
});

describe('every exercise type’s generator', () => {
  it('is reproducible from its seed', () => {
    each((d) => {
      for (const seed of SEEDS) {
        const spec = { seed, settings: d.settings.defaults };
        expect(d.generate(spec)).toEqual(d.generate(spec));
      }
    });
  });

  it('accepts every seed the app can mint', () => {
    each((d) => {
      for (const seed of SEEDS) {
        expect(() => d.generate({ seed, settings: d.settings.defaults })).not.toThrow();
      }
    });
  });

  it('generates from coerced rubbish as happily as from defaults', () => {
    each((d) => {
      for (const stored of RUBBISH) {
        const settings = d.settings.coerce(stored);
        expect(() => d.generate({ seed: 42, settings })).not.toThrow();
      }
    });
  });

  it('labels what it produced with its own id and the seed it was given', () => {
    each((d) => {
      for (const seed of SEEDS) {
        const exercise = d.generate({ seed, settings: d.settings.defaults });
        expect(exercise.type).toBe(d.id);
        expect(exercise.seed).toBe(seed);
      }
    });
  });

  it('reports the items it exercised, in the form the schedule will key on', () => {
    each((d) => {
      for (let seed = 0; seed < 100; seed++) {
        const { items } = d.generate({ seed, settings: d.settings.defaults });
        expect(items.length).toBeGreaterThan(0);
        for (const item of items) expect(item).toMatch(ITEM_ID);
      }
    });
  });

  it('engraves an answer the renderer could accept, where it offers one', () => {
    each((d) => {
      if (!d.answerScore) return;
      for (let seed = 0; seed < 50; seed++) {
        const spec = d.answerScore(d.generate({ seed, settings: d.settings.defaults }));
        expect(spec.notes.length).toBeGreaterThan(0);
        expect(['treble', 'bass', 'alto', 'tenor']).toContain(spec.clef);
      }
    });
  });
});
