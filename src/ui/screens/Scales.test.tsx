// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scales } from './Scales';
import { appSynth } from '../sound';
import { resizeTo } from '../../testing/resizeObserver';

/**
 * The page's own map from a sounding event to a note on the stave.
 *
 * **The one part of staff-following that was not covered**, and the part
 * most likely to be wrong: the stave draws the scale ascending and the
 * descending play reverses an index against it, `length - 1 - i`. An
 * off-by-one there lights the wrong note on every falling scale, and looks
 * entirely plausible while doing it.
 *
 * Driven through the page rather than around it. `appSynth` is an exported
 * instance, so its `playhead` can be stubbed without touching the module —
 * main's point, and the reason this holds the screen's own map rather than
 * a second copy of the arithmetic. `play` and `stopAll` are stubbed to keep
 * the test silent; `usePlayer` still computes the real event times from
 * `schedule`, so what the hook reads is the app's timing and not a fixture.
 */

let root: Root;
let container: HTMLDivElement;
let head: number | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  head = null;
  vi.spyOn(appSynth, 'play').mockImplementation(() => {});
  vi.spyOn(appSynth, 'stopAll').mockImplementation(() => {});
  vi.spyOn(appSynth, 'playhead').mockImplementation(() => head);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Which drawn note carries the light, by its place on the stave. */
const litIndex = (): number | null => {
  const notes = [...container.querySelectorAll('svg .vf-stavenote')];
  const at = notes.findIndex((note) => note.classList.contains('score-lit'));
  return at === -1 ? null : at;
};

const noteCount = () => container.querySelectorAll('svg .vf-stavenote').length;

function show() {
  act(() => { root.render(<Scales />); });
  // The stave only draws once it has been measured.
  act(() => { resizeTo(container.querySelector('.score-host') ?? container, 900); });
}

const press = (label: string) => {
  const button = [...container.querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(button, `no button labelled "${label}"`).toBeDefined();
  act(() => { button!.click(); });
};

/** Put the playhead at `seconds` and let the follow loop read it. */
const playheadAt = (seconds: number) => {
  head = seconds;
  act(() => { vi.advanceTimersByTime(32); });
};

describe('following a scale on the stave', () => {
  it('draws the scale it is going to light', () => {
    // The population: every case below indexes into these notes.
    show();
    expect(noteCount(), 'the stave drew no notes to light').toBeGreaterThan(5);
  });

  it('lights the stave from the left when the scale rises', () => {
    show();
    press('Play the scale');
    playheadAt(0.01);
    expect(litIndex(), 'the first note up should be the first on the stave').toBe(0);
  });

  it('lights the stave from the right when the scale falls', () => {
    /*
      The reversal, which is the whole of this file. The first note heard
      coming down is the top of the stave, not the bottom — the defect this
      would catch is the identity map used for both directions, which lights
      the tonic while the octave sounds.
    */
    show();
    const last = noteCount() - 1;
    press('Play it descending');
    playheadAt(0.01);
    expect(litIndex(), 'the first note down should be the last on the stave').toBe(last);
  });

  it('walks back down the stave as the falling scale goes on', () => {
    show();
    const last = noteCount() - 1;
    press('Play it descending');

    // The gap between events is the player's own; stepping well past each
    // one keeps this about the order rather than about the timing.
    const walked = [0, 1, 2].map((event) => {
      playheadAt(0.01 + event * 0.62);
      return litIndex();
    });

    expect(walked, 'the light did not move down the stave one note at a time')
      .toEqual([last, last - 1, last - 2]);
  });
});
