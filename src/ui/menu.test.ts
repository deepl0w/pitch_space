import { describe, expect, it } from 'vitest';
import { EXERCISE_MENU, REFERENCE_MENU, entryFor } from './menu';
import { EXERCISE_TYPES } from '../exercises/registry';

describe('the menu', () => {
  /**
   * The point of deriving the card title from the exercise definition. Two
   * strings that happen to match today are two strings that stop matching the
   * first time one is edited, and the symptom is a card that opens a page
   * calling itself something else.
   */
  it('titles every built exercise from the exercise itself', () => {
    for (const type of EXERCISE_TYPES) {
      const entry = EXERCISE_MENU.find((e) => e.route === type.id);
      expect(entry, `${type.id} is missing from the menu`).toBeDefined();
      expect(entry!.name).toBe(type.name);
      expect(entry!.ready).toBe(true);
    }
  });

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
