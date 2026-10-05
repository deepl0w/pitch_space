import { describe, expect, it } from 'vitest';
import { APP_CSS, APP_RULES, rulesFor, rulesUnder } from '../testing/stylesheet';

/**
 * Layout rules asked of the stylesheet, because jsdom has no layout and the
 * alternative is a person noticing.
 *
 * These are not a substitute for looking at the page. They pin the two
 * mistakes that have actually been made here, both of which produced a page
 * wider than the screen with nothing in the suite to say so.
 */
/** Every value given to a property anywhere in the sheet. */
function declarations(property: string): string[] {
  return [...APP_CSS.matchAll(new RegExp(`${property}\\s*:([^;}]+)`, 'g'))]
    .map((m) => m[1].trim());
}

describe('the stylesheet', () => {
  /**
   * A bare `1fr` is `minmax(auto, 1fr)`, so the track refuses to shrink below
   * its content's min-content width. With an engraved stave inside — which
   * has a real intrinsic width — the grid stopped wrapping and pushed the
   * whole page sideways instead.
   */
  it('never uses a grid track that cannot shrink below its content', () => {
    const offenders = declarations('grid-template-columns')
      .filter((value) => /(^|\s)\d*\.?\d*fr/.test(value.replace(/minmax\([^)]*\)/g, '')));
    expect(offenders).toEqual([]);
  });

  it('declares at least one multi-column grid, so the rule is not vacuous', () => {
    const grids = declarations('grid-template-columns');
    expect(grids.length).toBeGreaterThan(0);
    expect(grids.some((v) => v.includes('minmax(0, 1fr)'))).toBe(true);
  });

  /**
   * A flex or grid item's own min-content floor is the other half of the same
   * trap: constraining the track is not enough if the item inside refuses to
   * be narrower than the stave it contains.
   */
  it('lets everything that holds a stave be narrower than one', () => {
    for (const selector of ['.score', '.score-host']) {
      const bodies = rulesFor(selector);
      expect(bodies.length, `no rule whose whole selector is ${selector}`)
        .toBeGreaterThan(0);
      expect(bodies.some((b) => b.includes('min-width: 0')), `${selector} needs min-width: 0`)
        .toBe(true);
    }
  });

  /**
   * Hit targets, which are a different question from overflow and the one a
   * desktop browser never asks. 24x24 is the floor WCAG 2.5.8 sets for any
   * pointer; 44 is what Apple and WCAG 2.5.5 ask of a finger.
   */
  it('gives every control a floor no pointer struggles with', () => {
    // Unconditionally, which is the point: a floor that waited on a media
    // query would be no floor on the pointers it did not name.
    const unconditional = APP_RULES.filter((r) => r.at === null);
    expect(
      unconditional.some((r) => /min-height:\s*24px/.test(r.body)),
      'a universal min-height for controls',
    ).toBe(true);
  });

  it('raises them for a finger, keyed to the pointer and not to a width', () => {
    // A touchscreen laptop is the case a width breakpoint gets wrong.
    const coarse = rulesUnder('pointer: coarse');
    expect(coarse.length, 'no rules under a coarse-pointer query').toBeGreaterThan(0);
    // Anywhere in the block rather than in its first six hundred characters,
    // which is what this asked before and would have gone red for the rule
    // having moved down.
    expect(coarse.some((b) => /min-height:\s*44px/.test(b))).toBe(true);
  });

  it('keeps the drawn stave from deciding its container width', () => {
    const bodies = rulesFor('.score-host svg');
    expect(bodies.length, 'no rule whose whole selector is .score-host svg')
      .toBeGreaterThan(0);
    expect(bodies.some((b) => b.includes('max-width: 100%'))).toBe(true);
  });
});
