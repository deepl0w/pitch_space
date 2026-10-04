import { describe, expect, it } from 'vitest';
import { CELLS } from './generate/cells';
import { chooseCells } from './generate/rhythm';
import { generateHarmony, planPhrases } from './generate/harmony';
import { TEMPLATES } from './generate/templates';
import { ALL_KEYS } from './theory/key';
import type { CadenceType } from './theory/roman';
import { SHAPE_AT } from './exercises/progression-id/progressions';
import { TIME_SIGNATURES, timeSignature } from './theory/meter';
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
  /**
   * Seeds per meter per grade.
   *
   * Measured rather than guessed, which the 400 this started with was not —
   * that was an exploration budget, where being sure costs nothing, carried
   * into a suite where it cost a test that failed about one run in three on
   * timeout under worker contention. A check that red-lights for reasons
   * unconnected to what it checks teaches people to re-run rather than to
   * read, and this one guards a finding nobody will have independent reason
   * to doubt for months.
   *
   * The reached set stops growing at 10 seeds over all grades and 15 over the
   * askable ones; 60 is four times the worse of those. Too small a budget
   * cannot pass quietly — a cell left unreached fails the first case and
   * lengthens the stranded list in the third — so the number is a cost
   * decision and not a correctness one.
   */
  const SEEDS = 60;

  /** Every cell id `chooseCells` will actually hand back at these grades. */
  function reachedAt(grades: readonly number[]): Set<string> {
    const reached = new Set<string>();
    for (const ts of TIME_SIGNATURES) {
      for (const grade of grades) {
        for (let seed = 0; seed < SEEDS; seed += 1) {
          const placements = chooseCells(makeRng(seed), { timeSignature: ts, bars: 1, grade });
          for (const placement of placements ?? []) reached.add(placement.cell.id);
        }
      }
    }
    return reached;
  }

  /**
   * Swept once at module scope, like `harmony.test.ts`'s own sweep.
   *
   * Two cases read these, and a sweep inside each `it` puts the whole cost
   * inside a per-test timeout where it competes with 47 other files for
   * workers. Here it is paid once, during collection.
   */
  const REACHED_ANYWHERE = reachedAt(GRADES);

  it('holds nothing dead — every cell is reachable by some query', () => {
    // The obligation itself, and the thing templates could not claim.
    expect(CELLS.filter((c) => !REACHED_ANYWHERE.has(c.id)).map((c) => c.id)).toEqual([]);
  });

  /**
   * The grades the app can actually ask for.
   *
   * Read out of `SHAPE_AT` rather than copied from the record, so that
   * narrowing a difficulty band moves this test rather than leaving it
   * asserting a mapping that no longer exists.
   */
  const ASKABLE = [...new Set(Object.values(SHAPE_AT).map((s) => s.grade))].sort((a, b) => a - b);
  const REACHED_ASKABLE = reachedAt(ASKABLE);

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
    const stranded = CELLS.filter((c) => !REACHED_ASKABLE.has(c.id)).map((c) => c.id).sort();
    expect(stranded).toEqual(['quintuplet_s', 'septuplet_s']);
    for (const id of stranded) {
      expect(CELLS.find((c) => c.id === id)!.grade, `${id} is stranded for some other reason`)
        .toBeGreaterThan(Math.max(...ASKABLE));
    }
  });
});

/**
 * The same obligation, applied to the catalogue 0011 did measure — and
 * re-measured against the exercise that now exists.
 *
 * 0011 found three of thirty-three templates unreachable on the default path.
 * 0016 widened the query rather than pruning the corpus, adding `varyCadence`
 * on a pedagogical argument it required to stand without reference to the
 * data it rescued. Both predate the progression exercise. The question worth
 * asking now is not "are they reachable" but **what the number is, and
 * whether `varyCadence` is the only query that rescues anything** — because
 * if it is, 0016's argument is load-bearing in a way nobody has checked.
 *
 * Measured through `generateHarmony` under the options
 * `generateProgression` builds, since the exercise's own output carries no
 * template identity to observe. That bridge is the modelled part of this and
 * the place it can go stale: the bars and grades come from `SHAPE_AT` and the
 * cadence list from the exercise, but `allowBorrowed: false`,
 * `allowInversions: false` and 4/4 are copied from the call and would not
 * notice if that call changed.
 */
describe('reaching the template corpus', () => {
  const CADENCES: CadenceType[] = ['PAC', 'IAC', 'HC', 'DC', 'PC'];

  /**
   * Seeds per combination. The reached set settles at 80 in both the widest
   * and the narrowest scenario; 150 is a little under twice that. As with the
   * cells, guessing low fails loudly — a template left unreached lengthens
   * the stranded list that the cases below name exactly.
   */
  const SEEDS = 150;

  function reachedWith(vary: boolean, applied: boolean): Set<string> {
    const out = new Set<string>();
    for (const { bars, grade } of Object.values(SHAPE_AT)) {
      for (const mode of ['major', 'minor'] as const) {
        const key = ALL_KEYS.find((k) => k.mode === mode && k.accidentals === 0)!;
        {
          const allowAppliedDominants = applied;
          for (const cadences of vary ? CADENCES.map((c) => ({ final: c })) : [undefined]) {
            for (let seed = 0; seed < SEEDS; seed += 1) {
              const harmony = generateHarmony(makeRng(seed), {
                key,
                timeSignature: timeSignature('4/4'),
                bars,
                grade,
                allowInversions: false,
                allowBorrowed: false,
                allowAppliedDominants,
                cadences,
              });
              for (const e of harmony.events) if (e.templateId) out.add(e.templateId);
            }
          }
        }
      }
    }
    return out;
  }

  /**
   * The four corners of the two settings that could plausibly matter, and
   * their union — which is what "no query the app makes can reach it" means.
   */
  const PLAIN = reachedWith(false, false);
  const APPLIED_ONLY = reachedWith(false, true);
  const VARY_ONLY = reachedWith(true, false);
  const BOTH = reachedWith(true, true);
  const EVERYTHING = new Set([...PLAIN, ...APPLIED_ONLY, ...VARY_ONLY, ...BOTH]);

  it('is sweeping the settings it claims to', () => {
    // Without this the stranded lists below could be long for the dull
    // reason that the sweep never ran properly.
    expect(TEMPLATES.length).toBeGreaterThan(30);
    expect(EVERYTHING.size).toBeGreaterThan(PLAIN.size);
    for (const id of EVERYTHING) expect(TEMPLATES.map((t) => t.id)).toContain(id);
  });

  it('leaves five templates no setting can reach, each for its own reason', () => {
    /*
      0017 drew the boundary this is measured against: the obligation is
      about entries *no* legitimate query can reach, not about entries *some*
      query excludes. These five are the first kind. No combination of the
      exercise's settings produces them.

      Named rather than counted, like the cells, so a sixth fails here and so
      does any of these five becoming reachable — which is what giving the
      exercise a twelve-bar difficulty, or a borrowed-chord setting, would do.
    */
    const stranded = TEMPLATES.filter((t) => !EVERYTHING.has(t.id)).map((t) => t.id).sort();
    expect(stranded).toEqual([
      // Twelve bars. The exercise asks for four or eight and nothing else,
      // so a twelve-bar phrase is never planned — which stands the whole
      // blues section of the corpus down.
      'blues-12', 'blues-jazz', 'blues-quick-change',
      // The only two-bar template that closes on a half cadence, and it
      // needs grade 5. See the case below: the pairing denies it.
      'phrygian-half',
      // Carries a borrowed chord, and the exercise hardwires
      // `allowBorrowed: false` — not a setting the user can turn on.
      'rhythm-a',
    ]);
  });

  it('is rescued by varyCadence alone, and by applied dominants only with it', () => {
    /*
      0016's question, answered, and the answer is a conjunction rather than
      the single lever I first wrote down — this case failed on its own first
      draft, which claimed applied dominants rescued nothing at all.

      Applied dominants on its own rescues nothing: with `varyCadence` off,
      turning it on reaches the same templates. `varyCadence` on its own
      rescues five. The pair together reaches a sixth, `rhythm-b`, which is an
      eight-bar half-cadence template that also carries an applied dominant
      and so needs both gates open at once.

      None of this validates 0016's independence test, which is about whether
      the feature earns its place pedagogically. It does say the widening is
      doing real work rather than decorating a corpus — and that a setting can
      be a reachability lever only in combination, which is a shape neither
      0016 nor 0017 considered.
    */
    // Applied dominants on its own changes nothing at all.
    expect([...APPLIED_ONLY].sort(), 'applied dominants alone rescued something')
      .toEqual([...PLAIN].sort());

    // varyCadence on its own rescues five.
    expect([...VARY_ONLY].filter((id) => !PLAIN.has(id)).sort())
      .toEqual(['axis-iv', 'folia', 'leading-tone-close', 'pachelbel', 'plagal']);

    // And the sixth needs both gates open at once.
    expect([...BOTH].filter((id) => !VARY_ONLY.has(id)).sort()).toEqual(['rhythm-b']);
  });

  it('rescues twice what 0016 counted, and the extra three close on a half cadence', () => {
    /*
      0016 named three — `leading-tone-close`, `axis-iv`, `plagal` — the ones
      whose declared cadence is IAC, DC and PC. It missed the half-cadence
      ones, and the reason is structural rather than careless: an eight-bar
      template is only ever quoted into an eight-bar *phrase*, which only the
      single-phrase form produces, and that phrase carries the progression's
      final cadence. So an eight-bar template closing on HC needs the final
      cadence to be HC, which is exactly what `varyCadence` made askable.

      This is the second undercount in this lineage with the same shape as
      0017's borrowed column: a figure taken from the obvious mechanism and
      not from the selector.
    */
    const extra = ['folia', 'pachelbel', 'rhythm-b'];
    for (const id of extra) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      expect(t.endsWith, `${id} was expected to close on a half cadence`).toBe('HC');
      expect(t.bars, `${id} was expected to be an eight-bar carrier`).toBe(8);
      expect(PLAIN.has(id), `${id} should be out of reach without varyCadence`).toBe(false);
      expect(EVERYTHING.has(id), `${id} should be in reach with it`).toBe(true);
    }
  });

  it('strands phrygian-half on a pairing nobody declared', () => {
    /*
      The cells turned on `SHAPE_AT` stopping at grade 9. This turns on the
      same table pairing bar counts with grades: four bars come only with
      grades 2 and 4, eight bars only with 5, 7 and 9.

      `phrygian-half` is two bars, minor, closes on a half cadence, and needs
      grade 5. A two-bar phrase that wants a half cadence is the antecedent
      of a four-bar period — and four bars never arrive above grade 4. The
      two-bar phrases inside an eight-bar sentence are the presentation,
      which asks for no cadence at all, so a template declaring one is
      filtered out there.

      Neither half of that is written down anywhere, and either moving alone
      would release it.
    */
    const t = TEMPLATES.find((x) => x.id === 'phrygian-half')!;
    expect(t.bars).toBe(2);
    expect(t.endsWith).toBe('HC');

    const gradesAtFourBars = Object.values(SHAPE_AT)
      .filter((s) => s.bars === 4).map((s) => s.grade);
    expect(gradesAtFourBars.length).toBeGreaterThan(0);
    expect(Math.max(...gradesAtFourBars)).toBeLessThan(t.minGrade);
  });

  it('never plans a phrase as long as the twelve-bar templates need', () => {
    // The blues section's reason, asserted against the planner rather than
    // inferred from the three ids above.
    const lengths = new Set<number>();
    for (const { bars } of Object.values(SHAPE_AT)) {
      for (let seed = 0; seed < 200; seed += 1) {
        for (const phrase of planPhrases(makeRng(seed), { bars }).phrases) {
          lengths.add(phrase.bars);
        }
      }
    }
    expect([...lengths].sort((a, b) => a - b)).toEqual([2, 4, 8]);
    for (const id of ['blues-12', 'blues-quick-change', 'blues-jazz']) {
      expect(TEMPLATES.find((t) => t.id === id)!.bars).toBe(12);
    }
  });
});
