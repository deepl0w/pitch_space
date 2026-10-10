// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntervalPrompt } from './IntervalPrompt';
import {
  generateInterval, gradeInterval, INTERVAL_DEFAULTS, intervalSettingsSchema,
  type IntervalExercise, type IntervalResponse, type IntervalSettings,
} from './intervals';
import type { AudioIn, AudioOut, CaptureStyle, Result } from '../types';
import type { Voice } from '../../audio/output/synth';
import { SIMPLE_INTERVAL_NAMES } from '../../theory/interval';
import { alwaysHears, hearsOverTime, noMicrophone } from '../testing/audioIn';

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
const deaf: AudioIn = noMicrophone;

function recordingAudio(): AudioOut & { plays: Voice[][] } {
  const plays: Voice[][] = [];
  return { plays, play: (voices) => { plays.push([...voices]); }, stopAll: () => {} };
}

let container: HTMLDivElement;
let root: Root;
let audio: ReturnType<typeof recordingAudio>;
let responses: IntervalResponse[];

beforeEach(() => {
  // Faked so `afterItHasPlayed` costs nothing. The countdown on the
  // listening control reads its first value on render, so it does not
  // depend on a timer having fired.
  vi.useFakeTimers({ shouldAdvanceTime: true });
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

/** A seed whose exercise is an ascending interval the defaults can offer. */
const exercise = (over: Partial<IntervalExercise> = {}): IntervalExercise => ({
  ...generateInterval({ seed: 7919, settings: INTERVAL_DEFAULTS }),
  ...over,
});

function render(
  ex: IntervalExercise,
  {
    result = null, settings = INTERVAL_DEFAULTS, strict = false,
    audioIn = deaf, capture = 'press' as CaptureStyle,
  }: {
    result?: Result | null;
    settings?: IntervalSettings;
    strict?: boolean;
    audioIn?: AudioIn;
    capture?: CaptureStyle;
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
      capture={capture}
    />
  );
  act(() => root.render(strict ? <StrictMode>{prompt}</StrictMode> : prompt));
}

const choices = () => [...container.querySelectorAll('.choices button')] as HTMLButtonElement[];
/** The button offering a given semitone distance, named as the user sees it. */
const choiceFor = (semitones: number) =>
  choices().find((b) => b.textContent === SIMPLE_INTERVAL_NAMES[semitones])!;

/**
 * What a chip is marked as, with everything that is not a verdict removed.
 *
 * These cases are about the marking and nothing else. Comparing the whole
 * `className` also pinned `playable`, which says whether the chip can be
 * pressed to hear its interval — a different question, asserted by its own
 * cases below, and one that made three unrelated tests fail when it was
 * added.
 */
const marking = (button: HTMLButtonElement) =>
  [...button.classList].filter((c) => c !== 'choice' && c !== 'playable').join(' ');
/*
  Named rather than "the first button in `.actions`", which is what this was
  until a second control moved in beside it. The case below asserts that a
  read interval offers no replay, and the positional selector made that case
  pass or fail on the order of two unrelated buttons — it went red for
  finding "Play your answer", which is a control that should be there.
*/
/*
  Searched over the whole prompt rather than inside `.actions`, because the
  replay control moved: a listening question now puts its sound in a box of
  its own, the way a reading one puts its staff there. Scoping a search to
  the container something currently sits in is the same positional
  assumption as finding it by index, one level up.
*/
/*
  Found by its accessible name rather than by its text, because it has no
  text: the control is a play triangle. That is also the better test — it
  fails if the icon button loses the name a screen reader needs, which is
  the one way this control can become unusable without looking broken.
*/
const replay = () => ([...container.querySelectorAll('button')]
  .find((b) => /play it again|^stop$/i.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))
  ?? null) as HTMLButtonElement;

/**
 * Let the passage the question sounds on mount finish.
 *
 * The one control in the sound box is a stop while a passage is sounding,
 * so a test that presses it straight after mounting stops the question
 * rather than replaying it. Waiting the passage out is what a learner
 * does, and these cases are about what happens afterwards.
 */
const afterItHasPlayed = () => {
  act(() => { vi.advanceTimersByTime(PASSAGE_MS); });
};

/** Longer than any passage this exercise sounds. */
const PASSAGE_MS = 10_000;
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
    // Each press replays, and each replay has to be waited out before the
    // control is a play again rather than a stop.
    afterItHasPlayed();
    click(replay());
    afterItHasPlayed();
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
      // Wherever it sits: the caption follows the sound, which moved into
      // a box of its own. What matters is that the learner is told, not
      // which container tells them.
      expect(container.textContent, `no caption for ${direction}`).toContain(caption);
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

    expect(marking(choiceFor(7))).toBe('right');
    expect(marking(choiceFor(3))).toBe('wrong');
    expect(marking(choiceFor(4))).toBe('');
  });

  it('marks nothing wrong when the user was right', () => {
    const ex = exercise({ semitones: 7 });
    const settings: IntervalSettings = { ...INTERVAL_DEFAULTS, semitones: [3, 7] };
    render(ex, { settings });
    click(choiceFor(7));
    render(ex, { settings, result: gradeInterval(ex, { semitones: 7 }) });

    expect(marking(choiceFor(7))).toBe('right');
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
    /*
      The marked chips are pressable now — they play their interval — so
      "no second answer" is about what is *recorded*, not about what is
      disabled. Pressing the right answer after answering wrongly is the
      exact move this guards, and it is now a thing the learner is invited
      to do.
    */
    click(choiceFor(7));
    expect(responses, 'hearing a chip was recorded as an answer').toHaveLength(1);
    click(choiceFor(3));
    expect(responses).toHaveLength(1);
  });

  it('can still be replayed after it has been answered', () => {
    // Hearing it again next to the right answer is how the ear learns the
    // interval it just got wrong.
    const ex = exercise();
    render(ex, { result: gradeInterval(ex, { semitones: 0 }) });
    afterItHasPlayed();
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
/**
 * Hearing a wrong answer against the right one.
 *
 * Asked for directly: *"for the listening exercises i want to be able to
 * play again also the wrong answer to compare between expected and what i
 * answered"*. The claim worth holding is not that two controls exist — it is
 * that they sound **different intervals from the same note**, which is what
 * makes it a comparison rather than two unrelated sounds.
 *
 * **It was a pair of extra buttons and is now the marked chips**, after
 * *"instead of adding buttons the user should be allowed to click the answer
 * buttons to hear them — the right and wrong ones"*. The cases below moved
 * with it rather than being rewritten: what they assert about the sound is
 * unchanged, because the sound is what was asked for and the buttons were
 * only ever how it was reached.
 */
describe('comparing a wrong answer with the right one', () => {
  /** The chips that play something: the right answer and the one chosen. */
  const compareButtons = () => choices().filter((b) => b.classList.contains('playable'));

  function answerWrongly(ex: IntervalExercise) {
    render(ex);
    const wrong = ex.choices.find((c) => c !== ex.semitones)!;
    click(choiceFor(wrong));
    render(ex, { result: gradeInterval(ex, { semitones: wrong }) });
    return wrong;
  }

  it('offers both after a wrong answer', () => {
    answerWrongly(exercise());
    expect(compareButtons(), 'no way to compare the two').toHaveLength(2);
  });

  it('offers only the one after a right answer', () => {
    /*
      One rather than none, and that is a change. With a pair of extra
      buttons there was nothing to offer when the answer was right — two
      controls for one sound would have been absurd. The chip is already on
      the screen and already marked, so making it playable costs no room,
      and hearing the interval you just named is worth having.
    */
    const ex = exercise();
    render(ex);
    click(choiceFor(ex.semitones));
    render(ex, { result: gradeInterval(ex, { semitones: ex.semitones }) });
    expect(compareButtons().map((b) => b.textContent)).toEqual([
      SIMPLE_INTERVAL_NAMES[ex.semitones],
    ]);
  });

  it('leaves the chips that mean nothing unpressable', () => {
    /*
      The row must not become a keyboard. Every chip playable would invite
      working the answer out by ear after the fact, which is the opposite of
      the exercise — so only the two that carry a meaning respond, and the
      rest stay disabled rather than silently doing nothing.
    */
    const ex = exercise();
    const wrong = answerWrongly(ex);
    for (const button of choices()) {
      const marked = button.textContent === SIMPLE_INTERVAL_NAMES[ex.semitones]
        || button.textContent === SIMPLE_INTERVAL_NAMES[wrong];
      expect(button.disabled, `${button.textContent} should ${marked ? 'play' : 'not play'}`)
        .toBe(!marked);
    }
  });

  /*
    Driven from a generated exercise rather than one with fields overridden
    onto it: `semitones` and `pitches` are two views of one fact, and
    setting the first alone makes a fixture that cannot occur — which is
    how the first version of this case came to expect an interval the
    exercise was never asking about.
  */
  const ascending = () => {
    for (let seed = 1; seed < 400; seed += 1) {
      const drawn = generateInterval({ seed, settings: INTERVAL_DEFAULTS });
      if (drawn.direction === 'up' && drawn.choices.length > 1) return drawn;
    }
    throw new Error('no seed in range gave an ascending interval');
  };

  it('sounds the two from the same note, differing only in the distance', () => {
    const ex = ascending();
    const wrong = answerWrongly(ex);
    audio.plays.length = 0;

    for (const button of compareButtons()) click(button);
    expect(audio.plays, 'one of the two did not sound').toHaveLength(2);

    const [mine, theirs] = audio.plays.map((voices) => voices.map((v) => v.midi));
    expect(mine[0], 'the two started from different notes').toBe(theirs[0]);
    expect(mine[1] - mine[0], 'mine was not the interval I answered').toBe(wrong);
    expect(theirs[1] - theirs[0], 'theirs was not the interval asked about')
      .toBe(ex.semitones);
    expect(wrong, 'the fixture answered correctly, so nothing was compared')
      .not.toBe(ex.semitones);
  });

  it('keeps the contour when the question descended', () => {
    // A rising version of a falling interval is a different sound, and the
    // comparison is about the distance rather than the direction.
    const settings = intervalSettingsSchema.coerce({
      presentation: 'listen', directions: ['down'],
    });
    let descending = generateInterval({ seed: 1, settings });
    for (let seed = 1; seed < 400 && descending.direction !== 'down'; seed += 1) {
      descending = generateInterval({ seed, settings });
    }
    expect(descending.direction, 'no descending fixture').toBe('down');

    const wrong = answerWrongly(descending);
    audio.plays.length = 0;
    click(compareButtons()[0]);
    const mine = audio.plays[0].map((v) => v.midi);
    expect(mine[1] - mine[0], 'answered downwards and sounded upwards').toBe(-wrong);
  });
});

describe('answering by playing', () => {
  const note = (frequencyHz: number | null, startSeconds = 0) => (
    { startSeconds, durationSeconds: 0.5, frequencyHz }
  );
  /** A microphone that hears exactly these notes. */
  const hearing = (...notes: { startSeconds: number; durationSeconds: number; frequencyHz: number | null }[]): AudioIn =>
    alwaysHears({ heard: true, notes });

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
    render(exercise(), { audioIn: alwaysHears(take) });
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
    render(exercise(), { audioIn: alwaysHears({ heard: false, reason: 'refused' }) });
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

  /**
   * Keeping the microphone open, which is the learner's own description of
   * what they wanted: *register a note played and then take the next one
   * as the interval group*.
   *
   * The point is that the take ends **when the second note arrives**
   * rather than when a window closes — so a learner who has finished
   * playing is answered, instead of waiting out the rest of a timer they
   * cannot see. The polls are counted because arriving at the right answer
   * does not show that: a double revealing everything at once would give
   * the same response and prove nothing about when it stopped.
   */
  it('answers as soon as the second note arrives, rather than waiting the take out', async () => {
    const microphone = hearsOverTime([note(440), note(554.365, 1), note(659.255, 2)]);
    render(exercise({ semitones: 4 }), { audioIn: microphone, capture: 'continuous' });
    await answerByPlaying();

    expect(responses).toHaveLength(1);
    expect(responses[0].semitones, 'the third note reached the reading').toBe(4);
    expect(microphone.polls(), 'kept listening past the answer').toBe(2);
  });

  it('presses for a fixed take when that is what was asked for', async () => {
    // The control: the same double, the same notes, and with `press` the
    // whole take arrives — so the reading sees three notes and refuses.
    const microphone = hearsOverTime([note(440), note(554.365, 1), note(659.255, 2)]);
    render(exercise({ semitones: 4 }), { audioIn: microphone, capture: 'press' });
    await answerByPlaying();

    expect(responses, 'a pressed take stopped early').toEqual([]);
  });

  it('takes one answer, not one per press', async () => {
    render(exercise({ semitones: 4 }), { audioIn: hearing(note(440), note(554.365, 1)) });
    await answerByPlaying();
    await answerByPlaying();

    expect(responses, 'a second take answered the same question again').toHaveLength(1);
  });
});
