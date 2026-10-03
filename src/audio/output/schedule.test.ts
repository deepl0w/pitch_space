import { describe, expect, it } from 'vitest';
import { schedule } from './schedule';

const OPTIONS = { eventGap: 0.6, rollGap: 0.15, hold: 1 };
const block = { ...OPTIONS, rollGap: 0 };

describe('scheduling voices', () => {
  // The defect this module exists for: struck and rolled must not come out as
  // the same sequence at two speeds.
  it('strikes the pitches of one event together when the roll gap is zero', () => {
    const voices = schedule([{ midis: [60, 64, 67] }], block);
    expect(voices.map((v) => v.start)).toEqual([0, 0, 0]);
  });

  it('spreads them when it is not', () => {
    const voices = schedule([{ midis: [60, 64, 67] }], OPTIONS);
    expect(voices.map((v) => v.start)).toEqual([0, 0.15, 0.3]);
  });

  it('tells a struck chord apart from a rolled one', () => {
    const struck = schedule([{ midis: [60, 64, 67] }], block).map((v) => v.start);
    const rolled = schedule([{ midis: [60, 64, 67] }], OPTIONS).map((v) => v.start);
    expect(struck).not.toEqual(rolled);
    expect(new Set(struck).size).toBe(1);
    expect(new Set(rolled).size).toBe(3);
  });

  it('advances through successive events in order', () => {
    const voices = schedule([{ midis: [60] }, { midis: [62] }, { midis: [64] }], block);
    expect(voices.map((v) => v.start)).toEqual([0, 0.6, 1.2]);
  });

  it('never starts an event before the roll in front of it has finished', () => {
    const voices = schedule([{ midis: [60, 64, 67] }, { midis: [65] }], OPTIONS);
    const lastOfRoll = voices[2].start;
    expect(voices[3].start).toBeGreaterThan(lastOfRoll);
  });

  it('holds every note for the same length', () => {
    const voices = schedule([{ midis: [60, 64] }, { midis: [62] }], OPTIONS);
    expect(voices.every((v) => v.duration === 1)).toBe(true);
  });

  it('starts at zero and schedules nothing for an empty list', () => {
    expect(schedule([], OPTIONS)).toEqual([]);
    expect(schedule([{ midis: [60] }], OPTIONS)[0].start).toBe(0);
  });

  it('skips a rest without swallowing the gap after it', () => {
    const voices = schedule([{ midis: [] }, { midis: [60] }], block);
    expect(voices).toHaveLength(1);
    expect(voices[0].start).toBe(0.6);
  });
});
