import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

/**
 * The two things about a reserved space that a suite without layout can
 * still hold.
 *
 * `--answer-reserve` keeps the question from jumping when the answer
 * appears: the block is centred, revealing the answer made it taller, and
 * every control moved 195px — out from under the pointer that had just
 * pressed one. The fix pads the unanswered state by what the answered
 * state will add.
 *
 * **Whether it works is not checkable here, and a test that looked like it
 * was would be the worst outcome.** Measured rather than assumed: mounting
 * the practice screen under jsdom and answering a round gives
 * `offsetHeight` 0 and a bounding rect of height 0 both before and after,
 * `padding-bottom` computes to `0`, and `--answer-reserve` resolves to the
 * empty string — the cascade never reaches the element at all. So "render,
 * answer, assert nothing moved" passes identically with the fix present and
 * with it deleted. That is a check whose medium cannot represent the
 * defect, and the figure itself is a measurement with no ground truth in
 * the suite, the same as the instrument trims.
 *
 * It belongs to someone looking at the page at several widths, and the
 * user role has it. What is left here is the pair of silent deaths: the
 * rule keyed to a class nobody writes any more, and the value declared for
 * nobody.
 */
describe('a value the stylesheet reserves', () => {
  /**
   * A state selector names a class a component has to set. Renaming
   * `answered` in the component leaves the rule valid CSS that matches
   * nothing — no error, no warning, and the jump comes back.
   */
  it('keys a state on a class some component actually sets', () => {
    const classes = [...new Set(
      [...APP_CSS.matchAll(/:not\(\.([a-zA-Z0-9_-]+)\)/g)].map((m) => m[1]),
    )];
    // The population, so a selector syntax this regex stops recognising
    // fails here rather than quietly leaving nothing to check.
    expect(classes.length, 'no state selector found at all').toBeGreaterThan(1);

    /*
      As a whole token inside a string that could be a class list, not as
      a word somewhere in the file. Two earlier versions could not fail.
      Searching the source for the word stayed green when the class was
      renamed, because a comment four hundred lines away says "every
      answered round". Allowing any quoted span then matched across the
      prose on the home screen, where a sentence about questions being
      "answered by playing" sits between two unrelated attributes.

      A class reaches the DOM as a token in a space-separated list, so
      that is the shape to look for: a literal of nothing but names and
      spaces, split, and compared whole.
    */
    const classLists = [...sourceOf(['.tsx'])
      .matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)]
      .map((m) => m[1] ?? m[2] ?? m[3] ?? '')
      .filter((literal) => /^[\w- ]+$/.test(literal))
      .flatMap((literal) => literal.split(' '));
    const rendered = new Set(classLists);

    const orphans = classes.filter((name) => !rendered.has(name));
    expect(orphans, 'a rule keyed to a class nothing renders').toEqual([]);
  });

  /**
   * And a declared custom property is referenced somewhere — by `var()` in
   * the sheet, or by name from the code, which is how `--score-ink` is
   * read. A reserve nobody consumes reserves nothing.
   */
  it('refers to every custom property it declares', () => {
    const declared = [...new Set(
      [...APP_CSS.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)].map((m) => m[1]),
    )];
    expect(declared.length).toBeGreaterThan(5);

    const elsewhere = sourceOf(['.ts', '.tsx']);
    const unused = declared.filter((name) => {
      const used = new RegExp(`var\\(\\s*${name}\\b`).test(APP_CSS);
      return !used && !elsewhere.includes(name);
    });
    expect(unused, 'declared and referred to by nothing').toEqual([]);
  });
});

/** Every source file of the given kinds, concatenated, tests excluded. */
function sourceOf(extensions: readonly string[]): string {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (extensions.some((e) => entry.name.endsWith(e))
        && !/\.test\.tsx?$/.test(entry.name)) {
        // Comments blanked rather than dropped: a class name mentioned in
        // prose is not a class anything renders, and the first version of
        // the guard above passed on exactly that.
        out.push(readFileSync(path, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/\/\/.*$/gm, ' '));
      }
    }
  };
  walk(root);
  return out.join('\n');
}
