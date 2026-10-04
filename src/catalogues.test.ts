import { describe, expect, it } from 'vitest';
import { CELLS } from './generate/cells';
import { chooseCells } from './generate/rhythm';
import { generateHarmony, planPhrases } from './generate/harmony';
import { TEMPLATES, candidateTemplates } from './generate/templates';
import { ALL_KEYS } from './theory/key';
import type { CadenceType } from './theory/roman';
import { BAR_CHOICES, GRADE_CHOICES } from './exercises/progression-id/progressions';
import { EXERCISE_TYPES } from './exercises/registry';
import { TIME_SIGNATURES, timeSignature } from './theory/meter';
import { makeRng } from './theory/rng';

/**
 * What the catalogues owe, measured against the queries the app can make.
 *
 * At the root rather than beside either half, because the claim spans both
 * and belongs to neither: the catalogue lives in `generate/` and the query
 * that reaches it is a setting in `exercises/`. `generate/` may not import
 * upwards — `architecture.test.ts` enforces that and caught this file sitting
 * in the wrong place — so the test that compares the two sits above them, as
 * the architecture test does.
 */

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Enough to see what each exercise's defaults produce; this is a shape check. */
const SEEDS_FOR_ITEMS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);
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
   * There is no app-side query to measure this against, and saying so is
   * the whole of this case.
   *
   * ADR 0021 recorded two cells — the irrational subdivisions, the
   * highest-graded material in the library — as out of reach of anything
   * the app could ask for, and attributed it to a `SHAPE_AT` table that
   * reached grade 9 against a catalogue graded to 10. Removing that table
   * appeared to resolve it, and this file briefly said so.
   *
   * It did not, and the error is the one `docs/process/`'s note on
   * proxies is about. The grades `SHAPE_AT` offered were the *progression*
   * exercise's, and that exercise does not generate rhythm: nothing in
   * `src/` outside `generate/` and these tests calls `chooseCells` or
   * `generateRhythm` at all. Measuring the cell catalogue through a
   * progression setting was never a query against it — it was a number of
   * the right shape standing in for one.
   *
   * So 0021's finding holds, with its reason corrected. The cells are not
   * stranded above a grade band; they are unreached because **the rhythm
   * exercise does not exist yet**, and so is every other cell in the
   * catalogue. That is a roadmap item and not a defect.
   *
   * This case exists to fail the day it stops being true. When an exercise
   * ships that queries the cell catalogue, this goes red and asks for the
   * real measurement — against that exercise's own settings, which is
   * what the template section below does for the exercise that exists.
   */
  it('is not queried by any exercise the app ships', () => {
    const queries = EXERCISE_TYPES.filter((type) => {
      const items = SEEDS_FOR_ITEMS.flatMap(
        (seed) => type.generate({ seed, settings: type.settings.defaults }).items,
      );
      return items.some((item) => item.startsWith('cell:') || item.startsWith('rhythm:'));
    });
    expect(
      queries.map((t) => t.id),
      'an exercise now asks for rhythm — measure the cell catalogue against its settings, '
      + 'the way the template section measures against the progression exercise',
    ).toEqual([]);
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
 * the place it can go stale: the bars and grades come from `BAR_CHOICES` and
 * `GRADE_CHOICES` and the cadence list from the exercise, but
 * `allowBorrowed: false`, `allowInversions: false` and 4/4 are copied from
 * the call and would not notice if that call changed.
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

  function reachedWith(vary: boolean, applied: boolean, borrowed = false): Set<string> {
    const out = new Set<string>();
    for (const bars of BAR_CHOICES) for (const grade of GRADE_CHOICES) {
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
                allowBorrowed: borrowed,
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
  // Borrowing is a setting now, so it is a corner of the sweep and not a
  // ceiling on it. It is the one that reaches the last two templates.
  const BORROWED = reachedWith(true, true, true);
  const EVERYTHING = new Set([...PLAIN, ...APPLIED_ONLY, ...VARY_ONLY, ...BOTH, ...BORROWED]);

  it('is sweeping the settings it claims to', () => {
    // Without this the stranded lists below could be long for the dull
    // reason that the sweep never ran properly.
    expect(TEMPLATES.length).toBeGreaterThan(30);
    expect(EVERYTHING.size).toBeGreaterThan(PLAIN.size);
    for (const id of EVERYTHING) expect(TEMPLATES.map((t) => t.id)).toContain(id);
  });

  it('leaves nothing in the corpus that no setting can reach', () => {
    /*
      0017 drew the boundary this is measured against: the obligation is
      about entries *no* legitimate query can reach, not about entries
      *some* query excludes.

      This list was five, and three of them left when `difficulty` did. The
      previous measurement read: the blues section stood down because the
      exercise asked for four or eight bars and nothing else, and
      `phrygian-half` stranded on a pairing of bar counts with grades that
      nobody had declared. Both of those were `SHAPE_AT`, the preset table
      — not the corpus, and not a judgement anyone made about the corpus. A
      length control and a grade control were enough to release
      `blues-12`, `blues-quick-change` and `phrygian-half` with no change
      to `generate/` at all.

      The last two went the same way, for a cause that was real rather
      than accidental. `rhythm-a` carries the iv that rhythm changes is
      known for and `blues-jazz` the ♯iv°7 in its sixth bar, and the
      exercise hardwired `allowBorrowed: false` — so unlike the other
      three this was a setting the exercise had chosen not to offer, not a
      table nobody meant to write. It is offered now, on the same terms as
      applied dominants: the palette grows for every question while it is
      on, so it is a harder exercise and not a tell.

      Which leaves the obligation itself, with nothing to carve out of it.
      Every template in the corpus is reachable by some combination of the
      exercise's settings. A template that stops being reachable fails
      here and names itself.
    */
    const stranded = TEMPLATES.filter((t) => !EVERYTHING.has(t.id)).map((t) => t.id).sort();
    expect(stranded).toEqual([]);
  });

  it('needs borrowing for the two that borrow, and only those two', () => {
    /*
      The converse of the case above, and the reason it is not vacuous: if
      the sweep's widest corner reached everything on its own, "nothing is
      stranded" would say nothing about the corners.

      Asked of `candidateTemplates` rather than inferred from the ids, so
      the claim is about the selector's own reasoning.
    */
    const needsBorrowing = [...BORROWED].filter((id) => !BOTH.has(id)).sort();
    expect(needsBorrowing).toEqual(['blues-jazz', 'rhythm-a']);

    for (const id of needsBorrowing) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const query = {
        bars: t.bars, mode: 'major' as const, grade: Math.max(...GRADE_CHOICES),
        cadence: t.endsWith, allowApplied: true,
      };
      expect(
        candidateTemplates({ ...query, allowBorrowed: false }).map((c) => c.id),
        `${id} is refused for some reason other than borrowing`,
      ).not.toContain(id);
      expect(
        candidateTemplates({ ...query, allowBorrowed: true }).map((c) => c.id),
        `${id} is still refused once borrowing is allowed, so borrowing is not the cause`,
      ).toContain(id);
    }
  });

  it('is rescued by varyCadence alone, and by applied dominants on its own too', () => {
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
    // Applied dominants on their own now rescue `rhythm-b`, which used to
    // need both gates at once. It is an eight-bar half-cadence template,
    // and the conjunction was never about the two settings: eight bars
    // only came with grades 5, 7 and 9, so whether it could be reached at
    // all depended on which row of the table the user had landed on.
    expect([...APPLIED_ONLY].filter((id) => !PLAIN.has(id)).sort()).toEqual(['rhythm-b']);

    // varyCadence on its own rescues three.
    expect([...VARY_ONLY].filter((id) => !PLAIN.has(id)).sort())
      .toEqual(['axis-iv', 'leading-tone-close', 'plagal']);

    // And nothing now needs both gates open at once, which is the claim
    // 0016's argument was load-bearing for.
    expect([...BOTH].filter((id) => !VARY_ONLY.has(id) && !APPLIED_ONLY.has(id))).toEqual([]);
  });

  it('counts exactly what 0016 counted, now that the grades are not rationed', () => {
    /*
      0016 named three — `leading-tone-close`, `axis-iv`, `plagal` — the
      ones whose declared cadence is IAC, DC and PC. A later measurement
      made it six, and read the extra three as an undercount in 0016:
      `folia`, `pachelbel` and `rhythm-b` are eight-bar templates closing
      on HC, and an eight-bar template is only quoted into an eight-bar
      *phrase*, which carries the progression's final cadence.

      That reading was wrong, and the correction is worth more than the
      number. Those three are reachable in the plain sweep now, with
      `varyCadence` off, and nothing in `generate/` changed. They were
      never rescued by varying the cadence; they were out of reach because
      eight bars only arrived at grades 5, 7 and 9 and the sweep could not
      ask for an eight-bar phrase at any other grade. 0016's three are the
      three, and the apparent undercount was an artefact of measuring
      through a preset table.

      So the discipline the earlier note drew from itself — take the figure
      from the selector, not from the obvious mechanism — was right and did
      not go far enough. The selector was asked honestly; the *query* was a
      table that nobody had read as part of the measurement.
    */
    const rescued = [...VARY_ONLY].filter((id) => !PLAIN.has(id)).sort();
    expect(rescued).toEqual(['axis-iv', 'leading-tone-close', 'plagal']);
    expect(rescued.map((id) => TEMPLATES.find((t) => t.id === id)!.endsWith).sort())
      .toEqual(['DC', 'IAC', 'PC']);

    for (const id of ['folia', 'pachelbel']) {
      expect(PLAIN.has(id), `${id} needs varyCadence after all`).toBe(true);
    }
  });

  it('reaches phrygian-half, which the bar-and-grade pairing used to deny', () => {
    /*
      The sharpest of the three releases, and the one that shows what the
      preset table cost.

      `phrygian-half` is two bars, minor, closes on a half cadence, and
      needs grade 5. A two-bar phrase that wants a half cadence is the
      antecedent of a four-bar period — and under `SHAPE_AT`, four bars
      came only with grades 2 and 4, while grade 5 came only with eight.
      So the template needed a four-bar progression at grade 5 or above,
      and the table paired those two facts out of existence. Neither half
      of that was written down anywhere; it was a consequence of five rows
      of numbers, and nobody chose it.

      Kept as a case, inverted, because the pairing is the kind of thing
      that comes back: if some future control couples length to grade
      again, this is where it shows.
    */
    const t = TEMPLATES.find((x) => x.id === 'phrygian-half')!;
    expect(t.bars).toBe(2);
    expect(t.endsWith).toBe('HC');
    expect(EVERYTHING.has(t.id)).toBe(true);

    // The pairing is gone: every grade is askable at every length.
    expect(Math.max(...GRADE_CHOICES)).toBeGreaterThanOrEqual(t.minGrade);
    expect(BAR_CHOICES).toContain(4);
  });

  it('now plans a phrase as long as the twelve-bar templates need', () => {
    /*
      The blues section's old reason, asserted against the planner rather
      than inferred from the ids — and inverted, because it no longer
      holds.

      The planner was always willing to produce a twelve-bar phrase. What
      never arrived was a twelve-bar *request*: `SHAPE_AT` asked for four
      bars or eight, so the three twelve-bar templates were unreachable
      from the app while being perfectly ordinary entries in the corpus.
      All three are reached now: two by the length control alone, and
      `blues-jazz` once borrowing is also allowed — it was held by its
      ♯iv°7 and not by its length.
    */
    const lengths = new Set<number>();
    for (const bars of BAR_CHOICES) {
      for (let seed = 0; seed < 200; seed += 1) {
        for (const phrase of planPhrases(makeRng(seed), { bars }).phrases) {
          lengths.add(phrase.bars);
        }
      }
    }
    expect([...lengths].sort((a, b) => a - b)).toContain(12);

    for (const id of ['blues-12', 'blues-quick-change', 'blues-jazz']) {
      expect(TEMPLATES.find((t) => t.id === id)!.bars).toBe(12);
      expect(EVERYTHING.has(id), `${id} is still out of reach`).toBe(true);
    }
  });
});
