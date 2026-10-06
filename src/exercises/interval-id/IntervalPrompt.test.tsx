// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntervalPrompt } from './IntervalPrompt';
import {
  generateInterval, gradeInterval, INTERVAL_DEFAULTS,
  type IntervalExercise, type IntervalResponse, type IntervalSettings,
} from './intervals';
import type { AudioOut, Result } from '../types';
import type { Voice } from '../../audio/output/synth';
import { SIMPLE_INTERVAL_NAMES } from '../../theory/interval';

/**
 * The one part of an exercise type written by hand, and therefore the one
 * part a property test cannot reach.
 *
 * Everything it could get wrong is an interaction: whether the interval is
 * sounded once or twice, whether the answer offered is the answer recorded,
 * whether the clock it reports started when the user first heard the notes or
 * when they last asked to hear them again. The grader next door is pure and
 * tested as such; none of this is.
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** An audio out that records rather than sounds. */
function recordingAudio(): AudioOut & { plays: Voice[][] } {
  const plays: Voice[][] = [];
  return { plays, play: (voices) => { plays.push([...voices]); } };
}

let container: HTMLDivElement;
let root: Root;
let audio: ReturnType<typeof recordingAudio>;
let responses: IntervalResponse[];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  audio = recordingAudio();
  responses = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

/** A seed whose exercise is an ascending interval the defaults can offer. */
const exercise = (over: Partial<IntervalExercise> = {}): IntervalExercise => ({
  ...generateInterval({ seed: 7919, settings: INTERVAL_DEFAULTS }),
  ...over,
});

function render(
  ex: IntervalExercise,
  { result = null, settings = INTERVAL_DEFAULTS, strict = false }: {
    result?: Result | null; settings?: IntervalSettings; strict?: boolean;
  } = {},
) {
  const prompt = (
    <IntervalPrompt
      exercise={ex}
      settings={settings}
      result={result}
      onRespond={(r) => responses.push(r)}
      audio={audio}
    />
  );
  act(() => root.render(strict ? <StrictMode>{prompt}</StrictMode> : prompt));
}

const choices = () => [...container.querySelectorAll('.choices button')] as HTMLButtonElement[];
/** The button offering a given semitone distance, named as the user sees it. */
const choiceFor = (semitones: number) =>
  choices().find((b) => b.textContent === SIMPLE_INTERVAL_NAMES[semitones])!;
const replay = () => container.querySelector('.actions button') as HTMLButtonElement;
const click = (button: HTMLElement) => act(() => { button.click(); });

describe('sounding the interval', () => {
  it('plays it once, unasked, as soon as it is shown', () => {
    render(exercise());
    expect(audio.plays).toHaveLength(1);
    expect(audio.plays[0].length).toBeGreaterThan(0);
  });

  it('plays it once under a double mount, not twice over itself', () => {
    // StrictMode mounts, unmounts and remounts deliberately; without the
    // guard the two notes are heard on top of each other.
    render(exercise(), { strict: true });
    expect(audio.plays).toHaveLength(1);
  });

  it('plays it again when asked, and no more often than asked', () => {
    render(exercise());
    click(replay());
    click(replay());
    expect(audio.plays).toHaveLength(3);
  });

  it('sounds the two notes apart when melodic and together when harmonic', () => {
    render(exercise({ direction: 'up' }));
    const melodic = audio.plays[0];
    expect(new Set(melodic.map((v) => v.start)).size).toBe(2);

    act(() => root.unmount());
    root = createRoot(container);
    audio.plays.length = 0;
    render(exercise({ direction: 'harmonic' }));
    expect(new Set(audio.plays[0].map((v) => v.start)).size).toBe(1);
  });

  it('sounds nothing, and offers no replay, when the interval is to be read', () => {
    // The notes are on the staff; playing them would answer the question.
    render(exercise({ presentation: 'read' }));
    expect(audio.plays).toEqual([]);
    expect(replay()).toBeNull();
  });

  it('still takes an answer when the interval is read rather than heard', () => {
    const ex = exercise({ presentation: 'read', semitones: 7 });
    render(ex, { settings: { ...INTERVAL_DEFAULTS, semitones: [3, 7] } });
    click(choiceFor(7));
    // No latency, because the clock starts at the first hearing and there
    // was none. Omitted rather than zero: zero would be the strongest
    // possible evidence of an instant answer.
    expect(responses).toEqual([{ semitones: 7 }]);
  });

  it('says how the interval was presented', () => {
    for (const [direction, caption] of [
      ['up', 'ascending'], ['down', 'descending'], ['harmonic', 'both notes together'],
    ] as const) {
      act(() => root.unmount());
      root = createRoot(container);
      render(exercise({ direction }));
      expect(container.querySelector('.actions .secondary')?.textContent).toBe(caption);
    }
  });
});

describe('the answers on offer', () => {
  it('offers exactly the intervals the generator was allowed to draw from', () => {
    // Offering one the exercise could not have used is a free elimination;
    // omitting one it could have used takes the right answer off the screen.
    //
    // Read off the exercise rather than the live settings, which is the
    // fix for the pool being narrowed mid-question: the buttons used to
    // follow the panel while the answer stayed fixed at generation, so
    // unticking the answer left nothing correct to click and recorded a
    // wrong attempt for a question nobody was asked.
    const settings: IntervalSettings = { ...INTERVAL_DEFAULTS, semitones: [3, 4, 7] };
    const asked = generateInterval({ seed: 7919, settings });
    render(asked, { settings });
    expect(choices().map((b) => b.textContent))
      .toEqual([3, 4, 7].map((s) => SIMPLE_INTERVAL_NAMES[s]));
  });

  it('keeps offering them after the panel is narrowed under it', () => {
    /*
      The case the fix exists for. The exercise was generated when the
      pool still held its answer; the settings handed to the prompt no
      longer do. The buttons must be the ones the question was asked
      with, or the learner is shown a question with no correct answer on
      it — and the attempt that follows is recorded against an item ADR
      0007 says they were never asked.
    */
    const asked = generateInterval({
      seed: 7919,
      settings: { ...INTERVAL_DEFAULTS, semitones: [0, 12] },
    });
    render(asked, { settings: { ...INTERVAL_DEFAULTS, semitones: [12] } });

    expect(choices().map((b) => b.textContent))
      .toEqual([0, 12].map((s) => SIMPLE_INTERVAL_NAMES[s]));
    expect(
      choices().map((b) => b.textContent),
      'the answer to this question is not on the screen',
    ).toContain(SIMPLE_INTERVAL_NAMES[asked.semitones]);
  });

  it('is unmarked and live before an answer is given', () => {
    render(exercise());
    for (const button of choices()) {
      expect(button.className).toBe('choice');
      expect(button.disabled).toBe(false);
    }
  });
});

describe('answering', () => {
  it('hands up the interval that was tapped, not the one that was right', () => {
    const ex = exercise({ semitones: 7 });
    render(ex, { settings: { ...INTERVAL_DEFAULTS, semitones: [3, 7] } });
    click(choiceFor(3));
    expect(responses).toEqual([{ semitones: 3, latencyMs: expect.any(Number) }]);
  });

  it('measures from the first hearing, not from the last replay', () => {
    // A user who needs three listens has not answered quickly, and
    // restarting the clock on each replay would record that they had.
    let now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    render(exercise());
    now = 11_000;
    click(replay());
    now = 11_500;
    click(choices()[0]);

    expect(responses[0].latencyMs).toBe(1_500);
  });

  it('marks the right answer and the wrong one the user chose', () => {
    const ex = exercise({ semitones: 7 });
    const settings: IntervalSettings = { ...INTERVAL_DEFAULTS, semitones: [3, 4, 7] };
    render(ex, { settings });
    click(choiceFor(3));
    // The screen grades and hands the result back down.
    render(ex, { settings, result: gradeInterval(ex, { semitones: 3 }) });

    expect(choiceFor(7).className).toBe('choice right');
    expect(choiceFor(3).className).toBe('choice wrong');
    expect(choiceFor(4).className).toBe('choice');
  });

  it('marks nothing wrong when the user was right', () => {
    const ex = exercise({ semitones: 7 });
    const settings: IntervalSettings = { ...INTERVAL_DEFAULTS, semitones: [3, 7] };
    render(ex, { settings });
    click(choiceFor(7));
    render(ex, { settings, result: gradeInterval(ex, { semitones: 7 }) });

    expect(choiceFor(7).className).toBe('choice right');
    expect(choices().filter((b) => b.className.includes('wrong'))).toEqual([]);
  });

  it('shows the verdict the grader phrased, and says which it was in words', () => {
    // A verdict carried only by a colour is no verdict at all to a
    // colour-blind user.
    const ex = exercise({ semitones: 7 });
    const wrong = gradeInterval(ex, { semitones: 3 });
    render(ex, { result: wrong });
    const verdict = container.querySelector('.verdict');
    expect(verdict?.textContent).toBe(wrong.feedback);
    expect(verdict?.className).toBe('verdict wrong');

    act(() => root.unmount());
    root = createRoot(container);
    render(ex, { result: gradeInterval(ex, { semitones: 7 }) });
    expect(container.querySelector('.verdict')?.className).toBe('verdict right');
  });

  it('takes one answer and no more', () => {
    // A second response is a second attempt at an exercise whose answer is
    // already on screen, and recording it would tell the schedule
    // something untrue.
    const ex = exercise({ semitones: 7 });
    const settings: IntervalSettings = { ...INTERVAL_DEFAULTS, semitones: [3, 7] };
    render(ex, { settings });
    click(choiceFor(3));
    click(choiceFor(7));
    expect(responses).toHaveLength(1);

    render(ex, { settings, result: gradeInterval(ex, { semitones: 3 }) });
    for (const button of choices()) expect(button.disabled).toBe(true);
    click(choiceFor(7));
    expect(responses).toHaveLength(1);
  });

  it('can still be replayed after it has been answered', () => {
    // Hearing it again next to the right answer is how the ear learns the
    // interval it just got wrong.
    const ex = exercise();
    render(ex, { result: gradeInterval(ex, { semitones: 0 }) });
    const before = audio.plays.length;
    click(replay());
    expect(audio.plays).toHaveLength(before + 1);
  });
});
