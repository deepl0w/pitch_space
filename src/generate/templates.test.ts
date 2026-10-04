import { describe, expect, it } from 'vitest';
import { MAJOR_KEYS, MINOR_KEYS, type Key, type Mode, keyName } from '../theory/key';
import { diatonicOf, pitchClass, pitchName } from '../theory/pitch';
import { identifyChord, spellChord } from '../theory/chord';
import {
  type CadenceType, type RomanNumeral, numeralText, realizeNumeral,
} from '../theory/roman';
import {
  TEMPLATES, type Template, type TemplateStep, candidateTemplates, defaultTypeId, endsOn,
  findTemplate, isBorrowedIn, startsOn, templateNumerals, templateWeight,
} from './templates';

/**
 * The corpus conformance suite.
 *
 * Every template is realised in every key of every mode it claims, and the
 * harmonic rules are asked of the result. A wrong template is wrong in the
 * data rather than in one unlucky seed, so finding it here finds it once.
 */

const keysOf = (mode: Mode) => (mode === 'major' ? MAJOR_KEYS : MINOR_KEYS);

/** The scale degree a chord's root actually sits on, read off the staff. */
function rootDegree(key: Key, n: RomanNumeral): number {
  const root = realizeNumeral(key, n).root;
  return (((diatonicOf(root) - diatonicOf(key.tonic)) % 7) + 7) % 7 + 1;
}

/** Every (template, mode, key) the corpus claims, which is what the sweeps walk. */
function everyRealisation(): Array<{ t: Template; mode: Mode; key: Key }> {
  const out: Array<{ t: Template; mode: Mode; key: Key }> = [];
  for (const t of TEMPLATES) {
    for (const mode of t.modes) for (const key of keysOf(mode)) out.push({ t, mode, key });
  }
  return out;
}

const REALISATIONS = everyRealisation();

describe('the corpus as data', () => {
  it('covers both modes and all thirty keys', () => {
    // Above every sweep below: a sweep over an empty collection passes and
    // says nothing, and this is the only assertion that would notice.
    expect(REALISATIONS.length).toBe(
      TEMPLATES.reduce((sum, t) => sum + t.modes.length * 15, 0),
    );
    expect(REALISATIONS.length).toBeGreaterThan(500);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    for (const t of TEMPLATES) expect(findTemplate(t.id)).toBe(t);
  });

  it('declares the bars its steps actually fill', () => {
    for (const t of TEMPLATES) {
      expect(t.steps.reduce((sum, s) => sum + s.bars, 0), t.id).toBe(t.bars);
      expect(t.steps.length, t.id).toBeGreaterThanOrEqual(2);
      expect(t.minGrade, t.id).toBeGreaterThanOrEqual(1);
      expect(t.tags.length, t.id).toBeGreaterThan(0);
    }
  });

  /**
   * The name is the progression's identity, and the one place a template can
   * claim a chord it does not contain. Only the names written as a numeral
   * list are checkable, and they are read in the template's primary mode —
   * "I–IV" is a major reading of an entry that also serves the minor.
   */
  it('names the chords it actually contains, wherever the name is a numeral list', () => {
    const checked = TEMPLATES.filter((t) => t.name.includes('–'));
    expect(checked.length).toBeGreaterThan(20);
    for (const t of checked) {
      const written = templateNumerals(t, t.modes[0])
        .map((c) => numeralText(c.numeral)).join('–');
      expect(written, t.id).toBe(t.name);
    }
  });
});

describe('every template realised in every key', () => {
  it('puts each chord root on the staff step its numeral requires', () => {
    let checked = 0;
    for (const { t, mode, key } of REALISATIONS) {
      const tonicStep = diatonicOf(key.tonic);
      for (const { numeral: n } of templateNumerals(t, mode)) {
        // An applied chord is built above its target, so the target's own
        // step is part of what the numeral requires.
        const want = n.appliedTo === undefined
          ? tonicStep + n.degree - 1
          : tonicStep + (n.appliedTo - 1) + (n.degree - 1);
        const root = realizeNumeral(key, n).root;
        expect(diatonicOf(root) % 7, `${t.id} ${keyName(key)} ${numeralText(n)}`)
          .toBe(((want % 7) + 7) % 7);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(2000);
  });

  it('never needs an accidental past a double', () => {
    for (const { t, mode, key } of REALISATIONS) {
      for (const { numeral: n } of templateNumerals(t, mode)) {
        for (const p of spellChord(realizeNumeral(key, n))) {
          expect(Math.abs(p.alter), `${t.id} ${keyName(key)} ${numeralText(n)}: ${pitchName(p)}`)
            .toBeLessThanOrEqual(2);
        }
      }
    }
  });

  /**
   * The cross-check ADR 0004 calls load-bearing: `RomanNumeral` and `Chord`
   * both describe a chord, and a change to `CHORD_TYPES` can silently change
   * what a numeral realises to. The best reading has to be the one asked for,
   * not merely somewhere in the list — a shape that reads as something simpler
   * first is a shape the generator has mislabelled.
   */
  it('spells chords identifyChord reads back as the quality asked for', () => {
    for (const { t, mode, key } of REALISATIONS) {
      for (const { numeral: n } of templateNumerals(t, mode)) {
        const readings = identifyChord(spellChord(realizeNumeral(key, n)));
        expect(readings[0]?.type.id,
          `${t.id} ${keyName(key)} ${numeralText(n)}`).toBe(n.typeId);
      }
    }
  });

  it('gives every minor-key dominant its raised leading tone', () => {
    let checked = 0;
    for (const { t, mode, key } of REALISATIONS) {
      if (mode !== 'minor') continue;
      for (const { numeral: n } of templateNumerals(t, mode)) {
        if (n.fn !== 'dominant' || n.appliedTo !== undefined) continue;
        const leadingTone = (pitchClass(key.tonic) + 11) % 12;
        const pcs = spellChord(realizeNumeral(key, n)).map(pitchClass);
        expect(pcs, `${t.id} ${keyName(key)} ${numeralText(n)}`).toContain(leadingTone);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('the harmonic rules, over the whole corpus', () => {
  it('writes no dominant moving to a predominant outside blues', () => {
    for (const { t, mode } of REALISATIONS) {
      if (t.tags.includes('blues')) continue;
      const chords = templateNumerals(t, mode);
      for (let i = 0; i + 1 < chords.length; i++) {
        const a = chords[i].numeral, b = chords[i + 1].numeral;
        const retrogression = a.fn === 'dominant' && a.appliedTo === undefined
          && b.fn === 'predominant' && b.appliedTo === undefined;
        expect(retrogression,
          `${t.id} ${mode} ${numeralText(a)}→${numeralText(b)}`).toBe(false);
      }
    }
  });

  /**
   * The same rule asked of the bass rather than of the labels. The function
   * field is the generator's own opinion; the staff step is not, so a label
   * that lies about what a chord is shows up as these two disagreeing.
   */
  it('writes no fifth degree moving to a fourth outside blues', () => {
    for (const { t, mode, key } of REALISATIONS) {
      if (t.tags.includes('blues')) continue;
      const chords = templateNumerals(t, mode);
      for (let i = 0; i + 1 < chords.length; i++) {
        const a = chords[i].numeral, b = chords[i + 1].numeral;
        if (a.appliedTo !== undefined || b.appliedTo !== undefined) continue;
        expect(rootDegree(key, a) === 5 && rootDegree(key, b) === 4,
          `${t.id} ${keyName(key)} ${numeralText(a)}→${numeralText(b)}`).toBe(false);
      }
    }
  });

  /** What makes the two checks above independent rather than one check twice. */
  it('labels no chord with a function its scale degree cannot carry', () => {
    const allowed: Record<string, number[]> = {
      tonic: [1, 3, 6], predominant: [2, 4, 6], dominant: [5, 7],
    };
    let checked = 0;
    for (const { t, mode, key } of REALISATIONS) {
      for (const { numeral: n } of templateNumerals(t, mode)) {
        // An applied chord belongs to its target's key, and an altered degree
        // is named by the alteration rather than by the step it lands on.
        if (n.appliedTo !== undefined || n.chromaticAlter !== 0) continue;
        const degrees = allowed[n.fn];
        if (degrees === undefined) continue;
        expect(degrees, `${t.id} ${keyName(key)} ${numeralText(n)} as ${n.fn}`)
          .toContain(rootDegree(key, n));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('resolves every applied dominant onto a chord rooted on its target', () => {
    let checked = 0;
    for (const { t, mode, key } of REALISATIONS) {
      const chords = templateNumerals(t, mode);
      chords.forEach(({ numeral: n }, i) => {
        if (n.appliedTo === undefined || n.degree !== 5) return;
        const next = chords[i + 1]?.numeral;
        expect(next, `${t.id} ${numeralText(n)} is the last chord`).toBeDefined();
        // The target's root, not the target chord: the bridge of rhythm
        // changes chains applied dominants, each resolving onto the next.
        const target = pitchClass(realizeNumeral(key, {
          degree: n.appliedTo, chromaticAlter: 0, typeId: 'maj', inversion: 0, fn: 'other',
        }).root);
        expect(pitchClass(realizeNumeral(key, next!).root),
          `${t.id} ${keyName(key)} ${numeralText(n)}→${numeralText(next!)}`).toBe(target);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(50);
  });

  /** A template is offered on the strength of this claim, so it has to be true. */
  it('arrives at the cadence it claims to arrive at', () => {
    const claimed = TEMPLATES.filter((t) => t.endsWith !== null);
    expect(claimed.length).toBeGreaterThan(15);
    for (const t of claimed) {
      for (const mode of t.modes) {
        const chords = templateNumerals(t, mode).map((c) => c.numeral);
        const last = chords[chords.length - 1];
        const penult = chords[chords.length - 2];
        const where = `${t.id} ${mode}`;
        const cadence: CadenceType = t.endsWith!;
        if (cadence === 'HC') {
          expect(last.fn, where).toBe('dominant');
          expect(last.appliedTo, where).toBeUndefined();
        }
        if (cadence === 'PAC' || cadence === 'IAC') {
          expect(last.degree, where).toBe(1);
          expect(last.appliedTo, where).toBeUndefined();
          expect(penult.fn, where).toBe('dominant');
          // Perfect means both chords in root position; imperfect is exactly
          // the absence of that, so only the perfect one is held to it.
          if (cadence === 'PAC') {
            expect(penult.degree, where).toBe(5);
            expect(penult.inversion, where).toBe(0);
            expect(last.inversion, where).toBe(0);
          } else {
            expect(penult.inversion !== 0 || last.inversion !== 0, where).toBe(true);
          }
        }
        if (cadence === 'DC') {
          expect(penult.fn, where).toBe('dominant');
          expect(last.degree, where).not.toBe(1);
          expect(last.fn, where).toBe('tonic');
        }
        if (cadence === 'PC') {
          expect(last.degree, where).toBe(1);
          expect(penult.degree, where).toBe(4);
        }
      }
    }
  });
});

describe('choosing a template', () => {
  it('offers only templates that fit the query, and refuses a wrong mode outright', () => {
    for (const mode of ['major', 'minor'] as const) {
      for (const bars of [2, 4, 8, 12]) {
        for (const cadence of [null, 'HC', 'PAC'] as const) {
          for (const t of candidateTemplates({ bars, mode, grade: 10, cadence })) {
            expect(t.bars).toBe(bars);
            expect(t.modes).toContain(mode);
            expect(t.endsWith === null || t.endsWith === cadence).toBe(true);
          }
        }
      }
      for (const t of TEMPLATES) {
        if (t.modes.includes(mode)) continue;
        expect(() => templateNumerals(t, mode)).toThrow();
      }
    }
  });

  it('withholds a template until its grade, and never starts on a predominant after a dominant', () => {
    const atGradeOne = candidateTemplates({ bars: 4, mode: 'major', grade: 1, cadence: null });
    expect(atGradeOne.length).toBeGreaterThan(0);
    for (const t of atGradeOne) expect(t.minGrade).toBeLessThanOrEqual(1);

    for (const mode of ['major', 'minor'] as const) {
      for (const bars of [2, 4, 8, 12]) {
        const after = candidateTemplates({
          bars, mode, grade: 10, cadence: null, afterDominant: true,
        });
        for (const t of after) expect(startsOn(t, mode), t.id).not.toBe('predominant');
      }
    }
    // The guard is only worth having if something would otherwise get through.
    const unguarded = candidateTemplates({ bars: 4, mode: 'major', grade: 10, cadence: null });
    expect(unguarded.some((t) => startsOn(t, 'major') === 'predominant')).toBe(true);
  });

  it('weights an exact cadence above one that would be rewritten', () => {
    const query = { bars: 4, mode: 'major' as const, grade: 10, cadence: 'HC' as const };
    const exact = TEMPLATES.find((t) => t.id === 'doo-wop')!;
    const open = TEMPLATES.find((t) => t.id === 'axis')!;
    expect(templateWeight(exact, query)).toBeGreaterThan(templateWeight(open, query));
  });

  it('reads the ends of a template from the numerals it realises', () => {
    expect(startsOn(findTemplate('ii-V-I'), 'major')).toBe('predominant');
    expect(endsOn(findTemplate('doo-wop'), 'major')).toBe('dominant');
    expect(endsOn(findTemplate('andalusian'), 'minor')).toBe('dominant');
    // The subtonic of an Andalusian cadence is not doing a dominant's job,
    // and the template says so rather than letting the degree decide.
    expect(templateNumerals(findTemplate('andalusian'), 'minor')[1].numeral.fn).toBe('other');
  });

  it('raises the minor dominant by default and only lowers it on request', () => {
    expect(defaultTypeId('minor', 5)).toBe('maj');
    expect(defaultTypeId('minor', 5, true)).toBe('dom7');
    expect(defaultTypeId('minor', 1)).toBe('min');
    expect(defaultTypeId('major', 7)).toBe('dim');
    expect(defaultTypeId('major', 5, true)).toBe('dom7');
  });
});

/**
 * The two exclusion filters, each tested without the other.
 *
 * ADR 0017 makes `allowApplied` and `allowBorrowed` exclude templates that
 * *contain* those chords rather than only gating the passes that add them.
 * Both are asserted here rather than through an exercise, because the three
 * templates that carry either carry *both* — so a caller that turns off one
 * and leaves the other on is the only configuration that can tell them
 * apart, and no exercise currently is one. Tested through the exercise, the
 * applied filter could be deleted with nothing going red; it was.
 */
describe('excluding what a template contains', () => {
  /**
   * The query that would select this template, built from the template.
   *
   * Hand-picking one query and hoping it reaches the entry under test is
   * how the first version of this returned an empty candidate list and
   * asserted against it — `cadence: null` admits only templates that
   * declare no cadence, which none of these do.
   */
  function queryFor(t: Template, mode: Mode) {
    return { bars: t.bars, mode, grade: t.minGrade, cadence: t.endsWith };
  }

  function offered(t: Template, mode: Mode, flags: Record<string, boolean> = {}): boolean {
    return candidateTemplates({ ...queryFor(t, mode), ...flags }).some((c) => c.id === t.id);
  }

  const appliedCarriers = ['rhythm-a', 'rhythm-b', 'blues-jazz'];

  it('offers each carrier when nothing is switched off, so the rest is not vacuous', () => {
    for (const id of appliedCarriers) {
      const t = findTemplate(id);
      expect(offered(t, 'major'), `${id} is not reachable at all`).toBe(true);
    }
  });

  it('drops a template written with an applied chord', () => {
    for (const id of appliedCarriers) {
      const t = findTemplate(id);
      expect(offered(t, 'major', { allowApplied: false }), `${id} survived`).toBe(false);
    }
  });

  /**
   * `rhythm-a` is the one that matters. It borrows by *quality* — `IV`
   * then `{ degree: 4, typeId: 'min' }`, the rhythm-changes move — with the
   * degree unaltered, so the first version of this filter read
   * `chromaticAlter` and let it straight through.
   */
  it('drops a template written with a borrowed chord, however it is spelled', () => {
    const byQuality = findTemplate('rhythm-a');
    expect(offered(byQuality, 'major', { allowBorrowed: false })).toBe(false);

    // And the one that spells it with an alteration, so both paths are live.
    const byAlteration = findTemplate('blues-jazz');
    expect(offered(byAlteration, 'major', { allowBorrowed: false })).toBe(false);
  });

  it('keeps a template that borrows nothing', () => {
    // Otherwise "drops it" above would pass for a filter that dropped
    // everything.
    const plain = TEMPLATES.find((t) => t.modes.includes('major')
      && !appliedCarriers.includes(t.id))!;
    expect(offered(plain, 'major', { allowApplied: false, allowBorrowed: false })).toBe(true);
  });

  it('borrows relative to the mode, so a minor dominant is not a loan', () => {
    // Raising the leading tone is how a minor key cadences. Counting it as
    // borrowing would empty the minor corpus whenever the flag was off.
    for (const t of TEMPLATES.filter((x) => x.modes.includes('minor'))) {
      expect(offered(t, 'minor', { allowBorrowed: false }), `${t.id} wrongly excluded`)
        .toBe(offered(t, 'minor'));
    }
  });
});

/**
 * What counts as borrowing, asserted directly.
 *
 * Through `candidateTemplates` only the degree-5 path is live: every
 * degree-7 step in the corpus leaves its quality unspecified, so the
 * leading-tone half of the exception was unreachable and — in the first
 * version — silently in the wrong place, sitting after the alteration
 * check that would already have returned true.
 *
 * The claim is about music rather than about the corpus, so it is tested
 * as one. The corpus can then grow a template that writes `viio` in minor
 * without this becoming wrong on the way.
 */
describe('what borrowing means', () => {
  const step = (degree: number, over: Record<string, unknown> = {}) =>
    ({ bars: 1, degree, ...over } as unknown as TemplateStep);

  it('is a loan from the parallel mode, by quality', () => {
    // iv in major: the rhythm-changes move, degree unaltered.
    expect(isBorrowedIn(step(4, { typeId: 'min' }), 'major')).toBe(true);
    // IV in major is simply IV.
    expect(isBorrowedIn(step(4, { typeId: 'maj' }), 'major')).toBe(false);
  });

  it('is a loan by alteration too', () => {
    expect(isBorrowedIn(step(4, { typeId: 'dim7', chromaticAlter: 1 }), 'major')).toBe(true);
  });

  it('sees past a seventh to the triad under it', () => {
    // A dominant seventh on V is a seventh, not a loan.
    expect(isBorrowedIn(step(5, { typeId: 'dom7' }), 'major')).toBe(false);
    expect(isBorrowedIn(step(2, { typeId: 'min7' }), 'major')).toBe(false);
  });

  it('leaves an unspecified quality alone, whatever the degree', () => {
    for (let degree = 1; degree <= 7; degree++) {
      expect(isBorrowedIn(step(degree), 'major')).toBe(false);
      expect(isBorrowedIn(step(degree), 'minor')).toBe(false);
    }
  });

  it('is not what an applied chord is, which the other flag governs', () => {
    expect(isBorrowedIn(step(5, { typeId: 'dom7', appliedTo: 4 }), 'major')).toBe(false);
  });

  /**
   * The exception, and the half of it the corpus cannot currently reach.
   *
   * A raised 5 or 7 in a minor key is harmonic minor — a form of the key
   * — and not a loan from the parallel major. Both spellings: the major
   * dominant written as a quality, and the leading-tone triad written
   * with an alteration.
   */
  it('does not count harmonic minor as a loan', () => {
    expect(isBorrowedIn(step(5, { typeId: 'maj' }), 'minor')).toBe(false);
    expect(isBorrowedIn(step(5, { typeId: 'dom7' }), 'minor')).toBe(false);
    expect(isBorrowedIn(step(7, { typeId: 'dim' }), 'minor')).toBe(false);
    expect(isBorrowedIn(step(7, { typeId: 'dim7', chromaticAlter: 1 }), 'minor')).toBe(false);
  });

  it('still counts a real loan into minor', () => {
    // A Picardy third and a major IV are taken from the parallel major,
    // which is what borrowing in minor actually means.
    expect(isBorrowedIn(step(1, { typeId: 'maj' }), 'minor')).toBe(true);
    expect(isBorrowedIn(step(4, { typeId: 'maj' }), 'minor')).toBe(true);
  });
});
