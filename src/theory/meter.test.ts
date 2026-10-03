import { describe, expect, it } from 'vitest';
import {
  BASE_TICKS, NOTE_BASES, TICKS_PER_QUARTER, TICKS_PER_WHOLE, TIME_SIGNATURES, beamSpanIndex,
  beatLevel, isDownbeat, metricWeight, noteValue, ticksOf, tiedValues,
  timeSignature, valueOfTicks,
} from './meter';

describe('the tick grid', () => {
  // The whole reason TICKS_PER_QUARTER is 1680 rather than a power of two.
  it('makes every subdivision the app needs an exact integer', () => {
    const sixteenth = TICKS_PER_QUARTER / 4;
    expect(TICKS_PER_QUARTER / 16).toBe(105);        // 64th
    expect(sixteenth * 2 / 3).toBe(280);             // triplet 16th
    expect(sixteenth * 4 / 5).toBe(336);             // quintuplet 16th
    expect(sixteenth * 4 / 7).toBe(240);             // septuplet 16th
    expect(ticksOf(noteValue('q', 1))).toBe(2520);   // dotted quarter
  });

  it('lists every base, longest first, rather than relying on key order', () => {
    expect([...NOTE_BASES].sort()).toEqual(Object.keys(BASE_TICKS).sort());
    expect(NOTE_BASES.map((b) => BASE_TICKS[b]))
      .toEqual([...NOTE_BASES.map((b) => BASE_TICKS[b])].sort((a, b) => b - a));
  });

  // Not merely true today: a value is its base times 1, 3/2 or 7/4, the bases
  // are powers of two apart, and neither 3/2 nor 7/4 is a power of two.
  it('gives every distinct value a distinct duration', () => {
    const seen = new Map<number, string>();
    for (const base of NOTE_BASES) {
      for (const dots of [0, 1, 2] as const) {
        let ticks: number;
        try { ticks = ticksOf(noteValue(base, dots)); } catch { continue; }
        expect(seen.get(ticks), `${base}+${dots} collides`).toBeUndefined();
        seen.set(ticks, `${base}+${dots}`);
      }
    }
  });

  it('gives every undotted and singly-dotted value an integral duration', () => {
    for (const base of NOTE_BASES) {
      expect(Number.isInteger(ticksOf(noteValue(base)))).toBe(true);
      if (base !== '64') {
        expect(Number.isInteger(ticksOf(noteValue(base, 1)))).toBe(true);
      }
    }
  });

  // 105 * 1.5 is 157.5, and a float in the tick space would undermine every
  // bar-sum assertion in the suite.
  it('refuses a dotted 64th rather than rounding it', () => {
    expect(() => ticksOf(noteValue('64', 1))).toThrow(/not an integral duration/);
  });

  it('reads a duration back as the simplest value that measures it', () => {
    expect(valueOfTicks(3360)).toEqual({ base: 'h', dots: 0 });
    expect(valueOfTicks(2520)).toEqual({ base: 'q', dots: 1 });
    expect(valueOfTicks(1)).toBeNull();
  });

  it('refuses a duration no tie can measure, saying why', () => {
    expect(() => tiedValues(1000)).toThrow(/belongs to a tuplet/);
  });

  it('splits an un-notatable duration into values that sum back to it', () => {
    for (const ticks of [105, 525, 1050, 2520, 5040, 6615, 11760]) {
      const parts = tiedValues(ticks);
      expect(parts.length).toBeGreaterThan(0);
      expect(parts.reduce((s, v) => s + ticksOf(v), 0)).toBe(ticks);
    }
  });

  // Summing back is not enough on its own: a shortest-first walk also sums,
  // and notates a dotted half as twenty-four tied 64ths. Longest-first is the
  // property, and taking a value whole whenever one measures the duration is
  // what makes it readable.
  it('takes the longest value first, all the way down', () => {
    for (let n = 1; n <= 64 * 4; n++) {
      const ticks = n * BASE_TICKS['64'];
      const spans = tiedValues(ticks).map(ticksOf);
      expect(spans, `${ticks} ticks`).toEqual([...spans].sort((a, b) => b - a));
    }
  });

  it('writes a duration that has its own value as that one value', () => {
    for (const base of NOTE_BASES) {
      for (const dots of [0, 1, 2] as const) {
        let ticks: number;
        try { ticks = ticksOf(noteValue(base, dots)); } catch { continue; }
        expect(tiedValues(ticks), `${base} with ${dots} dot(s)`)
          .toEqual([{ base, dots }]);
      }
    }
  });

  it('reaches for the biggest value that still fits, then the remainder', () => {
    // A quarter tied to a sixteenth, not five tied sixteenths.
    expect(tiedValues(2100)).toEqual([{ base: 'q', dots: 0 }, { base: '16', dots: 0 }]);
    // Two whole notes' worth comes back as a double-dotted whole and a quarter.
    // Greedy reaches past the plain whole note because a dotted one still fits,
    // and both readings spend two values, so neither is longer than the other.
    expect(tiedValues(TICKS_PER_WHOLE * 2)).toEqual([{ base: 'w', dots: 2 }, { base: 'q', dots: 0 }]);
  });
});

describe('time signatures', () => {
  it('has beats that fill the bar exactly', () => {
    for (const ts of TIME_SIGNATURES) {
      expect(ts.beatDurations.reduce((a, b) => a + b, 0)).toBe(ts.barTicks);
      expect(ts.beatStarts[0]).toBe(0);
      expect(ts.beatStarts.length).toBe(ts.beatDurations.length);
    }
  });

  it('has beam spans that tile the bar with no gap and no overlap', () => {
    for (const ts of TIME_SIGNATURES) {
      let cursor = 0;
      for (const [start, end] of ts.beamSpans) {
        expect(start).toBe(cursor);
        expect(end).toBeGreaterThan(start);
        cursor = end;
      }
      expect(cursor).toBe(ts.barTicks);
    }
  });

  it('puts the downbeat alone at the top of the hierarchy', () => {
    for (const ts of TIME_SIGNATURES) {
      expect(ts.levels[0]).toEqual([0]);
      const beatLevelIndex = ts.levels.length - ts.beatWeight;
      expect([...ts.levels[beatLevelIndex]]).toEqual([...ts.beatStarts]);
    }
  });

  it('gives a quadruple meter a secondary accent at the half-bar', () => {
    for (const id of ['4/4', '12/8']) {
      const ts = timeSignature(id);
      const half = ts.barTicks / 2;
      expect(metricWeight(ts, half)).toBeGreaterThan(metricWeight(ts, ts.beatStarts[1]));
      expect(metricWeight(ts, half)).toBeLessThan(metricWeight(ts, 0));
    }
  });

  it('gives a triple meter no such accent — its beats are equal', () => {
    for (const id of ['3/4', '9/8']) {
      const ts = timeSignature(id);
      const weights = ts.beatStarts.slice(1).map((t) => metricWeight(ts, t));
      expect(new Set(weights).size).toBe(1);
    }
  });

  it('groups an irregular meter the way it is counted, not evenly', () => {
    const seven = timeSignature('7/8');
    const eighth = TICKS_PER_QUARTER / 2;
    expect(seven.beatDurations).toEqual([2 * eighth, 2 * eighth, 3 * eighth]);
    expect(seven.beatStarts).toEqual([0, 2 * eighth, 4 * eighth]);
    expect(seven.barTicks).toBe(7 * eighth);
  });

  // 7/8 is counted in eighths, so every eighth is a grid position even inside
  // the three-group. Halving that group into dotted sixteenths instead would
  // leave the second and third eighths off the grid entirely.
  it('divides every beat into the unit the meter is counted in', () => {
    for (const id of ['7/8', '5/8', '6/8', '9/8', '12/8', '3/8']) {
      const ts = timeSignature(id);
      const eighth = TICKS_PER_QUARTER / 2;
      for (let t = 0; t < ts.barTicks; t += eighth) {
        expect(metricWeight(ts, t), `${id} at tick ${t}`).toBeGreaterThan(0);
      }
    }
  });

  it('divides a compound beat into three and a simple beat into two', () => {
    const six = timeSignature('6/8');
    const eighth = TICKS_PER_QUARTER / 2;
    // The second eighth of a 6/8 bar is a real grid position, not an off-grid
    // tick: it is the middle of the first dotted-quarter beat.
    expect(metricWeight(six, eighth)).toBeGreaterThan(0);
    expect(metricWeight(six, eighth)).toBeLessThan(metricWeight(six, 3 * eighth));

    const three = timeSignature('3/4');
    expect(three.beatStarts).toEqual([0, 1680, 3360]);
  });
});

describe('metricWeight', () => {
  const fourFour = timeSignature('4/4');

  it('ranks the downbeat above beat three above beat two', () => {
    const downbeat = metricWeight(fourFour, 0);
    const beat3 = metricWeight(fourFour, 3360);
    const beat2 = metricWeight(fourFour, 1680);
    const offbeat = metricWeight(fourFour, 840);
    expect(downbeat).toBeGreaterThan(beat3);
    expect(beat3).toBeGreaterThan(beat2);
    expect(beat2).toBeGreaterThan(offbeat);
  });

  it('scores a tick that lands on no grid line at all as zero', () => {
    expect(metricWeight(fourFour, 1)).toBe(0);
    expect(metricWeight(fourFour, 337)).toBe(0);
  });

  it('treats every beat as at least beat level, and nothing weaker as that strong', () => {
    for (const ts of TIME_SIGNATURES) {
      for (const start of ts.beatStarts) {
        expect(metricWeight(ts, start)).toBeGreaterThanOrEqual(beatLevel(ts));
      }
      // The midpoint of a beat is a division, so it must rank below the beat.
      for (let i = 0; i < ts.beatStarts.length; i++) {
        const mid = ts.beatStarts[i] + ts.beatDurations[i] / 2;
        if (Number.isInteger(mid) && !ts.beatStarts.includes(mid)) {
          expect(metricWeight(ts, mid)).toBeLessThan(beatLevel(ts));
        }
      }
    }
  });

  it('is periodic across the barline', () => {
    for (const ts of TIME_SIGNATURES) {
      for (const tick of [0, 420, 840, 1680]) {
        expect(metricWeight(ts, tick + ts.barTicks)).toBe(metricWeight(ts, tick));
      }
      expect(isDownbeat(ts, ts.barTicks)).toBe(true);
      expect(isDownbeat(ts, ts.barTicks + 105)).toBe(false);
    }
  });
});

describe('beaming', () => {
  it('beams 4/4 in half-bars, so four eighths sit under one beam', () => {
    const ts = timeSignature('4/4');
    expect(beamSpanIndex(ts, 0)).toBe(0);
    expect(beamSpanIndex(ts, 2520)).toBe(0);
    expect(beamSpanIndex(ts, 3360)).toBe(1);
  });

  it('beams a compound meter per dotted-quarter beat, never in pairs', () => {
    const ts = timeSignature('6/8');
    const eighth = TICKS_PER_QUARTER / 2;
    expect([0, 1, 2].map((i) => beamSpanIndex(ts, i * eighth))).toEqual([0, 0, 0]);
    expect([3, 4, 5].map((i) => beamSpanIndex(ts, i * eighth))).toEqual([1, 1, 1]);
  });
});
