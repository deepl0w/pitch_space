import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The stylesheet as rules, for the tests that have to ask it questions.
 *
 * Shared because it was written twice. Both copies began as `indexOf` for a
 * selector and `slice` to the next brace, and the first one broke: looking
 * for `.score` found `main .practice-main > .prompt, main .practice-main >
 * .score`, so the assertion read a block that was never meant to carry the
 * declaration and went red on a stylesheet that was correct.
 *
 * Comparing whole selectors fixes that. It does not fix the other half,
 * which is **nesting**: a rule inside `@media` comes back from a flat regex
 * looking exactly like a rule at the top level. That matters because what
 * these tests guard is a page wider than the screen and a palette that does
 * not change — both of which are about *when* a declaration applies, not
 * merely whether it is written somewhere. So this walks braces instead of
 * matching them and keeps the at-rule a rule sits under.
 *
 * It is not a CSS parser: it does not know about strings, `url()` containing
 * braces, or `@supports` nested inside `@media`. `index.css` holds none of
 * those, and the failure mode if it ever does is a wrong answer about a rule
 * that exists rather than a confident answer about the wrong rule.
 */

export interface Rule {
  selectors: readonly string[];
  body: string;
  /** The `@media`/`@supports` prelude this sits under, or null at the top. */
  at: string | null;
}

export function parseRules(css: string, at: string | null = null): Rule[] {
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
      out.push(...parseRules(body, prelude));
    } else {
      out.push({ selectors: prelude.split(',').map((x) => x.trim()), body, at });
    }
    i = j;
  }
  return out;
}

/**
 * The app's stylesheets, with comments stripped so prose cannot match a
 * selector.
 *
 * From the working directory rather than from `import.meta.url`, which
 * this used and which breaks the moment a jsdom-environment test imports
 * it: under jsdom the global `URL` is the DOM's and resolves against the
 * document base, giving `/src/index.css`, and the module specifier is not
 * a `file:` URL there either, so neither `.pathname` nor `fileURLToPath`
 * survives. Vitest runs from the project root and `recorded.test.ts`
 * already reads `fixtures/audio` the same way, so this is the convention
 * here rather than a shortcut.
 */
/*
  Both files, because the palette moved into one of its own.

  `index.css` imports `palette.css` and a browser resolves that into a
  single stylesheet; a test reading only the first would find no `:root`
  colours at all and every palette case would pass by scanning nothing.
  Concatenated in import order, which is the order a browser applies them
  — so a later rule still wins here for the same reason it wins there.
*/
export const APP_CSS = ['palette.css', 'index.css']
  .map((file) => readFileSync(join(process.cwd(), 'src', file), 'utf8'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  // The import itself is not a rule and would otherwise be parsed as one.
  .replace(/@import\s+[^;]+;/g, '');

export const APP_RULES = parseRules(APP_CSS);

/** Bodies of every unconditional rule whose whole selector is this one. */
export function rulesFor(selector: string): string[] {
  return APP_RULES
    .filter((r) => r.at === null && r.selectors.includes(selector))
    .map((r) => r.body);
}

/** Bodies of every rule under an at-rule whose prelude contains this text. */
export function rulesUnder(at: string): string[] {
  return APP_RULES.filter((r) => r.at?.includes(at)).map((r) => r.body);
}

/** The custom properties a body sets, as `--name` to value, in source order. */
export function customProperties(body: string): Map<string, string> {
  return new Map(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}
