// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseBoundary } from './ExerciseBoundary';

/**
 * Containing one exercise's failure, and what that costs (ADR 0015).
 *
 * The boundary exists because a throw under `Prompt` used to take the whole
 * page, menu included. But containment is not free: a crash that stops the app
 * is the loudest possible signal, and one broken card among five working ones
 * can survive a release. The ADR answers that by requiring the boundary to
 * *report* and not only to display — so "it does not swallow silently" is the
 * claim worth testing here, not merely "it does not crash".
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Boom({ message = 'no voices for this chord' }: { message?: string }): never {
  throw new Error(message);
}

let container: HTMLDivElement;
let root: Root;
/** React reports a caught error through console.error too, so this is spied rather than silenced. */
let reported: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  reported = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const text = () => container.textContent ?? '';
const said = () =>
  (reported.mock.calls as unknown[][]).map((c) => c.map(String).join(' ')).join('\n');

describe('an exercise that throws while rendering', () => {
  it('is contained rather than taking the page', () => {
    act(() => root.render(
      <ExerciseBoundary seed={123456}><Boom /></ExerciseBoundary>,
    ));

    // Something is on screen, and it says what happened rather than going blank.
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(text()).toContain('could not be shown');
  });

  it('names the seed, so the failure is reproducible rather than a story', () => {
    act(() => root.render(
      <ExerciseBoundary seed={987654}><Boom /></ExerciseBoundary>,
    ));

    // Generation is reproducible from (seed, settings) — ADR 0002, ADR 0005 —
    // so the seed on screen is the difference between a bug report and "it
    // broke once".
    expect(text()).toContain('987654');
  });

  it('reports to the console as well as to the screen', () => {
    act(() => root.render(
      <ExerciseBoundary seed={424242}><Boom message="tritone had no spelling" /></ExerciseBoundary>,
    ));

    // The half that stops containment making this class of bug quieter. A
    // boundary that only drew a message would turn a crash into something
    // nobody hears about.
    expect(said()).toContain('424242');
    expect(said()).toContain('tritone had no spelling');
  });

  it('still says something useful when nothing had been generated yet', () => {
    act(() => root.render(<ExerciseBoundary><Boom /></ExerciseBoundary>));

    expect(text()).toContain('could not be shown');
    // No seed to quote, and no "seed undefined" either.
    expect(text()).not.toContain('undefined');
  });
});

describe('an exercise that renders normally', () => {
  it('is left entirely alone', () => {
    act(() => root.render(
      <ExerciseBoundary seed={1}><p>Which interval was that?</p></ExerciseBoundary>,
    ));

    expect(text()).toBe('Which interval was that?');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(said()).toBe('');
  });
});
