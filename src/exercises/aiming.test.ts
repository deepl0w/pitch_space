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

describe('asking for a particular item', () => {
  it.todo('has something that claims it can aim', () => {
    /*
      The guard against everything below passing over an empty set.

      It is `todo` rather than failing because `prefer` has not landed, and a
      red suite in `main` stops every other worktree's run — the project's own
      argument that an ignored check is worse than none applies to a check
      everybody has learned to see red. Removing `.todo` is the one-word
      change that arms this file, and it belongs in the commit that adds
      `aims` to the first definition.
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

  it('reaches what was asked for, where it claims lossy', () => {
    // Weaker on purpose: lossy means the field narrows, not that it closes.
    // The budget is the unaided ceiling, so an aim that made an item harder
    // to find than no aim at all still fails.
    for (const type of aimable()) {
      if (type.aims !== 'lossy') continue;
      const settings = widestSettings(type);
      const budget = UNAIDED_CEILING[type.id] ?? FALLBACK_CEILING;
      for (const item of type.items(settings)) {
        let reached = false;
        for (let seed = 0; seed < budget && !reached; seed += 1) {
          reached = type.generate({ seed, settings, prefer: item }).items.includes(item);
        }
        expect(reached, `${type.id} was asked for ${item} and never asked it in ${budget} seeds`)
          .toBe(true);
      }
    }
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
