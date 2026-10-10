// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundBox } from './SoundBox';
import type { Voice } from '../audio/output/synth';
import { SPECTRUM_BANDS } from '../audio/output/spectrum';

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

  it('does not end early because an earlier press was still counting down', () => {
    /*
      The constraint the effect's cleanup states and nothing here held: both
      cases above let the passage finish before pressing again, so the timer
      from the first press had already fired and there was nothing stale to
      clear. Pressing mid-passage is the case that distinguishes them —
      `AudioOut.play` cuts what is sounding and starts over, so the wave owes
      the *new* passage its full length, and a timer left over from the
      earlier press would end it partway through.

      Checked by removing `clearTimeout` from the effect: the four cases that
      were here all still passed.
    */
    vi.useFakeTimers();
    show({ playedAt: 1 });
    act(() => { vi.advanceTimersByTime(300); });
    expect(sounding(), 'the passage should still be sounding at 300ms of 400').toBe(true);

    // Pressed again with 100ms of the first passage left to run.
    show({ playedAt: 2 });
    act(() => { vi.advanceTimersByTime(150); });
    expect(sounding(), 'the first press ended the second passage').toBe(true);

    // And still ends, rather than passing by never stopping at all: the
    // second passage's own 400ms, counted from when it started.
    act(() => { vi.advanceTimersByTime(300); });
    expect(sounding(), 'the wave outlived the passage it was drawn for').toBe(false);
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

  /** Every bar's inline `scaleY`, which is what the drawing writes. */
  const drawnBars = () =>
    [...host.querySelectorAll<HTMLElement>('.sound-wave > span')]
      .map((bar) => bar.style.transform)
      .filter((transform) => transform !== '');

  it('hands the row back to the stylesheet when the passage ends', () => {
    /*
      Both halves of the handover, because the drawing takes the row over in
      two ways and has to give both back. `.sound-drawn` turns the keyframe
      off; the inline `scaleY` on each bar is what replaces it. Leaving
      either behind leaves a stopped box looking like a sounding one —
      frozen on the last frame it drew, which is worse than a flat row
      because it is a picture of a signal that is not there.

      The two mutants this kills — dropping `setDrawn(false)` and dropping
      the transform reset, both in the paint effect's cleanup — survived the
      four cases that were here, for a reason worth naming: none of them had
      a tap that answered, so the cleanup was never reached at all.
    */
    vi.useFakeTimers();
    show({ playedAt: 1, spectrum: (into) => { into.fill(200); return true; } });
    act(() => { vi.advanceTimersByTime(20); });

    expect(host.querySelector('.sound-drawn'), 'a tap that answers should be drawn').not.toBeNull();
    expect(drawnBars().length, 'nothing was drawn, so there is nothing to hand back').toBeGreaterThan(0);

    act(() => { vi.advanceTimersByTime(2000); });

    expect(sounding(), 'the wave should end with the passage').toBe(false);
    expect(host.querySelector('.sound-drawn'), 'still claims to draw a passage that stopped').toBeNull();
    expect(drawnBars(), 'the row froze on the last frame it drew').toEqual([]);
  });

  it('stops claiming to draw when the tap stops answering', () => {
    /*
      A tap that answers and then stops, which today's output cannot do —
      `Synth.spectrum` returns false only while `analyser` is null, and that
      field is assigned when the graph is built and never cleared. So this
      holds the component to its own prop contract rather than to a state
      the system can reach: `spectrum` is typed as returning a boolean every
      frame, and a caller is entitled to say no at any of them.

      Worth holding even so, because the branch is wrong if it ever becomes
      reachable. It takes `.sound-drawn` off, which restarts the keyframe,
      but leaves the inline `scaleY` from the last drawn frame on every bar
      — and the keyframe animates `height`, so the two would multiply rather
      than one replacing the other. That is the exact outcome the comment
      above the rule in `index.css` says the class exists to prevent.
    */
    vi.useFakeTimers();
    let answering = true;

    show({
      playedAt: 1,
      spectrum: (into) => {
        if (!answering) return false;
        into.fill(200);
        return true;
      },
    });
    act(() => { vi.advanceTimersByTime(20); });
    expect(host.querySelector('.sound-drawn')).not.toBeNull();

    answering = false;
    act(() => { vi.advanceTimersByTime(20); });

    expect(sounding(), 'the passage should still be sounding').toBe(true);
    expect(host.querySelector('.sound-drawn'), 'claimed to draw a signal it stopped getting').toBeNull();
  });
});
