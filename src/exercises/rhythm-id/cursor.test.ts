import { describe, expect, it } from 'vitest';
import { cursorAt } from './RhythmPrompt';
import type { ScoreLayout } from '../render/toVexflow';

/**
 * Where the cursor is at a given moment.
 *
 * Asserted as a relation and never as a pixel. The x positions come from
 * VexFlow's formatter, so a golden value here would be a snapshot of a
 * version rather than a claim about the app, and it would go red on an
 * upgrade that broke nothing. What has to hold is the ordering: a time
 * between two notes puts the line between them.
 */
const layout = (xs: number[], notesStartX = 50): ScoreLayout => ({
  notes: xs.map((x, index) => ({ index, x })),
  stave: { x: 10, top: 60, bottom: 100, width: 400, notesStartX },
});

describe('the cursor', () => {
  const times = [0, 1, 2, 3];
  const l = layout([100, 200, 300, 400]);

  it('waits in front of the music through the count-in', () => {
    // The count-in runs at negative time: the clock is zeroed on the first
    // written beat, so everything before it is lead-in. The line has to
    // sit still and visible, not run backwards off the stave. Up to but
    // not including zero — at zero the first note sounds and the line
    // belongs on it, which is the next case.
    for (const t of [-3, -1.5, -0.01]) {
      expect(cursorAt(t, times, l), `at ${t}s`).toBe(l.stave.notesStartX);
    }
  });

  it('lands between two notes for a time between them', () => {
    // The whole of following the music, and the one thing a wrong
    // interpolation would get wrong without looking wrong.
    for (let i = 1; i < times.length; i += 1) {
      const between = (times[i - 1] + times[i]) / 2;
      const x = cursorAt(between, times, l)!;
      expect(x, `between note ${i - 1} and ${i}`).toBeGreaterThan(l.notes[i - 1].x);
      expect(x).toBeLessThan(l.notes[i].x);
    }
  });

  it('is exactly on a note at that note\'s moment', () => {
    for (let i = 0; i < times.length; i += 1) {
      expect(cursorAt(times[i], times, l), `note ${i}`).toBe(l.notes[i].x);
    }
  });

  it('only ever moves forwards', () => {
    let previous = -Infinity;
    for (let t = -2; t <= 5; t += 0.05) {
      const x = cursorAt(t, times, l)!;
      expect(x, `went backwards at ${t.toFixed(2)}s`).toBeGreaterThanOrEqual(previous);
      previous = x;
    }
  });

  it('stops at the last note rather than running off the stave', () => {
    for (const t of [3, 4, 100]) {
      expect(cursorAt(t, times, l), `at ${t}s`).toBe(400);
    }
  });

  it('says nothing when there is nothing drawn', () => {
    // An empty stave is a legitimate thing to draw, and a cursor on it
    // would be a line pointing at no note.
    expect(cursorAt(1, [], layout([]))).toBeNull();
    expect(cursorAt(1, times, layout([]))).toBeNull();
  });

  it('does not divide by zero when two events share a tick', () => {
    // A grace note or a chorded attack puts two events at one moment.
    // The interpolation's denominator is their gap, which is then zero.
    const x = cursorAt(0.5, [0, 1, 1, 2], layout([100, 200, 200, 300]));
    expect(Number.isFinite(x!)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(100);
    expect(x).toBeLessThanOrEqual(300);
  });
});
