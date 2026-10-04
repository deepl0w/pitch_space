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

/**
 * The stylesheet as rules, parsed once.
 *
 * Every lookup in this file used to index into the text — `indexOf` for a
 * selector, `slice` to the next brace, and in one case a flat six hundred
 * characters. All of it works until the stylesheet is edited somewhere else.
 * It already failed once: `indexOf('.score')` found
 * `main .practice-main > .prompt, main .practice-main > .score` first, so the
 * assertion read a block that was never meant to carry the declaration and
 * went red on a stylesheet that was correct.
 *
 * Comparing whole selectors fixes that one. It does not fix the other half,
 * which is **nesting**: a rule inside `@media` is returned by a flat regex
 * looking exactly like a rule at the top level. That matters here more than
 * it looks, because the thing these tests guard is a page wider than the
 * screen — a narrow-viewport failure. Moving `min-width: 0` into a
 * `min-width: 900px` block would make it apply only where the bug cannot
 * happen, and a flat scan would still call that a pass.
 *
 * So this walks braces instead of matching them, and keeps the at-rule a
 * declaration sits under. It is a few lines more than a regex and it fails
 * for the reason it says.
 */
interface Rule {
  selectors: readonly string[];
  body: string;
  /** The `@media`/`@supports` prelude this sits under, or null at the top. */
  at: string | null;
}

function parse(css: string, at: string | null = null): Rule[] {
  const out: Rule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open === -1) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') depth -= 1;
      j += 1;
    }
    const body = css.slice(open + 1, j - 1);
    // A conditional group — `@media`, `@supports` — holds rules rather than
    // declarations. `@font-face` holds declarations and is a rule like any
    // other, which is why this asks the body and not the prelude.
    if (prelude.startsWith('@') && body.includes('{')) {
      out.push(...parse(body, prelude));
    } else {
      out.push({ selectors: prelude.split(',').map((x) => x.trim()), body, at });
    }
    i = j;
  }
  return out;
}

const RULES = parse(CSS.replace(/\/\*[\s\S]*?\*\//g, ''));

/** Bodies of every unconditional rule whose whole selector is this one. */
function rulesFor(selector: string): string[] {
  return RULES.filter((r) => r.at === null && r.selectors.includes(selector)).map((r) => r.body);
}

/** Bodies of every rule under an at-rule matching this text. */
function rulesUnder(at: string): string[] {
  return RULES.filter((r) => r.at?.includes(at)).map((r) => r.body);
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
    const unconditional = RULES.filter((r) => r.at === null);
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
