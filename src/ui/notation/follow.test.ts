import { describe, expect, it } from 'vitest';
import { cursorFor, soundingAt } from './follow';
import { eventStarts, schedule } from '../../audio/output/schedule';
import type { ScoreLayout } from '../../exercises/render/toVexflow';

const layout = (xs: number[]): ScoreLayout => ({
  notes: xs.map((x, index) => ({ index, x })),
  stave: { x: 0, top: 0, bottom: 40, width: 400, notesStartX: 20 },
});

describe('which note is sounding', () => {
  const starts = [0, 0.5, 1, 1.5];

  it('is none before the first, then the last to have begun', () => {
    expect(soundingAt(-0.05, starts)).toBeNull();
    expect(soundingAt(0, starts)).toBe(0);
    expect(soundingAt(0.49, starts)).toBe(0);
    expect(soundingAt(0.5, starts)).toBe(1);
    expect(soundingAt(9, starts)).toBe(3);
  });

  it('reads the times the notes were scheduled at, not a second calculation', () => {
    // Rolled chords take longer to lay out; the times the cursor reads must
    // move with them, or it runs ahead of a roll.
    const events = [{ midis: [60, 64, 67] }, { midis: [62] }, { midis: [65, 69] }];
    const timing = { eventGap: 0.6, rollGap: 0.14, hold: 1 };
    const voices = schedule(events, timing);
    const firstOfEach = [0, 3, 4].map((v) => voices[v].start);
    expect(eventStarts(events, timing)).toEqual(firstOfEach);
  });
});

describe('where the cursor stands', () => {
  const starts = [0, 1, 2];

  it('moves from one note towards the next as the time between them passes', () => {
    const at = (s: number) => cursorFor(s, starts, [0, 1, 2], layout([100, 200, 300]));
    expect(at(0)).toBe(100);
    expect(at(0.5)).toBe(150);
    expect(at(1.75)).toBe(275);
    expect(at(5)).toBe(300);
  });

  it('walks the stave from the right when the passage runs downwards', () => {
    // A scale played descending over a stave drawn ascending.
    const at = (s: number) => cursorFor(s, starts, [2, 1, 0], layout([100, 200, 300]));
    expect(at(0)).toBe(300);
    expect(at(1.5)).toBe(150);
  });

  it('stays on one note when every event sounds it', () => {
    // A chord arpeggiated is several events on one notehead.
    const at = (s: number) => cursorFor(s, starts, [0, 0, 0], layout([140]));
    expect([at(0), at(0.7), at(1.9)]).toEqual([140, 140, 140]);
  });

  it('draws none before the passage begins', () => {
    expect(cursorFor(-0.06, starts, [0, 1, 2], layout([100, 200, 300]))).toBeNull();
  });
});
