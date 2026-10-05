// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RhythmPrompt, cursorAt } from './RhythmPrompt';
import {
  RHYTHM_DEFAULTS, beatSeconds, generateRhythmExercise, leadInSeconds,
  type RhythmExercise, type RhythmResponse, type RhythmSettings,
} from './rhythms';
import type { AudioOut, Result } from '../types';
import type { Voice } from '../../audio/output/synth';
import type { ScoreLayout } from '../render/toVexflow';

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
  it('plays nothing on arrival, because the question is on the staff', () => {
    /*
      It used to sound the rhythm unasked, which was right while there was
      a listening mode and is the answer now that there is not. The staff
      carries the question; playing it would read the answer out.
    */
    render(exercise());
    expect(audio.plays).toEqual([]);
  });

  it('still plays nothing under a double mount', () => {
    // The autoplay this guarded is gone. Kept pointed the other way: a
    // StrictMode remount must not find some other path to the speaker.
    render(exercise(), { strict: true });
    expect(audio.plays).toEqual([]);
  });

  it('sounds the count-in, and only the count-in, when asked', () => {
    const ex = exercise();
    render(ex);
    click(hear());
    expect(audio.plays).toHaveLength(1);
    expect(audio.plays[0].length).toBe(ex.countInBeats);
  });
});

describe('what the controls say while they wait', () => {
  it('names what is happening for every instant the controls are disabled', () => {
    /*
      The defect this came from, stated as the property it violated: for
      the whole wait every control was disabled and still wore its idle
      label, which from the player's side is a page that has stopped.

      Asserted across the whole duration rather than at a moment in it,
      because the gap was the duration.
    */
    const IDLE = ['Count me in', 'Tap it back'];
    const ex = exercise();
    render(ex);
    click(hear());
    const lead = leadInSeconds(ex);
    for (let elapsed = 0; elapsed < lead; elapsed += 0.25) {
      const speaks = buttons().some((b) => !IDLE.includes(b.textContent?.trim() ?? ''));
      expect(speaks, `nothing said what was happening at ${elapsed.toFixed(2)}s`).toBe(true);
      advance(0.25);
    }
  });

  it('holds the controls for the count-in, not for the rhythm it is not playing', () => {
    /*
      The count-in is about three seconds at 84bpm and the rhythm it
      precedes is about nine. The wait was written against the rhythm, so
      the buttons stayed disabled and the label went on reading that it
      was playing for six seconds after the last click — the single piece
      of evidence the page was alive, outlasting the thing it described.

      Pinned as the relationship rather than as a number: the wait tracks
      the count-in, and is nowhere near the whole question.
    */
    const ex = exercise();
    const lead = leadInSeconds(ex);
    const whole = lead + ex.onsets[ex.onsets.length - 1];
    expect(whole, 'the two spans are too close for this to prove anything')
      .toBeGreaterThan(lead * 2);

    render(ex);
    click(hear());
    expect(hear().disabled).toBe(true);

    advance(lead + 1);
    expect(hear().disabled, 'still held after the count-in finished').toBe(false);
    expect(labelled('Count me in')).toBeDefined();
  });

  it('says it is counting, and offers the count-in again once it has stopped', () => {
    const ex = exercise();
    render(ex);
    click(hear());
    expect(labelled('Counting you in…')).toBeDefined();
    expect(hear().disabled).toBe(true);
    expect(answer().disabled).toBe(true);

    advance(leadInSeconds(ex) + 1);
    expect(labelled('Count me in')).toBeDefined();
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

/**
 * Where the cursor sits at a given moment.
 *
 * The whole correctness of following the music, and checkable without a
 * browser: `cursorAt` takes the layout as an argument rather than reading
 * the DOM, so these hand it a stave whose geometry is chosen to make the
 * arithmetic legible — notes a hundred pixels apart at one-second intervals
 * — and ask where a time lands.
 *
 * **Nothing here asserts a pixel the engraver chose.** A golden x is a
 * snapshot of this week's VexFlow and breaks on an upgrade that moved every
 * note by a point; what a cursor depends on is that a time between two
 * onsets lands between their two positions, and that survives the upgrade.
 * `toVexflow.test.ts` pins the layout those positions come from.
 */
describe('placing the cursor', () => {
  /** Four notes, a second and a hundred pixels apart, on a stave starting at 30. */
  const layout: ScoreLayout = {
    notes: [100, 200, 300, 400].map((x, index) => ({ index, x })),
    stave: { x: 10, top: 40, bottom: 80, width: 700, notesStartX: 30 },
  };
  const times = [0, 1, 2, 3];

  it('waits at the start of the notes before the first one sounds', () => {
    // Not at the first notehead: the count-in happens before any note is due,
    // and a cursor parked on note one for the whole of it says the music has
    // started when it has not.
    expect(cursorAt(-1, times, layout)).toBe(layout.stave.notesStartX);
    expect(cursorAt(0, times, layout)).toBe(layout.stave.notesStartX);
  });

  it('lands between two notes for a time between their onsets', () => {
    // The claim. Strictly between, so a cursor at the half-beat is visibly
    // not on either note.
    const x = cursorAt(1.5, times, layout)!;
    expect(x).toBeGreaterThan(200);
    expect(x).toBeLessThan(300);
  });

  it('moves in proportion to the time, not in jumps', () => {
    // Interpolation rather than snapping: a quarter of the way through the
    // gap is a quarter of the way across it. Asserted as a ratio so the
    // pixel values stay the test's own rather than the engraver's.
    for (const [through, want] of [[0.25, 225], [0.5, 250], [0.75, 275]] as const) {
      expect(cursorAt(1 + through, times, layout)).toBeCloseTo(want, 6);
    }
  });

  it('never goes backwards as the music runs', () => {
    // The property a cursor is, swept rather than sampled at the interesting
    // points, because a non-monotonic step is a jitter nobody would catch by
    // choosing three times to look at.
    let previous = -Infinity;
    for (let t = -0.5; t <= 4; t += 0.05) {
      const x = cursorAt(t, times, layout)!;
      expect(x, `went backwards at ${t.toFixed(2)}s`).toBeGreaterThanOrEqual(previous);
      previous = x;
    }
  });

  it('stops on the last note once the music is over', () => {
    // Rather than running off the end of the stave, which is where a naive
    // extrapolation would put it.
    for (const t of [3, 3.5, 100]) expect(cursorAt(t, times, layout)).toBe(400);
  });

  it('lands on the later of two events written at the same moment', () => {
    /*
      A chord, or two voices striking together, is two entries at one time.
      The cursor has to pick one and the later is right, because the earlier
      is already behind the playhead.

      It does **not** reach the `span > 0` guard above it, and this test is
      not evidence that the guard works. Reaching that branch needs
      `seconds >= times[i - 1]` — or the loop would have returned at the
      previous index — together with `seconds < times[i]` where the two times
      are equal, which is a contradiction for any input, sorted or not. I
      searched two thousand non-decreasing arrays and an unsorted one and
      reached it zero times. The ternary is dead rather than defensive, and
      the comment on it describes a case the control flow above already
      makes impossible.
    */
    const together = [0, 1, 1, 2];
    const x = cursorAt(1, together, layout)!;
    expect(Number.isFinite(x)).toBe(true);
    expect(x).toBe(300);
  });

  it('says nothing rather than guessing when there is nothing to place against', () => {
    // Null is a real answer here: a score that has not been laid out yet has
    // no x to return, and 0 would be the left edge of the SVG.
    expect(cursorAt(1, times, { ...layout, notes: [] })).toBeNull();
    expect(cursorAt(1, [], layout)).toBeNull();
  });

  it('places against the notes it has when the two lists disagree', () => {
    // A score mid-redraw can report fewer placements than there are events.
    // Reading past the end would give `undefined.x`; this stays inside both.
    const short: ScoreLayout = { ...layout, notes: layout.notes.slice(0, 2) };
    const x = cursorAt(2.5, times, short);
    expect(Number.isFinite(x)).toBe(true);
    expect(x).toBe(200);
  });
});
