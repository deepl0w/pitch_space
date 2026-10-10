import { Fragment, useEffect, useState } from 'react';
import { settingsStore, useSettings } from '../../state/settingsStore';

/**
 * A colour picker for every token the app paints with, in development only.
 *
 * **Not shipped.** `import.meta.env.DEV` is a compile-time constant, so the
 * component and its markup are removed from a production build entirely
 * rather than hidden behind a flag at runtime — there is nothing to find in
 * `dist/` and nothing to accidentally enable.
 *
 * **The tokens are read from the stylesheet, never listed here.** A list
 * would be a second copy of the palette and would go stale the first time
 * somebody added a colour: the panel would quietly stop offering it, which
 * is exactly the kind of silence this project keeps finding. Instead the
 * live `:root` is asked what custom properties it has and which of them
 * resolve to a colour, so a token added tomorrow appears tomorrow.
 *
 * Changes are set as inline styles on `:root`, which beats both the
 * stylesheet and the `data-theme` blocks by specificity — so a colour tried
 * here survives switching theme, and *Reset* is removing them rather than
 * writing the old values back.
 */
/**
 * The panel's own styling, carried by the component rather than by
 * `index.css`.
 *
 * **Because a stylesheet ships even when the code that uses it does not.**
 * `import.meta.env.DEV` removes this component from a production build, but
 * rules written in `index.css` were still in `dist/assets/*.css` — checked,
 * not assumed — so the deployed site carried a dozen selectors for a tool
 * nobody could reach. Dead weight, and a hint of a thing that is not there.
 * Held here, they are removed with everything else.
 */
/**
 * Tokens that are one colour in both themes, so editing one edits both.
 *
 * Only the accent, and that is a decision rather than a convenience: the
 * two palettes are deliberately independent — a ground, its ink and its
 * panels belong to their own theme — and the accent is the one thing the
 * user chose to hold constant across them. Writing it to one theme only
 * would silently break that the first time somebody tried a new one.
 */
const SHARED: readonly string[] = ['--accent'];

type Painted = 'light' | 'dark';
type Overrides = Record<Painted, Record<string, string>>;

/** The subset of a record named by `keys`. */
function pick(from: Record<string, string>, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, from[key]]));
}

/**
 * The overrides as CSS, in the shape `index.css` declares its palettes.
 *
 * Four blocks rather than two, because a theme is reached two ways: by the
 * `data-theme` attribute when the reader has chosen, and by the media query
 * when they have not. Mirroring both is what makes an override behave like
 * part of the palette instead of on top of all of them.
 */
function sheetFor(overrides: Overrides): string {
  const body = (which: Painted) => Object.entries(overrides[which])
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');
  const light = body('light');
  const dark = body('dark');
  return [
    light && `:root[data-theme="light"] { ${light} }`,
    light && `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { ${light} } }`,
    dark && `:root[data-theme="dark"] { ${dark} }`,
    dark && `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${dark} } }`,
  ].filter(Boolean).join('\n');
}

const STYLE = `
.debug-open {
  position: fixed; inset-block-end: 1rem; inset-inline-start: 1rem;
  z-index: 50; opacity: 0.55; font-size: 0.75rem;
}
.debug-open:hover { opacity: 1; }
.debug-panel {
  position: fixed; inset-block-end: 1rem; inset-inline-start: 1rem;
  z-index: 50; max-block-size: 70vh; overflow-y: auto;
  inline-size: min(30rem, calc(100vw - 2rem));
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 10px; padding: 0.8rem;
  box-shadow: 0 8px 28px rgb(0 0 0 / 0.28);
}
.debug-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.debug-head > strong { margin-inline-end: auto; }
.debug-head button { font-size: 0.75rem; padding: 0.3rem 0.6rem; }
.debug-themes { display: flex; gap: 0.2rem; }
.debug-themes button {
  font-size: 0.7rem; padding: 0.25rem 0.45rem;
  background: transparent; color: var(--muted); border-color: var(--line);
}
.debug-themes button.on { background: var(--accent); color: var(--bg); border-color: transparent; }
.debug-tokens { list-style: none; margin: 0.6rem 0 0; padding: 0; }
.debug-tokens > li {
  display: flex; align-items: center; gap: 0.5rem; padding-block: 0.25rem;
}
.debug-tokens code { font-size: 0.78rem; color: var(--muted); white-space: nowrap; }
/* Nothing in the panel may make it wider than it is: a horizontal scrollbar
   under a column of colours is a scrollbar nobody will find. */
.debug-panel, .debug-tokens > li { overflow-x: hidden; }
.debug-panel .debug-tokens input[type="color"] {
  flex: none; inline-size: 2rem; block-size: 1.6rem; padding: 0;
  border: 1px solid var(--line); border-radius: 4px; background: none;
}
/* Specific enough to beat the stylesheet's own input rules, which carry an
   attribute selector and therefore outrank a single class. A plain
   .debug-hex was being ignored entirely — the field kept the app's font and
   width and clipped the last character of every colour. */
.debug-panel input.debug-hex {
  inline-size: 8rem; flex: none;
  font-family: ui-monospace, monospace; font-size: 0.78rem;
  padding: 0.2rem 0.35rem;
}
.debug-name {
  background: none; border: none; padding: 0; margin: 0;
  color: inherit; cursor: pointer; text-align: start;
  margin-inline-end: auto;
}
/* .debug-tokens > li is the more specific selector and was flexing these
   sideways, so the three sliders sat in a row and the last one left the
   panel. Matched at the same specificity plus the class, so this wins. */
.debug-tokens > li.debug-sliders { display: block; padding: 0.2rem 0 0.6rem; }
.debug-sliders label {
  display: flex; align-items: center; gap: 0.5rem;
  font-size: 0.72rem; color: var(--muted);
  padding-block: 0.1rem;
}
.debug-sliders label > span { inline-size: 1rem; }
.debug-sliders input[type="range"] { flex: 1 1 auto; min-inline-size: 0; }
.debug-sliders output { inline-size: 3rem; text-align: end; }
`;

export function DebugColours() {
  const [open, setOpen] = useState(false);
  /*
    Through the store rather than by setting `data-theme` here, so the
    toggle is the same mechanism the Settings screen uses. Writing the
    attribute directly would work until the app's own effect ran again and
    put it back, which is the sort of divergence a debug tool should not
    introduce into the thing it is for inspecting.
  */
  const theme = useSettings((s) => s.doc.appearance.theme);
  const [tokens, setTokens] = useState<readonly string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [tuning, setTuning] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({ light: {}, dark: {} });
  /*
    Which palette is on screen. `system` is not a palette — it defers to the
    device — so an edit made under it belongs to whichever one the device is
    actually showing, which is what the learner is looking at.
  */
  const showing: Painted = theme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;

  useEffect(() => {
    if (!open) return undefined;
    /*
      Read after a frame, not during the effect.

      This component is a child of the one that applies the theme, and a
      child's effects run *before* its parent's — so reading the computed
      values here caught the page still wearing the previous palette, and
      every swatch showed the theme you had just left. Reported as exactly
      that. Waiting for the next frame puts the read after the attribute
      is on `:root` and after the browser has recomputed.
    */
    const frame = requestAnimationFrame(() => {
      const names = colourTokens();
      setTokens(names);
      const current = Object.fromEntries(
        names.map((name) => [name, currentValue(name) ?? '#000000']),
      );
      setValues(current);
      // The field keeps what is being typed into it; everything else
      // follows the page.
      setTyped((was) => ({ ...current, ...pick(was, names.filter((n) => n in was)) }));
    });
    return () => { cancelAnimationFrame(frame); };
    /*
      `theme` because each palette has its own values, and `overrides`
      because the palette is derived — changing a ground changes the ink,
      the panels and the hairlines, and the swatches have to follow.
    */
  }, [open, theme, overrides]);

  /**
   * Apply an override to the theme being looked at, and re-read the rest.
   *
   * **Two faults this fixes, both reported.** An inline style on `:root`
   * beats every palette block, so a colour tried in dark was also applied
   * in light — one edit silently changing two themes that were different
   * on purpose. And because the palette is derived, moving a ground should
   * move the ink, the panels and the hairlines with it; the swatches showed
   * the old values until the panel was reopened.
   *
   * So overrides are kept per theme and emitted as a stylesheet whose
   * selectors mirror `index.css`, and every change re-reads every token
   * from what the browser now paints.
   */
  function change(name: string, value: string) {
    setOverrides((was) => (SHARED.includes(name)
      ? {
        light: { ...was.light, [name]: value },
        dark: { ...was.dark, [name]: value },
      }
      : { ...was, [showing]: { ...was[showing], [name]: value } }));
    setTyped((was) => ({ ...was, [name]: value }));
  }

  /** What is in the hex field, which may not yet be a colour. */
  function type(name: string, text: string) {
    setTyped((was) => ({ ...was, [name]: text }));
    const full = text.startsWith('#') ? text : `#${text}`;
    if (/^#[0-9a-f]{6}$/i.test(full)) change(name, full);
  }

  function reset() {
    setOverrides({ light: {}, dark: {} });
  }

  if (!open) {
    return (
      <>
        <style>{STYLE}</style>
        <button type="button" className="debug-open" onClick={() => { setOpen(true); }}>
          Colours
        </button>
      </>
    );
  }

  return (
    <div className="debug-panel">
      <style>{STYLE}</style>
      {/*
        The overrides, as a stylesheet whose selectors mirror `index.css`
        rather than as inline styles on `:root`. Inline would beat every
        palette block at once, which is how one edit came to change both
        themes.
      */}
      <style>{sheetFor(overrides)}</style>
      <div className="debug-head">
        <strong>Colours</strong>
        {/*
          A theme switch, because the two palettes are the thing being
          compared and reaching Settings to flip between them loses the
          screen you were looking at.
        */}
        <span className="debug-themes" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={option === theme ? 'on' : undefined}
              aria-pressed={option === theme}
              onClick={() => { settingsStore.getState().setAppearance({ theme: option }); }}
            >
              {option}
            </button>
          ))}
        </span>
        <button type="button" onClick={reset}>Reset</button>
        <button type="button" onClick={() => { void copy(values); }}>Copy CSS</button>
        <button type="button" onClick={() => { setOpen(false); }}>Close</button>
      </div>
      <p className="secondary">
        Development only. Changes are not saved and are gone on reload.
      </p>
      <ul className="debug-tokens">
        {tokens.map((name) => (
          <Fragment key={name}>
          <li>
            <input
              type="color"
              value={values[name] ?? '#000000'}
              onChange={(e) => { change(name, e.target.value); }}
              aria-label={name}
            />
            {/*
              The hex, typed as well as picked. A picker is for finding a
              colour and a field is for applying one you already have —
              which is most of what this panel is for, since a palette
              usually arrives as six characters from somewhere else.

              Applied only once it parses, so the token does not blank out
              while a value is half-typed; what is in the field and what is
              on the page are allowed to disagree until it is a colour.
            */}
            <input
              type="text"
              className="debug-hex"
              value={typed[name] ?? values[name] ?? ''}
              spellCheck={false}
              onChange={(e) => { type(name, e.target.value); }}
              aria-label={`${name} hex`}
            />
            <button
              type="button"
              className="debug-name"
              onClick={() => { setTuning(tuning === name ? null : name); }}
              aria-expanded={tuning === name}
            >
              <code>{name}</code>
            </button>
          </li>
          {/*
            Sliders under the token being tuned, one at a time.

            Hue, saturation and lightness rather than red, green and blue:
            a palette is adjusted by asking for the same colour a little
            lighter or a little less saturated, and nobody thinks in
            channels. One at a time because nine tokens times three
            sliders is a wall, and the question being asked is always
            about one colour.
          */}
          {tuning === name && (
            <li className="debug-sliders">
              {HSL_PARTS.map(({ key, label, max, unit }) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    type="range"
                    min={0}
                    max={max}
                    value={Math.round(hslOf(values[name] ?? '#000000')[key])}
                    onChange={(e) => {
                      const hsl = hslOf(values[name] ?? '#000000');
                      change(name, hexOfHsl({ ...hsl, [key]: Number(e.target.value) }));
                    }}
                  />
                  <output>{Math.round(hslOf(values[name] ?? '#000000')[key])}{unit}</output>
                </label>
              ))}
            </li>
          )}
          </Fragment>
        ))}
      </ul>
    </div>
  );
}

/** The three parts of a colour anyone adjusts by hand. */
const HSL_PARTS = [
  { key: 'h', label: 'H', max: 360, unit: '\u00b0' },
  { key: 's', label: 'S', max: 100, unit: '%' },
  { key: 'l', label: 'L', max: 100, unit: '%' },
] as const;

interface Hsl { h: number; s: number; l: number }

/** `#rrggbb` to hue, saturation and lightness. */
function hslOf(hex: string): Hsl {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const span = max - min;
  if (span === 0) return { h: 0, s: 0, l: l * 100 };
  const s = span / (1 - Math.abs(2 * l - 1));
  const h = max === r
    ? ((g - b) / span + (g < b ? 6 : 0))
    : max === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

/** And back, so a slider's value becomes a token the page can use. */
function hexOfHsl({ h, s, l }: Hsl): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
      : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c]
          : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b]
    .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Every custom property declared on `:root` whose value is a colour.
 *
 * Walking the stylesheets rather than a list, so nothing has to be kept in
 * step. `--page-inset` and anything else that is a length is filtered by
 * trying to paint with it: a browser normalises a colour it understands to
 * `rgb(...)` and leaves anything else alone, which is a cheaper and more
 * reliable test than parsing.
 *
 * Rules from another origin throw on `cssRules`, so each sheet is tried
 * separately — one inaccessible sheet must not cost the whole list.
 */
function colourTokens(): string[] {
  const names = new Set<string>();
  for (const sheet of [...document.styleSheets]) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of [...rules]) collect(rule, names);
  }
  return [...names].filter(isColour).sort();
}

function collect(rule: CSSRule, into: Set<string>): void {
  if (rule instanceof CSSStyleRule) {
    for (const property of [...rule.style]) {
      if (property.startsWith('--')) into.add(property);
    }
  }
  // Media and `@supports` blocks hold the dark palette, so their contents
  // are walked too — the whole point is to reach every token, and half of
  // them are inside a `prefers-color-scheme` query.
  if (rule instanceof CSSGroupingRule) {
    for (const inner of [...rule.cssRules]) collect(inner, into);
  }
}

function isColour(name: string): boolean {
  return currentValue(name) !== null;
}

/**
 * The colour a token comes out as, painted and read back, or null if it is
 * not a colour at all.
 *
 * **A token's declared value stopped being the colour it is.** The palette
 * is derived: three colours are chosen and the rest are `color-mix`
 * expressions, several referencing another mix — so `getPropertyValue`
 * returns `color-mix(in oklab, var(--bg) 14%, #140b06)`, and the hex test
 * this used to do dropped every derived token. The symptom was the dark
 * theme's accent edge simply not appearing in the panel.
 *
 * So the browser is asked rather than parsed: paint the token, read the
 * computed colour — which may be `oklab(...)`, since that is what a mix in
 * oklab resolves to — and push it through a canvas, which is the one place
 * a browser will hand back plain sRGB bytes. That is also the honest
 * reading: these are the numbers it actually paints.
 */
function currentValue(name: string): string | null {
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  document.body.append(probe);
  const painted = getComputedStyle(probe).color;
  probe.remove();
  if (painted === '' || painted === 'rgba(0, 0, 0, 0)') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return null;
  // A length or a keyword leaves `fillStyle` at its default, which is how a
  // non-colour is told from a colour without parsing anything.
  ctx.fillStyle = '#000000';
  ctx.fillStyle = painted;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

async function copy(values: Record<string, string>): Promise<void> {
  const css = Object.entries(values).map(([name, value]) => `  ${name}: ${value};`).join('\n');
  try {
    await navigator.clipboard.writeText(`:root {\n${css}\n}`);
  } catch {
    // No clipboard permission in some contexts; the values are on screen
    // beside each swatch, which is the fallback worth having.
  }
}
