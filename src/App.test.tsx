// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { installAudioContext, resetAudio } from './testing/audioContext';
import { resizeTo } from './testing/resizeObserver';

/**
 * Settings reached over a running exercise, rather than instead of it.
 *
 * The user asked to change instrument mid-question. A route change cannot
 * serve that: every one unmounts the practice screen and takes the round
 * with it. So the settings screen is also rendered as a layer above the
 * exercise, and what that buys — the round still being there afterwards —
 * is the thing worth asserting, because a later refactor to a settings
 * *page* would undo it silently and leave every other test green.
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  resetAudio();
  installAudioContext();
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  window.location.hash = '';
  resetAudio();
});

/** The app on a route, mounted the way `main.tsx` mounts it. */
function appAt(route: string) {
  window.location.hash = route === '' ? '' : `#/${route}`;
  root = createRoot(container);
  act(() => root!.render(<App />));

  const buttons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
  const press = (label: string) => act(() => {
    buttons().find((b) => b.textContent?.trim() === label)?.click();
  });
  return {
    buttons,
    press,
    cog: () => container.querySelector('.cog-floating') as HTMLButtonElement | null,
    layer: () => container.querySelector('[role="dialog"]'),
    /**
     * What is on screen, as something that differs between two rounds.
     *
     * The drawn stave rather than `.prompt`, which was the first choice
     * and does not move: a listening question renders the same markup
     * whatever interval it is asking, because the question is the sound.
     * "The round survived" was then true of a round that had been thrown
     * away and replaced, and the sensitivity case below is what caught it.
     *
     * VexFlow numbers its groups from a counter that never resets, so the
     * ids come out before two drawings can be compared at all.
     */
    question: () => {
      const host = container.querySelector('.score-host');
      if (host) act(() => { resizeTo(host, 760); });
      return container.querySelector('.score-host svg')?.outerHTML
        .replace(/vf-auto\d+/g, 'vf-auto') ?? null;
    },
    openSettings: () => act(() => { (container.querySelector('.cog-floating') as HTMLButtonElement).click(); }),
  };
}

describe('settings over a running exercise', () => {
  it('keeps the question that was on screen, with the layer actually open', () => {
    /*
      **The control is the first assertion, not a nicety.** "The question is
      still there" is equally true of a cog that does nothing, so a case
      that did not first prove the layer opened would pass on a dead button
      — the shape this suite has had to repair three times this week.

      And the second control is below: the question's markup has to be
      something that *changes* when the round really is replaced, or
      "unchanged" is a statement about a handle that never moves.
    */
    const app = appAt('interval-id');
    app.press('Reading');
    app.press('Start');
    const before = app.question();
    expect(before, 'no question was on screen to keep').not.toBeNull();
    expect(app.layer(), 'the layer was open before it was opened').toBeNull();

    app.openSettings();
    expect(app.layer(), 'the cog did not open the layer').not.toBeNull();
    expect(app.question(), 'the round did not survive the layer opening').toBe(before);

    app.press('Done');
    expect(app.layer(), 'the layer did not close').toBeNull();
    expect(app.question(), 'the round did not survive the layer closing').toBe(before);
  });

  it('is asked of a handle that moves when the round really changes', () => {
    // The sensitivity control for the case above. Without it, a `.prompt`
    // that rendered the same markup for every round would make "unchanged"
    // true of a round that had been thrown away and replaced.
    const app = appAt('interval-id');
    app.press('Reading');
    app.press('Start');
    const first = app.question();
    expect(first, 'nothing was drawn, so nothing is being compared').not.toBeNull();
    app.press('Skip to the next');
    expect(app.question(), 'one round looks exactly like the next').not.toBe(first);
  });

  it('offers the layer only where there is a round to keep', () => {
    // Two routes into one screen on one route is a thing to explain rather
    // than a convenience, and the home screen's own cog already goes to the
    // full page.
    expect(appAt('').cog(), 'the floating cog is offered off an exercise').toBeNull();
  });

  it('closes before it navigates, so nothing floats over the next screen', () => {
    /*
      Calibration is reachable from inside the layer. Without the close the
      panel would sit over whatever the reader landed on — which is the same
      defect as a passage still sounding after a screen change, in a
      different medium.
    */
    const app = appAt('interval-id');
    app.press('Reading');
    app.press('Start');
    app.openSettings();
    expect(app.layer()).not.toBeNull();

    app.press('Measure it');
    expect(window.location.hash, 'it did not navigate at all').not.toBe('#/interval-id');
    expect(app.layer(), 'the layer is still over the screen it navigated to').toBeNull();
  });
});
