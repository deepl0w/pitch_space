/**
 * Test setup, loaded for every environment.
 *
 * VexFlow measures text by asking a canvas for a 2D context, and jsdom does
 * not implement `getContext` unless the native `canvas` package is installed.
 * Without this, every measurement logs a "Not implemented" error through
 * jsdom's virtual console — a render sweep produced a 14 MB log and spent all
 * its time printing rather than drawing.
 *
 * Installing `canvas` would fix it with a native build that has to compile on
 * every machine and in CI. A stub is enough instead: the only thing asked of
 * the context is text metrics, and the tests here assert that a score draws
 * rather than that it is spaced to the pixel.
 *
 * ResizeObserver is stubbed for the same reason from the other direction:
 * jsdom implements no layout, so a component that measures itself before
 * drawing would never draw at all. Installing it here rather than per file
 * means every component test inherits one.
 */
import { TestResizeObserver } from './resizeObserver';
if (typeof HTMLCanvasElement !== 'undefined') {
  const approximate = { width: 0 } as TextMetrics;
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return {
      measureText: (text: string) => ({ ...approximate, width: text.length * 8 }),
      font: '',
      fillText: () => {},
      strokeText: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      scale: () => {},
      translate: () => {},
    } as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

if (typeof globalThis.ResizeObserver === 'undefined' && typeof document !== 'undefined') {
  globalThis.ResizeObserver = TestResizeObserver;
}

/**
 * jsdom has no `matchMedia`, and Score asks it for the colour scheme so a
 * theme change can force a redraw. The stub reports the light scheme and
 * accepts listeners it never calls: a test that wants to drive a theme change
 * should add one here first, rather than have every component test carry a
 * dependency on media queries it does not care about.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
