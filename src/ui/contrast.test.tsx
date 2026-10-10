// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { CircleOfFifths } from './screens/CircleOfFifths';
import { APP_RULES, customProperties } from '../testing/stylesheet';

/**
 * The focus ring on the circle of fifths, against the fill it actually
 * lands on, in both themes.
 *
 * **Why this one is computable here when the general version is not.** A
 * focus indicator lands on whatever is painted behind it, which is
 * geometry and belongs to a browser. The wheel is the case where it is
 * not: `.wedge` carries the ring and `.wedge-self` carries the fill, and
 * they are two classes on *one element*, so the pairing can be read off
 * the rendered DOM rather than guessed from how things were named. That
 * distinction is the whole reason this file exists and the reason there
 * is no sweep over every control — for the rest, the suite genuinely
 * cannot know what is underneath.
 *
 * **What it cost to get here.** The ring was `--ink`, which is 1.84:1 on
 * the neat-accent wedge in dark and 2.38:1 in light, under the 3:1 floor
 * for a non-text indicator — on precisely the wedge a keyboard reaches
 * first. It is scoped to `--bg` there now. Two readers measured it by
 * different means, one through a canvas pixel read and one through this
 * arithmetic, and agreed to two decimals; what neither saw alone was that
 * a *compound* selector had already fixed it, because a reader matching
 * on single class names cannot see `.wedge.wedge-self:focus-visible`.
 * Hence the specificity resolution below, which is not decoration: it is
 * the exact blindness this test was written after.
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** WCAG 1.4.11: a non-text indicator needs this against what surrounds it. */
const INDICATOR_FLOOR = 3;

/* -- colour, as the browser computes it ------------------------------------ */

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearOf(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return [srgbToLinear((n >> 16) & 255), srgbToLinear((n >> 8) & 255), srgbToLinear(n & 255)];
}

/** Linear sRGB to Oklab, by Björn Ottosson's matrices — what `in oklab` means. */
function toOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: [number, number, number]): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function mixOklab(
  a: [number, number, number], b: [number, number, number], percent: number,
): [number, number, number] {
  const [x, y] = [toOklab(a), toOklab(b)];
  const t = percent / 100;
  return fromOklab([0, 1, 2].map((i) => x[i] * t + y[i] * (1 - t)) as [number, number, number]);
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* -- the cascade, enough of it --------------------------------------------- */

/** The palette a theme declares, as `--name` to a literal colour. */
function palette(...selectors: string[]): Map<string, string> {
  const bodies = APP_RULES
    .filter((rule) => rule.selectors.some((s) => selectors.includes(s)))
    .map((rule) => rule.body);
  return customProperties(bodies.join(''));
}

const THEMES = {
  light: palette(':root'),
  dark: palette(':root:not([data-theme="light"])', ':root[data-theme="dark"]'),
};

/**
 * Specificity as the cascade counts it: ids, then classes and
 * pseudo-classes and attributes, then element names.
 *
 * Written out because this is the thing that was missed.
 * `.wedge.wedge-self:focus-visible` beats `.wedge:focus-visible` by one
 * class, and a reader taking the first or the last match rather than the
 * most specific gets the wrong answer with both rules present and valid.
 */
function specificity(selector: string): [number, number, number] {
  const ids = selector.match(/#[\w-]+/g)?.length ?? 0;
  const classes = (selector.match(/\.[\w-]+/g)?.length ?? 0)
    + (selector.match(/\[[^\]]*\]/g)?.length ?? 0)
    + (selector.match(/:(?!:)[\w-]+/g)?.length ?? 0);
  const types = selector.replace(/[.#:[][^\s>+~]*/g, '').match(/[\w-]+/g)?.length ?? 0;
  return [ids, classes, types];
}

function beats(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true; // Equal specificity: later in the source wins.
}

/**
 * The value that wins for a property on an element, among the rules whose
 * selectors it matches once `:focus-visible` is taken off.
 *
 * jsdom applies no stylesheet of its own, so `getComputedStyle` cannot
 * answer this; what it can do is `matches`, which is the part that has to
 * be right. The cascade is then specificity and source order.
 */
function winning(element: Element, property: string, focus: boolean): string | null {
  let best: { value: string; spec: [number, number, number] } | null = null;
  for (const rule of APP_RULES) {
    const declaration = new RegExp(`(?:^|;)\\s*${property}\\s*:([^;}]+)`).exec(rule.body);
    if (!declaration) continue;
    for (const selector of rule.selectors) {
      const isFocus = selector.includes(':focus-visible');
      if (isFocus !== focus) continue;
      const base = selector.replace(/:focus-visible/g, '').trim();
      if (!element.matches(base)) continue;
      const spec = specificity(selector);
      if (!best || beats(spec, best.spec)) best = { value: declaration[1].trim(), spec };
    }
  }
  return best?.value ?? null;
}

/** A declared value resolved against a palette, as linear sRGB. */
function resolve(value: string, theme: Map<string, string>): [number, number, number] {
  /*
    Recursive, and either side of a mix may be a literal or a reference.

    It handled exactly `color-mix(in oklab, var(--a) N%, var(--b))` with
    both operands naming hex tokens, which was the whole of what the
    palette then contained. The palette is now **derived**: three colours
    are chosen and the rest are mixes, several of which reference a token
    that is itself a mix. Resolving one level of that returns a string
    where a colour was expected, which is what `not a hex colour:
    color-mix(...)` was saying.
  */
  const text = value.trim();
  const single = /^var\((--[\w-]+)\)$/.exec(text);
  if (single) return resolve(token(single[1], theme), theme);

  // Operands are a hex literal or a `var()`, neither of which contains a
  // comma, so splitting on the one before the closing paren is safe. A
  // mix written inline inside another would not be, and nothing does that.
  const mix = /^color-mix\(\s*in oklab\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)$/.exec(text);
  if (mix) {
    return mixOklab(resolve(mix[1], theme), resolve(mix[3], theme), Number(mix[2]));
  }

  /*
    A relative colour, in the one shape the palette uses: the panels, which
    are their ground with its lightness lifted and its hue and chroma kept.

    Only `calc(l + N) c h` is understood, deliberately. A general
    implementation of relative colour syntax would be a second browser in
    the test suite, and what this has to resolve is one line of the
    stylesheet. Anything else throws rather than guessing — a resolver that
    silently returned the base colour would make a panel's contrast read as
    its ground's and pass everything.
  */
  const relative = /^oklch\(\s*from\s+(.+?)\s+calc\(\s*l\s*\+\s*([\d.]+)\s*\)\s+c\s+h\s*\)$/
    .exec(text);
  if (relative) {
    const [L, a, b] = toOklab(resolve(relative[1], theme));
    return fromOklab([L + Number(relative[2]), a, b]);
  }
  if (/^oklch\(/.test(text)) {
    throw new Error(`relative colour this resolver does not understand: ${text}`);
  }
  return linearOf(text);
}

function token(name: string, theme: Map<string, string>): string {
  const value = theme.get(name);
  if (!value) throw new Error(`${name} is not in this palette`);
  return value;
}

/* -- the claim -------------------------------------------------------------- */

function wedges(): Element[] {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => { createRoot(host).render(<CircleOfFifths />); });
  return [...host.querySelectorAll('.wedge')];
}

describe('the focus ring on the circle of fifths', () => {
  const found = wedges();

  it('is asked of every wedge, in both themes', () => {
    // The population. A selector rename, or a wheel that stopped
    // rendering, would otherwise leave every case below asserting over an
    // empty list and passing.
    expect(found.length, 'no wedges rendered').toBeGreaterThan(20);
    expect(THEMES.light.size, 'no light palette').toBeGreaterThan(4);
    expect(THEMES.dark.size, 'no dark palette').toBeGreaterThan(4);
  });

  /**
   * The arithmetic, pinned against figures measured in a browser.
   *
   * Without this the whole file could pass on a broken mix: a contrast
   * function returning a large number for everything satisfies the claim
   * below perfectly. These four are the ones two readers measured
   * independently — a canvas pixel read and this code — and agreed on.
   */
  it('computes what a browser measured', () => {
    const pairs: [keyof typeof THEMES, string, string, number][] = [
      ['light', '--ink', '--accent', 2.55],
      ['dark', '--ink', '--accent', 4.44],
      ['light', '--bg', '--accent', 4.76],
      ['dark', '--bg', '--accent', 3.12],
    ];
    for (const [theme, a, b, expected] of pairs) {
      const got = contrast(
        // `resolve`, not `linearOf`: most tokens are mixes now, and a
        // reader asking for `--ink` wants the colour it comes out as.
        resolve(token(a, THEMES[theme]), THEMES[theme]),
        resolve(token(b, THEMES[theme]), THEMES[theme]),
      );
      expect(got, `${a} on ${b} in ${theme}`).toBeCloseTo(expected, 1);
    }
    /*
      And a compound resolves rather than throwing: a mix of the accent with
      a panel that is itself `oklch(from …)` of the ground.

      **This was briefly widened to ±0.5 for a reason that was wrong, and
      the reason is worth more than the figure.** A browser appeared to read
      7.89 against this file's 7.84, and the gap was put down to error
      compounding through a nested expression. A second, independent
      implementation of the same arithmetic then agreed with this file to
      three decimals, which left the reading as the odd one out rather than
      the maths — and so it was: the measurement went through a canvas, and
      eight bits per channel is coarse enough down here that the same mix
      read back as two different byte triples on two runs. Read as
      `color(from … srgb-linear r g b)` instead, which is not quantised at
      all, the browser says 7.857 and the gap is 0.013.

      So the pin is tight again. A tolerance wide enough to absorb a
      disagreement also absorbs the next real one, and this case earns its
      keep precisely by two implementations agreeing closely.
    */
    const relative = resolve('color-mix(in oklab, var(--accent) 55%, var(--surface))', THEMES.dark);
    expect(contrast(resolve(token('--ink', THEMES.dark), THEMES.dark), relative))
      .toBeCloseTo(7.86, 1);
  });

  /**
   * Text on a filled control is the page's own ground, and what that costs.
   *
   * Asked for in those terms, and the decision is the assertion: a later
   * hand-edit that quietly mixes it back towards white to buy contrast
   * would be reversing a choice rather than fixing a bug, so it should
   * have to change a test that says so.
   *
   * The cost is the dark theme, where the ground against this red is
   * 3.12:1 — under the 4.5 of WCAG 1.4.3 and pinned above as the
   * `--bg`/`--accent` pair, which is now the same measurement. Recorded
   * here rather than asserted as a floor, because a floor would be a
   * claim this palette does not make.
   */
  it('takes the ground as the colour on an accent fill, in both themes', () => {
    for (const [name, theme] of Object.entries(THEMES)) {
      expect(
        resolve(token('--on-accent', theme), theme),
        `${name} draws something other than its ground on an accent fill`,
      ).toEqual(resolve(token('--bg', theme), theme));
    }
  });

  /**
   * And the shortfall is asserted as a shortfall, in both directions.
   *
   * The figure is already pinned above, so it cannot quietly get worse.
   * What was only prose is that it is *under* a floor — and a cost
   * recorded in a comment is the thing that has gone stale three times in
   * this file alone. **Four, now**: this paragraph quoted 3.05 and the
   * palette moved to 3.12 under it, which is why it no longer quotes the
   * number at all. The ratio has one home, in the pins above, and
   * everything else refers to it.
   *
   * **Both sides, which is what stops a recorded cost becoming somewhere
   * regressions hide.** A list that says "these may fail" swallows the next
   * failure silently. This says the dark pair is below the text floor and
   * the light pair is above it, so the day somebody buys the dark theme its
   * contrast back, *this case fails* and the entry has to be removed on
   * purpose. An exemption that stops being needed should be as loud as one
   * that is violated — the same shape as excusing a method the fake does
   * not answer, and failing when the fake grows it.
   */
  it('records which theme pays for that, and that the other does not', () => {
    // WCAG 1.4.3 for ordinary text. Named here rather than inline because
    // the claim is about a published floor rather than a number picked.
    const TEXT_FLOOR = 4.5;
    const onAccent = (theme: typeof THEMES.light) => contrast(
      resolve(token('--on-accent', theme), theme),
      resolve(token('--accent', theme), theme),
    );

    expect(onAccent(THEMES.light), 'the light theme has stopped clearing the text floor')
      .toBeGreaterThanOrEqual(TEXT_FLOOR);
    expect(onAccent(THEMES.dark),
      'the dark theme now clears the text floor — delete this case rather than keeping a '
      + 'cost the palette no longer pays')
      .toBeLessThan(TEXT_FLOOR);
  });

  it('clears the floor for an indicator on every wedge it can land on', () => {
    const failures: string[] = [];
    for (const [name, theme] of Object.entries(THEMES)) {
      for (const wedge of found) {
        const ring = winning(wedge, 'stroke', true);
        const fill = winning(wedge, 'fill', false);
        if (ring === null || fill === null) continue;
        const ratio = contrast(resolve(ring, theme), resolve(fill, theme));
        if (ratio < INDICATOR_FLOOR) {
          failures.push(`${name}: ${wedge.getAttribute('class')} — ring ${ring} on fill `
            + `${fill} is ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect([...new Set(failures)]).toEqual([]);
  });

  /**
   * A focused wedge differs from an unfocused one in something a reader
   * can see besides the line getting thicker.
   *
   * **This guard passed a defect, which is why it exists.** `.wedge`
   * already strokes `var(--bg)` at rest — that is what draws the
   * separators between wedges — so scoping the ring on the selected
   * wedge to `--bg` set the stroke to the colour it already was. Width
   * changed, colour did not; it measured 8.16:1 against the fill and was
   * invisible. The case above is sound and had nothing to say, because
   * the comparison it makes is indicator against *fill* and the thing
   * that went wrong was indicator against *the stroke already there*.
   *
   * So this is a second claim rather than a widening of the first, and
   * it is deliberately crude: at least one property of the focused state
   * must differ from the rest state in something other than a width. It
   * does not judge whether the difference reads as focus — a dash, a
   * colour or both all satisfy it — because that is a looking question
   * and this is a structural one.
   *
   * What it still cannot see, said plainly: a halo, an underlying
   * element drawn behind, anything whose effect depends on what is
   * painted around it. Those stay with whoever is looking.
   */
  it('shows focus as something other than a thicker line', () => {
    // Width alone is the failure this is about: a ring that differs from
    // the rest state only in how heavy it is reads as nothing at all when
    // the wedges already carry a stroke.
    const isWidth = (property: string) => /width$/.test(property);
    // A removal rather than a difference: `outline: none` takes the
    // browser's own ring away and adds nothing in its place.
    const isAbsence = (value: string) => /^(none|0)$/.test(value.trim());

    const invisible: string[] = [];
    for (const wedge of found) {
      const properties = new Set<string>();
      for (const rule of APP_RULES) {
        if (!rule.selectors.some((selector) => selector.includes(':focus-visible')
          && wedge.matches(selector.replace(/:focus-visible/g, '').trim()))) continue;
        for (const match of rule.body.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/g)) {
          properties.add(match[1]);
        }
      }

      const differences = [...properties].filter((property) => {
        if (isWidth(property)) return false;
        const focused = winning(wedge, property, true);
        if (focused === null || isAbsence(focused)) return false;
        return focused !== winning(wedge, property, false);
      });

      if (differences.length === 0) {
        invisible.push(`${wedge.getAttribute('class')}: focus differs only in width`);
      }
    }
    expect([...new Set(invisible)]).toEqual([]);
  });

  /**
   * And the resolution above is actually doing the work it was written
   * for. If every wedge took its ring from the same rule, the specificity
   * code would be dead and the compound override — the thing that was
   * invisible to the reader this file replaces — would go unexercised.
   */
  it('resolves a compound override, not merely the first rule that matched', () => {
    const rings = new Set(found.map((wedge) => winning(wedge, 'stroke', true)));
    expect([...rings].filter((r) => r !== null).length,
      'every wedge rings the same colour, so no override is being resolved')
      .toBeGreaterThan(1);
  });
});

/**
 * Two colours that mean different things have to look different from each
 * other, which no contrast assertion can see.
 *
 * Contrast only ever compares a colour with what is *behind* it. `--accent`
 * and `--wrong` are never behind one another — they are a filled button and
 * a verdict, on the same screen, both legible against the same ground — so
 * every contrast case in this file passed while the two converged to within
 * about 0.013 in oklab, which is nearer than the palette's own definition of
 * "the same surface". The user role saw it; nothing here could.
 *
 * **The threshold is the palette's, not mine.** `--bg` and `--surface` are
 * deliberately nearly the same: a panel on its ground, meant to read as one
 * surface with an edge rather than as two colours. That distance is what the
 * palette means by *too close to tell apart*, so it is the floor a pair that
 * must be told apart has to clear. Nothing is invented and nothing is tuned —
 * if the panel treatment changes, the floor moves with it, which is right,
 * because the floor is a statement about this palette's own scale.
 *
 * **Checked against the instance rather than hoped at.** At `f3414f2` the
 * light palette had `--accent: #b13837` and `--wrong: #a63634`, which is
 * **0.024** apart, against a floor of **0.040** — so this would have caught
 * the pair the user role reported, with room to spare. Worth knowing because
 * a floor chosen for a good reason can still sit on the wrong side of the
 * defect it was chosen for, and that is only answerable by measuring the
 * defect.
 *
 * The three tokens are named rather than derived, and the reason is the thing
 * that cannot be derived: these are the colours a reader reads *as a meaning*
 * — this is the thing, this was right, this was wrong. `--line`, `--muted`
 * and the rest are structure, and structure is allowed to be close.
 */
describe('colours that mean different things', () => {
  /** Perceptual distance, in the space the palette is mixed in. */
  function apart(a: [number, number, number], b: [number, number, number]): number {
    const [x, y] = [toOklab(a), toOklab(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  }

  const MEANINGS = ['--accent', '--right', '--wrong'];

  it.each(Object.keys(THEMES) as (keyof typeof THEMES)[])(
    'are further apart than the palette calls the same surface, in %s',
    (name) => {
      const theme = THEMES[name];
      const resolved = (token: string) => resolve(`var(${token})`, theme);

      // The floor, read out of the palette rather than chosen.
      const sameSurface = apart(resolved('--bg'), resolved('--surface'));
      expect(sameSurface, 'the ground and a panel on it are identical, so there is no floor')
        .toBeGreaterThan(0);

      const tooClose: string[] = [];
      let compared = 0;
      for (let i = 0; i < MEANINGS.length; i += 1) {
        for (let j = i + 1; j < MEANINGS.length; j += 1) {
          const distance = apart(resolved(MEANINGS[i]), resolved(MEANINGS[j]));
          compared += 1;
          if (distance <= sameSurface) {
            tooClose.push(`${MEANINGS[i]} and ${MEANINGS[j]} are ${distance.toFixed(3)} apart, `
              + `where a panel on its ground is ${sameSurface.toFixed(3)}`);
          }
        }
      }

      // The population, since a list that emptied would satisfy this by
      // comparing nothing.
      expect(compared, 'no pair of meanings compared').toBe(3);
      expect(tooClose).toEqual([]);
    },
  );
});
