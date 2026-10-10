// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressionPrompt } from './ProgressionPrompt';
import {
  generateProgression, gradeProgression, PROGRESSION_DEFAULTS,
  type ProgressionExercise, type ProgressionResponse, type ProgressionSettings,
} from './progressions';
import type { AudioIn, AudioOut, Result } from '../types';
import type { Voice } from '../../audio/output/synth';
import { noMicrophone } from '../testing/audioIn';

/**
 * The only prompt in the app whose answer is built up rather than chosen.
 *
 * Every other exercise is one tap: the response is the button, and there is
 * no state between seeing the question and answering it. A progression is
 * answered a chord at a time, so this component holds a partial answer, and a
 * partial answer is a thing that can be wrong in ways a pure grader cannot
 * see — filled in the wrong order, rewound to the wrong place, still editable
 * after it has been marked, or reported with a clock that restarted every
 * time the user asked to hear the chords again.
 *
 * `progressions.ts` is pure and tested as such. None of the below is.
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
let responses: ProgressionResponse[];

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

/**
 * A seed whose progression is ii–V–V–I in D major.
 *
 * The repeated V is deliberate: a rewind that matched on the numeral rather
 * than on the slot would pass on a progression where every chord differs.
 */
const exercise = (over: Partial<ProgressionExercise> = {}): ProgressionExercise => ({
  ...generateProgression({ seed: 7919, settings: PROGRESSION_DEFAULTS }),
  ...over,
});

function render(
  ex: ProgressionExercise,
  { result = null, settings = PROGRESSION_DEFAULTS, strict = false }: {
    result?: Result | null; settings?: ProgressionSettings; strict?: boolean;
  } = {},
) {
  const prompt = (
    <ProgressionPrompt
      exercise={ex}
      settings={settings}
      result={result}
      onRespond={(r) => responses.push(r)}
      audio={audio}
      audioIn={deaf}
      capture="press"
    />
  );
  act(() => root.render(strict ? <StrictMode>{prompt}</StrictMode> : prompt));
}

const slots = () => [...container.querySelectorAll('.slots button')] as HTMLButtonElement[];
const choices = () => [...container.querySelectorAll('.choices button')] as HTMLButtonElement[];
const choiceFor = (numeral: string) => choices().find((b) => b.textContent === numeral)!;
const replay = () => [...container.querySelectorAll('.actions button')]
  .find((b) => b.textContent === 'Play it again') as HTMLButtonElement | undefined;
/**
 * The control that hands the answer up; it is also the "n to go" counter.
 *
 * Matched on what it says rather than on being last in the group. `.at(-1)`
 * is a claim about layout: a control added after this one is picked up
 * silently in its place, which is how the interval prompt's replay case
 * started pressing a different button when capture arrived beside it. The
 * pattern covers both of this control's words, since the count is in one
 * of them.
 */
const check = () => [...container.querySelectorAll('.actions button')]
  .find((b) => b.textContent?.trim() === 'Check') as HTMLButtonElement | undefined;
/**
 * The Check control, insisted upon.
 *
 * Most cases fill every slot first and then press it, so its absence there
 * is a broken fixture rather than the thing under test — and a `!` would
 * report that as "cannot read properties of undefined" several lines later.
 */
const mustCheck = () => {
  const button = check();
  if (button === undefined) throw new Error('no Check control, with every slot filled');
  return button;
};
/**
 * How many slots are left, which is a sentence rather than a control.
 *
 * It was the label on a disabled Check button and read as a control you
 * cannot use — the learner said so. A count is a description of where you
 * are; it becomes a button only when there is something to press.
 */
const toGo = () => [...container.querySelectorAll('.actions .secondary')]
  .find((e) => /\d+ to go/.test(e.textContent ?? ''));
const click = (button: HTMLElement) => act(() => { button.click(); });
/** What each slot reads, which is what the user sees of their own answer. */
const written = () => slots().map((b) => b.textContent);

describe('sounding the progression', () => {
  it('plays it once, unasked, as soon as it is shown', () => {
    render(exercise());
    expect(audio.plays).toHaveLength(1);
    expect(audio.plays[0].length).toBeGreaterThan(0);
  });

  it('plays it once under a double mount, not twice over itself', () => {
    // StrictMode mounts, unmounts and remounts deliberately; without the
    // guard the cadence and the progression are heard on top of themselves.
    render(exercise(), { strict: true });
    expect(audio.plays).toHaveLength(1);
  });

  it('plays it again when asked, and no more often than asked', () => {
    render(exercise());
    click(replay()!);
    click(replay()!);
    expect(audio.plays).toHaveLength(3);
  });

  it('sounds nothing, and offers no replay, when the progression is to be read', () => {
    // The chords are on the staff; playing them would answer the question.
    render(exercise({ presentation: 'read' }));
    expect(audio.plays).toEqual([]);
    expect(replay()).toBeUndefined();
  });
});

describe('filling the slots', () => {
  it('puts one slot on screen per chord, all of them empty', () => {
    const ex = exercise();
    render(ex);
    expect(slots()).toHaveLength(ex.numerals.length);
    expect(written()).toEqual(ex.numerals.map(() => '·'));
  });

  it('fills left to right, whichever chord is tapped', () => {
    // Order is the exercise: filling the cadence first would be working
    // backwards from the end, which is a real technique but not this drill.
    render(exercise());
    click(choiceFor('vi'));
    expect(written()).toEqual(['vi', '·', '·', '·']);
    click(choiceFor('I'));
    expect(written()).toEqual(['vi', 'I', '·', '·']);
  });

  it('counts down what is left, and only offers Check when nothing is', () => {
    const ex = exercise();
    render(ex);
    expect(toGo()?.textContent?.trim()).toBe('4 to go');
    expect(check(), 'offered Check with four slots empty').toBeUndefined();

    for (const numeral of ex.numerals) click(choiceFor(numeral));
    expect(toGo(), 'still counting down with nothing left').toBeUndefined();
    expect(check()?.disabled).toBe(false);
  });

  it('takes no further chord once every slot is filled', () => {
    // There is nowhere to put it, and silently dropping it is better than
    // overwriting a slot the user cannot see they are overwriting.
    const ex = exercise();
    render(ex);
    for (const numeral of ex.numerals) click(choiceFor(numeral));
    for (const button of choices()) expect(button.disabled).toBe(true);

    click(choiceFor('vi'));
    expect(written()).toEqual([...ex.numerals]);
  });

  it('rewinds to a filled slot that is tapped, dropping it and everything after', () => {
    // One rule rather than two: clearing only the tapped slot would leave a
    // gap, and a gap means deciding what a half-answered progression means.
    render(exercise());
    for (const numeral of ['ii', 'V', 'V', 'I']) click(choiceFor(numeral));
    expect(written()).toEqual(['ii', 'V', 'V', 'I']);

    click(slots()[1]);
    expect(written()).toEqual(['ii', '·', '·', '·']);

    // And the answer resumes from there rather than from the end.
    click(choiceFor('IV'));
    expect(written()).toEqual(['ii', 'IV', '·', '·']);
  });

  it('leaves a slot that has not been reached alone', () => {
    // Tapping ahead of the answer would rewind to a slot that was never
    // filled, which from the user's side is the answer vanishing.
    render(exercise());
    click(choiceFor('ii'));
    expect(slots()[1].disabled).toBe(true);
    click(slots()[1]);
    expect(written()).toEqual(['ii', '·', '·', '·']);
  });
});

describe('answering', () => {
  it('hands up the chords that were tapped, in the order they were tapped', () => {
    render(exercise());
    for (const numeral of ['I', 'IV', 'V', 'I']) click(choiceFor(numeral));
    click(mustCheck());
    expect(responses).toEqual([
      { numerals: ['I', 'IV', 'V', 'I'], latencyMs: expect.any(Number) },
    ]);
  });

  it('measures from the first hearing, not from the last replay', () => {
    // A user who needs three listens has not answered quickly, and
    // restarting the clock on each replay would record that they had.
    let now = 10_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const ex = exercise();
    render(ex);
    now = 11_000;
    click(replay()!);
    now = 11_500;
    for (const numeral of ex.numerals) click(choiceFor(numeral));
    click(mustCheck());

    expect(responses[0].latencyMs).toBe(1_500);
  });

  it('reports no latency at all when the progression was read rather than heard', () => {
    // Omitted rather than zero: zero would be the strongest possible
    // evidence of an instant answer.
    const ex = exercise({ presentation: 'read' });
    render(ex);
    for (const numeral of ex.numerals) click(choiceFor(numeral));
    click(mustCheck());
    expect(responses).toEqual([{ numerals: [...ex.numerals] }]);
  });

  it('offers no way to hand up a half-filled answer', () => {
    /*
      Stronger than it was, and the change is the point. It used to press a
      disabled Check and assert nothing was handed up; there is now no
      Check to press until the slots are full, so the half-filled answer is
      unreachable rather than merely refused. Both halves are asserted,
      because a missing control that still submits by some other route
      would pass the first on its own.
    */
    const ex = exercise();
    render(ex);
    click(choiceFor('I'));
    expect(check(), 'a half-filled answer could be submitted').toBeUndefined();
    expect(responses).toEqual([]);
  });

  it('freezes once it has been answered', () => {
    // The right answer is on screen; a second response would tell the
    // schedule the user knew something they were shown.
    const ex = exercise();
    render(ex);
    for (const numeral of ex.numerals) click(choiceFor(numeral));
    click(mustCheck());
    render(ex, { result: gradeProgression(ex, { numerals: [...ex.numerals] }) });

    for (const button of [...slots(), ...choices()]) expect(button.disabled).toBe(true);
    click(slots()[0]);
    expect(written()).toEqual([...ex.numerals]);
    expect(responses).toHaveLength(1);
  });

  it('shows what was said struck through beside what was right, where they differ', () => {
    const ex = exercise();
    const said = ['I', 'V', 'V', 'I'];
    render(ex);
    for (const numeral of said) click(choiceFor(numeral));
    click(mustCheck());
    render(ex, { result: gradeProgression(ex, { numerals: said }) });

    // ii was answered I; the other three were right.
    expect(slots()[0].className).toBe('slot filled wrong');
    expect(slots()[0].querySelector('s')?.textContent).toBe('I');
    expect(slots()[0].textContent).toBe('I ii');

    for (const i of [1, 2, 3]) {
      expect(slots()[i].className).toBe('slot filled right');
      expect(slots()[i].querySelector('s')).toBeNull();
      expect(slots()[i].textContent).toBe(ex.numerals[i]);
    }
  });

  it('strikes nothing through when every chord was right', () => {
    const ex = exercise();
    render(ex);
    for (const numeral of ex.numerals) click(choiceFor(numeral));
    click(mustCheck());
    render(ex, { result: gradeProgression(ex, { numerals: [...ex.numerals] }) });

    expect(slots().map((b) => b.className)).toEqual(ex.numerals.map(() => 'slot filled right'));
    expect(container.querySelectorAll('.slots s')).toHaveLength(0);
  });

  it('shows the verdict the grader phrased, and says which it was in words', () => {
    // A verdict carried only by a colour is no verdict at all to a
    // colour-blind user.
    const ex = exercise();
    const wrong = gradeProgression(ex, { numerals: ['I', 'I', 'I', 'I'] });
    render(ex, { result: wrong });
    expect(container.querySelector('.verdict')?.textContent).toBe(wrong.feedback);
    expect(container.querySelector('.verdict')?.className).toBe('verdict wrong');

    render(ex, { result: gradeProgression(ex, { numerals: [...ex.numerals] }) });
    expect(container.querySelector('.verdict')?.className).toBe('verdict right');
  });
});
