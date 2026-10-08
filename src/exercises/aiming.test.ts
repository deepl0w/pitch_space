import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES } from './registry';
import { widestSettings } from '../testing/settingsSpace';
import type { AnyExerciseDefinition } from './types';

/**
 * What it means for the schedule to ask for a particular item.
 *
 * Written before `prefer` exists, which is the prospective half of the
 * tester's job that `docs/IN-FLIGHT.md` describes: the failure this guards
 * is the one the schedule cannot detect at runtime, so the contract wants
 * to exist before anything implements it rather than after.
 *
 * **The shape, as agreed.** `generate(spec, { prefer })` carries a wish
 * rather than a command. A definition declares what it can do about one:
 *
 * - `exact` — the item asked for is the item asked. The askable set is a
 *   projection of a setting, so narrowing to one item is exact and
 *   invertible: intervals are semitones × directions, scales are types,
 *   chords are types × inversions.
 * - `lossy` — the wish narrows the field without isolating it. Key
 *   identification can narrow the circle and never to one key; degree
 *   identification aims the degree exactly and cannot aim the key it also
 *   reports.
 * - `none` — the wish is not expressible. A numeral is an *outcome* of
 *   harmony generation and a cell is an outcome of the filler, so there is
 *   no input that means "ask me a `viio`" and there could not be one
 *   without the generator becoming a search.
 *
 * The three-way split is the point rather than a detail. A two-way one —
 * can aim or cannot — invites the four that cannot aim exactly to
 * implement something plausible, and a seam like that does not fail
 * loudly: the schedule records that it aimed, and is confidently wrong
 * about what it taught.
 *
 * **The failure this exists for** is not a definition that declines to aim.
 * It is one that claims `exact` and returns something else, because that is
 * the case nothing downstream can detect.
 */

/** The shape `prefer` will have. Cast, because the type does not exist yet. */
type Aiming = 'exact' | 'lossy' | 'none';
type Aimable = AnyExerciseDefinition & {
  aims?: Aiming;
  generate(spec: { seed: number; settings: unknown; prefer?: string }): { items: readonly string[] };
};

const aimable = () => EXERCISE_TYPES as unknown as Aimable[];

/**
 * Seeds per exercise, measured rather than picked.
 *
 * How many seeds it takes to see every askable item *without* any aiming, at
 * the widest settings — which is the ceiling an aimed generator has to beat
 * and the floor a test of one needs:
 *
 *     rhythm-id     10 seeds for 17 items
 *     key-id        43 for 15
 *     scale-id      59 for 20
 *     degree-id     62 for 14
 *     interval-id  188 for 37
 *     chord-id     778 for 99
 *     progression-id — never, at a fixed bar count; see catalogues.test.ts
 *
 * So a single budget for all of them would be wrong by an order of
 * magnitude at one end: 400 seeds is ample for intervals and demonstrably
 * not enough for chords, which is the mistake this project has now made
 * four times in a day. `exact` needs one seed by definition; `lossy` gets
 * the unaided ceiling with room to spare, because aiming that made an item
 * *harder* to reach would be a defect this should catch.
 */
const UNAIDED_CEILING: Record<string, number> = {
  'rhythm-id': 40, 'key-id': 150, 'scale-id': 200, 'degree-id': 200,
  'interval-id': 600, 'chord-id': 2500,
};
const FALLBACK_CEILING = 2500;

/** A multi-select's options, which may depend on the other settings. */
function resolved(
  field: { options: readonly { id: string }[] | ((s: never) => readonly { id: string }[]) },
  settings: unknown,
): readonly { id: string }[] {
  return typeof field.options === 'function' ? field.options(settings as never) : field.options;
}

/**
 * The items a generator never asked for, having been asked for each of them.
 *
 * Split out so the contract has one statement and two callers: the sweep
 * over whatever declares `lossy`, which is empty, and the stand-ins that
 * show the sweep would catch something if it were not.
 */
function unreached(
  type: { id: string; generate(spec: { seed: number; settings: unknown; prefer?: string }):
    { items: readonly string[] } },
  items: readonly string[], settings: unknown, budget: number,
): string[] {
  return items.filter((item) => {
    for (let seed = 0; seed < budget; seed += 1) {
      if (type.generate({ seed, settings, prefer: item }).items.includes(item)) return false;
    }
    return true;
  });
}

describe('asking for a particular item', () => {
  it('has something that claims it can aim', () => {
    /*
      The guard against everything below passing over an empty set.

      It was `todo` while `prefer` did not exist, with a note saying the
      one-word change belonged in the commit that added `aims` to the first
      definition. This is that commit.
    */
    expect(aimable().filter((d) => d.aims !== undefined && d.aims !== 'none').length)
      .toBeGreaterThan(0);
  });

  it('declares what it can do about a wish, or declares nothing yet', () => {
    // Inert until `aims` exists, and exhaustive the moment it does: a fourth
    // value would be a fourth kind of promise and nothing here would know
    // what to hold it to.
    for (const type of aimable()) {
      if (type.aims === undefined) continue;
      expect(['exact', 'lossy', 'none'], `${type.id} declares an aim nothing understands`)
        .toContain(type.aims);
    }
  });

  it('asks exactly what was asked for, where it claims exact', () => {
    // The whole contract. A definition claiming `exact` and producing
    // something else is the one failure the schedule cannot see: it records
    // that it aimed, and the user's history gains a line about an item they
    // were never asked.
    for (const type of aimable()) {
      if (type.aims !== 'exact') continue;
      const settings = widestSettings(type);
      for (const item of type.items(settings)) {
        const produced = type.generate({ seed: 7919, settings, prefer: item }).items;
        expect(produced, `${type.id} was asked for ${item} and did not ask it`)
          .toContain(item);
      }
    }
  });

  it('ignores a wish the current settings exclude, rather than widening to it', () => {
    /*
      Reachable, and the schedule cannot avoid it: it ranks items by what
      the user has *answered*, not by what their settings currently allow,
      so it will ask for things that were turned off since. A generator
      that honoured the wish by reaching past the settings would hand the
      user a question they had excluded — the same shape as ADR 0017's
      setting that declines to act, pointed the other way.

      The settings win. Narrow a multi-select to one option, wish for one
      of the others, and what comes back must still be from the narrowed
      set.
    */
    for (const type of aimable()) {
      if (type.aims !== 'exact') continue;
      const field = type.settings.fields.find(
        (f): f is Extract<typeof f, { kind: 'multi' }> =>
          f.kind === 'multi' && resolved(f, type.settings.defaults).length > 2,
      );
      if (field === undefined) continue;

      const [kept, excluded] = resolved(field, type.settings.defaults);
      const narrow = type.settings.coerce({
        ...(type.settings.defaults as object), [field.id]: [kept.id],
      });
      const allowed = new Set(type.items(narrow));
      expect(allowed.size, `${type.id} narrowed to nothing`).toBeGreaterThan(0);
      // Only the askable namespace. `exercise.items` also carries what the
      // question *contained* — a degree exercise names the key it was built
      // in — and those were never in `items(settings)` to be narrowed
      // (ADR 0007).
      const askable = new Set(type.items(widestSettings(type)));

      for (const wish of askable) {
        if (allowed.has(wish)) continue;
        for (let seed = 0; seed < 20; seed += 1) {
          const asked = type.generate({ seed, settings: narrow, prefer: wish }).items
            .filter((i: string) => askable.has(i));
          expect(asked.length, `${type.id} asked nothing askable`).toBeGreaterThan(0);
          for (const item of asked) {
            expect(
              allowed.has(item),
              `${type.id} wished ${wish} with only ${kept.id} on, and asked ${item}`,
            ).toBe(true);
          }
        }
        break;
      }
      expect(excluded, `${type.id} has a second option to exclude`).toBeDefined();
    }
  });

  it('freezes only what the wish decides, and nothing else that was varying', () => {
    /*
      The contract above says the wished item must be asked. It says nothing
      about what else may move, so a generator that satisfied every wish by
      always picking the same root, register or spelling would pass it and
      be a worse exercise than one that ignored the wish entirely.

      **"Not frozen" was too weak to see that.** The first version of this
      asked only that aiming produce more than one distinct exercise, which
      a generator can do while collapsing a whole dimension: freezing the
      enharmonic spelling whenever a wish is honoured left everything else
      varying, and that mutant survived.

      So the question is asked per field, and which fields may freeze is
      derived rather than listed. A field the wish *determines* is constant
      within an item group already — group the unaimed exercises by the item
      they produced, and anything constant inside every group is a
      consequence of the item rather than a casualty of aiming. Everything
      that varies *within* a group has to go on varying when aimed, because
      nothing about the wish fixes it.
    */
    for (const type of aimable()) {
      if (type.aims !== 'exact') continue;
      const settings = widestSettings(type);
      const wish = type.items(settings)[0];
      const SEEDS = 40;

      /** Field values across seeds, with the item each exercise produced. */
      const sweep = (prefer?: string) => {
        const rows: { item: string; fields: Record<string, string> }[] = [];
        for (let seed = 0; seed < SEEDS; seed += 1) {
          const exercise = type.generate({
            seed, settings, ...(prefer === undefined ? {} : { prefer }),
          }) as unknown as Record<string, unknown> & { items: readonly string[] };
          rows.push({
            item: [...exercise.items].sort().join(','),
            fields: Object.fromEntries(
              Object.entries(exercise).map(([k, v]) => [k, JSON.stringify(v)]),
            ),
          });
        }
        return rows;
      };

      const free = sweep();
      const aimed = sweep(wish);

      /** Fields the item decides: constant inside every group that shares one. */
      const byItem = new Map<string, typeof free>();
      for (const row of free) byItem.set(row.item, [...(byItem.get(row.item) ?? []), row]);
      const decided = (field: string) => [...byItem.values()]
        .every((group) => new Set(group.map((r) => r.fields[field])).size === 1);

      const collapsed: string[] = [];
      for (const field of Object.keys(free[0].fields)) {
        const variedFreely = new Set(free.map((r) => r.fields[field])).size > 1;
        const variesAimed = new Set(aimed.map((r) => r.fields[field])).size > 1;
        if (variedFreely && !variesAimed && !decided(field)) collapsed.push(field);
      }

      expect(collapsed, `${type.id} aimed at ${wish} stopped varying`).toEqual([]);
      // The sweep has to have found something varying, or the loop above
      // compared nothing: a generator frozen already would pass in silence.
      expect(
        Object.keys(free[0].fields).filter((f) => new Set(free.map((r) => r.fields[f])).size > 1)
          .length,
        `${type.id} varies nothing at all over ${SEEDS} seeds`,
      ).toBeGreaterThan(1);
    }
  });

  it('reaches what was asked for, where it claims lossy', () => {
    /*
      Weaker than `exact` on purpose: lossy means the field narrows, not
      that it closes. The budget is the unaided ceiling, so an aim that made
      an item *harder* to find than no aim at all still fails.

      **Nothing declares `lossy` today, so this loop runs over nothing**, and
      [ADR 0032](../../docs/adr/0032-the-generator-is-a-draw-not-a-search.md)
      is right that an empty sweep is indistinguishable from a tautology
      from the outside. It is the first and not the second, and the case
      below is how that is shown rather than argued: the predicate this uses
      is held against stand-ins that break the contract in each of the two
      ways a real one could. The record says the difference is between a
      line nobody has crossed and a thing that cannot happen — so the answer
      belongs in a test that fails, not in a sentence.
    */
    for (const type of aimable()) {
      if (type.aims !== 'lossy') continue;
      const settings = widestSettings(type);
      const budget = UNAIDED_CEILING[type.id] ?? FALLBACK_CEILING;
      const missed = unreached(type, [...type.items(settings)], settings, budget);
      expect(missed, `${type.id} was asked for these and never asked them in ${budget} seeds`)
        .toEqual([]);
    }
  });

  it('is a check that can fail, which is what the empty case rests on', () => {
    /*
      The predicate above, run against generators that exist only here.

      Two ways a lossy aim goes wrong, and the second is the one worth the
      trouble. A generator that ignores the wish outright is the obvious
      failure. A generator that honours it *eventually*, past the budget, is
      the subtle one: it reaches every item, so a test asking only "is this
      reachable" passes it, while in practice the schedule's preference has
      made the item rarer than leaving it alone would have. The budget is
      the unaided ceiling precisely so that counts as a failure, and that
      sentence was a comment with nothing behind it until now.
    */
    const items = ['a', 'b', 'c'];
    const stub = (
      id: string, reach: (seed: number, prefer: string | undefined) => string,
    ) => ({ id, generate: ({ seed, prefer }: { seed: number; prefer?: string }) =>
      ({ items: [reach(seed, prefer)] }) });

    const biasing = stub('biasing', (seed, prefer) =>
      (seed % 3 === 0 && prefer !== undefined ? prefer : 'a'));
    expect(unreached(biasing, items, null, 40),
      'a generator that biases towards the wish should satisfy the check').toEqual([]);

    const ignoring = stub('ignoring', () => 'a');
    expect(unreached(ignoring, items, null, 40),
      'a generator that ignores the wish should fail the check').toEqual(['b', 'c']);

    const dawdling = stub('dawdling', (seed, prefer) =>
      (seed >= 40 && prefer !== undefined ? prefer : 'a'));
    expect(unreached(dawdling, items, null, 40),
      'aiming that pushes an item past the unaided ceiling should fail the check')
      .toEqual(['b', 'c']);
    // And the same generator passes on a budget that forgives it, so the
    // case above is the budget doing the work rather than the stub never
    // reaching anything.
    expect(unreached(dawdling, items, null, 60)).toEqual([]);
  });

  it('still generates something answerable when it ignores the wish', () => {
    /*
      The `none` case, and the reason it is a declaration rather than an
      omission. An exercise that cannot aim must still take the argument and
      carry on, because the schedule will pass one — it has no way to know
      which exercise it is talking to, and a generator that threw or returned
      an empty question on an unexpected argument would take the screen down
      for the two exercises that are honest about their limits.
    */
    for (const type of aimable()) {
      if (type.aims === undefined) continue;
      const settings = widestSettings(type);
      const asked = type.items(settings)[0];
      const produced = type.generate({ seed: 7919, settings, prefer: asked }).items;
      expect(produced.length, `${type.id} produced nothing when given a wish`)
        .toBeGreaterThan(0);
    }
  });
});
