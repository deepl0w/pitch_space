import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_CSS, APP_RULES, rulesFor, rulesUnder, type Rule } from '../testing/stylesheet';

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

  /**
   * A rigid track is allowed only where something guarantees the room.
   *
   * The `fr` case above names the defect exactly — a track that refuses to
   * go below its content and pushes the page sideways — but `fr` was the
   * shape it wore when it was found, not the only shape it has. A literal
   * `30rem` is every bit as unshrinkable, and `minmax(17rem, …)` has a
   * floor of 17rem however the rest of it is written.
   *
   * What makes a rigid track acceptable is not the track: it is a
   * `min-width` query guaranteeing there is room for it. That coupling
   * lives in two places — the query's threshold and the track list — and
   * nothing related them, so a rule could be made rigid at every width
   * including a phone's and the suite would have had nothing to say.
   *
   * **This is a lower bound and says so.** A track whose floor the
   * stylesheet does not state — `auto`, `fr`, `min-content` — contributes
   * zero here, because its real floor is its content and that is not in
   * the file. So the sum below can only ever understate the room needed,
   * and the case is sound in one direction: what it fails is certainly too
   * wide, what it passes may still be. Said plainly because a bound
   * mistaken for a measurement is how a guard gets trusted past what it
   * checked.
   */
  it('makes a track rigid only inside a query wide enough to hold it', () => {
    const rigid = APP_RULES
      .map((rule) => ({ rule, tracks: trackList(rule) }))
      .filter((found) => found.tracks !== null && floorOf(found.tracks) > 0);

    // The population. Every case here is satisfied by a stylesheet with no
    // rigid tracks in it, and the point is that this one has four.
    expect(rigid.length, 'no rigid track anywhere, so this checks nothing')
      .toBeGreaterThan(1);

    const offenders = rigid.flatMap(({ rule, tracks }) => {
      const needs = floorOf(tracks!);
      const guaranteed = minWidthOf(rule.at);
      if (guaranteed === null) {
        return [`${rule.selectors.join(', ')}: rigid ${tracks} at every width`];
      }
      return guaranteed >= needs ? [] : [
        `${rule.selectors.join(', ')}: rigid ${tracks} needs ${needs}rem inside a ${guaranteed}rem query`,
      ];
    });
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
 * Two things a suite without layout can still hold about the stylesheet,
 * and one it cannot — written against a mistake that has since been fixed
 * by deleting the thing it was about.
 *
 * The practice screen's question jumped 195px when the answer appeared,
 * out from under the pointer that had just pressed a button. The first fix
 * reserved the answer's height as a measured constant, `--answer-reserve`.
 * A sweep of the other five exercises found key and scale identification
 * still moving 113px, because each exercise's answer is a different
 * height, and `c689de1` replaced the constant with a fraction of the pane
 * — stable by construction rather than correct for the one exercise it was
 * measured against. **The lesson is kept here because the code that taught
 * it is gone:** a single measured length standing for six different
 * contents is a figure that is right once and wrong five times, and
 * nothing in the suite said so.
 *
 * **Whether any of that works is not checkable here, and a test that
 * looked like it was would be the worst outcome.** Measured rather than
 * assumed, while the reserve still existed: mounting the practice screen
 * under jsdom and answering a round gives `offsetHeight` 0 and a bounding
 * rect of height 0 both before and after, `padding-bottom` computes to
 * `0`, and a custom property resolves to the empty string — the cascade
 * never reaches the element at all. So "render, answer, assert nothing
 * moved" passes identically with the fix present and with it deleted.
 *
 * **Not the same as the instrument trims, and an earlier draft of this
 * comment said it was.** Nothing here can hear, by any means, so a trim
 * has no instrument. Layout has one: the project drives real Chrome over
 * CDP and `docs/RUNNING-THE-APP.md` describes it, where one
 * `getBoundingClientRect().top` before and after answering measures
 * exactly this. The claim is a bound and not a length — the question moves
 * by no more than a few pixels — and it holds for all six exercises and
 * both layouts. What it has no home in is a *check*: nothing in the
 * repository drives a browser as part of one, so there is no tier for it
 * to live in and building that tier is a larger decision than one
 * assertion justifies. Until there is, the user role's sweep covers it —
 * and did, which is how the 113px was found.
 *
 * What is left here is the pair of silent deaths vitest can see: a rule
 * keyed to a class nobody renders, and a value declared for nobody.
 */
describe('what the stylesheet refers to', () => {
  /**
   * A state selector names a class a component has to set. Renaming
   * `answered` in the component leaves the rule valid CSS that matches
   * nothing — no error, no warning, and the jump comes back.
   */
  it('keys a state on a class some component actually sets', () => {
    const classes = [...new Set(
      [...APP_CSS.matchAll(/:not\(\.([a-zA-Z0-9_-]+)\)/g)].map((m) => m[1]),
    )];
    /*
      The population, so a selector syntax this regex stops recognising
      fails here rather than quietly leaving nothing to check.

      One rather than two, lowered by main when the merge that brought
      this file in went red. It was calibrated against two state
      selectors and `.answered` was one of them — removed the same
      afternoon, because reserving the answer's height was tuned
      against a single exercise and a sweep found the other five still
      moving. The pane is split by a fraction now and needs no state
      class. The guard's job is to notice the regex matching nothing at
      all, and one match proves it still recognises the syntax; a count
      is not the thing being claimed.
    */
    expect(classes.length, 'no state selector found at all').toBeGreaterThan(0);

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

/** The `grid-template-columns` a rule sets, if it sets one. */
function trackList(rule: Rule): string | null {
  const match = /grid-template-columns\s*:([^;}]+)/.exec(rule.body);
  return match ? match[1].trim() : null;
}

/**
 * The width a track list cannot go below, in rem, counting only the floors
 * the stylesheet actually states.
 *
 * `minmax(a, b)` floors at `a`; a bare length floors at itself; everything
 * else — `fr`, `auto`, `min-content`, `repeat` of any of those — floors at
 * its content, which is not a thing a file can tell you, so it counts zero.
 * Gaps are left out for the same reason and in the same direction.
 */
function floorOf(tracks: string): number {
  const parts = tracks.match(/minmax\([^)]*\)|repeat\([^)]*\)|[^\s]+/g) ?? [];
  return parts.reduce((sum, part) => {
    const minmax = /^minmax\(\s*([^,]+),/.exec(part);
    return sum + rem(minmax ? minmax[1] : part);
  }, 0);
}

/** A length in rem, or zero for anything whose size the file does not state. */
function rem(value: string): number {
  const match = /^(\d*\.?\d+)rem$/.exec(value.trim());
  return match ? Number(match[1]) : 0;
}

/** The `min-width` an at-rule guarantees, in rem, or null if it guarantees none. */
function minWidthOf(at: string | null): number | null {
  if (at === null) return null;
  const match = /min-width:\s*(\d*\.?\d+)rem/.exec(at);
  return match ? Number(match[1]) : null;
}
