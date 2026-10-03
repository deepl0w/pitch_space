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
 */
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
