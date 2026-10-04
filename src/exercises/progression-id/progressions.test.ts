import { describe, expect, it } from 'vitest';
import {
  BAR_CHOICES, PROGRESSION_DEFAULTS, STYLE_CHOICES, generateProgression, gradeProgression, paletteFor, progressionScoreSpec, progressionVoices, type ProgressionSettings,
} from './progressions';
import { ALL_KEYS, keyId } from '../../theory/key';

/**
 * What this exercise owes beyond the registry contract.
 *
 * The contract tests in `registry.test.ts` ask the generic questions — it
 * generates from a seed, it coerces rubbish, it grades. The claims here are
 * the ones particular to naming a progression, and the first of them is the
 * one the design rests on.
 */

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);

/**
 * The seed budget for the sweep that crosses every control.
 *
 * 300 seeds against one configuration became 300 against 480 of them when
 * `bars` and `varyCadence` joined the sweep, which is 144,000 progressions
 * and a timeout. The trade is deliberate and goes the right way: the
 * defect this sweep exists to catch is a *configuration* the palette does
 * not cover, not a rare seed within one — `V/VII` turned up on the third
 * seed of the configuration that reaches it. Breadth over depth, and the
 * 300-seed depth is kept where it still costs nothing, below.
 */
const SWEEP_SEEDS = SEEDS.slice(0, 25);

/** Both palette-widening switches off, which is the default shape. */
const OFF = { appliedDominants: false, borrowed: false, diminished: false } as const;

/**
 * Everything the chord-vocabulary switches can turn on at once.
 *
 * There was a `TOP_GRADE` here, read off `GRADE_CHOICES` so the two tests
 * that use it would probe the end of the range rather than its middle.
 * The range is gone — the switches are independent now, so "the furthest
 * the panel reaches" is all of them on rather than the largest of a
 * list, and there is no longer an end to miss.
 */
const EVERYTHING_ON = {
  sevenths: true, diminished: true, picardy: true, neapolitan: true,
} as const;

/** Nothing on, and everything on: the two corners the sweeps cross. */
const VOCABULARIES: Array<Partial<ProgressionSettings>> = [
  { sevenths: false, diminished: false, picardy: false, neapolitan: false },
  { ...EVERYTHING_ON },
];

function settings(over: Partial<ProgressionSettings> = {}): ProgressionSettings {
  return { ...PROGRESSION_DEFAULTS, ...over };
}

describe('the palette contains every answer', () => {
  /**
   * The claim the whole design rests on.
   *
   * The user picks from a fixed row of numerals, so a generator that
   * produced one outside the row would ask a question with no right answer
   * on screen — and the only way to notice would be a user failing a
   * progression they had heard correctly. Inversions and borrowed chords
   * are off at generation for exactly this reason; this is the assertion
   * that the switches do what their names say.
   *
   * **Over every setting, not every seed.** This swept seeds, grades and
   * modes and held `bars` and `varyCadence` at their defaults — and it had
   * to be the whole settings object, because the claim is about what a
   * *user* can reach and those two are things a user sets. The hole was
   * not hypothetical: with applied dominants on, in minor, at sixteen
   * bars, the generator produced `V/VII` and the palette had no button for
   * it. Found by sweeping the real product of the controls; invisible to
   * every sweep that fixed one of them.
   *
   * `bars` became a setting when it stopped being inferred from a
   * difficulty preset, and the sweep did not follow it; `styles` and the
   * four vocabulary switches arrived the same way when the grade dial
   * went. **A new control is a new dimension of this sweep**, and that is
   * the thing to remember rather than the particular numeral.
   *
   * Styles are crossed one at a time rather than in combination. The
   * palette does not depend on them — it is per mode and per switch —
   * so what a style can do is make the *generator* reach a numeral the
   * palette lacks, and a single style is the narrowest case where that
   * could happen. All of them at once is the unnarrowed sweep already
   * here as `[]`.
   */
  it('over every seed, mode and setting a user can reach', () => {
    for (const mode of ['major', 'minor'] as const) {
      for (const vocabulary of VOCABULARIES) {
        for (const applied of [false, true]) for (const varyCadence of [false, true]) {
          for (const borrowed of [false, true]) for (const bars of BAR_CHOICES) {
            for (const styles of [[], ...STYLE_CHOICES.map((t) => [t])]) {
            const s = settings({
              modes: [mode], ...vocabulary, bars, styles, varyCadence,
              borrowed, appliedDominants: applied,
            });
            const palette = new Set(paletteFor(mode, { appliedDominants: applied, borrowed, diminished: vocabulary.diminished === true }));
            for (const seed of SWEEP_SEEDS) {
              const exercise = generateProgression({ seed, settings: s });
              for (const numeral of exercise.numerals) {
                expect(
                  palette.has(numeral),
                  `${mode} ${bars}b ${styles.join('+') || 'any style'} `
                  + `applied=${applied} vary=${varyCadence} borrowed=${borrowed}: `
                  + `${numeral} is not offered`,
                ).toBe(true);
              }
            }
            }
          }
        }
      }
    }
    /*
      Three seconds here and five is the per-test default, which is not a
      margin — a runner half the speed of this laptop fails a sweep that
      found nothing wrong. That is what happened: one unreproducible red
      run locally, then the same test timing out on CI, and the cause was
      the clock rather than anything it asserts. A sweep's cost is the
      point of it, so the timeout is raised to say so rather than the
      seed count cut to fit a default that was never chosen for this.
      `toVexflow.test.ts` carries the same note for the same reason.
    */
  }, 30_000);

  /**
   * The other half, and the one that would be easy to lose by "fixing" the
   * test above the convenient way.
   *
   * A palette built from the numerals this exercise happens to contain
   * would satisfy the containment check perfectly and announce the answer:
   * seven buttons for a progression of seven chords, and every one of them
   * used exactly once. It has to come from the mode alone.
   */
  it('without depending on what this seed produced', () => {
    const s = settings({ ...EVERYTHING_ON });
    const palettes = SEEDS.slice(0, 50)
      .map((seed) => generateProgression({ seed, settings: s }).palette.join(','));
    expect(new Set(palettes).size).toBe(1);
  });

  it('opens with the mode\'s own triads, in degree order', () => {
    expect(paletteFor('major', OFF).slice(0, 6))
      .toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi']);
    expect(paletteFor('minor', OFF).slice(0, 4)).toEqual(['i', 'III', 'iv', 'V']);

    // The diminished ones keep their place in degree order when they are
    // switched on, rather than being appended after everything else.
    const on = { ...OFF, diminished: true } as const;
    expect(paletteFor('major', on)).toContain('viio');
    expect(paletteFor('minor', on)).toContain('iio');
  });

  it('adds the applied dominants when they are asked for', () => {
    const off = paletteFor('major', OFF);
    const on = paletteFor('major', { ...OFF, appliedDominants: true });
    expect(on.length).toBeGreaterThan(off.length);
    expect(on).toContain('V/V');
    // V/I is V, and V/vii would tonicise a diminished triad, which is not a
    // key anything modulates to.
    expect(on).not.toContain('V/I');
    expect(on).not.toContain('V/viio');
  });

  /**
   * The discovery that forced the palette to consult the corpus.
   *
   * `allowAppliedDominants: false` stops the transformation pass adding
   * them; it does not stop a template quoting one it was written with. A
   * palette that believed the flag asked questions with no right answer on
   * screen, at grade 7 and above.
   */
  /**
   * What ADR 0017 changed, asserted from this side of it.
   *
   * Both of these used to be on the major palette and had to be: they
   * arrive from templates rather than from the transformation passes, and
   * the flags gated only the passes. Now that the flags exclude, a major
   * progression with applied dominants off contains neither — so the
   * palette is the plain diatonic triads and nothing else.
   *
   * Six of them rather than seven: vii° left for the diminished switch
   * when the grade dial went, and it is the one chord here that is not
   * a plain triad of the key.
   */
  it('offers only the mode\'s own chords when nothing is switched on', () => {
    expect(paletteFor('major', OFF)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi']);
  });

  it('offers nothing that can never be right', () => {
    // The modal minor v is a style flag this exercise never sets, so it is
    // off the palette. An option that cannot be the answer is a control
    // lying about what it offers — the same complaint ADR 0011 makes about
    // a catalogue entry nothing can reach.
    expect(paletteFor('minor', OFF)).not.toContain('v');
  });
});

/**
 * The obligation ADR 0011 puts on a catalogue, applied to the palette.
 *
 * Containment says the palette is big enough. This says it is not bigger
 * than it should be — every button can be the right answer to something.
 * The two together are what make it a catalogue rather than a list, and
 * only one of them is the one a user would ever notice going wrong.
 */
describe('every chord on the palette is reachable', () => {
  it('with every switch turned on', () => {
    for (const mode of ['major', 'minor'] as const) {
      for (const applied of [false, true]) for (const borrowed of [false, true]) {
        // Every length at the top grade, not one of them. Length is the
        // user's own setting, and a progression's reach reads off it: the
        // minor `V/VII` is produced at sixteen bars and not at eight, so
        // pinning eight here claimed it was unreachable while the
        // containment sweep was meeting it. Two tests that are supposed to
        // be each other's converse have to ask over the same ground, or
        // they can both be green and contradict one another.
        const produced = new Set(BAR_CHOICES.flatMap((bars) => [true, false].flatMap((vary) => {
          const s = settings({
            modes: [mode], ...EVERYTHING_ON, bars, borrowed,
            varyCadence: vary, appliedDominants: applied,
          });
          return SWEEP_SEEDS.flatMap((seed) => generateProgression({ seed, settings: s }).numerals);
        })));
        // Every switch on, matching the settings the sweep above used:
        // the palette and the generator have to be asked the same question.
        const palette = paletteFor(mode, {
          appliedDominants: applied, borrowed, diminished: EVERYTHING_ON.diminished,
        });
        for (const numeral of palette) {
          expect(produced.has(numeral), `${mode}: nothing ever produces ${numeral}`).toBe(true);
        }
      }
    }
  });
});

describe('what the exercise hands the rest of the app', () => {
  const s = settings(EVERYTHING_ON);

  it('has a chord, a voicing and an item for every slot', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const e = generateProgression({ seed, settings: s });
      expect(e.numerals.length).toBeGreaterThan(0);
      expect(e.voicings).toHaveLength(e.numerals.length);
      for (const voicing of e.voicings) expect(voicing.length).toBeGreaterThanOrEqual(3);
      // Items may exceed the slots by the cadence; never fall short of them.
      expect(e.items.length).toBeGreaterThanOrEqual(e.numerals.length);
    }
  });

  it('names a key the theory layer knows', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const e = generateProgression({ seed, settings: s });
      expect(ALL_KEYS.some((k) => keyId(k) === e.keyId)).toBe(true);
    }
  });

  it('engraves one chord per slot, and sounds the context before them', () => {
    const e = generateProgression({ seed: 7919, settings: s });
    expect(progressionScoreSpec(e).notes).toHaveLength(e.numerals.length);

    const voices = progressionVoices(e);
    // Counted in voices, not in chords: the context is four chords and
    // twelve notes, and slicing by the chord count took a third of the
    // cadence and called it the whole of it.
    const contextVoices = e.context.flat().length;
    const contextEnds = Math.max(
      ...voices.slice(0, contextVoices).map((v) => v.start + v.duration),
    );
    const bodyStarts = Math.min(...voices.slice(contextVoices).map((v) => v.start));
    // A progression that began before the establishing cadence finished
    // would be heard as one long passage, and the user would count wrong
    // before hearing anything.
    expect(bodyStarts).toBeGreaterThan(contextEnds);
  });
});

describe('grading a progression', () => {
  const e = generateProgression({ seed: 7919, settings: settings(EVERYTHING_ON) });

  it('credits a right answer whole', () => {
    const result = gradeProgression(e, { numerals: [...e.numerals] });
    expect(result.correct).toBe(true);
    expect(result.outcomes.every((o) => o.correct)).toBe(true);
  });

  /**
   * Per chord, which is the point of ADR 0007 and the reason this is not
   * one verdict. A learner who hears six chords and misses the seventh has
   * learned six things, and a single `correct: false` would teach the
   * schedule they know none of them.
   */
  it('credits the chords that were right in an answer that was not', () => {
    const wrong = [...e.numerals];
    wrong[wrong.length - 1] = wrong[wrong.length - 1] === 'I' ? 'vi' : 'I';
    const result = gradeProgression(e, { numerals: wrong });

    expect(result.correct).toBe(false);
    expect(result.outcomes.filter((o) => o.correct)).toHaveLength(e.numerals.length - 1);
    expect(result.outcomes[result.outcomes.length - 1].correct).toBe(false);
  });

  it('counts an unanswered slot as wrong rather than throwing', () => {
    const result = gradeProgression(e, { numerals: [] });
    expect(result.correct).toBe(false);
    expect(result.outcomes.every((o) => !o.correct)).toBe(true);
  });

  it('keys an outcome on the numeral and the mode, not on the key', () => {
    // A V in E flat and a V in A are the same thing to learn. Keying on the
    // chord would split one skill across fifteen keys and the schedule
    // would never see enough of any of them to act.
    const result = gradeProgression(e, { numerals: [...e.numerals] });
    for (const outcome of result.outcomes) {
      expect(outcome.item).toMatch(/^progression:(major|minor):/);
    }
  });
});

/**
 * ADR 0011 recorded that three templates — `leading-tone-close`, `axis-iv`
 * and `plagal` — could not be reached on the default path, and deferred the
 * decision to whenever the progression exercise was built. This is that
 * decision, and it is a setting rather than a deletion.
 *
 * The planner only ever asks for a half cadence or a perfect authentic one,
 * so the templates closing any other way are never candidates. Letting the
 * exercise ask for a cadence reaches them.
 */
describe('varying the close', () => {
  function closes(vary: boolean): Set<string> {
    const s = settings({ ...EVERYTHING_ON, varyCadence: vary });
    return new Set(
      SEEDS.map((seed) => generateProgression({ seed, settings: s }).cadence ?? 'none'),
    );
  }

  it('reaches cadences the default path does not', () => {
    const fixed = closes(false);
    const varied = closes(true);
    for (const cadence of fixed) expect(varied).toContain(cadence);
    expect(varied.size).toBeGreaterThan(fixed.size);
  });

  it('reaches the deceptive and plagal closes specifically', () => {
    // Named rather than counted: "more kinds than before" would stay true
    // if the two that matter were still missing and a third had appeared.
    const varied = closes(true);
    expect(varied).toContain('DC');
    expect(varied).toContain('PC');
  });
});
