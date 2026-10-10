// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntervalPrompt } from './IntervalPrompt';
import {
  generateInterval, gradeInterval, INTERVAL_DEFAULTS,
  type IntervalExercise, type IntervalResponse, type IntervalSettings,
} from './intervals';
import type { AudioIn, AudioOut, Result } from '../types';
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
/**
 * A microphone that is not there, which is the honest default for a test
 * that is not about listening.
 *
 * Never `{ heard: true, notes: [] }`: that is a silent room, an answer the
 * exercise is entitled to grade, and a test that did not mean to supply an
 * answer would be supplying one. ADR 0047 is about keeping those two apart.
 */
const deaf: AudioIn = { listen: async () => ({ heard: false, reason: 'unavailable' }) };

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
  { result = null, settings = INTERVAL_DEFAULTS, strict = false, audioIn = deaf }: {
    result?: Result | null;
    settings?: IntervalSettings;
    strict?: boolean;
    audioIn?: AudioIn;
  } = {},
) {
  const prompt = (
    <IntervalPrompt
      exercise={ex}
      settings={settings}
      result={result}
      onRespond={(r) => responses.push(r)}
      audio={audio}
      audioIn={audioIn}
    />
  );
  act(() => root.render(strict ? <StrictMode>{prompt}</StrictMode> : prompt));
}

const choices = () => [...container.querySelectorAll('.choices button')] as HTMLButtonElement[];
/** The button offering a given semitone distance, named as the user sees it. */
const choiceFor = (semitones: number) =>
  choices().find((b) => b.textContent === SIMPLE_INTERVAL_NAMES[semitones])!;
/*
  Named rather than "the first button in `.actions`", which is what this was
  until a second control moved in beside it. The case below asserts that a
  read interval offers no replay, and the positional selector made that case
  pass or fail on the order of two unrelated buttons — it went red for
  finding "Play your answer", which is a control that should be there.
*/
const replay = () => ([...container.querySelectorAll('.actions button')]
  .find((b) => /play it again/i.test(b.textContent ?? '')) ?? null) as HTMLButtonElement;
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

/**
 * Answering by playing, which is the brief's central promise and the one
 * path where "the user got it wrong" and "the user never answered" arrive
 * through the same function.
 *
 * ADR 0047 is the whole of the care here. A refused microphone, a device
 * that is not there, and a take with nothing readable in it are not wrong
 * answers: grading them resets the item's streak, drops it down the review
 * ladder, and drags the figure on the home card, for a question the player
 * was never able to answer. So every case below that is not a real reading
 * asserts that **nothing was responded**, not merely that the response was
 * sensible.
 */
describe('answering by playing', () => {
  const note = (frequencyHz: number | null, startSeconds = 0) => (
    { startSeconds, durationSeconds: 0.5, frequencyHz }
  );
  /** A microphone that hears exactly these notes. */
  const hearing = (...notes: { startSeconds: number; durationSeconds: number; frequencyHz: number | null }[]): AudioIn =>
    ({ listen: async () => ({ heard: true, notes }) });

  const playAnswer = () => [...container.querySelectorAll('.actions button')]
    .find((b) => /play your answer|listening/i.test(b.textContent ?? '')) as HTMLButtonElement;

  /** Press it and let the promise it started settle. */
  const answerByPlaying = async () => {
    await act(async () => { playAnswer().click(); });
  };

  it('offers the control at all', () => {
    // The guard on every case below: all of them pass against a prompt with
    // no such button, by finding nothing and responding nothing.
    render(exercise());
    expect(playAnswer(), 'no control for answering by playing').toBeTruthy();
  });

  it('answers with the interval that was played', async () => {
    // A4 then C#5: a major third, whatever the exercise was asking.
    render(exercise({ semitones: 4 }), { audioIn: hearing(note(440), note(554.365, 1)) });
    await answerByPlaying();

    expect(responses).toHaveLength(1);
    expect(responses[0].semitones).toBe(4);
  });

  it('answers wrongly when the wrong interval was played, rather than helpfully', async () => {
    render(exercise({ semitones: 4 }), { audioIn: hearing(note(440), note(659.255, 1)) });
    await answerByPlaying();

    expect(responses).toHaveLength(1);
    expect(responses[0].semitones).toBe(7);
  });

  it.each([
    ['refused', { heard: false as const, reason: 'refused' as const }],
    ['unavailable', { heard: false as const, reason: 'unavailable' as const }],
  ])('does not answer at all when the microphone was %s', async (_name, take) => {
    render(exercise(), { audioIn: { listen: async () => take } });
    await answerByPlaying();

    expect(responses, 'a refusal was graded as an answer').toEqual([]);
  });

  it('does not answer when the take held no notes', async () => {
    render(exercise(), { audioIn: hearing() });
    await answerByPlaying();

    expect(responses, 'a silent take was graded as an answer').toEqual([]);
  });

  /**
   * The ambiguity is the machine's, and has to read as the machine's.
   *
   * Reported from outside: a learner who re-struck a note before committing
   * to it was told they were wrong, in the same wording and the same tally
   * as a clean miss, with nothing saying a third note had arrived. Both
   * halves matter — not scoring it, and saying *which* way the take could
   * not be read. "I did not hear two notes" said to someone who played
   * three is the app telling them something false about their own playing.
   */
  it('does not answer a take with a third note in it', async () => {
    render(exercise({ semitones: 4 }), {
      audioIn: hearing(note(440), note(440, 1), note(554.365, 2)),
    });
    await answerByPlaying();

    expect(responses, 'a hesitation was graded as a unison').toEqual([]);
  });

  it('says it heard three notes rather than that it heard fewer than two', async () => {
    render(exercise(), { audioIn: hearing(note(440), note(440, 1), note(554.365, 2)) });
    await answerByPlaying();

    expect(container.textContent).toMatch(/3 notes/);
    expect(container.textContent, 'told a player who played three that it heard under two')
      .not.toMatch(/did not hear two notes/);
  });

  it('does not answer when only one note could be read', async () => {
    render(exercise(), { audioIn: hearing(note(440), note(null, 1)) });
    await answerByPlaying();

    expect(responses, 'half a take was graded as an answer').toEqual([]);
  });

  it('says what happened, so a silent refusal is not the only sign', async () => {
    render(exercise(), { audioIn: { listen: async () => ({ heard: false, reason: 'refused' }) } });
    await answerByPlaying();

    expect(container.textContent).toMatch(/microphone/i);
  });

  it('leaves the question answerable after a take that said nothing', async () => {
    render(exercise({ semitones: 4 }), { audioIn: hearing() });
    await answerByPlaying();
    click(choiceFor(4));

    expect(responses, 'the buttons stopped working after a failed take')
      .toEqual([{ semitones: 4, latencyMs: expect.any(Number) }]);
  });

  it('says what it heard, so a wrong reading is visible rather than mysterious', async () => {
    render(exercise({ semitones: 2 }), { audioIn: hearing(note(440), note(987.767, 1)) });
    await answerByPlaying();

    // A major ninth, deliberately not folded into the second it contains.
    expect(container.textContent).toMatch(/14 semitones/);
  });

  it('takes one answer, not one per press', async () => {
    render(exercise({ semitones: 4 }), { audioIn: hearing(note(440), note(554.365, 1)) });
    await answerByPlaying();
    await answerByPlaying();

    expect(responses, 'a second take answered the same question again').toHaveLength(1);
  });
});
