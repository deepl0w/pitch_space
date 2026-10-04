import { describe, expect, it } from 'vitest';
import { CELLS } from './generate/cells';
import { chooseCells } from './generate/rhythm';
import { generateHarmony, planPhrases } from './generate/harmony';
import { TEMPLATES, candidateTemplates } from './generate/templates';
import { ALL_KEYS } from './theory/key';
import type { CadenceType } from './theory/roman';
import { BAR_CHOICES, STYLE_CHOICES } from './exercises/progression-id/progressions';
import type { StyleTag } from './generate/templates';
import { EXERCISE_TYPES } from './exercises/registry';
import { METER_CHOICES } from './exercises/rhythm-id/rhythms';
import { TIME_SIGNATURES, timeSignature } from './theory/meter';
import { makeRng } from './theory/rng';
import { widestSettings } from './testing/settingsSpace';

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

/**
 * The constraint sets a caller can ask the cell selector for.
 *
 * This was a list of grades. The grades are gone from the catalogue —
 * every cell is now described by what it is rather than by how advanced
 * somebody judged it — so "every query the app can make" is the product
 * of the switches instead of ten points on one line.
 */
const CONSTRAINTS = [
  { allowRests: false, allowTuplets: false, syncopationsPerBar: 0 },
  { allowRests: true, allowTuplets: false, syncopationsPerBar: 0 },
  { allowRests: true, allowTuplets: true, syncopationsPerBar: 0 },
  { allowRests: true, allowTuplets: true, syncopationsPerBar: 3, allowAdjacentTuplets: true },
];

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

  /** Every cell id `chooseCells` will actually hand back under these constraints. */
  function reachedAt(sets: typeof CONSTRAINTS): Set<string> {
    const reached = new Set<string>();
    for (const ts of TIME_SIGNATURES) {
      for (const constraints of sets) {
        for (let seed = 0; seed < SEEDS; seed += 1) {
          const placements = chooseCells(makeRng(seed), {
            timeSignature: ts, bars: 1, ...constraints,
          });
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
  const REACHED_ANYWHERE = reachedAt(CONSTRAINTS);

  it('holds nothing dead — every cell is reachable by some query', () => {
    // The obligation itself, and the thing templates could not claim.
    expect(CELLS.filter((c) => !REACHED_ANYWHERE.has(c.id)).map((c) => c.id)).toEqual([]);
  });

  /**
   * ADR 0011's obligation on this catalogue, measured against the
   * exercise that now asks for it.
   *
   * This case used to assert the opposite — that *no* shipped exercise
   * queried the cell catalogue — and said in its own comment that it
   * existed to fail the day one did and ask for the real measurement.
   * It did, when the rhythm exercise shipped, and this is the
   * measurement it was asking for.
   *
   * Worth keeping the history straight, because it is the second time
   * the answer has moved. ADR 0021 read two unreachable cells as a fact
   * about the catalogue; it was a fact about a difficulty table. ADR
   * 0027 removed the table, and the apparent resolution was itself
   * wrong — the grades being measured through belonged to the
   * *progression* exercise, which does not generate rhythm, so the
   * measurement had no referent at all. Now it has one.
   *
   * Measured through `rhythmItems`, which is the exercise's own
   * statement of what its settings admit, crossed with every metre the
   * panel offers. `registry.test.ts` separately holds that list to what
   * the generator actually produces, in both directions, so this does
   * not have to re-derive it.
   */
  describe('as the rhythm exercise asks for it', () => {
    const rhythm = EXERCISE_TYPES.find((t) => t.id === 'rhythm-id')!;

    /** Every figure any setting of the exercise admits. */
    const ASKABLE = new Set(
      METER_CHOICES.flatMap((meter) => [0, 3].flatMap((syncopation) => [false, true].flatMap(
        (tuplets) => rhythm.items(rhythm.settings.coerce({
          ...(rhythm.settings.defaults as object), meter, syncopation, tuplets, rests: true,
        })) as string[],
      ))).map((id) => id.replace('cell:', '')),
    );

    it('asks for every cell in the library that makes a sound', () => {
      /*
        The obligation itself. A figure of nothing but rests is
        excluded and that is not a carve-out: the user plays nothing
        for it, so grading has nothing to credit and it cannot be an
        item however reachable it is. It is still *in* the bars — a
        beat of rest is ordinary, a bar of them is refused by the
        selector — which is the contained-but-not-tested distinction
        the degree exercise makes about the key it happens to pick.
      */
      const sounding = CELLS.filter((c) => !c.events.every((e) => e.rest));
      const missing = sounding.filter((c) => !ASKABLE.has(c.id)).map((c) => c.id);
      expect(missing).toEqual([]);
    });

    it('excludes exactly the silent figures, and there are some', () => {
      // The guard on the carve-out: if nothing in the library were
      // silent the exclusion above would be doing nothing and the
      // claim would be weaker than it reads.
      const silent = CELLS.filter((c) => c.events.every((e) => e.rest)).map((c) => c.id);
      expect(silent.length).toBeGreaterThan(0);
      for (const id of silent) expect(ASKABLE.has(id), `${id} is silent and askable`).toBe(false);
    });

    it('narrows when the settings do, rather than always offering everything', () => {
      // Otherwise the sweep above would pass over an `items` that
      // ignores its argument, which is the failure mode a denominator
      // has.
      const plain = rhythm.items(rhythm.settings.coerce({
        ...(rhythm.settings.defaults as object), tuplets: false, syncopation: 0, rests: false,
      }));
      const everything = rhythm.items(rhythm.settings.coerce({
        ...(rhythm.settings.defaults as object), tuplets: true, syncopation: 3, rests: true,
      }));
      expect(everything.length).toBeGreaterThan(plain.length);
    });
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
    // Every length crossed with every style selection the panel offers,
    // plus the unnarrowed one. The grades this used to cross are gone:
    // the corpus is now reached by saying which tradition you want, so
    // that is what "every query the app can make" has become.
    const selections: Array<readonly StyleTag[]> = [[], ...STYLE_CHOICES.map((t) => [t])];
    for (const bars of BAR_CHOICES) for (const styles of selections) {
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
                styles,
                sevenths: true,
                diminished: true,
                picardy: true,
                neapolitan: true,
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
        bars: t.bars, mode: 'major' as const, cadence: t.endsWith, allowApplied: true,
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

    // The pairing is gone twice over: the grade that half of it turned
    // on no longer exists, and the length is the user's own control.
    expect(BAR_CHOICES).toContain(4);
    expect(t.tags.some((tag) => STYLE_CHOICES.includes(tag)), 'unreachable by style').toBe(true);
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

/**
 * The askable list, against the settings a user actually practises at.
 *
 * `items(settings)` is a catalogue the schedule reads, so ADR 0011's
 * obligation applies to it: everything listed must be reachable by a query
 * the app makes, or the list promises work that can never be done.
 *
 * `registry.test.ts` asserts that, and unions the reachable set across bar
 * counts while doing it — so what it establishes is *reachable at some bar
 * count*. **A user picks a bar count and it stays picked**, which makes that
 * union a dimension the test crosses and the user does not. It is the same
 * shape as every other defect this week, and it hid a real one: at four bars
 * with the vocabulary opened up, three listed numerals cannot be generated at
 * all.
 *
 * Pinned at the default bar count only. The others were measured and are not
 * asserted here, because a second bar count costs another half-second of
 * generation and a *comment* recording what they said would be a measurement
 * going stale on its own — which is the failure that produced this finding in
 * the first place.
 */
describe('what the schedule is told it can ask', () => {
  const progression = EXERCISE_TYPES.find((t) => t.id === 'progression-id')!;

  /**
   * Seeds, and why this many rather than more.
   *
   * The *size* of the unreachable set is budget-sensitive in a way that makes
   * asserting it exactly a bad trade. Measured at four bars: seven items look
   * unreachable at 1000 seeds, five at 5000, and three from 15000 out to
   * 60000. The four that drop out are rare rather than absent, two of them
   * desperately so — `minor:#viio` appears nine times in sixty thousand
   * four-bar progressions and `major:viio` eleven, about one in six thousand.
   *
   * So a test pinning the exact set would need a budget big enough to see a
   * one-in-six-thousand event reliably, which is either slow or flaky: at
   * 30000 seeds each of those two is still missed about once in a hundred
   * runs, and two such items make that a flake worth having an opinion about.
   *
   * What is *not* budget-sensitive is the three below. They are absent at
   * every budget from 1000 to 60000, because they cannot be generated at all.
   * Asserting those by name is robust at any budget, so this one is chosen
   * for speed rather than for discrimination.
   */
  const SEEDS = 1_000;

  /** Everything the vocabulary switches allow, at the bar count users start on. */
  const settings = progression.settings.coerce({
    ...(widestSettings(progression) as object), bars: 4,
  });

  const produced = (() => {
    const listed = new Set(progression.items(settings));
    const seen = new Set<string>();
    for (let seed = 0; seed < SEEDS; seed += 1) {
      for (const item of progression.generate({ seed, settings }).items) {
        if (listed.has(item)) seen.add(item);
      }
    }
    return { listed, seen };
  })();

  it('is sweeping a list long enough for the question to mean anything', () => {
    expect(produced.listed.size).toBeGreaterThan(20);
    expect(produced.seen.size).toBeGreaterThan(20);
  });

  it('lists three numerals four-bar progressions cannot produce', () => {
    /*
      Named, because a count would be a claim about the budget and these are
      a claim about the generator. Each fails here if it becomes reachable,
      which is what fixing this looks like from one direction.

      The fix is not obvious and is not a tester's to pick. Narrowing `items`
      with the settings is what the palette deliberately refuses — a row of
      buttons that grew with the setting would tell the user how many chords
      are in play before they had named one — so the alternative is that the
      schedule learns askable and reachable are different sets.
    */
    for (const item of [
      'progression:major:#ivo',
      'progression:major:ii/IV',
      'progression:minor:V/VII',
    ]) {
      expect(produced.listed.has(item), `${item} is no longer even listed`).toBe(true);
      expect(produced.seen.has(item), `${item} is now reachable at four bars`).toBe(false);
    }
  });
});
