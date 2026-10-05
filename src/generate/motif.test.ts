import { describe, expect, it } from 'vitest';
import { makeRng } from '../theory/rng';
import { timeSignature } from '../theory/meter';
import { baseOf, formFor, planMotifs } from './motif';
import { CELLS } from './cells';

/**
 * What a motif plan owes.
 *
 * The point of this layer is that bars *repeat*. A generator that returns
 * four independent bars satisfies every rhythmic constraint in the project
 * and is the blandness the module exists to fix, so the claims here are
 * about sameness rather than legality — legality is `rhythm.test.ts`'s and
 * is not re-asserted.
 *
 * Nothing here pins a particular tune. The contour steps and the form
 * table are tuning, not facts, and a test that fixed them would make them
 * unchangeable; what is asserted is that a restatement restates.
 */

const TS = timeSignature('4/4');
const base = { timeSignature: TS, bars: 4 } as const;

const onsetsOf = (bar: { events: readonly { isRest: boolean; tiedFromPrevious: boolean }[] }) =>
  bar.events.filter((e) => !e.isRest && !e.tiedFromPrevious).length;

describe('a motif plan', () => {
  it('restates: a repeated label is the same rhythm, bar for bar', () => {
    // The whole claim. `A` and `A'` differ in shape and not in rhythm, so
    // the cells of every bar sharing a base label have to be identical.
    for (let seed = 0; seed < 40; seed += 1) {
      const plan = planMotifs(makeRng(seed), base);
      const byLabel = new Map<string, string[]>();
      for (const [i, label] of plan.form.entries()) {
        const want = byLabel.get(baseOf(label));
        const got = [...plan.bars[i].cellIds];
        if (want) expect(got, `seed ${seed}, bar ${i} (${label})`).toEqual(want);
        else byLabel.set(baseOf(label), got);
      }
    }
  });

  it('is not four independent bars, which is what it is here to avoid', () => {
    /*
      The guard against the fix being undone. If every bar were generated
      afresh they would sometimes coincide, so this is asserted over many
      seeds as "repetition is the rule" rather than over one as "these two
      match" — four independent draws from a catalogue this size agree
      about a fifth of the time.
    */
    let identical = 0;
    for (let seed = 0; seed < 60; seed += 1) {
      const plan = planMotifs(makeRng(seed), base);
      if (plan.bars[0].cellIds.join() === plan.bars[1].cellIds.join()) identical += 1;
    }
    expect(identical, 'bar 2 should restate bar 1 every time').toBe(60);
  });

  it('departs as well as repeats, or the form is one idea said four times', () => {
    // `B` exists in the four-bar form and must actually differ, otherwise
    // the plan is a loop rather than a phrase. Over seeds, because two
    // independent rhythms can coincide.
    let departed = 0;
    for (let seed = 0; seed < 60; seed += 1) {
      const plan = planMotifs(makeRng(seed), base);
      const a = plan.bars[0].cellIds.join();
      const b = plan.bars[2].cellIds.join();
      if (a !== b) departed += 1;
    }
    expect(departed, 'B never differed from A over sixty seeds').toBeGreaterThan(40);
  });

  it('gives every onset a place in the shape, and only the onsets', () => {
    // The shape is handed to the melody search alongside its slots, so a
    // length disagreement is an off-by-one in every bar after the first.
    for (let seed = 0; seed < 30; seed += 1) {
      const plan = planMotifs(makeRng(seed), { ...base, bars: 8 });
      const onsets = plan.bars.reduce((n, bar) => n + onsetsOf(bar), 0);
      expect(plan.shape, `seed ${seed}`).toHaveLength(onsets);
    }
  });

  it('places its bars end to end, each filling the meter', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const plan = planMotifs(makeRng(seed), base);
      for (const [i, bar] of plan.bars.entries()) {
        expect(bar.index, `seed ${seed}`).toBe(i);
        expect(bar.startTick).toBe(i * TS.barTicks);
        const sum = bar.events.reduce((n, e) => n + e.durationTicks, 0);
        expect(sum, `seed ${seed} bar ${i}`).toBe(TS.barTicks);
      }
    }
  });

  it('builds only from figures the rhythm generator would place', () => {
    // A motif is laid out from cell ids rather than from copied events, so
    // an id the catalogue does not have would be a bar that silently does
    // not fill its meter. `barFromCells` throws instead; this is the
    // positive half.
    const known = new Set(CELLS.map((c) => c.id));
    for (let seed = 0; seed < 20; seed += 1) {
      for (const bar of planMotifs(makeRng(seed), base).bars) {
        for (const id of bar.cellIds) expect(known, `seed ${seed}`).toContain(id);
      }
    }
  });

  it('reproduces exactly from a seed, like everything else in generate/', () => {
    // ADR 0005. The tiling re-lays each bar rather than cloning it, which
    // is where a module-level tuplet counter crept in last time.
    for (const seed of [1, 7919, 104729]) {
      const a = planMotifs(makeRng(seed), { ...base, bars: 8, allowTuplets: true });
      const b = planMotifs(makeRng(seed), { ...base, bars: 8, allowTuplets: true });
      expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    }
  });

  it('answers a bar count it has no form for, rather than refusing', () => {
    // A bar count is a user setting, and an unlisted one should cost the
    // shape and not the exercise.
    expect(formFor(5)).toHaveLength(5);
    expect(() => planMotifs(makeRng(3), { ...base, bars: 5 })).not.toThrow();
  });
});
