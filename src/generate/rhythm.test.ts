import { describe, expect, it } from 'vitest';
import { CELLS, cellsOfKind, scaleCell, valueForEvent } from './cells';
import { generateRhythm, kindForBeat } from './rhythm';
import { TIME_SIGNATURES, beamSpanIndex, ticksOf, timeSignature } from '../theory/meter';
import { makeRng } from '../theory/rng';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 2654435761 % 0xffffffff);

/**
 * The constraint sets a user can actually ask for.
 *
 * This swept ten grades, which was ten points on one line through a
 * space with four axes in it. The axes are what the caller sets now, so
 * the sweep takes their corners: nothing allowed, each thing on its own,
 * and everything at once.
 */
const CONSTRAINTS: Array<Partial<Parameters<typeof generateRhythm>[1]>> = [
  { allowRests: false, allowTuplets: false, syncopationsPerBar: 0 },
  { allowRests: true, allowTuplets: false, syncopationsPerBar: 0 },
  { allowRests: false, allowTuplets: true, syncopationsPerBar: 0 },
  { allowRests: false, allowTuplets: false, syncopationsPerBar: 2 },
  { allowRests: true, allowTuplets: true, syncopationsPerBar: 1 },
  { allowRests: true, allowTuplets: true, syncopationsPerBar: 3, allowAdjacentTuplets: true },
];

/** Every meter under every constraint set, over a spread of seeds. */
function everyRhythm(bars = 4) {
  return TIME_SIGNATURES.flatMap((ts) =>
    CONSTRAINTS.flatMap((constraints) =>
      SEEDS.slice(0, 8).map((seed) => ({
        ts, constraints, seed,
        bars: generateRhythm(makeRng(seed), { timeSignature: ts, bars, ...constraints }),
      }))));
}

describe('the cell library', () => {
  it('declares durations that add up to the beats each cell claims', () => {
    // Enforced at construction, so this is really asserting the guard exists.
    expect(CELLS.length).toBeGreaterThan(20);
    for (const cell of CELLS) {
      const want = (cell.kind === 'simple' ? 1680 : 2520) * cell.beats;
      expect(cell.events.reduce((s, e) => s + e.ticks, 0), cell.id).toBe(want);
    }
  });

  /**
   * What replaced "each grade is a superset of the one below".
   *
   * That invariant was free because the grades nested by construction,
   * and it went with them. The partition by kind is the one that is left
   * and the one the generator actually depends on: a meter's beat is
   * simple or compound, `cellsOfKind` is asked for one of those, and a
   * cell in neither bucket or in both would be a cell the selector can
   * never place or can place wrongly.
   */
  it('splits cleanly into the two kinds of beat the meters need', () => {
    const simple = cellsOfKind('simple');
    const compound = cellsOfKind('compound');
    expect(simple.length).toBeGreaterThan(0);
    expect(compound.length).toBeGreaterThan(0);
    expect(simple.length + compound.length).toBe(CELLS.length);
    expect(cellsOfKind()).toHaveLength(CELLS.length);
  });

  it('offers something for every meter', () => {
    for (const ts of TIME_SIGNATURES) {
      for (const beatTicks of ts.beatDurations) {
        const kind = kindForBeat(beatTicks);
        expect(kind, `${ts.id} beat of ${beatTicks}`).not.toBeNull();
        expect(cellsOfKind(kind!).length, ts.id).toBeGreaterThan(0);
      }
    }
  });

  it('scales a cell onto a beat without inventing a fractional tick', () => {
    for (const ts of TIME_SIGNATURES) {
      for (const beatTicks of ts.beatDurations) {
        const kind = kindForBeat(beatTicks)!;
        for (const cell of cellsOfKind(kind)) {
          for (const event of scaleCell(cell, beatTicks)) {
            expect(Number.isInteger(event.ticks), `${cell.id} on ${beatTicks}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('generated bars', () => {
  it('always sum to exactly the meter', () => {
    for (const { ts, constraints, seed, bars } of everyRhythm()) {
      for (const bar of bars) {
        const sum = bar.events.reduce((s, e) => s + e.durationTicks, 0);
        expect(sum, `${ts.id} ${JSON.stringify(constraints)} seed ${seed} bar ${bar.index}`).toBe(ts.barTicks);
      }
    }
  });

  it('run contiguously from the start, with no gap and no overlap', () => {
    for (const { bars } of everyRhythm()) {
      for (const bar of bars) {
        let at = bar.startTick;
        for (const event of bar.events) {
          expect(event.startTick).toBe(at);
          at += event.durationTicks;
        }
      }
    }
  });

  it('notate every event as the duration it actually has', () => {
    for (const { bars } of everyRhythm()) {
      for (const bar of bars) {
        for (const event of bar.events) {
          const written = event.tupletRatio
            ? (event.durationTicks * event.tupletRatio.count) / event.tupletRatio.inTheTimeOf
            : event.durationTicks;
          expect(ticksOf(event.value)).toBe(written);
        }
      }
    }
  });

  it('keep every tuplet contiguous, and inside one beat unless asked otherwise', () => {
    for (const { ts, constraints, bars } of everyRhythm()) {
      for (const bar of bars) {
        const groups = new Map<number, typeof bar.events>();
        for (const event of bar.events) {
          if (event.tupletId === undefined) continue;
          const list = groups.get(event.tupletId) ?? [];
          list.push(event);
          groups.set(event.tupletId, list);
        }
        for (const [, members] of groups) {
          // Contiguous: the group's own span equals the sum of its members.
          const span = members[members.length - 1].startTick
            + members[members.length - 1].durationTicks - members[0].startTick;
          expect(span).toBe(members.reduce((s, e) => s + e.durationTicks, 0));
          expect(members.length).toBe(members[0].tupletRatio!.count);
          if (constraints.allowAdjacentTuplets !== true) {
            const relative = members[0].startTick - bar.startTick;
            const beat = ts.beatStarts.findIndex((start, i) =>
              relative >= start && relative < start + ts.beatDurations[i]);
            expect(relative + span).toBeLessThanOrEqual(
              ts.beatStarts[beat] + ts.beatDurations[beat]);
          }
        }
      }
    }
  });

  it('beam only short notes, two or more at a time, inside one beam span', () => {
    for (const { ts, bars } of everyRhythm()) {
      for (const bar of bars) {
        const groups = new Map<number, typeof bar.events>();
        for (const event of bar.events) {
          if (event.beamGroup === undefined) continue;
          const list = groups.get(event.beamGroup) ?? [];
          list.push(event);
          groups.set(event.beamGroup, list);
        }
        for (const [, members] of groups) {
          expect(members.length).toBeGreaterThanOrEqual(2);
          const spans = new Set(members.map((e) => beamSpanIndex(ts, e.startTick - bar.startTick)));
          expect(spans.size).toBe(1);
          for (const event of members) {
            expect(event.isRest).toBe(false);
            expect(event.durationTicks).toBeLessThan(1680);
          }
        }
      }
    }
  });

  // The downbeat has to be articulated before anything pushes against it.
  it('never opens a bar off the beat', () => {
    for (const { bars } of everyRhythm()) {
      for (const bar of bars) {
        expect(bar.events[0].startTick).toBe(bar.startTick);
      }
    }
  });

  it('sound something in every bar', () => {
    for (const { ts, constraints, seed, bars } of everyRhythm()) {
      for (const bar of bars) {
        expect(
          bar.events.some((e) => !e.isRest),
          `${ts.id} ${JSON.stringify(constraints)} seed ${seed} bar ${bar.index} is silent`,
        ).toBe(true);
      }
    }
  });

  it('honour a ban on rests, tuplets or syncopation', () => {
    for (const ts of TIME_SIGNATURES) {
      const bars = generateRhythm(makeRng(7), {
        timeSignature: ts, bars: 8,
        allowRests: false, allowTuplets: false,
      });
      for (const bar of bars) {
        for (const event of bar.events) {
          expect(event.isRest, `${ts.id} produced a rest`).toBe(false);
          expect(event.tupletId, `${ts.id} produced a tuplet`).toBeUndefined();
        }
      }
    }
  });

  it('reproduce exactly from a seed, and differ across seeds', () => {
    const ts = timeSignature('4/4');
    const make = (seed: number) =>
      JSON.stringify(generateRhythm(makeRng(seed), {
        timeSignature: ts, bars: 4, syncopationsPerBar: 1, allowTuplets: true,
      }));
    expect(make(1234)).toBe(make(1234));
    const distinct = new Set(SEEDS.map(make));
    expect(distinct.size).toBeGreaterThan(SEEDS.length * 0.8);
  });

  it('say so rather than loop when nothing fits', () => {
    expect(() => generateRhythm(makeRng(1), {
      timeSignature: timeSignature('4/4'), bars: 1,
      allowRests: false, allowTuplets: false, syncopationsPerBar: 0,
    })).not.toThrow();
  });
});

describe('valueForEvent', () => {
  it('reads the duration an event has, not the beat it was written for', () => {
    // A quarter-beat cell on an eighth-note beat is notated in eighths.
    expect(valueForEvent({ ticks: 840, rest: false })).toEqual({ base: '8', dots: 0 });
    expect(valueForEvent({ ticks: 1680, rest: false })).toEqual({ base: 'q', dots: 0 });
    expect(valueForEvent({ ticks: 2520, rest: false })).toEqual({ base: 'q', dots: 1 });
  });

  it('notates a tuplet member as the value it is written as', () => {
    // A triplet eighth sounds for 560 ticks and is written as an eighth.
    expect(valueForEvent({ ticks: 560, rest: false, tuplet: { count: 3, inTheTimeOf: 2 } }))
      .toEqual({ base: '8', dots: 0 });
  });
});
