import { describe, expect, it } from 'vitest';
import { APP_CSS, APP_RULES, parseRules, rulesFor, rulesUnder } from './stylesheet';

/**
 * The parse accounts for the whole stylesheet, or two guards shrink silently.
 *
 * `layout.test.ts` and `theme.test.ts` ask this module which rules exist and
 * under which at-rule, then assert over the answer. Every one of those
 * assertions is a filter, so a rule the parse drops is a rule they stop
 * checking — and dropping it makes nothing red. The same shape cost four
 * sweeps three keys this week, through a different helper: a guard that
 * reports on a set cannot notice the set got smaller.
 *
 * So this does not ask whether the parser is right about any particular
 * rule, which the two files already do. It asks whether the parse is
 * **complete**: every selector written in the file comes back as a rule, and
 * no rule's body still has structure left in it. Both are read off the
 * source by a second method rather than by asking the walk to confirm
 * itself, which is the only way a parse can be held to account.
 *
 * It is pointed at one thing in particular. `parseRules` recurses only into
 * a prelude beginning `@`, so a rule nested inside a *selector* — `&:hover`
 * inside `.chip`, which browsers have taken for two years and nothing here
 * writes yet — is swallowed into the parent's body rather than becoming a
 * rule. The module's header calls that out in prose, which is a test that
 * cannot fail; the last case below is that prose asserted, and the two
 * above are what go red on the day someone writes one.
 */

describe('the parse of the shipped stylesheet', () => {
  it('loses no selector that is written in the source', () => {
    /*
      Every prelude in the file that is not an at-rule has to come back as a
      rule. Found with a match for "text up to an opening brace, containing
      no brace itself", which needs none of the walk's logic to agree with
      it — the point is a second opinion, so a change to `parseRules` cannot
      quietly take this with it. A rule the walk steps over and a rule it
      folds into its parent both show up here as a selector nobody parsed.
    */
    const written = [...APP_CSS.matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1].trim())
      .filter((prelude) => prelude.length > 0 && !prelude.startsWith('@'))
      .map((prelude) => prelude.split(',').map((x) => x.trim()).join(', '));
    const parsed = new Set(APP_RULES.map((r) => r.selectors.join(', ')));
    expect(written.filter((w) => !parsed.has(w))).toEqual([]);
    expect(written.length, 'the match found no selectors, so it proves nothing')
      .toBeGreaterThan(APP_RULES.length / 2);
  });

  it('leaves no structure inside a rule it called a rule', () => {
    // A body still holding a brace is a block the walk stepped over: its
    // declarations are invisible to `rulesFor`, and the parent's answer now
    // includes declarations that do not apply unconditionally.
    const unparsed = APP_RULES.filter((r) => r.body.includes('{'))
      .map((r) => r.selectors.join(', '));
    expect(unparsed).toEqual([]);
  });

  it('answers the two questions the guards are built on', () => {
    // Both helpers filter, so both return [] for a selector that is missing
    // and for one that was never there. The difference matters, and these
    // are the lookups the other files would go quiet on.
    expect(rulesFor(':root').length, 'no unconditional :root block').toBeGreaterThan(0);
    expect(rulesUnder('prefers-color-scheme: dark').length,
      'no rules under the dark-scheme query').toBeGreaterThan(0);
  });
});

describe('what the walk does and does not understand', () => {
  it('keeps the at-rule a rule sits under, rather than flattening it', () => {
    const rules = parseRules('.a { color: red } @media (min-width: 10rem) { .a { color: blue } }');
    expect(rules.map((r) => [r.selectors.join(), r.at]))
      .toEqual([['.a', null], ['.a', '@media (min-width: 10rem)']]);
  });

  it('treats an at-rule holding declarations as a rule, not as a group', () => {
    // `@font-face` is the case: it looks like `@media` from the prelude and
    // behaves like a rule, which is why the body decides rather than the
    // prelude.
    const rules = parseRules('@font-face { font-family: X; src: url(x.woff2) }');
    expect(rules).toHaveLength(1);
    expect(rules[0].body).toContain('font-family');
  });

  it('folds a nested selector into its parent, which is why completeness is checked', () => {
    /*
      Pinned as a limitation rather than fixed, because fixing it is a
      parser and the stylesheet has no nesting in it. What makes that
      tolerable is that the limitation is loud: the nested selector is never
      parsed and the folded body keeps its braces, so both checks above go
      red rather than `layout` and `theme` going quiet. If this ever has to
      pass, those are the tests that say so first.
    */
    const rules = parseRules('.chip { color: red; &:hover { color: blue } }');
    expect(rules).toHaveLength(1);
    expect(rules[0].body, 'a nested rule would have to be silently swallowed')
      .toContain('{');
  });
});
