import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXERCISE_FAMILIES, EXERCISE_TYPES, exerciseTypeOr, findExerciseType } from './registry';
import { itemLabel } from './itemLabel';
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

  it('labels every option for a reader rather than for the parser', () => {
    // The interval exercise offered its clefs as `treble`, `alto`, `tenor`,
    // `bass` while every other exercise offered `Treble` and `Bass` — the
    // option id leaking into the dropdown. The ids are a storage format and
    // the labels are the only part the user reads, so they are allowed to
    // coincide only where the id is already how a musician writes it.
    const written = /^(ii|iii|vi|vii|[IVX]+o?|[1-7])$/;
    each((d) => {
      for (const field of d.settings.fields) {
        if (field.kind === 'toggle') continue;
        for (const option of field.options) {
          if (option.label === option.id && written.test(option.id)) continue;
          expect(
            option.label,
            `${d.id}.${field.id} offers "${option.id}" as its own label`,
          ).not.toBe(option.id);
        }
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

  it('produces no item the readout would have to show as a storage key', () => {
    // "How this has gone" is the one place a learner is told what they know,
    // and it lists `Exercise.items` directly. An item kind nothing can name
    // reaches them as `progression:major:ii`.
    each((d) => {
      for (let seed = 0; seed < 100; seed++) {
        for (const item of d.generate({ seed, settings: d.settings.defaults }).items) {
          expect(itemLabel(item), `${d.id} produces an unnameable item`).not.toBe(item);
        }
      }
    });
  });

  it('engraves an answer the renderer could accept, where it offers one', () => {
    each((d) => {
      if (!d.answerScore) return;
      for (let seed = 0; seed < 50; seed++) {
        const spec = d.answerScore(d.generate({ seed, settings: d.settings.defaults }));
        // Something to look at, which is not the same as notes. A key
        // signature with no notes is the whole answer to a key-identification
        // exercise, and the renderer draws the stave for it; an empty stave
        // with no signature either would be a blank box.
        expect(
          spec.notes.length > 0 || spec.key !== undefined,
          `${d.id} seed ${seed}: nothing to engrave`,
        ).toBe(true);
        expect(['treble', 'bass', 'alto', 'tenor']).toContain(spec.clef);
      }
    });
  });
});

/**
 * Registration, asked of the filesystem rather than of the registry.
 *
 * Every assertion in the file above iterates `EXERCISE_TYPES`, which is the
 * families flattened — so an exercise that exists on disk and is in no
 * family is invisible to all of them, and they pass. That is not a gap in
 * the assertions; it is the shape of the question. "Did anyone forget to
 * register this?" cannot be answered by the register.
 *
 * It is the same defect as the reading presentation the app declared and
 * never offered: everything built, nothing wired, nothing red. The scan
 * walks the directory for the same reason `architecture.test.ts` does — an
 * untracked exercise is still an unregistered one.
 */
describe('every exercise on disk', () => {
  const EXERCISES = new URL('.', import.meta.url).pathname;

  /** A directory with an `index.ts` is an exercise; anything else is support. */
  function builtDirectories(): string[] {
    return readdirSync(EXERCISES, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== 'render')
      .map((e) => e.name)
      .filter((name) => existsSync(join(EXERCISES, name, 'index.ts')));
  }

  it('finds the ones that are registered, so the scan is not looking at nothing', () => {
    expect(builtDirectories().length).toBeGreaterThanOrEqual(EXERCISE_TYPES.length);
  });

  it('is in a family, so nothing is built and unreachable', () => {
    const registry = readFileSync(join(EXERCISES, 'registry.ts'), 'utf8');
    for (const name of builtDirectories()) {
      expect(
        registry.includes(`from './${name}'`),
        `src/exercises/${name}/ has an index.ts and registry.ts does not import it`,
      ).toBe(true);
    }
  });
});

/**
 * The second id namespace, which the families introduced and nothing
 * checked.
 *
 * There are two, and both are compatibility commitments. A **type** id is
 * what the attempt log stores and what every recorded item is keyed by — the
 * tests above cover those. A **family** id is a route, so it is what a link
 * or a bookmark carries, and it had no tests at all: `EXERCISE_FAMILIES`
 * appeared in exactly one test file and only in assertions that could not
 * fail.
 *
 * Two families sharing an id puts two cards on one route. `findFamily`
 * returns the first and the second is unreachable, which is the same defect
 * as an exercise registered in no family and would be found the same way —
 * by a user clicking a card and getting someone else's screen.
 */
describe('family ids', () => {
  it('are distinct, so no card is shadowed by another on its route', () => {
    const ids = EXERCISE_FAMILIES.map((f) => f.id);
    expect(new Set(ids).size, `duplicate family id in ${ids.join(', ')}`).toBe(ids.length);
  });

  it('do not collide with a type id belonging to another family', () => {
    // A family id and a member id may be the same string — a family of one
    // names itself after its member, and `findFamily` accepts either — but
    // a family sharing an id with some *other* family's member makes the
    // route ambiguous, and findFamily resolves it by declaration order.
    for (const family of EXERCISE_FAMILIES) {
      const owner = EXERCISE_FAMILIES.find((f) => f.members.some((m) => m.id === family.id));
      expect(owner === undefined || owner === family,
        `family ${family.id} shares its route with a member of ${owner?.id}`).toBe(true);
    }
  });

  it('are storable and linkable, like the type ids beside them', () => {
    for (const family of EXERCISE_FAMILIES) {
      expect(family.id, `${family.id} is not a usable route`).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(family.name.length, `${family.id} has no name`).toBeGreaterThan(0);
      expect(family.members.length, `${family.id} has no members`).toBeGreaterThan(0);
    }
  });
});
