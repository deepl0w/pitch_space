import { describe, expect, it } from 'vitest';
import { EXERCISE_MENU, REFERENCE_MENU, entryFor } from './menu';
import { EXERCISE_FAMILIES } from '../exercises/registry';

describe('the menu', () => {
  /**
   * The point of deriving the card title from the registry. Two strings that
   * happen to match today are two strings that stop matching the first time
   * one is edited, and the symptom is a card that opens a page calling
   * itself something else.
   */
  it('titles every family from the family itself', () => {
    for (const family of EXERCISE_FAMILIES) {
      const entry = EXERCISE_MENU.find((e) => e.route === family.id);
      expect(entry, `${family.id} is missing from the menu`).toBeDefined();
      expect(entry!.name).toBe(family.name);
      expect(entry!.ready).toBe(true);
    }
  });

  /*
   * The obvious companion to the test above — "every built type is reachable
   * from some card" — is *not* here, and deliberately.
   *
   * `EXERCISE_TYPES` is the families flattened, so a type belonging to no
   * family is not a type this file can see; the loop would iterate the
   * families' own members and pass whatever the families said. Written out,
   * it looked like protection and could not fail. Checked by deleting a
   * member: still green.
   *
   * The thing it was reaching for is real — an exercise can be written,
   * tested and never registered, which is how the clef control came to be
   * advertised and unopenable — but it is a claim about the filesystem and
   * not about this module, so it lives in `registry.test.ts` where it can
   * actually fail.
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
