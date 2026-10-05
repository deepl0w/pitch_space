import { describe, expect, it } from 'vitest';
import { APP_RULES, customProperties, rulesFor } from '../testing/stylesheet';

/**
 * The dark palette is written twice and the two copies must agree.
 *
 * One copy serves a reader whose device says dark; the other serves a
 * reader who chose Dark on a light machine. CSS cannot give one block two
 * scopes, so the values are duplicated — and a duplication kept in step by
 * a comment is a constraint that cannot fail, which is the thing this
 * repository keeps finding. So it is kept in step by this instead.
 *
 * **What the defect actually looked like matters for what is asserted.**
 * Choosing Dark set the attribute correctly and changed no colour, because
 * the dark values existed only inside `@media (prefers-color-scheme: dark)`.
 * Anything asserting on state would have passed; it was found by reading a
 * computed background in a browser. So these ask what the stylesheet *says*
 * rather than what the app *stores* — and, below, that what it says is
 * different from the light palette, which is the half that agreement
 * between two identical copies cannot give you.
 */

/** The custom properties a rule sets, wherever it sits. */
function paletteOf(selector: string): Map<string, string> {
  const bodies = selector.startsWith(':root:not')
    // This one lives inside the colour-scheme query, so it is not a
    // top-level rule and `rulesFor` will not see it.
    ? APP_RULES.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
    : rulesFor(selector);
  return customProperties(bodies.join(''));
}

describe('the dark palette', () => {
  const light = paletteOf(':root');
  const bySystem = paletteOf(':root:not([data-theme="light"])');
  const byChoice = paletteOf(':root[data-theme="dark"]');

  it('is actually declared in all three places, or this test proves nothing', () => {
    expect(light.size, 'the light palette').toBeGreaterThan(5);
    expect(bySystem.size, 'the system-preference block').toBeGreaterThan(5);
    expect(byChoice.size, 'the chosen-dark block').toBeGreaterThan(5);
  });

  it('sets the same properties to the same values in both dark blocks', () => {
    expect([...byChoice.entries()]).toEqual([...bySystem.entries()]);
  });

  it('overrides every colour the light palette defines', () => {
    /*
      A property defined for light and forgotten in dark does not fall back
      to something sensible — it stays the light value, so one mark on the
      page keeps its light colour against a dark background. That is how
      the ledger-line bug looked, and it is invisible until someone opens
      the screen it is on.
    */
    expect([...byChoice.keys()].sort()).toEqual([...light.keys()].sort());
  });

  it('is actually dark, rather than a second copy of the light one', () => {
    /*
      The hole the three cases above leave, and it is the shape of the
      defect they were written for.

      They say the two dark blocks agree with each other and name the same
      properties as light. Replace every dark value with its light value
      and all three still pass — the blocks agree, the names match, and
      choosing Dark changes no colour at all, which is exactly what was
      just fixed. Agreement between two copies says nothing about what the
      copies contain.

      Every property, not most: a palette where one colour happened to suit
      both themes would be a deliberate choice worth writing down here,
      rather than something to leave as slack the next identical value can
      hide in.
    */
    for (const [name, value] of light) {
      expect(byChoice.get(name), `${name} is the same in both themes`).not.toBe(value);
    }
  });
});
