import { describe, expect, it } from 'vitest';
import { PATTERNS, patternsFor } from './patterns';
import { CELLS, scaleCell } from './cells';
import { kindForBeat } from './rhythm';
import { TIME_SIGNATURES, tiedValues, timeSignature, valueOfTicks } from '../theory/meter';

/**
 * The four things ADR 0011 says a catalogue owes, asked of this one.
 *
 * It had none when the record was written: 26 entries verified by hand and
 * nothing holding them there. Hand-verification is a snapshot of one
 * afternoon; the twenty-seventh entry is the one that breaks.
 */

describe('what the pattern catalogue owes', () => {
  // 1. Well-formedness is checked at construction and throws at import, so
  //    reaching the catalogue at all proves it. This asserts the guard runs
  //    rather than re-deriving what it checks.
  it('is well formed at import, and says so by existing', () => {
    expect(PATTERNS.length).toBeGreaterThan(20);
    for (const p of PATTERNS) {
      const bar = timeSignature(p.meter).barTicks;
      expect(p.durations.reduce((s, d) => s + Math.abs(d), 0), p.id).toBe(bar);
    }
  });

  // 2. Ids reach a user's history, so they are a compatibility commitment
  //    rather than editorial.
  it('gives every entry an id of its own', () => {
    const ids = PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, `${id} is not a stable slug`).toMatch(/^[a-z0-9-]+$/);
  });

  // 3. The musical claims: a pattern names a metre it belongs to, and says
  //    where it comes from. A catalogue of inventions would teach nothing.
  it('names a real metre and a real origin for every entry', () => {
    const known = new Set(TIME_SIGNATURES.map((t) => t.id));
    for (const p of PATTERNS) {
      expect(known.has(p.meter), `${p.id} claims metre ${p.meter}`).toBe(true);
      expect(p.name.length, p.id).toBeGreaterThan(2);
      expect(p.origin.trim(), `${p.id} does not say where it is from`).not.toBe('');
    }
  });

  it('writes every duration as something the engraver can draw', () => {
    for (const p of PATTERNS) {
      for (const d of p.durations) {
        const ticks = Math.abs(d);
        const drawable = valueOfTicks(ticks) !== null || tiedValues(ticks).length > 0;
        expect(drawable, `${p.id}: ${ticks} ticks`).toBe(true);
      }
    }
  });

  /**
   * 4. Reachability — the obligation ADR 0011 exists for, and the one the
   *    corpus of harmony templates fails. Every pattern must be selectable
   *    by a query the app actually makes, which here is the rhythm
   *    reference asking for one metre at a time.
   */
  it('can show every pattern it holds', () => {
    const reachable = new Set(TIME_SIGNATURES.flatMap((ts) => patternsFor(ts.id).map((p) => p.id)));
    const stranded = PATTERNS.filter((p) => !reachable.has(p.id)).map((p) => p.id);
    expect(stranded).toEqual([]);
  });

  it('leaves no metre with nothing to show', () => {
    const empty = TIME_SIGNATURES.filter((ts) => patternsFor(ts.id).length === 0).map((t) => t.id);
    expect(empty).toEqual([]);
  });
});

/**
 * The same obligation asked of the cell library, which ADR 0011 notes is
 * tested only through the generator — so a cell the generator never picks is
 * verified by nothing. The rhythm reference shows cells per metre, and that
 * is the query that has to reach them all.
 */
describe('reaching every rhythmic cell', () => {
  /** The cells the reference can show, which is how the screen selects them. */
  function shown(): Set<string> {
    const out = new Set<string>();
    for (const ts of TIME_SIGNATURES) {
      ts.beatDurations.forEach((beatTicks, beat) => {
        const kind = kindForBeat(beatTicks);
        if (kind === null) return;
        for (const cell of CELLS) {
          if (cell.kind !== kind) continue;
          if (cell.beats === 2 && ts.beatDurations[beat + 1] !== beatTicks) continue;
          if (beat + cell.beats > ts.beatStarts.length) continue;
          try {
            scaleCell(cell, beatTicks);
            out.add(cell.id);
          } catch {
            // Does not scale onto this beat without a fractional tick.
          }
        }
      });
    }
    return out;
  }

  it('shows every cell in the library under some metre', () => {
    const reachable = shown();
    const stranded = CELLS.filter((c) => !reachable.has(c.id)).map((c) => c.id);
    expect(stranded).toEqual([]);
  });

  it('covers enough metres for that to mean something', () => {
    // Guards the sweep above against passing because it looked nowhere.
    expect(TIME_SIGNATURES.length).toBeGreaterThan(8);
    expect(shown().size).toBe(CELLS.length);
  });
});
