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
    cog: () => container.querySelector('.app-cog') as HTMLButtonElement | null,
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
    openSettings: () => act(() => {
      const cog = container.querySelector('.app-cog') as HTMLButtonElement | null;
      if (cog === null) throw new Error('no cog to open settings with');
      cog.click();
    }),
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

  it('opens a layer rather than navigating, everywhere it is offered', () => {
    /*
      **This replaced the claim it is standing in for, which had become
      vacuous.** It used to say the cog is offered *only* over an exercise,
      and it asserted that by looking for `.cog-floating` on the home
      route. The cog is one control in `App` now, on every page, under a
      different class — so the old case went on passing by finding nothing
      under a name nothing uses any more.

      The claim that replaces it is the one the change is for: one control
      doing one thing. The reason it must not navigate over an exercise is
      that the round would be discarded; the reason to do the same
      elsewhere is that a control which means two things depending on where
      you are is two controls.
    */
    for (const route of ['', 'interval-id', 'circle', 'calibration']) {
      const app = appAt(route);
      const before = window.location.hash;

      expect(app.cog(), `no cog on ${route || 'the home screen'}`).not.toBeNull();
      app.openSettings();

      expect(app.layer(), `the cog on ${route || 'home'} opened nothing`).not.toBeNull();
      expect(window.location.hash, `the cog on ${route || 'home'} navigated`).toBe(before);

      act(() => root?.unmount());
      root = null;
    }
  });

  it('shows no cog on the settings page itself, and none while the layer is up', () => {
    /*
      Two conditions that have to be the same condition, which they were
      not: the cog hid itself while the layer was open before the layer
      opened everywhere, so on every page but a practice one it vanished
      and opened nothing. A control that disappears and does nothing is
      worse than one that is simply missing.
    */
    expect(appAt('settings').cog(), 'the settings page offers a cog to itself').toBeNull();

    act(() => root?.unmount());
    root = null;

    const app = appAt('circle');
    app.openSettings();
    expect(app.layer()).not.toBeNull();
    expect(app.cog(), 'the cog is still there under the layer it opened').toBeNull();
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
