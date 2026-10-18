// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AudioOut, Result } from './types';
import type { Voice } from '../audio/output/synth';
import { noMicrophone } from './testing/audioIn';
import { ChordPrompt } from './chord-id/ChordPrompt';
import {
  CHORD_DEFAULTS, chordAnswerVoices, chordVoicesFor, generateChord, gradeChord,
  type ChordExercise, type ChordResponse, type ChordSettings,
} from './chord-id/chords';
import { ScalePrompt } from './scale-id/ScalePrompt';
import {
  SCALE_DEFAULTS, generateScale, gradeScale, scaleAnswerVoices, scaleVoices,
  type ScaleExercise, type ScaleResponse, type ScaleSettings,
} from './scale-id/scales';

/**
 * Hearing a wrong answer against the right one, for chords and scales.
 *
 * Asked for in the interval exercise's terms: its marked chips play the
 * answer and the one chosen from the same starting note, and chord and
 * scale identification had nothing of the kind. A learner told "that was
 * melodic minor" has the name and not the sound.
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let plays: Voice[][];
const audio: AudioOut = { play: (voices) => { plays.push([...voices]); }, stopAll: () => {} };

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  plays = [];
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const midis = (voices: readonly Voice[]) => voices.map((v) => v.midi);
const chips = () => [...container.querySelectorAll('.choices button')] as HTMLButtonElement[];
const click = (button: HTMLElement) => act(() => { button.click(); });

/** The prompt and the grader together, as the screen holds them. */
function Graded<E, R>({ exercise, grade, render }: {
  exercise: E;
  grade(exercise: E, response: R): Result;
  render(props: { result: Result | null; onRespond(r: R): void }): React.ReactElement;
}) {
  const [result, setResult] = useState<Result | null>(null);
  return render({ result, onRespond: (r) => setResult(grade(exercise, r)) });
}

function mountChord(exercise: ChordExercise, settings: ChordSettings = CHORD_DEFAULTS) {
  act(() => root.render(
    <Graded<ChordExercise, ChordResponse>
      exercise={exercise}
      grade={gradeChord}
      render={({ result, onRespond }) => (
        <ChordPrompt
          exercise={exercise} settings={settings} result={result} onRespond={onRespond}
          audio={audio} audioIn={noMicrophone} capture="press" moveOn={null}
        />
      )}
    />,
  ));
}

function mountScale(exercise: ScaleExercise, settings: ScaleSettings = SCALE_DEFAULTS) {
  act(() => root.render(
    <Graded<ScaleExercise, ScaleResponse>
      exercise={exercise}
      grade={gradeScale}
      render={({ result, onRespond }) => (
        <ScalePrompt
          exercise={exercise} settings={settings} result={result} onRespond={onRespond}
          audio={audio} audioIn={noMicrophone} capture="press" moveOn={null}
        />
      )}
    />,
  ));
}

describe('the voices a chord answer is replayed with', () => {
  it('replays the asked chord exactly as the question sounded it, in every voicing', () => {
    // If the right answer's replay differed from the question, the
    // comparison would be against something the learner never heard.
    for (const settings of [
      CHORD_DEFAULTS,
      { ...CHORD_DEFAULTS, openVoicing: true, sounding: 'arpeggio' as const, inversions: true },
    ]) {
      for (let seed = 1; seed <= 60; seed += 1) {
        const ex = generateChord({ seed, settings });
        expect(chordAnswerVoices(ex, ex.typeId, ex.inversion), `seed ${seed}`)
          .toEqual(chordVoicesFor(ex));
      }
    }
  });

  it('builds another quality on the same root note', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const ex = generateChord({ seed, settings: CHORD_DEFAULTS });
      for (const other of ex.choices) {
        // Root position, so the lowest note is the root for both.
        expect(Math.min(...midis(chordAnswerVoices(ex, other, 0))), `seed ${seed}, ${other}`)
          .toBe(Math.min(...midis(chordVoicesFor(ex))));
      }
    }
  });
});

describe('the voices a scale answer is replayed with', () => {
  it('replays the asked scale exactly as the question sounded it, in every direction', () => {
    for (const direction of ['up', 'down', 'updown'] as const) {
      for (let seed = 1; seed <= 60; seed += 1) {
        const ex = generateScale({ seed, settings: { ...SCALE_DEFAULTS, direction } });
        expect(scaleAnswerVoices(ex, ex.typeId)).toEqual(scaleVoices(ex));
      }
    }
  });

  it('plays another type from the same root, in the same direction', () => {
    for (const direction of ['up', 'down'] as const) {
      const ex = generateScale({ seed: 3, settings: { ...SCALE_DEFAULTS, direction } });
      for (const other of ex.choices) {
        const heard = midis(scaleAnswerVoices(ex, other));
        const asked = midis(scaleVoices(ex));
        expect(heard[0], other).toBe(asked[0]);
        expect(heard.at(-1), other).toBe(asked.at(-1));
      }
    }
  });
});

describe('a marked chip, once the question is answered', () => {
  it('plays the chord chosen and the chord asked, and nothing else', () => {
    const ex = generateChord({ seed: 11, settings: CHORD_DEFAULTS });
    const wrong = ex.choices.find((id) => id !== ex.typeId)!;
    mountChord(ex);
    const wrongChip = chips()[ex.choices.indexOf(wrong)];
    const rightChip = chips()[ex.choices.indexOf(ex.typeId)];
    click(wrongChip);
    plays = [];

    const playable = chips().filter((b) => b.classList.contains('playable'));
    expect(playable).toEqual(
      [wrongChip, rightChip].sort((a, b) => chips().indexOf(a) - chips().indexOf(b)),
    );
    expect(chips().filter((b) => !playable.includes(b)).every((b) => b.disabled)).toBe(true);

    click(wrongChip);
    click(rightChip);
    expect(plays).toEqual([
      chordAnswerVoices(ex, wrong, ex.inversion),
      chordAnswerVoices(ex, ex.typeId, ex.inversion),
    ]);
  });

  it('plays a bass chip with the asked quality, so only the bass differs', () => {
    const settings = { ...CHORD_DEFAULTS, inversions: true };
    const ex = generateChord({ seed: 5, settings });
    const otherBass = ex.inversionChoices.find((inv) => inv !== ex.inversion)!;
    mountChord(ex, settings);
    const bassChips = () => [...container.querySelectorAll(
      '[aria-label="Which note is in the bass?"] button',
    )] as HTMLButtonElement[];
    click(chips()[ex.choices.indexOf(ex.typeId)]);
    click(bassChips()[ex.inversionChoices.indexOf(otherBass)]);
    plays = [];
    click(bassChips()[ex.inversionChoices.indexOf(otherBass)]);
    expect(plays).toEqual([chordAnswerVoices(ex, ex.typeId, otherBass)]);
  });

  it('plays the scale chosen and the scale asked, from the same root', () => {
    const ex = generateScale({ seed: 2, settings: SCALE_DEFAULTS });
    const wrong = ex.choices.find((id) => id !== ex.typeId && id !== 'natural_minor'
      && id !== 'melodic_minor')!;
    mountScale(ex);
    const wrongChip = chips()[ex.choices.indexOf(wrong)];
    click(wrongChip);
    plays = [];
    expect(chips().filter((b) => b.classList.contains('playable'))).toHaveLength(2);
    click(wrongChip);
    expect(plays).toEqual([scaleAnswerVoices(ex, wrong)]);
  });

  it('stays silent on a reading question, which was never about a sound', () => {
    const ex = generateChord({ seed: 11, settings: { ...CHORD_DEFAULTS, presentation: 'read' } });
    mountChord(ex, { ...CHORD_DEFAULTS, presentation: 'read' });
    click(chips()[0]);
    expect(chips().some((b) => b.classList.contains('playable'))).toBe(false);
  });
});

describe('a falling melodic minor', () => {
  /*
    Classical, by the user's choice: melodic minor raises its sixth and
    seventh on the way up and comes down as the natural minor. So by ear,
    descending, the two are one answer, and refusing either would be
    marking a learner wrong for something the sound does not contain.
  */
  const down = { ...SCALE_DEFAULTS, direction: 'down' as const };
  const asked = (typeId: string, settings: ScaleSettings = down): ScaleExercise => {
    for (let seed = 1; seed < 500; seed += 1) {
      const ex = generateScale({ seed, settings });
      if (ex.typeId === typeId) return ex;
    }
    throw new Error(`no seed asks ${typeId}`);
  };

  it('sounds the natural minor notes', () => {
    const melodic = asked('melodic_minor');
    const natural = { ...melodic, typeId: 'natural_minor' };
    expect(midis(scaleVoices(melodic))).toEqual(midis(scaleVoices(natural)));
  });

  it('still rises with the raised notes when it goes up and back', () => {
    const melodic = asked('melodic_minor', { ...SCALE_DEFAULTS, direction: 'updown' });
    const heard = midis(scaleVoices(melodic));
    const root = heard[0];
    const rising = heard.slice(0, 8).map((m) => m - root);
    const falling = heard.slice(7).map((m) => m - root);
    expect(rising).toEqual([0, 2, 3, 5, 7, 9, 11, 12]);
    expect(falling).toEqual([12, 10, 8, 7, 5, 3, 2, 0]);
  });

  it('accepts either name, either way round, and credits the item asked', () => {
    for (const [question, answer] of [
      ['melodic_minor', 'natural_minor'], ['natural_minor', 'melodic_minor'],
    ]) {
      const result = gradeScale(asked(question), { typeId: answer });
      expect(result.correct, `${answer} for ${question}`).toBe(true);
      expect(result.outcomes).toEqual([
        expect.objectContaining({ item: `scale:${question}`, correct: true }),
      ]);
    }
  });

  it('accepts only the exact name where the sound differs', () => {
    for (const settings of [
      SCALE_DEFAULTS,
      { ...SCALE_DEFAULTS, direction: 'updown' as const },
      { ...down, presentation: 'read' as const },
    ]) {
      const result = gradeScale(asked('melodic_minor', settings), { typeId: 'natural_minor' });
      expect(result.correct, `${settings.direction}, ${settings.presentation}`).toBe(false);
    }
  });

  it('marks the other name right on screen, not wrong', () => {
    const melodic = asked('melodic_minor');
    mountScale(melodic, down);
    const natural = chips()[melodic.choices.indexOf('natural_minor')];
    click(natural);
    expect(natural.classList.contains('right')).toBe(true);
    expect(natural.classList.contains('wrong')).toBe(false);
  });
});
