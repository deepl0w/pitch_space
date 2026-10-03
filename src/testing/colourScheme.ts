/**
 * A matchMedia jsdom does not have, that a test can drive.
 *
 * Notation is redrawn rather than restyled when the theme changes — the ink is
 * read from the stylesheet and handed to VexFlow at draw time — so a test that
 * cannot flip the scheme cannot see whether the redraw happens at all.
 *
 * Only `(prefers-color-scheme: dark)` is answered meaningfully; every other
 * query reports no match, which is what jsdom's absent implementation amounted
 * to anyway.
 */
const DARK = '(prefers-color-scheme: dark)';

interface Query {
  list: MediaQueryList;
  listeners: Set<(event: MediaQueryListEvent) => void>;
  matches: boolean;
}

const queries: Query[] = [];
let dark = false;

function make(query: string): MediaQueryList {
  const entry: Query = { matches: query === DARK ? dark : false, listeners: new Set(), list: null! };
  const add = (listener: unknown) => {
    if (typeof listener === 'function') entry.listeners.add(listener as (e: MediaQueryListEvent) => void);
  };
  const remove = (listener: unknown) => entry.listeners.delete(listener as (e: MediaQueryListEvent) => void);
  entry.list = {
    get matches() { return entry.matches; },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: unknown) => add(listener),
    removeEventListener: (_type: string, listener: unknown) => remove(listener),
    addListener: add,
    removeListener: remove,
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
  queries.push(entry);
  return entry.list;
}

export function installMatchMedia(): void {
  window.matchMedia = ((query: string) => make(query)) as typeof window.matchMedia;
}

/** Flip the colour scheme and tell everything that asked to be told. */
export function setDarkScheme(value: boolean): void {
  dark = value;
  for (const entry of queries) {
    if (entry.list.media !== DARK) continue;
    entry.matches = value;
    const event = { matches: value, media: DARK } as MediaQueryListEvent;
    for (const listener of [...entry.listeners]) listener(event);
  }
}

/** How many listeners are still attached, for asserting that cleanup happened. */
export function schemeListenerCount(): number {
  return queries.reduce((total, entry) => total + entry.listeners.size, 0);
}

export function resetColourScheme(): void {
  queries.length = 0;
  dark = false;
}
