import { describe, expect, it } from 'vitest';
import { CELLS } from './generate/cells';
import { chooseCells } from './generate/rhythm';
import { SHAPE_AT } from './exercises/progression-id/progressions';
import { TIME_SIGNATURES } from './theory/meter';
import { makeRng } from './theory/rng';

/**
 * What the catalogues owe, measured against the queries the app can make.
 *
 * At the root rather than beside either half, because the claim spans both
 * and belongs to neither: the catalogue lives in `generate/` and the query
 * that reaches it is a difficulty in `exercises/`. `generate/` may not import
 * upwards — `architecture.test.ts` enforces that and caught this file sitting
 * in the wrong place — so the test that compares the two sits above them, as
 * the architecture test does.
 */

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/**
 * ADR 0011's third obligation, applied to the cell catalogue.
 *
 * 0011 requires every catalogue entry to be selectable by a query the app
 * actually makes, and measured the template corpus. ADR 0021 measured this
 * one and found the pattern repeating with its sting intact: the catalogue
 * is whole, but the only difficulty-to-grade mapping the codebase contains
 * stops one grade below the top of it, and what sits above that line is the
 * irrational subdivisions — the hardest material in the library.
 *
 * That measurement existed as a paragraph. Nothing failed if someone
 * narrowed a grade band and stranded a third cell. This is the paragraph as
 * a test, through `chooseCells` — the real selector — rather than against a
 * model of it, which is the part 0011's obligation is actually about.
 */
describe('reaching the cell catalogue', () => {
  /** Every cell id `chooseCells` will actually hand back at these grades. */
  function reachedAt(grades: readonly number[]): Set<string> {
    const reached = new Set<string>();
    for (const ts of TIME_SIGNATURES) {
      for (const grade of grades) {
        for (let seed = 0; seed < 400; seed += 1) {
          const placements = chooseCells(makeRng(seed), { timeSignature: ts, bars: 1, grade });
          for (const placement of placements ?? []) reached.add(placement.cell.id);
        }
      }
    }
    return reached;
  }

  it('holds nothing dead — every cell is reachable by some query', () => {
    // The obligation itself, and the thing templates could not claim.
    const missing = CELLS.filter((c) => !reachedAt(GRADES).has(c.id));
    expect(missing.map((c) => c.id)).toEqual([]);
  });

  /**
   * The grades the app can actually ask for.
   *
   * Read out of `SHAPE_AT` rather than copied from the record, so that
   * narrowing a difficulty band moves this test rather than leaving it
   * asserting a mapping that no longer exists.
   */
  const ASKABLE = [...new Set(Object.values(SHAPE_AT).map((s) => s.grade))].sort((a, b) => a - b);

  it('is queried over a range that stops one grade short of the catalogue', () => {
    // The cause, named separately from its effect: the catalogue reaches 10
    // and the only mapping onto it reaches 9.
    expect(ASKABLE).toEqual([2, 4, 5, 7, 9]);
    expect(Math.max(...CELLS.map((c) => c.grade)))
      .toBeGreaterThan(Math.max(...ASKABLE));
  });

  it('strands exactly the two cells above that range, and no others', () => {
    /*
      Named rather than counted. "All 37" would fail today and would be
      wrong — the two are genuinely out of reach and the app is not broken,
      because no rhythm exercise exists yet to ask. "Some are stranded"
      would assert nothing at all.

      So: these two, by id, for this reason. A third one appearing fails
      here, which is the thing worth catching — and so does either of these
      two becoming reachable, which is what building the rhythm exercise
      against a mapping that reaches grade 10 would do.
    */
    const reached = reachedAt(ASKABLE);
    const stranded = CELLS.filter((c) => !reached.has(c.id)).map((c) => c.id).sort();
    expect(stranded).toEqual(['quintuplet_s', 'septuplet_s']);
    for (const id of stranded) {
      expect(CELLS.find((c) => c.id === id)!.grade, `${id} is stranded for some other reason`)
        .toBeGreaterThan(Math.max(...ASKABLE));
    }
  });
});
