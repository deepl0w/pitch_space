// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScalePrompt } from './ScalePrompt';
import {
  SCALE_DEFAULTS, generateScale,
  type ScaleExercise, type ScaleResponse,
} from './scales';
import type { AudioIn, AudioOut, Heard, PlayedNote } from '../types';
import { alwaysHears } from '../testing/audioIn';

/**
 * Answering a scale by playing it, and specifically the outcomes that are
 * not answers.
 *
 * ADR 0047 is the whole of the care. A refused microphone, an absent device
 * and a take with no readable octave in it are not wrong answers: grading
 * any of them resets the item's streak and drags the card's reading, for a
 * question the learner never got to answer. So every case below that is not
 * a real reading asserts that **nothing was responded**.
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const silent: AudioOut = { play: () => {} };
const RATE = 440;

/** A sequence of semitone offsets, as a detector would report them. */
const played = (semitones: readonly number[]): PlayedNote[] => semitones.map((semitone, i) => ({
  startSeconds: i * 0.4,
  durationSeconds: 0.35,
  frequencyHz: RATE * 2 ** (semitone / 12),
}));

const take = (...semitones: number[]): AudioIn =>
  alwaysHears({ heard: true, notes: played(semitones) });

let container: HTMLDivElement;
let root: Root;
let responses: ScaleResponse[];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  responses = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** A seed whose exercise offers the major scale among its choices. */
function exercise(): ScaleExercise {
  for (let seed = 1; seed < 400; seed += 1) {
    const drawn = generateScale({ seed, settings: SCALE_DEFAULTS });
    if (drawn.choices.includes('major')) return drawn;
  }
  throw new Error('no seed in range offered the major scale');
}

function render(ex: ScaleExercise, audioIn: AudioIn) {
  act(() => root.render(
    <ScalePrompt
      exercise={ex}
      settings={SCALE_DEFAULTS}
      result={null}
      onRespond={(r) => responses.push(r)}
      audio={silent}
      audioIn={audioIn}
      capture="press"
    />,
  ));
}

const playAnswer = () => [...container.querySelectorAll('.actions button')]
  .find((b) => /play your answer|listening/i.test(b.textContent ?? '')) as HTMLButtonElement;

const answerByPlaying = async () => {
  await act(async () => { playAnswer().click(); });
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];

describe('answering a scale by playing it', () => {
  it('offers the control at all', () => {
    // The guard on every case below: all of them pass against a prompt with
    // no such button, by finding nothing and responding nothing.
    render(exercise(), take());
    expect(playAnswer(), 'no control for answering by playing').toBeTruthy();
  });

  /**
   * The take is eight seconds long, and a disabled control that says only
   * "Listening…" for eight seconds reads as broken.
   *
   * Found from outside: a reviewer watching it at five seconds concluded
   * the control was stuck and nearly reported it. The cost of a missing
   * progress indication is not the wait — it is the learner ceasing to
   * believe the app is working.
   */
  it('says how much of the take is left while it listens', async () => {
    let resolve: (take: { heard: false; reason: 'unavailable' }) => void = () => {};
    // Written out rather than built from the helper, because what this
    // case needs is a take that has not finished yet — the one thing a
    // double answering immediately cannot provide.
    const pending = new Promise<Heard>((settle) => { resolve = settle; });
    const slow: AudioIn = { listen: () => pending, listenUntil: () => pending };
    render(exercise(), slow);

    await act(async () => { playAnswer().click(); });
    expect(playAnswer().textContent, 'listening without saying for how long')
      .toMatch(/\d+\s*s/);

    await act(async () => { resolve({ heard: false, reason: 'unavailable' }); });
    expect(playAnswer().textContent, 'still counting after the take ended')
      .toMatch(/play your answer/i);
  });

  it('answers with the scale that was played', async () => {
    render(exercise(), take(...MAJOR));
    await answerByPlaying();

    expect(responses).toHaveLength(1);
    expect(responses[0].typeId).toBe('major');
  });

  it.each([
    ['refused', 'refused' as const],
    ['unavailable', 'unavailable' as const],
  ])('does not answer at all when the microphone was %s', async (_name, reason) => {
    render(exercise(), alwaysHears({ heard: false, reason }));
    await answerByPlaying();

    expect(responses, 'a refusal was graded as an answer').toEqual([]);
    expect(container.textContent).toMatch(/microphone/i);
  });

  it('does not answer when the take held no readable scale', async () => {
    render(exercise(), take(0, 2, 4));
    await answerByPlaying();

    expect(responses, 'half a scale was graded as an answer').toEqual([]);
  });

  it('leaves the question answerable after a take it could not read', async () => {
    const ex = exercise();
    render(ex, take(0, 2, 4));
    await answerByPlaying();

    const button = [...container.querySelectorAll('.choices button')]
      .find((b) => !(b as HTMLButtonElement).disabled) as HTMLButtonElement;
    act(() => { button.click(); });
    expect(responses, 'the buttons stopped working after a failed take')
      .toHaveLength(1);
  });

  it('takes one answer, not one per press', async () => {
    render(exercise(), take(...MAJOR));
    await answerByPlaying();
    await answerByPlaying();

    expect(responses, 'a second take answered the same question again').toHaveLength(1);
  });
});
