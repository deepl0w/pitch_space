/**
 * A ResizeObserver jsdom does not have, and that a test can drive.
 *
 * jsdom implements no layout, so a real ResizeObserver would never fire and
 * nothing that measures itself before drawing would ever draw. Width is also
 * the interesting variable for notation — it is redrawn at the measured width
 * rather than scaled — so the stub lets a test say what width the element got
 * instead of pretending there is a layout to read it from.
 */
interface Observed {
  element: Element;
  callback: ResizeObserverCallback;
  observer: ResizeObserver;
}

const watching: Observed[] = [];

export class TestResizeObserver implements ResizeObserver {
  // A plain field rather than a parameter property: tsconfig sets
  // erasableSyntaxOnly, so the shorthand will not compile.
  readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(element: Element): void {
    watching.push({ element, callback: this.callback, observer: this });
  }

  unobserve(element: Element): void {
    for (let i = watching.length - 1; i >= 0; i--) {
      if (watching[i].observer === this && watching[i].element === element) watching.splice(i, 1);
    }
  }

  disconnect(): void {
    for (let i = watching.length - 1; i >= 0; i--) {
      if (watching[i].observer === this) watching.splice(i, 1);
    }
  }
}

/** Tell whatever is observing `element` that it has been laid out this wide. */
export function resizeTo(element: Element, width: number, height = 200): void {
  const entry = {
    target: element,
    contentRect: { width, height, top: 0, left: 0, bottom: height, right: width, x: 0, y: 0 },
  } as ResizeObserverEntry;
  for (const { element: observed, callback, observer } of [...watching]) {
    if (observed === element) callback([entry], observer);
  }
}

/** How many elements are being observed, for asserting that cleanup happened. */
export function observedCount(): number {
  return watching.length;
}

export function resetObservers(): void {
  watching.length = 0;
}
