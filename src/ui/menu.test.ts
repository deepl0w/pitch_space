import { describe, expect, it } from 'vitest';
import { EXERCISE_MENU, REFERENCE_MENU, entryFor } from './menu';

describe('the menu', () => {
  /*
   * There was a test here asserting that every family's card carries the
   * family's name and is marked ready, and a companion asserting that no
   * built type is unreachable from a card. Both are gone, and neither was
   * deleted for being wrong.
   *
   * They could not fail. `BUILT` maps `family.id` to `route`, `family.name`
   * to `name` and `true` to `ready`, and it comes first in `EXERCISE_MENU`
   * — so the lookup cannot miss, the name cannot differ and `ready` cannot
   * be false. `EXERCISE_TYPES` is the families flattened, so a type in no
   * family is not a type the second one could see. Checked both by
   * mutation: deleting a member left them green.
   *
   * They are fossils of a design that changed. The duplication they were
   * written against — a title written once on the card and once on the
   * screen — went away when the menu started deriving the name, and what
   * was left guarded nothing. Kept as documentation they would be worse
   * than absent, because a passing test reads as a guarantee.
   *
   * What they were reaching for is real and now lives where it can fail:
   * registry.test.ts asks the filesystem whether every exercise directory
   * is registered, and asks whether family ids are distinct and storable.
   */

  it('lists every built exercise before the unbuilt ones', () => {
    const firstUnbuilt = EXERCISE_MENU.findIndex((e) => !e.ready);
    const lastBuilt = EXERCISE_MENU.map((e) => e.ready).lastIndexOf(true);
    if (firstUnbuilt >= 0) expect(lastBuilt).toBeLessThan(firstUnbuilt);
  });

  it('never lists a route twice, so a built exercise has no planned twin', () => {
    const routes = [...EXERCISE_MENU, ...REFERENCE_MENU].map((e) => e.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('gives every entry something to say', () => {
    for (const entry of [...EXERCISE_MENU, ...REFERENCE_MENU]) {
      expect(entry.name.length, entry.route).toBeGreaterThan(0);
      expect(entry.blurb.length, entry.route).toBeGreaterThan(0);
    }
  });

  // Reference screens read their own heading from here, so a missing lede is
  // an empty paragraph on the page rather than a type error.
  it('gives every reference screen a lede for its heading', () => {
    for (const entry of REFERENCE_MENU) {
      expect(entry.lede, entry.route).toBeTruthy();
    }
  });

  it('resolves a route, and says so loudly when it cannot', () => {
    expect(entryFor('scales').name).toBe('Scales');
    expect(() => entryFor('no-such-screen')).toThrow(/No menu entry/);
  });
});
