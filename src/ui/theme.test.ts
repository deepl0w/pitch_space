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
/**
 * Whether a custom property's value is a colour.
 *
 * `:root` holds more than the palette — `--page-inset` is a length the page
 * edge and the fixed settings cog both derive from, so that two things
 * meant to line up come from one value rather than two numbers that
 * happen to match. A length has no business being redeclared per theme,
 * and these cases are about the palette: every one of them is named for
 * colours and compared every custom property, which agreed only while
 * the palette was all there was.
 */
function isColour(value: string): boolean {
  return /^(#|rgb|hsl|color\()/i.test(value.trim());
}

function paletteOf(selector: string): Map<string, string> {
  const bodies = selector.startsWith(':root:not')
    // This one lives inside the colour-scheme query, so it is not a
    // top-level rule and `rulesFor` will not see it.
    ? APP_RULES.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
    : rulesFor(selector);
  const all = customProperties(bodies.join(''));
  return new Map([...all].filter(([, v]) => isColour(v)));
}

describe('what a theme block is allowed to hold', () => {
  /**
   * A dark block declares colours and nothing else.
   *
   * The cases below filter to colours before comparing, which is right —
   * they are about the palette and a length has no business being
   * redeclared per theme. But a filter only protects the comparison. It
   * says nothing about what is *in* the block, so declaring `--page-inset`
   * in both themes would pass every one of them.
   *
   * That is the repair someone reaches for the next time a length looks
   * like it needs to differ, and it is exactly what the token exists to
   * prevent: one named value that positioning derives from, not a
   * constant copied per theme and free to drift.
   *
   * The filter and this are opposite halves. `isColour` keeps a non-colour
   * out of the comparison; this keeps it out of the block.
   */
  const everything = (selector: string) => {
    const bodies = selector.startsWith(':root:not')
      ? APP_RULES.filter((r) => r.selectors.includes(selector)).map((r) => r.body)
      : rulesFor(selector);
    return customProperties(bodies.join(''));
  };

  it('declares no token a theme has no business changing', () => {
    const intruders: string[] = [];
    for (const selector of [':root:not([data-theme="light"])', ':root[data-theme="dark"]']) {
      for (const [name, value] of everything(selector)) {
        if (!isColour(value)) intruders.push(`${selector} sets ${name} to ${value}`);
      }
    }
    expect(intruders, 'a theme block redeclares something that is not a colour')
      .toEqual([]);
  });

  it('is looking at blocks that hold something, or the case above is idle', () => {
    // Both selectors have to resolve: the system one sits inside a media
    // query and is reached a different way from the explicit one, so a
    // change to either lookup could leave this scanning nothing.
    for (const selector of [':root:not([data-theme="light"])', ':root[data-theme="dark"]']) {
      expect(everything(selector).size, `${selector} declares nothing`).toBeGreaterThan(5);
    }
  });
});

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

  it('reads colours only, or the case above fails on the first length added', () => {
    /*
      The control on the filter rather than on the palette. Without it,
      a non-colour token in `:root` — an inset, a radius, a duration —
      makes "dark overrides everything light defines" fail for a reason
      that has nothing to do with theming, and the obvious repair is to
      declare the length twice.
    */
    expect([...light.values()].every(isColour), 'a non-colour reached the palette').toBe(true);
    expect(isColour('16px'), 'a length is being read as a colour').toBe(false);
    expect(isColour('#fbfaf8')).toBe(true);
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
