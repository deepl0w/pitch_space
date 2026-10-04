import { describe, expect, it } from 'vitest';
import { ALL_KEYS, type Key, findKey, keyName } from '../theory/key';
import { diatonicOf, pitchClass, pitchName } from '../theory/pitch';
import { identifyChord, spellChord } from '../theory/chord';
import { timeSignature } from '../theory/meter';
import { makeRng, pick, rngInt, type Rng } from '../theory/rng';
import {
  type CadenceType, type RomanNumeral, numeralText, realizeNumeral,
} from '../theory/roman';
import { type StyleTag, isBorrowedIn } from './templates';
import {
  type Harmony, type HarmonyEvent, type HarmonyOptions, type PhraseForm,
  bassNote, generateHarmony, isSixFour, planPhrases, sixFourKind,
} from './harmony';

/**
 * Harmony generation, asserted as constraints over a wide sweep of seeds.
 *
 * Nothing here pins an output. The generator's weights are a tuning problem
 * with no ground truth, so every assertion below is something that would be
 * wrong in any tuning: a phrase that does not cadence, a chord whose root is
 * on the wrong staff step, a six-four nobody can explain.
 */

const METERS = ['4/4', '3/4', '2/4', '2/2', '6/8', '9/8', '7/8', '5/4'].map(timeSignature);
const BARS = [2, 3, 4, 5, 6, 8, 12, 16];
/**
 * Style selections, not styles: the corpus query takes a set now, and an
 * empty one means the whole corpus. Singletons dominate because the
 * narrow case is the one that can starve the query, and a pair is here to
 * cover a union actually widening it.
 */
const STYLES: Array<readonly StyleTag[]> = [
  [], [], ['pop'], ['rock'], ['folk'], ['jazz'], ['blues'], ['classical'], ['baroque'],
  ['flamenco'], ['jazz', 'blues'], ['classical', 'baroque'],
];

/**
 * The chord vocabulary, drawn independently.
 *
 * Independently is the point. These were five thresholds on one `grade`,
 * so a sweep over grades could never produce sevenths without the
 * templates that came with the same number, and "does the seventh switch
 * do what it says" was not a question this suite could put. Four
 * booleans drawn separately ask it.
 */
function capabilities(r: Rng) {
  return {
    sevenths: rngInt(r, 0, 1) === 1,
    diminished: rngInt(r, 0, 1) === 1,
    picardy: rngInt(r, 0, 1) === 1,
    neapolitan: rngInt(r, 0, 1) === 1,
  };
}
const CADENCES: Array<HarmonyOptions['cadences']> = [
  undefined, undefined, { final: 'PAC' }, { final: 'HC' }, { final: 'IAC' },
  { final: 'DC' }, { final: 'PC' }, { antecedent: 'IAC' }, { antecedent: 'PAC', final: 'HC' },
];
const FORMS: Array<PhraseForm | undefined> = [undefined, undefined, 'period', 'sentence', 'single'];

interface Case { options: HarmonyOptions; harmony: Harmony; label: string }

/**
 * The sweep. Options are drawn from the case index through its own `Rng` so
 * the matrix is as reproducible as the generation it feeds, and so adding a
 * dimension does not renumber the ones already there.
 */
function caseAt(index: number): Case {
  const r = makeRng(index);
  const options: HarmonyOptions = {
    key: pick(r, ALL_KEYS),
    timeSignature: pick(r, METERS),
    bars: pick(r, BARS),
    styles: pick(r, STYLES),
    ...capabilities(r),
    cadences: pick(r, CADENCES),
    form: pick(r, FORMS),
    improviseRate: pick(r, [0, 0.35, 0.35, 1]),
    modalMinorV: rngInt(r, 0, 9) === 0,
    allowInversions: rngInt(r, 0, 3) === 0 ? true : undefined,
    allowAppliedDominants: rngInt(r, 0, 3) === 0 ? true : undefined,
    allowBorrowed: rngInt(r, 0, 3) === 0 ? true : undefined,
  };
  const harmony = generateHarmony(makeRng(index), options);
  const label = `seed ${index} ${keyName(options.key)} ${options.timeSignature.id} `
    + `${options.bars}b ${options.styles?.length ? options.styles.join('+') : 'any style'}`
    + `${options.sevenths ? ' +7ths' : ''}${options.diminished ? ' +dim' : ''}`
    + `${options.picardy ? ' +picardy' : ''}${options.neapolitan ? ' +N6' : ''}`;
  return { options, harmony, label };
}

const SWEEP: Case[] = Array.from({ length: 6000 }, (_, i) => caseAt(i));

/** The scale degree a chord's root actually sits on, read off the staff. */
function rootDegree(key: Key, n: RomanNumeral): number {
  const root = realizeNumeral(key, n).root;
  return (((diatonicOf(root) - diatonicOf(key.tonic)) % 7) + 7) % 7 + 1;
}

function phraseEvents(h: Harmony, phrase: number): HarmonyEvent[] {
  return h.events.filter((e) => e.phrase === phrase);
}

describe('the sweep itself', () => {
  // A sweep that generated nothing, or that never reached the interesting
  // branches, would pass every test below without asserting anything.
  it('reaches every key, meter, length, form and cadence it claims to', () => {
    expect(SWEEP.length).toBe(6000);
    expect(new Set(SWEEP.map((c) => keyName(c.options.key))).size).toBe(ALL_KEYS.length);
    expect(new Set(SWEEP.map((c) => c.options.timeSignature.id)).size).toBe(METERS.length);
    expect(new Set(SWEEP.map((c) => c.options.bars)).size).toBe(BARS.length);
    expect(new Set(SWEEP.map((c) => c.harmony.plan.form)).size).toBe(4);
    const cadences = new Set(SWEEP.flatMap((c) => c.harmony.plan.phrases.map((p) => p.cadence)));
    for (const c of ['HC', 'PAC', 'IAC', 'DC', 'PC', null]) expect(cadences).toContain(c);
    const sources = new Set(SWEEP.flatMap((c) => c.harmony.events.map((e) => e.source)));
    expect(sources).toEqual(new Set(['template', 'functional']));
    expect(SWEEP.reduce((n, c) => n + c.harmony.events.length, 0)).toBeGreaterThan(30000);
  });
});

describe('spelling', () => {
  it('puts every chord root on the staff step its numeral requires', () => {
    for (const { options, harmony, label } of SWEEP) {
      const tonicStep = diatonicOf(options.key.tonic);
      for (const e of harmony.events) {
        const n = e.numeral;
        const want = n.appliedTo === undefined
          ? tonicStep + n.degree - 1
          : tonicStep + (n.appliedTo - 1) + (n.degree - 1);
        expect(diatonicOf(e.chord.root) % 7, `${label}: ${numeralText(n)}`)
          .toBe(((want % 7) + 7) % 7);
      }
    }
  });

  it('never needs an accidental past a double, in any key', () => {
    for (const { harmony, label } of SWEEP) {
      for (const e of harmony.events) {
        for (const p of spellChord(e.chord)) {
          expect(Math.abs(p.alter), `${label}: ${numeralText(e.numeral)} ${pitchName(p)}`)
            .toBeLessThanOrEqual(2);
        }
      }
    }
  });

  // The best reading, not merely one of them: a generated chord that sounds
  // more like something else is a chord the numeral has mislabelled.
  it('spells chords identifyChord reads back as the quality asked for', () => {
    for (const { harmony, label } of SWEEP) {
      for (const e of harmony.events) {
        const readings = identifyChord(spellChord(e.chord));
        expect(readings[0]?.type.id, `${label}: ${numeralText(e.numeral)}`).toBe(e.numeral.typeId);
      }
    }
  });

  it('gives a minor-key dominant its raised leading tone unless the modal flag asked otherwise', () => {
    let checked = 0;
    for (const { options, harmony, label } of SWEEP) {
      if (options.key.mode !== 'minor' || options.modalMinorV) continue;
      const leadingTone = (pitchClass(options.key.tonic) + 11) % 12;
      for (const e of harmony.events) {
        if (e.numeral.fn !== 'dominant' || e.numeral.appliedTo !== undefined) continue;
        expect(spellChord(e.chord).map(pitchClass), `${label}: ${numeralText(e.numeral)}`)
          .toContain(leadingTone);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('the phrase plan', () => {
  it('tiles the bars it was given, once, in order', () => {
    for (const { options, harmony, label } of SWEEP) {
      const { phrases } = harmony.plan;
      expect(harmony.plan.bars, label).toBe(options.bars);
      expect(phrases.length, label).toBeGreaterThan(0);
      let bar = 0;
      phrases.forEach((p, i) => {
        expect(p.index, label).toBe(i);
        expect(p.startBar, label).toBe(bar);
        expect(p.bars, label).toBeGreaterThan(0);
        bar += p.bars;
      });
      expect(bar, label).toBe(options.bars);
      expect(new Set(harmony.events.map((e) => e.phrase)))
        .toEqual(new Set(phrases.map((p) => p.index)));
    }
  });

  it('lays every chord end to end over the whole progression', () => {
    for (const { options, harmony, label } of SWEEP) {
      let tick = 0;
      for (const e of harmony.events) {
        expect(e.startTick, label).toBe(tick);
        expect(e.durationTicks, label).toBeGreaterThan(0);
        tick += e.durationTicks;
      }
      expect(tick, label).toBe(options.bars * options.timeSignature.barTicks);
    }
  });

  it('refuses a progression shorter than two bars', () => {
    expect(() => planPhrases(makeRng(1), { bars: 1 })).toThrow(/at least two bars/);
    expect(() => planPhrases(makeRng(1), { bars: 0 })).toThrow();
  });

  it('restates a sentence s basic idea as the same chords', () => {
    const sentences = SWEEP.filter((c) => c.harmony.plan.form === 'sentence');
    expect(sentences.length).toBeGreaterThan(50);
    for (const { harmony, label } of sentences) {
      for (const p of harmony.plan.phrases) {
        if (p.repeatOf === undefined) continue;
        const source = phraseEvents(harmony, p.repeatOf);
        const copy = phraseEvents(harmony, p.index);
        // The chords may differ: the transformation passes see the two
        // stretches as independent music and a real sentence varies its
        // restatement. What is restated is the harmonic rhythm.
        expect(copy.length, label).toBe(source.length);
        expect(copy.map((e) => e.durationTicks), label)
          .toEqual(source.map((e) => e.durationTicks));
      }
    }
  });
});

describe('cadences', () => {
  it('ends every phrase with the cadence its plan asked for', () => {
    const seen = new Set<CadenceType>();
    for (const { harmony, label } of SWEEP) {
      for (const p of harmony.plan.phrases) {
        if (p.cadence === null) continue;
        seen.add(p.cadence);
        const events = phraseEvents(harmony, p.index);
        const last = events[events.length - 1].numeral;
        const penult = events[events.length - 2]?.numeral;
        const where = `${label} phrase ${p.index} (${p.cadence})`;
        expect(events[events.length - 1].cadence, where).toBe(p.cadence);
        switch (p.cadence) {
          case 'HC':
            expect(last.fn, where).toBe('dominant');
            expect(last.appliedTo, where).toBeUndefined();
            break;
          case 'PAC':
            // Perfect means root position on both sides; that is the whole
            // difference between this and the imperfect cadence below.
            expect(last.degree, where).toBe(1);
            expect(last.inversion, where).toBe(0);
            expect(last.appliedTo, where).toBeUndefined();
            expect(penult.degree, where).toBe(5);
            expect(penult.inversion, where).toBe(0);
            expect(penult.fn, where).toBe('dominant');
            break;
          case 'IAC':
            expect(last.degree, where).toBe(1);
            expect(penult.degree, where).toBe(5);
            expect(last.inversion !== 0 || penult.inversion !== 0, where).toBe(true);
            break;
          case 'DC':
            expect(penult.fn, where).toBe('dominant');
            expect(penult.appliedTo, where).toBeUndefined();
            expect(last.degree, where).not.toBe(1);
            break;
          case 'PC':
            expect(last.degree, where).toBe(1);
            expect(penult.degree, where).toBe(4);
            expect(penult.fn, where).toBe('predominant');
            break;
        }
      }
    }
    expect(seen).toEqual(new Set(['HC', 'PAC', 'IAC', 'DC', 'PC']));
  });

  it('raises the dominant of a minor cadence even when the modal v was asked for', () => {
    const modal = SWEEP.filter((c) => c.options.modalMinorV && c.options.key.mode === 'minor');
    expect(modal.length).toBeGreaterThan(50);
    for (const { options, harmony, label } of modal) {
      const leadingTone = (pitchClass(options.key.tonic) + 11) % 12;
      for (const p of harmony.plan.phrases) {
        if (p.cadence === null || p.cadence === 'PC') continue;
        const events = phraseEvents(harmony, p.index);
        const dominant = p.cadence === 'HC'
          ? events[events.length - 1] : events[events.length - 2];
        expect(spellChord(dominant.chord).map(pitchClass), `${label} ${p.cadence}`)
          .toContain(leadingTone);
      }
    }
  });
});

describe('the retrogression', () => {
  /** The generator's own rule, asked of the labels it writes. */
  it('never moves a dominant to a predominant outside blues', () => {
    for (const { harmony, label } of SWEEP) {
      for (let i = 0; i + 1 < harmony.events.length; i++) {
        const a = harmony.events[i], b = harmony.events[i + 1];
        if (a.tags.includes('blues') && b.tags.includes('blues')) continue;
        const retrogression = a.numeral.fn === 'dominant' && a.numeral.appliedTo === undefined
          && b.numeral.fn === 'predominant' && b.numeral.appliedTo === undefined;
        expect(retrogression,
          `${label}: ${numeralText(a.numeral)}→${numeralText(b.numeral)}`).toBe(false);
      }
    }
  });

  /**
   * The same rule asked of the bass instead of the labels. The function field
   * is the generator's own opinion and could be wrong; a root's staff step
   * cannot be, so the two checks fail together only when the music is wrong
   * and separately when a label is lying.
   */
  it('never moves a fifth degree to a fourth outside blues', () => {
    for (const { options, harmony, label } of SWEEP) {
      for (let i = 0; i + 1 < harmony.events.length; i++) {
        const a = harmony.events[i], b = harmony.events[i + 1];
        if (a.tags.includes('blues') && b.tags.includes('blues')) continue;
        // An applied chord is a dominant of somewhere else; its root is not
        // behaving as a degree of this key and is read as one by nothing.
        if (a.numeral.appliedTo !== undefined || b.numeral.appliedTo !== undefined) continue;
        expect(rootDegree(options.key, a.numeral) === 5 && rootDegree(options.key, b.numeral) === 4,
          `${label}: ${numeralText(a.numeral)}→${numeralText(b.numeral)}`).toBe(false);
      }
    }
  });

  it('labels no chord with a function its scale degree cannot carry', () => {
    const allowed: Record<string, number[]> = {
      tonic: [1, 3, 6], predominant: [2, 4, 6], dominant: [5, 7],
    };
    let checked = 0;
    for (const { options, harmony, label } of SWEEP) {
      for (const e of harmony.events) {
        const n = e.numeral;
        if (n.appliedTo !== undefined || n.chromaticAlter !== 0) continue;
        const degrees = allowed[n.fn];
        if (degrees === undefined) continue;
        expect(degrees, `${label}: ${numeralText(n)} labelled ${n.fn}`)
          .toContain(rootDegree(options.key, n));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20000);
  });

  it('keeps the blues its own V-IV', () => {
    const blues = SWEEP.filter((c) => c.harmony.events.some((e) => e.tags.includes('blues')));
    expect(blues.length).toBeGreaterThan(100);
    const kept = blues.some(({ options, harmony }) => harmony.events.some((e, i) => {
      const next = harmony.events[i + 1];
      return next !== undefined && e.tags.includes('blues') && next.tags.includes('blues')
        && rootDegree(options.key, e.numeral) === 5 && rootDegree(options.key, next.numeral) === 4;
    }));
    expect(kept).toBe(true);
  });
});

describe('applied dominants', () => {
  it('resolves every one onto a chord rooted on its target', () => {
    let checked = 0;
    for (const { options, harmony, label } of SWEEP) {
      harmony.events.forEach((e, i) => {
        const n = e.numeral;
        if (n.appliedTo === undefined || n.degree !== 5) return;
        const next = harmony.events[i + 1];
        expect(next, `${label}: ${numeralText(n)} dangles at the end`).toBeDefined();
        const target = pitchClass(realizeNumeral(options.key, {
          degree: n.appliedTo, chromaticAlter: 0, typeId: 'maj', inversion: 0, fn: 'other',
        }).root);
        expect(pitchClass(next.chord.root),
          `${label}: ${numeralText(n)}→${numeralText(next.numeral)}`).toBe(target);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('carries a real leading tone to whatever it tonicises', () => {
    let checked = 0;
    for (const { options, harmony } of SWEEP) {
      for (const e of harmony.events) {
        const n = e.numeral;
        if (n.appliedTo === undefined || n.degree !== 5) continue;
        const target = pitchClass(realizeNumeral(options.key, {
          degree: n.appliedTo, chromaticAlter: 0, typeId: 'maj', inversion: 0, fn: 'other',
        }).root);
        expect(spellChord(e.chord).map(pitchClass), numeralText(n))
          .toContain((target + 11) % 12);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('six-fours', () => {
  /**
   * A triad in second inversion is a dissonance and has only two excuses:
   * the cadential six-four over the bass of the dominant it becomes, and the
   * passing one whose bass walks in and out by step in one direction. Anything
   * else is the commonest artefact a chord generator produces.
   */
  it('writes none that is neither cadential nor passing', () => {
    let found = 0;
    for (const { options, harmony, label } of SWEEP) {
      harmony.events.forEach((e, i) => {
        if (!isSixFour(e.numeral)) return;
        found++;
        const kind = sixFourKind(
          options.key, options.timeSignature, e.startTick,
          harmony.events[i - 1]?.numeral, e.numeral, harmony.events[i + 1]?.numeral,
        );
        expect(kind, `${label}: ${numeralText(e.numeral)} at tick ${e.startTick}`).not.toBeNull();
      });
    }
    // Without this the sweep could stop producing six-fours entirely and the
    // assertion above would go on passing while saying nothing.
    expect(found).toBeGreaterThan(50);
  });

  it('reads a cadential six-four from its bass and its beat, and a passing one from its direction', () => {
    const key = ALL_KEYS[0];
    const ts = timeSignature('4/4');
    const tonic64 = { degree: 1, chromaticAlter: 0, typeId: 'maj', inversion: 2, fn: 'tonic' } as const;
    const dominant = { degree: 5, chromaticAlter: 0, typeId: 'maj', inversion: 0, fn: 'dominant' } as const;
    expect(isSixFour(tonic64)).toBe(true);
    expect(isSixFour(dominant)).toBe(false);
    // The bass of I64 is the root of the V it becomes; that is what makes it
    // cadential rather than a passing chord that happens to be here.
    expect(bassNote(key, tonic64).letter).toBe(bassNote(key, dominant).letter);
    expect(sixFourKind(key, ts, 0, undefined, tonic64, dominant)).toBe('cadential');
    // Off the downbeat it is not a cadential six-four, whatever follows it.
    expect(sixFourKind(key, ts, ts.barTicks / 4, undefined, tonic64, dominant)).toBeNull();
    // Nor is a second inversion that merely happens to precede the dominant:
    // the bass has to be the one the dominant is about to take over.
    const supertonic64 = { ...tonic64, degree: 2, typeId: 'min', fn: 'predominant' } as const;
    expect(bassNote(key, supertonic64).letter).not.toBe(bassNote(key, dominant).letter);
    expect(sixFourKind(key, ts, 0, undefined, supertonic64, dominant)).toBeNull();

    // A passing six-four's bass walks in and out the same way. The same three
    // chords with the outer two swapped give a neighbour, which is not one.
    const mediant = { degree: 3, chromaticAlter: 0, typeId: 'min', inversion: 0, fn: 'tonic' } as const;
    const tonic = { degree: 1, chromaticAlter: 0, typeId: 'maj', inversion: 0, fn: 'tonic' } as const;
    const dominant64 = { ...dominant, inversion: 2 } as const;
    expect(sixFourKind(key, ts, ts.barTicks / 4, mediant, dominant64, tonic)).toBe('passing');
    expect(sixFourKind(key, ts, ts.barTicks / 4, tonic, dominant64, tonic)).toBeNull();
  });
});

describe('determinism', () => {
  it('gives the same progression for the same seed and settings', () => {
    for (let i = 0; i < 200; i++) {
      const { options } = caseAt(i);
      const once = generateHarmony(makeRng(i), options);
      const twice = generateHarmony(makeRng(i), options);
      expect(twice.events.map((e) => numeralText(e.numeral)))
        .toEqual(once.events.map((e) => numeralText(e.numeral)));
      expect(twice.plan).toEqual(once.plan);
    }
  });

  it('gives different progressions for different seeds', () => {
    // A generator that ignored its seed would pass every other test here.
    const options: HarmonyOptions = {
      key: ALL_KEYS[0], timeSignature: timeSignature('4/4'), bars: 8, sevenths: true,
    };
    const texts = new Set<string>();
    for (let seed = 0; seed < 400; seed++) {
      texts.add(generateHarmony(makeRng(seed), options).events
        .map((e) => numeralText(e.numeral)).join(' '));
    }
    expect(texts.size).toBeGreaterThan(200);
  });
});

/**
 * ADR 0017: the two flags *exclude*, rather than merely decline to add.
 *
 * The sweep above draws `allowAppliedDominants` and `allowBorrowed` as `true`
 * or `undefined` and never as `false`, so every assertion in this file so far
 * has been made about a generator with both switches on or defaulted. The off
 * position is the one the record is about — it is what makes a difficulty that
 * promises no applied dominants deliver none, and what stops the attempt log
 * recording a `V/IV` the user was never told to expect.
 *
 * Four paths can put one of these chords in a progression: a quoted template
 * whose own data carries it, the transformation pass that adds it, the state
 * machine that fills a phrase when nothing is quoted, and the cadence writes
 * that overwrite whatever was there. Asserting over the finished events covers
 * all four, including the one 0017's correction was written about — a borrowed
 * chord spelled by quality rather than by alteration, which the first filter
 * let through.
 */
/**
 * The vocabulary settings the flag sweep varies underneath the two flags
 * it is actually about.
 *
 * It varied `grade` here, for the same reason: something has to move
 * other than the flags, or the sweep only ever reaches one corner of the
 * generator and the flags are tested against a single backdrop.
 */
const VOCABULARIES = [
  { sevenths: false, diminished: false, picardy: false, neapolitan: false },
  { sevenths: true, diminished: false, picardy: false, neapolitan: false },
  { sevenths: false, diminished: true, picardy: false, neapolitan: false },
  { sevenths: true, diminished: true, picardy: true, neapolitan: false },
  { sevenths: true, diminished: true, picardy: true, neapolitan: true },
];

/**
 * One case twice over: the same draw, generated once with both flags off and
 * once with both on. Sharing the draw is what makes the pair comparable — a
 * difference between them is the flags and cannot be the options.
 */
function flagCase(index: number, allow: boolean): Case {
  const r = makeRng(index);
  const options: HarmonyOptions = {
    key: pick(r, ALL_KEYS),
    timeSignature: pick(r, METERS),
    bars: pick(r, BARS),
    ...pick(r, VOCABULARIES),
    styles: pick(r, STYLES),
    cadences: pick(r, CADENCES),
    form: pick(r, FORMS),
    // Both ends: 0 always quotes a template, 1 always improvises, so the
    // corpus filter and the state machine are each reached on their own.
    improviseRate: pick(r, [0, 0, 0.35, 1, 1]),
    allowAppliedDominants: allow,
    allowBorrowed: allow,
  };
  const harmony = generateHarmony(makeRng(index), options);
  return {
    options,
    harmony,
    label: `seed ${index} 7ths=${options.sevenths} dim=${options.diminished} allow=${allow}`,
  };
}

const WITHOUT = Array.from({ length: 2000 }, (_, i) => flagCase(i, false));
const WITH = Array.from({ length: 2000 }, (_, i) => flagCase(i, true));

const isApplied = (e: HarmonyEvent) => e.numeral.appliedTo !== undefined;
/**
 * The shipped predicate, not a second opinion about what borrowing is.
 *
 * What is under test is whether the generator honours the flag, not whether
 * `isBorrowedIn` draws the line in the right place — `templates.test.ts` owns
 * that. A reimplementation here could only agree with the generator or
 * disagree with the corpus.
 */
const isBorrowed = (c: Case) => (e: HarmonyEvent) => isBorrowedIn(
  // Carried across field by field rather than cast. `bars` belongs to a
  // template step and not to a generated chord; the predicate does not read
  // it, and everything it does read arrives unchanged.
  {
    bars: 1,
    degree: e.numeral.degree,
    typeId: e.numeral.typeId,
    chromaticAlter: e.numeral.chromaticAlter,
    appliedTo: e.numeral.appliedTo,
  },
  c.options.key.mode,
);

describe('a flag that is switched off', () => {
  it('is reached by a sweep that turns both off over the whole grade range', () => {
    // Without this the two assertions below would pass on an empty sweep, and
    // the one above them would pass on a sweep that generated nothing to
    // exclude.
    expect(WITHOUT).toHaveLength(2000);
    expect(new Set(WITHOUT.map(
      (c) => `${c.options.sevenths}${c.options.diminished}${c.options.neapolitan}`,
    )).size).toBe(new Set(VOCABULARIES.map(
      (v) => `${v.sevenths}${v.diminished}${v.neapolitan}`,
    )).size);
    expect(new Set(WITHOUT.flatMap((c) => c.harmony.events.map((e) => e.source))))
      .toEqual(new Set(['template', 'functional']));
    expect(WITHOUT.reduce((n, c) => n + c.harmony.events.length, 0)).toBeGreaterThan(10000);
  });

  it('has something to exclude, on the same draws, when it is switched on', () => {
    // The guard that stops the two tests below being vacuous. If the
    // generator stopped producing applied or borrowed chords altogether,
    // "none appear when the flag is off" would stay green and mean nothing.
    expect(WITH.filter((c) => c.harmony.events.some(isApplied)).length).toBeGreaterThan(0);
    expect(WITH.filter((c) => c.harmony.events.some(isBorrowed(c))).length).toBeGreaterThan(0);
  });

  it('writes no applied dominant anywhere, from the corpus or from a pass', () => {
    for (const c of WITHOUT) {
      const found = c.harmony.events.filter(isApplied);
      expect(found.map((e) => numeralText(e.numeral)), c.label).toEqual([]);
    }
  });

  /**
   * The one thing the flag does not govern, asserted as the only one.
   *
   * `planCadence` writes a major tonic to close a minor-key authentic cadence
   * — "the only borrowing that belongs to the cadence itself", in its own
   * words — and does not consult `allowBorrowed`. That is deliberate and said
   * twice: the progression exercise lists `I` in its minor palette for the
   * same reason, that raising the third of a final tonic is how a minor key
   * closes rather than a loan from elsewhere.
   *
   * Written as "every borrowed chord that appears is this one" rather than as
   * an exclusion, so the carve-out cannot quietly widen. Anything else the
   * flag fails to exclude still fails here.
   */
  const isPicardy = (c: Case, e: HarmonyEvent) =>
    c.options.key.mode === 'minor'
    && e.numeral.degree === 1 && e.numeral.typeId === 'maj'
    && e.numeral.chromaticAlter === 0
    && (e.cadence === 'PAC' || e.cadence === 'IAC');

  it('writes no borrowed chord but the Picardy third the cadence owns', () => {
    // 0017's correction: `rhythm-a` borrows by quality (`{ degree: 4,
    // typeId: 'min' }`) with the degree unaltered, where `blues-jazz` borrows
    // by alteration. A filter that only knew about the second shipped once.
    for (const c of WITHOUT) {
      const leaked = c.harmony.events.filter((e) => isBorrowed(c)(e) && !isPicardy(c, e));
      expect(leaked.map((e) => numeralText(e.numeral)), c.label).toEqual([]);
    }
  });

  /**
   * The corpus filter, reached on purpose and one flag at a time.
   *
   * Two things hide this filter from a sweep. The random one above never
   * selects either carrier — `rhythm-a` and `blues-jazz` need an eight- and
   * a twelve-bar *phrase*, which a period or a sentence never produces
   * because it splits its bars in two, so only a single-phrase form reaches
   * them. And **every template carrying a borrowed chord also carries an
   * applied dominant**, so turning both flags off lets the applied filter
   * exclude all three and the borrowed filter never decides anything.
   *
   * Deleting the borrowed filter is invisible to any test that moves the two
   * flags together. These move them apart.
   */
  const CARRIERS = [
    { id: 'rhythm-a', bars: 8, cadence: 'PAC' as const, borrowed: true },
    { id: 'rhythm-b', bars: 8, cadence: 'HC' as const, borrowed: false },
    { id: 'blues-jazz', bars: 12, cadence: 'HC' as const, borrowed: true },
  ];

  function quotedIds(
    carrier: typeof CARRIERS[number],
    flags: { applied: boolean; borrowed: boolean },
  ): Set<string> {
    const ids = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) {
      const harmony = generateHarmony(makeRng(seed), {
        key: findKey('C_major'),
        timeSignature: timeSignature('4/4'),
        bars: carrier.bars,
        sevenths: true,
        diminished: true,
        form: 'single',
        styles: ['jazz'],
        // Always quote: the state machine cannot select a template, so
        // improvising would be testing the wrong half.
        improviseRate: 0,
        cadences: { final: carrier.cadence },
        allowAppliedDominants: flags.applied,
        allowBorrowed: flags.borrowed,
      });
      for (const e of harmony.events) if (e.templateId) ids.add(e.templateId);
    }
    return ids;
  }

  it('is quoting the templates whose data carries these chords, when both are on', () => {
    // The coverage guard for the two tests below. Without it, a change that
    // made these three unreachable for any other reason would read as the
    // filters working.
    for (const carrier of CARRIERS) {
      expect(
        quotedIds(carrier, { applied: true, borrowed: true }),
        `${carrier.id} is unreachable even with both flags on`,
      ).toContain(carrier.id);
    }
  });

  it('drops a template that borrows, with borrowing off and applied chords still on', () => {
    // The borrowed filter on its own. With both flags off the applied filter
    // excludes all three of these and this assertion would hold with the
    // borrowed filter deleted.
    for (const carrier of CARRIERS) {
      const quoted = quotedIds(carrier, { applied: true, borrowed: false });
      if (carrier.borrowed) {
        expect(quoted, `${carrier.id} was quoted with borrowing off`).not.toContain(carrier.id);
      } else {
        // And does not over-exclude: `rhythm-b` carries an applied dominant
        // and no loan, so the borrowed flag has no business touching it.
        expect(quoted, `${carrier.id} was excluded by a flag that does not apply to it`)
          .toContain(carrier.id);
      }
    }
  });

  it('drops a template that carries an applied dominant, with applied chords off', () => {
    for (const carrier of CARRIERS) {
      expect(
        quotedIds(carrier, { applied: false, borrowed: true }),
        `${carrier.id} was quoted with applied dominants off`,
      ).not.toContain(carrier.id);
    }
  });

  it('still closes a minor cadence on the major third, which is not the flag’s business', () => {
    // The exception above is an exception to something that happens. If the
    // Picardy third stopped being written the test above would pass by
    // excusing nothing, and this file would have quietly lost the claim.
    const picardy = WITHOUT.filter((c) => c.harmony.events.some((e) => isPicardy(c, e)));
    expect(picardy.length).toBeGreaterThan(0);
  });
});
