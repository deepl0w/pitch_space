import { describe, expect, it } from 'vitest';
import {
  PROGRESSION_DEFAULTS, generateProgression, gradeProgression, paletteFor,
  progressionScoreSpec, progressionVoices,
  type ProgressionSettings,
} from './progressions';
import type { Difficulty } from '../types';
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
   */
  it('over every seed, difficulty and mode', () => {
    for (const mode of ['major', 'minor'] as const) {
      for (const difficulty of [1, 2, 3, 4, 5] as Difficulty[]) {
        for (const applied of [false, true]) {
          const s = settings({ modes: [mode], difficulty, appliedDominants: applied });
          const palette = new Set(paletteFor(mode, applied));
          for (const seed of SEEDS) {
            const exercise = generateProgression({ seed, settings: s });
            for (const numeral of exercise.numerals) {
              expect(palette.has(numeral), `${mode} d${difficulty}: ${numeral} is not offered`)
                .toBe(true);
            }
          }
        }
      }
    }
  });

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
    const s = settings({ difficulty: 5 });
    const palettes = SEEDS.slice(0, 50)
      .map((seed) => generateProgression({ seed, settings: s }).palette.join(','));
    expect(new Set(palettes).size).toBe(1);
  });

  it('opens with the mode\'s own triads, in degree order', () => {
    expect(paletteFor('major', false).slice(0, 7))
      .toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'viio']);
    expect(paletteFor('minor', false).slice(0, 4)).toEqual(['i', 'iio', 'III', 'iv']);
  });

  it('adds the applied dominants when they are asked for', () => {
    const off = paletteFor('major', false);
    const on = paletteFor('major', true);
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
   * screen, at difficulty 4 and above.
   */
  it('carries the chords the corpus quotes even when the settings are off', () => {
    // Both of these arrive from templates rather than from the
    // transformation passes, so neither setting suppresses them: a borrowed
    // iv in a major key, and the one applied dominant the corpus quotes
    // without being asked.
    expect(paletteFor('major', false)).toContain('iv');
    expect(paletteFor('major', false)).toContain('V/IV');
  });

  it('offers nothing that can never be right', () => {
    // The modal minor v is a style flag this exercise never sets, so it is
    // off the palette. An option that cannot be the answer is a control
    // lying about what it offers — the same complaint ADR 0011 makes about
    // a catalogue entry nothing can reach.
    expect(paletteFor('minor', false)).not.toContain('v');
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
  it('at the difficulty that reaches furthest', () => {
    for (const mode of ['major', 'minor'] as const) {
      for (const applied of [false, true]) {
        const s = settings({ modes: [mode], difficulty: 5, appliedDominants: applied });
        const produced = new Set(
          SEEDS.flatMap((seed) => generateProgression({ seed, settings: s }).numerals),
        );
        for (const numeral of paletteFor(mode, applied)) {
          expect(produced.has(numeral), `${mode}: nothing ever produces ${numeral}`).toBe(true);
        }
      }
    }
  });
});

describe('what the exercise hands the rest of the app', () => {
  const s = settings({ difficulty: 3 });

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
    const contextEnds = Math.max(
      ...voices.slice(0, e.context.length).map((v) => v.start + v.duration),
    );
    const bodyStarts = Math.min(...voices.slice(e.context.length).map((v) => v.start));
    // A progression that began before the establishing cadence finished
    // would be heard as one long passage, and the user would count wrong
    // before hearing anything.
    expect(bodyStarts).toBeGreaterThan(contextEnds);
  });
});

describe('grading a progression', () => {
  const e = generateProgression({ seed: 7919, settings: settings({ difficulty: 1 }) });

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
    const s = settings({ difficulty: 4, varyCadence: vary });
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
