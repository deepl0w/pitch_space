import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Layout rules asked of the stylesheet, because jsdom has no layout and the
 * alternative is a person noticing.
 *
 * These are not a substitute for looking at the page. They pin the two
 * mistakes that have actually been made here, both of which produced a page
 * wider than the screen with nothing in the suite to say so.
 */
const CSS = readFileSync(new URL('../index.css', import.meta.url).pathname, 'utf8');

/** Declarations, with comments stripped so prose cannot match. */
function declarations(property: string): string[] {
  const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...code.matchAll(new RegExp(`${property}\\s*:([^;}]+)`, 'g'))].map((m) => m[1].trim());
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
      const block = CSS.slice(CSS.indexOf(selector));
      expect(block.slice(0, block.indexOf('}')), `${selector} needs min-width: 0`)
        .toContain('min-width: 0');
    }
  });

  /**
   * Hit targets, which are a different question from overflow and the one a
   * desktop browser never asks. 24x24 is the floor WCAG 2.5.8 sets for any
   * pointer; 44 is what Apple and WCAG 2.5.5 ask of a finger.
   */
  it('gives every control a floor no pointer struggles with', () => {
    const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const base = code.slice(0, code.indexOf('@media (pointer: coarse)'));
    expect(base, 'a universal min-height for controls').toMatch(/min-height:\s*24px/);
  });

  it('raises them for a finger, keyed to the pointer and not to a width', () => {
    // A touchscreen laptop is the case a width breakpoint gets wrong.
    expect(CSS).toContain('@media (pointer: coarse)');
    const block = CSS.slice(CSS.indexOf('@media (pointer: coarse)'));
    expect(block.slice(0, 600)).toMatch(/min-height:\s*44px/);
  });

  it('keeps the drawn stave from deciding its container width', () => {
    const block = CSS.slice(CSS.indexOf('.score-host svg'));
    expect(block.slice(0, block.indexOf('}'))).toContain('max-width: 100%');
  });
});
