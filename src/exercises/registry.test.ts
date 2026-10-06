import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { optionIds, widestSettings } from '../testing/settingsSpace';
import { EXERCISE_FAMILIES, EXERCISE_TYPES, exerciseTypeOr, findExerciseType } from './registry';
import { itemLabel } from './itemLabel';
import { SCALE_TYPES } from '../theory/scale';
import { CHORD_TYPES } from '../theory/chord';
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

  /**
   * A document with history in it, which is what a real user has.
   *
   * `RUBBISH` above asks whether nonsense survives and the idempotence case
   * asks whether a round trip is stable. Neither asks the question a
   * returning user poses: a document written by an older build, carrying
   * settings they chose, beside keys this build has never heard of — the
   * grade dial 0027 removed, a field a newer release added, a spelling that
   * changed. Everything else here tests defaults or a document this build
   * wrote, and a user's storage is neither.
   */
  describe('a stored document from another release', () => {
    /** Every field moved off its default, so there is something to lose. */
    const configured = (d: AnyExerciseDefinition) =>
      widestSettings(d) as Record<string, unknown>;

    it('is worth asking, because coerce does not simply return what it was given', () => {
      // The control. If coerce were the identity function every case below
      // would pass and none of them would mean anything.
      each((d) => {
        // A string, so nothing throws on the way to being rejected, and one
        // no field could legitimately hold: not an option id, not a number,
        // not a list, not a boolean.
        const wrecked = Object.fromEntries(
          Object.keys(configured(d)).map((key) => [key, 'not-a-value']),
        );
        expect(d.settings.coerce(wrecked), `${d.id} returned its input`).not.toEqual(wrecked);
      });
    });

    it('keeps every setting the user chose, whatever else is in the file', () => {
      each((d) => {
        const chosen = configured(d);
        const back = d.settings.coerce({
          ...chosen,
          // Three shapes of key this build does not have: one withdrawn
          // (0027's grade dial), one renamed, one from a future release.
          grade: 7,
          presentationMode: 'listen',
          somethingLater: { nested: true },
        }) as Record<string, unknown>;
        for (const key of Object.keys(chosen)) {
          expect(back[key], `${d.id}.${key} did not survive the unknown keys`)
            .toEqual(chosen[key]);
        }
      });
    });

    it('keeps the one field a document written before the others has', () => {
      /*
        The other half, and the commoner one: an old document is not a new
        document plus junk, it is a new document minus most of it. Asked a
        field at a time so a failure names the field rather than the
        exercise.

        Unknown keys *inside* an exercise's settings are dropped, where
        `coerceSettings` keeps an unknown *exercise* whole — see
        `schema.test.ts`. The asymmetry is deliberate on the document side
        and worth knowing on this one: a field added by a newer build does
        not survive an older build touching that exercise, which is the
        thing the document-level comment's own reasoning argues against.
      */
      each((d) => {
        const chosen = configured(d);
        for (const key of Object.keys(chosen)) {
          const back = d.settings.coerce({ [key]: chosen[key] }) as Record<string, unknown>;
          expect(back[key], `${d.id}.${key} was dropped when it stood alone`)
            .toEqual(chosen[key]);
        }
      });
    });
  });

  it('describes every field well enough for the generic panel to render it', () => {
    each((d) => {
      const ids = d.settings.fields.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const field of d.settings.fields) {
        expect(field.label.length).toBeGreaterThan(0);
        if (field.kind === 'toggle') continue;
        // Resolved against the defaults, because a multi-select's options
        // may depend on the other settings — a tonic the chosen mode
        // cannot build is not offered.
        const options = field.kind === 'multi' && typeof field.options === 'function'
          ? field.options(d.settings.defaults) : field.options as readonly { id: string; label: string }[];
        expect(options.length).toBeGreaterThan(0);
        const ids = options.map((o) => o.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const option of options) expect(option.label.length).toBeGreaterThan(0);
      }
    });
  });

  it('labels every option for a reader rather than for the parser', () => {
    // The interval exercise offered its clefs as `treble`, `alto`, `tenor`,
    // `bass` while every other exercise offered `Treble` and `Bass` — the
    // option id leaking into the dropdown. The ids are a storage format and
    // the labels are the only part the user reads, so they are allowed to
    // coincide only where the id is already how a musician writes it.
    /*
      Any plain number counts as written out, not just a scale degree.

      This allowed 1 to 7 and nothing else, which was the range the
      degree buttons needed and became wrong twice in one sitting: an
      accidental count starts at 0 and a bar count reaches 16. What the
      rule is actually for is a *slug* reaching the screen — `treble`,
      `m7b5`, `dom7b13` — and a number is never that. The unit lives in
      the field's caption, which is what stopped these controls saying
      "bars" six times and wrapping onto two rows.

      A time signature is the same case one step on: `4/4` is the id and
      it is also exactly how a musician writes it, so spelling it out
      would be the invention.
    */
    const written = /^(ii|iii|vi|vii|[IVX]+o?|\d{1,3}|\d{1,2}\/\d{1,2})$/;
    each((d) => {
      for (const field of d.settings.fields) {
        if (field.kind === 'toggle') continue;
        for (const option of (field.kind === 'multi' && typeof field.options === 'function'
          ? field.options(d.settings.defaults) : field.options as readonly { id: string; label: string }[])) {
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
          const known = optionIds(field, d.settings.defaults);
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
/**
 * The schedule's denominator, held to the generator in both directions.
 *
 * `items(settings)` is what the spaced-repetition count is a fraction of,
 * and it is a second enumeration of something the generator already
 * decides — which is exactly the shape that has gone wrong here before.
 * The progression palette is the same shape, and the day it was swept
 * over the real product of the controls rather than one configuration it
 * turned up a numeral the user had no button for.
 *
 * So both directions, against the generator rather than against a copy of
 * the list:
 *
 * - **Containment.** Everything generated must be listed, or the count
 *   promises less work than there is and an item can never come due.
 * - **Reachability.** Everything listed must be generable, or the count
 *   promises work that cannot be set — a due badge that never clears,
 *   which is worse than no badge. This is ADR 0011's obligation on a
 *   catalogue, applied to a list the schedule reads.
 *
 * **Both directions at every settings shape, with no carve-out.** There
 * used to be one: reachability was asserted only at the widest
 * settings, because the progression palette is deliberately blind to
 * the grade and `viio` in major needed grade 6 and six bars, so at
 * narrow settings the list contained a numeral nothing could produce.
 *
 * ADR 0027 removed the grade and gave the diminished triads a switch of
 * their own, which closed that gap without anyone noticing it had. The
 * comment outlived the dial it described by several commits and went on
 * justifying an exemption nothing needed — a stale claim is worse than
 * no claim, because it reads as a decision. Measured at defaults and at
 * the widest, over every exercise and both presentations: nothing is
 * listed that cannot be produced.
 *
 * Swept over the widened settings as well as the defaults, for the reason
 * the progression sweep learned: a new control is a new dimension, and
 * holding them all at their defaults checks one configuration out of
 * however many exist.
 */
describe('the verdict a grading reports', () => {
  /**
   * `Result.correct` and `Result.outcomes` are two statements about one
   * answer, and nothing has ever asked whether they agree.
   *
   * It matters because of what became of them. `attempt.correct` is
   * persisted and validated — `schema.ts` refuses an attempt without a
   * boolean there — and then **nothing reads it**: `tallyItems` folds the
   * outcomes and the screen counts from the fold. So a verdict that
   * contradicted its own detail would be stored, would pass validation,
   * and would be invisible to every consumer. Hard-coding it `true` in
   * `attemptFrom` survived four of five mutants for exactly that reason.
   *
   * Measured first over forty seeds and every response shape the seven
   * accept — junk, perfect, wrong, short and empty — 1,240 gradings with
   * `correct` equal to "every outcome correct" in all of them. Asserted
   * here over twenty, which is 380 of them; the floor below is read from
   * that rather than carried over from the wider sweep, which is a
   * mistake this took on its first run.
   */
  it('agrees with the outcomes underneath it', () => {
    let compared = 0;
    for (const definition of EXERCISE_TYPES) {
      const settings = definition.settings.coerce(definition.settings.defaults);
      for (let seed = 0; seed < 20; seed += 1) {
        const exercise = definition.generate({ seed, settings });
        const shaped: unknown[] = [undefined, null, 'nonsense', [], {}];
        const asAny = exercise as unknown as {
          numerals?: readonly unknown[]; onsets?: readonly number[];
        };
        if (asAny.numerals) {
          shaped.push({ numerals: [...asAny.numerals] });
          shaped.push({ numerals: asAny.numerals.map(() => 'I') });
        }
        if (asAny.onsets) {
          shaped.push({ taps: [...asAny.onsets] }, { taps: [] });
        }
        for (const response of shaped) {
          let result;
          try { result = definition.grade(exercise, response); } catch { continue; }
          compared += 1;
          const everyOutcomeRight = result.outcomes.length > 0
            && result.outcomes.every((o) => o.correct);
          /*
            If this ever fails legitimately — a grader awarding the round
            to someone who got part of it right — then the two fields have
            stopped being one statement and the attempt log needs to say
            which one a consumer should believe. That is a decision rather
            than a bug, and this is where it would be noticed, since
            nothing downstream reads `correct` at all.
          */
          expect(result.correct, `${definition.id} seed ${seed}: verdict and outcomes disagree`)
            .toBe(everyOutcomeRight);
        }
      }
    }
    // The responses have to have been gradeable, or this compared nothing:
    // two exercises take structured answers and throw on everything else.
    expect(compared, 'no response was gradeable anywhere').toBeGreaterThan(300);
  });
});

describe('every exercise type’s askable items', () => {
  const WIDE: Record<string, unknown> = {
    maxAccidentals: 7, window: 24, bars: 16,
    // The rhythm exercise's own axes. Every control is a dimension of
    // this sweep; these were the third set to arrive without it.
    tuplets: true, rests: true, syncopation: 3, tempo: 60,
    modes: ['major', 'minor'], varyCadence: true, appliedDominants: true, borrowed: true,
    sevenths: true, diminished: true, picardy: true, neapolitan: true,
    degrees: [1, 2, 3, 4, 5, 6, 7], directions: ['up', 'down'],
    // Every scale type. Read off the catalogue rather than listed, so a
    // twenty-first type widens this sweep by existing — the way `bars`,
    // `styles` and the vocabulary switches each did not, and each had to
    // be noticed afterwards.
    types: [...SCALE_TYPES.map((t) => t.id), ...CHORD_TYPES.map((t) => t.id)],
    inversions: true,
  };
  /**
   * Enough seeds that the reachability half is about the selector and not
   * about luck.
   *
   * Chord identification has the largest askable set — twenty-four
   * qualities times each one's inversions, about eighty-five items — and
   * at 220 seeds a given one is missed roughly seven times in a hundred
   * by chance alone, which failed this sweep naming an item that is
   * perfectly reachable. The budget is set from the largest set rather
   * than guessed: at 1500 seeds the chance of missing any reachable item
   * anywhere is far below the chance of a real defect.
   */
  const SWEEP_SEEDS = Array.from({ length: 1500 }, (_, i) => i * 7919 + 1);

  /** The item kinds an exercise tests, as opposed to merely contains. */
  function tested(type: AnyExerciseDefinition, settings: unknown): Set<string> {
    const kinds = new Set<string>();
    for (const seed of SWEEP_SEEDS) {
      const exercise = type.generate({ seed, settings });
      for (const outcome of gradedOutcomes(type, exercise)) kinds.add(outcome);
    }
    return kinds;
  }

  /**
   * A wrong-but-well-formed answer for each exercise, keyed by id.
   *
   * Grading reports which items an answer *tested* whether or not it got
   * them right, so a deliberately wrong response is the honest way to
   * enumerate what can be credited. It has to be well formed, though: the
   * first version of this passed `{}` to every grader, and the
   * progression grader walks `response.numerals` — which is `undefined`
   * there, so it reported no outcomes and the test concluded the exercise
   * never tests any of its own numerals. A generic empty object is not a
   * generic answer.
   *
   * Per exercise and in the test rather than on the definition, because
   * this is a thing the test needs and not a thing the app does. The case
   * below fails if a new exercise ships without a row.
   */
  const WRONG_ANSWER: Record<string, (exercise: { numerals?: readonly string[] }) => unknown> = {
    'degree-id': () => ({ degree: -1 }),
    'interval-id': () => ({ semitones: -1 }),
    'key-id': () => ({ keyId: 'not-a-key' }),
    'scale-id': () => ({ typeId: 'not-a-scale' }),
    'chord-id': () => ({ typeId: 'not-a-chord', inversion: -1 }),
    // Nothing tapped: every written note missed, which is a real answer.
    'rhythm-id': () => ({ taps: [] }),
    // One blank per slot: the slots are what carry the numerals, so a
    // shorter list would test fewer items than the exercise contains.
    'progression-id': (e) => ({ numerals: (e.numerals ?? []).map(() => '') }),
  };

  it('has a wrong answer written down for every exercise that ships', () => {
    expect(Object.keys(WRONG_ANSWER).sort()).toEqual(EXERCISE_TYPES.map((t) => t.id).sort());
  });

  /** What grading credits for an exercise, given a wrong answer to it. */
  function gradedOutcomes(type: AnyExerciseDefinition, exercise: { numerals?: string[] }): string[] {
    const answer = WRONG_ANSWER[type.id](exercise);
    return type.grade(exercise, answer).outcomes.map((o: { item: string }) => o.item);
  }

  /**
   * Everything reachable across every length the exercise offers.
   *
   * "Widest settings" is not one settings object where a length is
   * involved, because a template is quoted into a phrase of its own
   * length: `#ivo` lives only in the twelve-bar jazz blues, so sixteen
   * bars does not reach it and neither does any single choice. The union
   * over the lengths is what "some query the app can make" means here,
   * which is the form ADR 0011's obligation actually takes.
   */
  function reachableAnyLength(type: AnyExerciseDefinition, base: Record<string, unknown>): Set<string> {
    const reached = new Set<string>();
    for (const bars of [2, 4, 6, 8, 12, 16]) {
      const settings = type.settings.coerce({ ...base, bars });
      for (const item of tested(type, settings)) reached.add(item);
    }
    return reached;
  }

  for (const presentation of ['read', 'listen'] as const) {
    for (const [label, over] of [['its defaults', {}], ['everything widened', WIDE]] as const) {
      it(`lists every item the generator tests, under ${label} (${presentation})`, () => {
        for (const type of EXERCISE_TYPES) {
          if (!type.presentations.includes(presentation)) continue;
          const settings = type.settings.coerce({
            ...type.settings.defaults, ...over, presentation,
          });
          const listed = new Set(type.items(settings));
          for (const item of tested(type, settings)) {
            expect(listed.has(item), `${type.id} tests ${item} and does not list it`).toBe(true);
          }
        }
      });

      it(`lists nothing the generator cannot test, under ${label} (${presentation})`, () => {
        for (const type of EXERCISE_TYPES) {
          if (!type.presentations.includes(presentation)) continue;
          const base = { ...type.settings.defaults, ...over, presentation };
          const reachable = reachableAnyLength(type, base);
          for (const item of type.items(type.settings.coerce(base))) {
            expect(reachable.has(item), `${type.id} lists ${item} and never tests it`).toBe(true);
          }
        }
      });
    }
  }

  it('narrows with the settings rather than listing everything always', () => {
    // The guard against the pair above passing vacuously over a list that
    // ignores its argument. An exercise whose askable set does not move
    // when its settings do is not answering the question the schedule
    // asked.
    const moved = EXERCISE_TYPES.filter((type) => {
      const narrow = type.items(type.settings.coerce(type.settings.defaults)).length;
      const wide = type.items(type.settings.coerce({ ...type.settings.defaults, ...WIDE })).length;
      return wide > narrow;
    });
    expect(moved.map((t) => t.id).sort()).toEqual(EXERCISE_TYPES.map((t) => t.id).sort());
  });
});

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
