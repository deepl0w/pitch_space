// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RhythmPrompt } from './RhythmPrompt';
import {
  RHYTHM_DEFAULTS, beatSeconds, generateRhythmExercise, leadInSeconds,
  type RhythmExercise, type RhythmResponse, type RhythmSettings,
} from './rhythms';
import type { AudioOut, Result } from '../types';
import type { Voice } from '../../audio/output/synth';

/**
 * The one prompt whose answer is a performance, and the one the screen
 * sweep had to exempt by name because there is no button that constitutes
 * answering.
 *
 * Everything it can get wrong is timing or wording, and both reached the
 * browser once already: the tap window added the count-in twice and stayed
 * open for a second count-in's worth of silence after the last note, and
 * both buttons sat disabled with their ordinary labels for the nine seconds
 * a two-bar question takes at 84bpm — indistinguishable, from the user's
 * side, from an app that had stopped.
 *
 * Driven on fake timers, which move `performance.now()` as well as
 * `setTimeout`, so the clock the prompt measures against is the clock the
 * test advances. **What is asserted is differences, not absolute placement:**
 * the prompt's own header explains that it cannot promise millisecond
 * accuracy against a cold audio context, and a test that pinned absolute
 * times would be asserting something the app does not claim. Where a tap
 * lands relative to the first written beat, and where one tap lands relative
 * to another, are claims it does make.
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function recordingAudio(): AudioOut & { plays: Voice[][] } {
  const plays: Voice[][] = [];
  return { plays, play: (voices) => { plays.push([...voices]); } };
}

let container: HTMLDivElement;
let root: Root;
let audio: ReturnType<typeof recordingAudio>;
let responses: RhythmResponse[];

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  audio = recordingAudio();
  responses = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 84bpm, 4/4, a four-beat count-in and twelve written attacks. */
const exercise = (over: Partial<RhythmExercise> = {}): RhythmExercise => ({
  ...generateRhythmExercise({ seed: 7919, settings: RHYTHM_DEFAULTS }),
  ...over,
});

function render(
  ex: RhythmExercise,
  { result = null, settings = RHYTHM_DEFAULTS, strict = false }: {
    result?: Result | null; settings?: RhythmSettings; strict?: boolean;
  } = {},
) {
  const prompt = (
    <RhythmPrompt
      exercise={ex}
      settings={settings}
      result={result}
      onRespond={(r) => responses.push(r)}
      audio={audio}
    />
  );
  act(() => root.render(strict ? <StrictMode>{prompt}</StrictMode> : prompt));
}

const buttons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const labelled = (text: string) => buttons().find((b) => b.textContent?.trim() === text);
const hear = () => buttons()[0];
const answer = () => buttons()[1];
const pad = () => container.querySelector('.tap-pad') as HTMLButtonElement | null;
const counter = () => [...container.querySelectorAll('.secondary')]
  .map((e) => e.textContent ?? '').find((t) => t.includes('so far'));

const advance = (seconds: number) => act(() => { vi.advanceTimersByTime(seconds * 1000); });
const click = (button: HTMLElement) => act(() => { button.click(); });
const press = (key: string, repeat = false) => act(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true }));
});

/** Past the question it plays on arrival, to the point where it takes an answer. */
function arrive(ex: RhythmExercise) {
  render(ex);
  const total = leadInSeconds(ex) + (ex.onsets[ex.onsets.length - 1] ?? 0);
  advance(total + 0.6);
  return { total, lead: leadInSeconds(ex), beat: beatSeconds(ex.tempo) };
}

describe('putting the question', () => {
  it('sounds it once, unasked, when it is to be heard', () => {
    render(exercise());
    expect(audio.plays).toHaveLength(1);
    expect(audio.plays[0].length).toBeGreaterThan(0);
  });

  it('sounds it once under a double mount, not twice over itself', () => {
    render(exercise(), { strict: true });
    expect(audio.plays).toHaveLength(1);
  });

  it('sounds only the count-in when the rhythm is on the staff', () => {
    // Playing the notes would answer a reading question.
    const ex = exercise({ presentation: 'read' });
    render(ex);
    expect(audio.plays).toEqual([]);
    click(hear());
    const heard = audio.plays[0];
    expect(heard.length).toBe(ex.countInBeats);
  });
});

describe('what the controls say while they wait', () => {
  it('never goes quiet for the whole nine seconds it is busy', () => {
    /*
      The defect, stated as the property it actually violated. A two-bar
      question at 84bpm takes about nine seconds, and for all of it every
      control was disabled and still wore its idle label — from the user's
      side, a page that had stopped.

      What the fix gives is one control that names the state, not two: while
      the rhythm sounds, the hear button reads "Playing…" and the answer
      button is simply unavailable, which is legible because the thing
      beside it says why. So the property is that *something* on screen
      names what is happening at every instant of the wait — asserted across
      the whole duration, because the gap was the duration and not a moment
      in it.
    */
    const IDLE = ['Play it again', 'Tap it back', 'Count me in'];
    const ex = exercise();
    render(ex);
    const total = leadInSeconds(ex) + (ex.onsets[ex.onsets.length - 1] ?? 0);
    for (let elapsed = 0; elapsed < total; elapsed += 0.5) {
      const speaks = buttons().some((b) => !IDLE.includes(b.textContent?.trim() ?? ''));
      expect(speaks, `nothing on screen said what was happening at ${elapsed.toFixed(1)}s`)
        .toBe(true);
      advance(0.5);
    }
  });

  it('says it is playing, and offers the question again once it has stopped', () => {
    const ex = exercise();
    render(ex);
    expect(labelled('Playing…')).toBeDefined();
    expect(hear().disabled).toBe(true);
    expect(answer().disabled).toBe(true);

    arrive(ex);
    expect(labelled('Play it again')).toBeDefined();
    expect(hear().disabled).toBe(false);
    expect(answer().disabled).toBe(false);
  });

  it('says it is listening once the taps are being counted', () => {
    const ex = exercise();
    arrive(ex);
    click(answer());
    expect(labelled('Listening for taps…')).toBeDefined();
  });
});

describe('taking the taps', () => {
  it('counts the beat in before anything is measured', () => {
    const ex = exercise();
    arrive(ex);
    click(answer());
    // Silent: a count-in that played the rhythm would be the answer.
    expect(audio.plays.at(-1)!.length).toBe(ex.countInBeats);
  });

  it('measures a tap from the first written beat, with the count-in taken off once', () => {
    /*
      The sharp one. `onsets` is measured from the first written beat and the
      count-in is lead-in, so a tap landing exactly on that beat is zero.
      Subtracting the lead twice, or not at all, moves every tap by a count-in
      and the grader reports a rhythm played in the wrong place.
    */
    const ex = exercise();
    const { lead, beat } = arrive(ex);
    click(answer());

    advance(lead);
    click(pad()!);
    advance(beat);
    click(pad()!);

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(responses).toHaveLength(1);
    const [first, second] = responses[0].taps;
    expect(first).toBeCloseTo(0, 5);
    // The difference is the claim the prompt actually makes.
    expect(second - first).toBeCloseTo(beat, 5);
  });

  it('takes a tap from the keyboard as well as the pad, and ignores a held key', () => {
    // A held space is one tap, not forty: the browser repeats it and a
    // rhythm made of auto-repeat is not one anybody played.
    const ex = exercise();
    arrive(ex);
    click(answer());
    press(' ');
    press('Enter');
    press(' ', true);
    // Two presses and one auto-repeat.
    expect(counter()).toBe('2 so far');
  });

  it('says how many it has, so a tapper can see it is being heard', () => {
    const ex = exercise();
    arrive(ex);
    click(answer());
    expect(counter()).toBe('0 so far');
    click(pad()!);
    expect(counter()).toBe('1 so far');
  });

  it('starts an attempt from nothing when it is asked for a second time', () => {
    const ex = exercise();
    const { lead } = arrive(ex);
    click(answer());
    click(pad()!);
    expect(counter()).toBe('1 so far');

    act(() => { vi.advanceTimersByTime(60_000); });
    render(ex, { result: null });
    // Back to ready, and a fresh attempt carries none of the first one.
    advance(lead);
    expect(responses).toHaveLength(1);
  });
});

describe('closing the window', () => {
  it('closes a beat and a half after the last written note, not a count-in later', () => {
    /*
      The second defect. `total` already includes the count-in, and adding
      `lead` to it again held the window open for a second count-in's worth
      of silence — about three seconds at 84bpm — after the last note. From
      the user's side the app had stopped responding.

      Asserted from both sides of the boundary, because "it eventually
      closes" is true of the bug too.
    */
    const ex = exercise();
    const { total, beat, lead } = arrive(ex);
    click(answer());

    advance(total + beat * 1.5 - 0.05);
    expect(responses, 'closed before the window was up').toHaveLength(0);

    advance(0.1);
    expect(responses, 'did not close when the window was up').toHaveLength(1);

    // And the bug's window would still have been open here.
    expect(lead).toBeGreaterThan(beat * 1.5);
  });

  it('hands up the taps it collected, once', () => {
    const ex = exercise();
    const { total, beat } = arrive(ex);
    click(answer());
    click(pad()!);
    click(pad()!);

    advance(total + beat * 1.5 + 0.1);
    expect(responses).toHaveLength(1);
    expect(responses[0].taps).toHaveLength(2);

    advance(30);
    expect(responses, 'answered more than once').toHaveLength(1);
  });

  it('is not restarted by tapping, however long the tapping goes on', () => {
    // A window that restarted on each tap would never close for anyone
    // keeping time, which is everyone this exercise is for.
    const ex = exercise();
    const { total, beat } = arrive(ex);
    click(answer());

    for (let i = 0; i < 8; i += 1) {
      advance(beat);
      click(pad()!);
    }
    advance(total + beat * 1.5 - beat * 8 + 0.1);
    expect(responses).toHaveLength(1);
  });

  it('stops offering a pad once the window has closed', () => {
    const ex = exercise();
    const { total, beat } = arrive(ex);
    click(answer());
    expect(pad()).not.toBeNull();
    advance(total + beat * 1.5 + 0.1);
    expect(pad()).toBeNull();
  });
});
