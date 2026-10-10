// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundBox } from './SoundBox';
import { SPECTRUM_BANDS, type Voice } from '../audio/output/synth';

/**
 * The box that says a passage is sounding, and now draws it.
 *
 * Both cases here are about the same thing from opposite sides: the wave
 * belongs to the sound and to nothing else. It used to belong to React's
 * render cycle as well, which is the defect, and it now reads a tap that
 * may not exist, which is the fallback.
 */

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
  vi.useRealTimers();
});

/** A fresh array every call, exactly as every prompt builds it. */
const passage = (): Voice[] => [{ midi: 60, start: 0, duration: 0.4 }];

const sounding = () => host.querySelector('.sound')?.className.includes('sound-playing') ?? false;

function show(props: Partial<Parameters<typeof SoundBox>[0]> = {}) {
  act(() => {
    root.render(
      <SoundBox
        voices={passage()}
        onPlay={() => {}}
        onStop={() => {}}
        playedAt={0}
        {...props}
      />,
    );
  });
}

describe('when the wave runs', () => {
  /**
   * The reported defect, stated as the user met it.
   *
   * Every prompt passes `voices={intervalVoices(exercise)}` — a new array on
   * every render — and the effect that starts the wave had `voices` in its
   * dependencies. So any re-render at all restarted it, and the one that
   * happens most is pressing an answer: "the visualisation seems to play
   * whenever any button is pressed".
   *
   * The passage has to have finished for this to be visible, which is why
   * the timers are driven rather than the render being done twice in a row.
   */
  it('does not start again because the prompt re-rendered', () => {
    vi.useFakeTimers();
    show({ playedAt: 1 });
    expect(sounding(), 'a play should start the wave').toBe(true);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(sounding(), 'the wave should end with the passage').toBe(false);

    // The same play, a new array: what a click on an answer button does.
    show({ playedAt: 1 });
    expect(sounding(), 'an unrelated re-render restarted the wave').toBe(false);
  });

  it('still starts when the passage is actually played again', () => {
    /*
      The other half, and the reason the case above is not simply "never
      restart". Dropping `voices` from the dependencies would pass that one
      by never reacting to anything; a later `playedAt` is a real second
      play and has to be heard.
    */
    vi.useFakeTimers();
    show({ playedAt: 1 });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(sounding()).toBe(false);

    show({ playedAt: 2 });
    expect(sounding(), 'a second play did not start the wave').toBe(true);
  });
});

describe('what the wave is drawn from', () => {
  it('leaves the bars to the stylesheet when there is no tap to read', () => {
    /*
      A platform whose context has no analyser, and every test double. The
      box must still say that sound is playing — `sound-playing` drives the
      keyframe — and must not claim to be drawing a signal it does not have.
    */
    vi.useFakeTimers();
    show({ playedAt: 1 });
    expect(sounding()).toBe(true);
    expect(host.querySelector('.sound-drawn'), 'claimed to draw with no tap').toBeNull();
  });

  it('asks the tap for exactly as many bands as the output reports', () => {
    /*
      The array is the caller's and the output fills it in place, so the two
      have to agree on its length. Asserted here rather than trusted,
      because a mismatch is silent: a short array is filled with the bottom
      of the spectrum and the picture is simply wrong rather than broken.
    */
    let asked = -1;
    // Vitest's fake timers mock `requestAnimationFrame` too, which is what
    // drives the drawing — so the frames are advanced rather than stubbed,
    // and a hand-rolled stub installed first would simply be replaced.
    vi.useFakeTimers();

    show({
      playedAt: 1,
      spectrum: (into) => { asked = into.length; return true; },
    });
    act(() => { vi.advanceTimersByTime(20); });

    expect(asked).toBe(SPECTRUM_BANDS);
  });
});
