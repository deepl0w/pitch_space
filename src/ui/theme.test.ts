import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The dark palette is written twice and the two copies must agree.
 *
 * One copy serves a reader whose device says dark; the other serves a
 * reader who chose Dark on a light machine. CSS cannot give one block two
 * scopes, so the values are duplicated — and a duplication kept in step by
 * a comment is a constraint that cannot fail, which is the thing this
 * repository keeps finding. So it is kept in step by this instead.
 */
const CSS = readFileSync(new URL('../index.css', import.meta.url).pathname, 'utf8');

/** The custom properties a rule sets, as `name: value` in source order. */
function declarationsOf(selector: string): string[] {
  const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const at = code.indexOf(selector);
  if (at < 0) return [];
  const open = code.indexOf('{', at);
  const close = code.indexOf('}', open);
  return [...code.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .map((m) => `${m[1]}: ${m[2].trim()}`);
}

describe('the dark palette', () => {
  const bySystem = declarationsOf(':root:not([data-theme="light"])');
  const byChoice = declarationsOf(':root[data-theme="dark"]');

  it('is actually declared in both places, or this test proves nothing', () => {
    expect(bySystem.length, 'the system-preference block').toBeGreaterThan(5);
    expect(byChoice.length, 'the chosen-dark block').toBeGreaterThan(5);
  });

  it('sets the same properties to the same values in both', () => {
    // Order included: if they diverge, saying so by position is a clearer
    // failure than a set comparison that reports only membership.
    expect(byChoice).toEqual(bySystem);
  });

  it('overrides every colour the light palette defines', () => {
    /*
      A property defined for light and forgotten in dark does not fall back
      to something sensible — it stays the light value, so one mark on the
      page keeps its light colour against a dark background. That is how
      the ledger-line bug looked, and it is invisible until someone opens
      the screen it is on.
    */
    const light = declarationsOf(':root {').map((d) => d.split(':')[0]);
    expect(light.length).toBeGreaterThan(5);
    const dark = byChoice.map((d) => d.split(':')[0]);
    expect([...light].sort()).toEqual([...dark].sort());
  });
});
