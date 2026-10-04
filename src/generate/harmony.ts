import { type Pitch, diatonicOf } from '../theory/pitch';
import { type Chord, chordType, spellChord } from '../theory/chord';
import { type Key, type Mode } from '../theory/key';
import { type TimeSignature, beatLevel, metricWeight } from '../theory/meter';
import { type Rng, chance, weightedPick } from '../theory/rng';
import {
  type CadenceType, type Degree, type RomanNumeral, numeral, numeralText, realizeNumeral,
} from '../theory/roman';
import {
  type StyleTag, type Template, candidateTemplates, defaultTypeId, templateNumerals,
  templateWeight,
} from './templates';

/**
 * Harmony generation, in four stages that happen in this order for reasons
 * no chord-to-chord process can supply.
 *
 * 1. **The phrase plan**, decided before a single chord exists. Eight bars is
 *    a period or a sentence; four is two two-bar halves. This stage *is*
 *    phrase rhythm, and nothing downstream could recover it — a Markov chain
 *    over chords produces joins that are locally plausible and a whole that
 *    means nothing.
 * 2. **Filling**, from the template corpus where one fits and from a
 *    two-level functional machine otherwise, or at a rate, so the corpus
 *    cannot simply be memorised.
 * 3. **Transformations**, applied to a sequence that already exists, because
 *    a secondary dominant's legitimacy depends entirely on what follows it
 *    and so cannot be decided inline.
 * 4. **Cadence enforcement**, a hard assignment rather than a probability, so
 *    "every progression cadences" is true by construction rather than likely.
 *
 * Everything is symbolic until the last moment: the numeral is the thing the
 * generator reasons about and `realizeNumeral` spells it, which is why V/V in
 * C comes out D–F#–A (ADR 0004).
 */

// ---- What comes out ------------------------------------------------------

export interface HarmonyEvent {
  numeral: RomanNumeral;
  /** The numeral realised in the key, spelled. */
  chord: Chord;
  startTick: number;
  durationTicks: number;
  /** Index into `Harmony.plan.phrases`. */
  phrase: number;
  /** Set on the chord a phrase's cadence arrives on. */
  cadence?: CadenceType;
  source: 'template' | 'functional';
  templateId?: string;
  /**
   * The style this chord was written in, carried per event rather than per
   * exercise so the one rule with a style exception — the V–IV retrogression,
   * idiomatic in blues and a mistake everywhere else — can be checked on the
   * chords themselves.
   */
  tags: readonly StyleTag[];
}

export type PhraseRole =
  | 'antecedent' | 'consequent' | 'basic-idea' | 'repeated-idea' | 'continuation' | 'whole';

export interface Phrase {
  index: number;
  role: PhraseRole;
  startBar: number;
  bars: number;
  /** null where the plan asks for no close, as in a sentence's presentation. */
  cadence: CadenceType | null;
  /** A sentence restates its basic idea; this says which phrase is restated. */
  repeatOf?: number;
}

export type PhraseForm = 'period' | 'sentence' | 'single' | 'blues';

export interface PhrasePlan {
  form: PhraseForm;
  bars: number;
  phrases: readonly Phrase[];
}

export interface Harmony {
  key: Key;
  timeSignature: TimeSignature;
  plan: PhrasePlan;
  events: HarmonyEvent[];
}

export interface HarmonyOptions {
  key: Key;
  timeSignature: TimeSignature;
  bars: number;
  form?: PhraseForm;
  /**
   * Which traditions the progressions may be quoted from. Empty or absent
   * means all of them.
   *
   * This replaced a `grade: number`, and the replacement is the point
   * rather than the mechanism. One ordinal gated six unrelated
   * decisions — which templates, which chords are in the vocabulary,
   * sevenths at cadences, the Picardy third, sevenths on applied
   * dominants, and the Neapolitan — so asking for any one of them meant
   * accepting the other five, and asking for a plain blues was
   * impossible because blues sat at a grade that had already turned on
   * things a blues does not use.
   *
   * Every one of those is now its own option below. Nothing here is a
   * level, and none of them implies another.
   */
  styles?: readonly StyleTag[];
  /** How often a phrase is improvised by the state machine rather than quoted. */
  improviseRate?: number;
  allowAppliedDominants?: boolean;
  allowBorrowed?: boolean;
  allowInversions?: boolean;
  /**
   * Seventh chords: ii7, V7, the half-diminished ii, and a seventh on a
   * cadential dominant or an applied one.
   *
   * One option rather than four, because a corpus that uses sevenths
   * uses them in all those places and a learner who wants them wants
   * them wherever they belong. Splitting it further would be
   * configurability for its own sake.
   */
  sevenths?: boolean;
  /** The diminished triads: ii° in minor and vii° in major. */
  diminished?: boolean;
  /** A major tonic closing a minor progression. */
  picardy?: boolean;
  /** The Neapolitan sixth, which is a specific gesture rather than a tier. */
  neapolitan?: boolean;
  /** Overrides what the plan asks for, which is how DC, PC and IAC are reached. */
  cadences?: { antecedent?: CadenceType; final?: CadenceType };
  /** The modal minor v, which is a style flag and never a default. */
  modalMinorV?: boolean;
}

// ---- Stage 1: the phrase plan -------------------------------------------

function phrase(
  index: number, role: PhraseRole, startBar: number, bars: number,
  cadence: CadenceType | null, repeatOf?: number,
): Phrase {
  return { index, role, startBar, bars, cadence, repeatOf };
}

/** Which forms a given length can take at all. */
function formsFor(bars: number, style?: StyleTag): Array<{ value: PhraseForm; weight: number }> {
  if (bars === 12) {
    return [{ value: 'blues', weight: style === 'blues' ? 10 : 3 }, { value: 'single', weight: 1 }];
  }
  if (bars === 16) return [{ value: 'period', weight: 1 }];
  if (bars === 8) {
    return [
      { value: 'period', weight: 4 }, { value: 'sentence', weight: 3 },
      { value: 'single', weight: 2 },
    ];
  }
  if (bars === 4) return [{ value: 'period', weight: 3 }, { value: 'single', weight: 2 }];
  return [{ value: 'single', weight: 1 }];
}

/**
 * The plan, chosen before any chord exists.
 *
 * A period is an antecedent that asks a question with a half cadence and a
 * consequent that answers it with a perfect authentic one. A sentence states
 * a basic idea, restates it, and then spends twice as long getting to the
 * close. Both are shapes of a whole phrase, which is exactly why they are
 * decided here rather than falling out of chord choices later.
 */
export function planPhrases(
  rng: Rng,
  options: {
    bars: number; form?: PhraseForm;
    styles?: readonly StyleTag[]; cadences?: HarmonyOptions['cadences'];
  },
): PhrasePlan {
  const { bars } = options;
  if (bars < 2) throw new Error(`A progression needs at least two bars; asked for ${bars}`);
  // One style shapes the form; several do not, because a twelve-bar blues
  // form is a claim about blues and not about "blues or jazz or folk".
  const available = formsFor(bars, options.styles?.length === 1 ? options.styles[0] : undefined);
  const requested = options.form;
  const form = requested !== undefined && available.some((f) => f.value === requested)
    ? requested
    : weightedPick(rng, available);

  // The blues turnaround lands on the dominant, so that is the form's own
  // close rather than a weaker version of a perfect cadence.
  const close = options.cadences?.final ?? (form === 'blues' ? 'HC' : 'PAC');
  // A plagal close is approached from the subdominant, and a dominant moving
  // to a subdominant is the one join this generator refuses. Inside a phrase
  // `planCadence` repairs that by putting a tonic in front of the IV, but a
  // consequent of two chords has no room for one and the chord in front of
  // its subdominant is the antecedent's own cadence — locked, and restored by
  // the second pass if anything overwrites it. So a period that closes
  // plagally asks its question with the weak authentic cadence instead.
  const asked = options.cadences?.antecedent ?? 'HC';
  const half: CadenceType = close === 'PC' && asked === 'HC' ? 'IAC' : asked;

  if (form === 'period' && bars % 2 === 0) {
    const n = bars / 2;
    return {
      form, bars,
      phrases: [
        phrase(0, 'antecedent', 0, n, half),
        phrase(1, 'consequent', n, n, close),
      ],
    };
  }
  if (form === 'sentence' && bars % 4 === 0) {
    const unit = bars / 4;
    return {
      form, bars,
      phrases: [
        phrase(0, 'basic-idea', 0, unit, null),
        phrase(1, 'repeated-idea', unit, unit, null, 0),
        phrase(2, 'continuation', unit * 2, unit * 2, close),
      ],
    };
  }
  return { form: form === 'blues' ? 'blues' : 'single', bars, phrases: [phrase(0, 'whole', 0, bars, close)] };
}

// ---- The working representation -----------------------------------------

interface Slot {
  numeral: RomanNumeral;
  bars: number;
  startTick: number;
  durationTicks: number;
  phrase: number;
  /** Owned by cadence enforcement; no transformation may touch it. */
  locked: boolean;
  source: 'template' | 'functional';
  templateId?: string;
  tags: readonly StyleTag[];
}

interface Context {
  rng: Rng;
  key: Key;
  mode: Mode;
  ts: TimeSignature;
  styles?: readonly StyleTag[];
  modalMinorV: boolean;
  sevenths: boolean;
  diminished: boolean;
  picardy: boolean;
  neapolitan: boolean;
  /**
   * Resolved once, so corpus selection and the transformation passes agree
   * about what was asked for (ADR 0017).
   *
   * Resolving them at the two use sites separately is how they came to
   * disagree in the first place: the pass read the option and the query
   * did not read it at all, so the flags excluded nothing and only
   * declined to add.
   */
  allowApplied: boolean;
  allowBorrowed: boolean;
}

// ---- Stage 2a: the two-level functional machine -------------------------

type MachineFunction = 'tonic' | 'predominant' | 'dominant';

/**
 * Function to function, before any chord is chosen.
 *
 * The one hard rule is the gap in the dominant row: **D never returns to PD**.
 * The V–IV retrogression is the single most audible mistake a naive generator
 * makes, and no weight small enough to be tasteful is small enough to be rare
 * over thousands of bars, so it is absent rather than unlikely. Blues is the
 * exception and asks for it by name.
 */
const TRANSITIONS: Record<MachineFunction, Array<{ value: MachineFunction; weight: number }>> = {
  tonic: [{ value: 'tonic', weight: 2 }, { value: 'predominant', weight: 5 }, { value: 'dominant', weight: 3 }],
  predominant: [{ value: 'predominant', weight: 2 }, { value: 'dominant', weight: 8 }, { value: 'tonic', weight: 1 }],
  dominant: [{ value: 'tonic', weight: 8 }, { value: 'dominant', weight: 2 }],
};

const BLUES_RETROGRESSION = { value: 'predominant' as MachineFunction, weight: 4 };

interface PoolEntry {
  degree: Degree;
  typeId: string;
  chromaticAlter?: number;
  weight: number;
  /**
   * The option this chord waits for, or absent for one always in play.
   *
   * Read off the chord rather than off a tier. These carried a
   * `minGrade` — ii7 and V7 at 4, ii° at 5, iiø7 and vii° at 6 — and the
   * numbers were describing the chord's quality in every case: the ones
   * at 4 are sevenths and the ones at 5 and 6 are diminished. Saying so
   * costs a word and means a user who wants sevenths gets sevenths
   * rather than sevenths and whatever else grade 4 included.
   *
   * iii had a grade of its own and now has no gate at all. It is a plain
   * diatonic triad; nothing about it needs permission, and it was at 4
   * because 4 was where the list had got to.
   */
  needs?: 'sevenths' | 'diminished';
}

function p(
  degree: Degree, typeId: string, weight: number,
  needs?: PoolEntry['needs'], chromaticAlter = 0,
): PoolEntry {
  return { degree, typeId, weight, needs, chromaticAlter };
}

/**
 * Chord within function, the second level.
 *
 * A degree appears in more than one pool on purpose: vi after a tonic is
 * prolonging it, vi before ii is behaving as a predominant, and the function
 * the chord was drawn for is written onto the numeral rather than left to the
 * default, which reads the degree alone and cannot tell those apart (ADR 0004).
 *
 * The minor dominant is major in every pool here. vii° in minor is built on
 * the raised seventh, which the degree root does not supply, so it carries the
 * alteration explicitly.
 */
const POOLS: Record<Mode, Record<MachineFunction, PoolEntry[]>> = {
  major: {
    tonic: [p(1, 'maj', 8), p(6, 'min', 3), p(3, 'min', 1)],
    predominant: [
      p(4, 'maj', 5), p(2, 'min', 5), p(2, 'min7', 2, 'sevenths'), p(6, 'min', 1),
    ],
    dominant: [p(5, 'maj', 8), p(5, 'dom7', 5, 'sevenths'), p(7, 'dim', 1, 'diminished')],
  },
  minor: {
    tonic: [p(1, 'min', 8), p(6, 'maj', 3), p(3, 'maj', 2)],
    predominant: [
      p(4, 'min', 5), p(6, 'maj', 2), p(2, 'dim', 2, 'diminished'),
      p(2, 'm7b5', 2, 'sevenths'),
    ],
    dominant: [p(5, 'maj', 8), p(5, 'dom7', 5, 'sevenths'), p(7, 'dim', 1, 'diminished', 1)],
  },
};

function poolFor(ctx: Context, fn: MachineFunction, avoid?: RomanNumeral): PoolEntry[] {
  const all = POOLS[ctx.mode][fn].filter((entry) => entry.needs === undefined || ctx[entry.needs]);
  // Repeating a chord across a bar line is not wrong, but a machine that does
  // it as often as chance allows sounds stuck.
  const fresh = all.filter((entry) => entry.degree !== avoid?.degree);
  return fresh.length ? fresh : all;
}

function machineChord(ctx: Context, fn: MachineFunction, avoid?: RomanNumeral): RomanNumeral {
  const entry = weightedPick(ctx.rng, poolFor(ctx, fn, avoid).map((value) => ({ value, weight: value.weight })));
  let typeId = entry.typeId;
  // The modal v is reachable, but only because a style flag asked for it.
  if (ctx.mode === 'minor' && entry.degree === 5 && ctx.modalMinorV) {
    typeId = typeId === 'dom7' ? 'min7' : 'min';
  }
  return numeral(entry.degree, typeId, { chromaticAlter: entry.chromaticAlter, fn });
}

function machineFill(ctx: Context, bars: number, startAt: MachineFunction): RomanNumeral[] {
  const out: RomanNumeral[] = [];
  let fn = startAt;
  for (let i = 0; i < bars; i++) {
    out.push(machineChord(ctx, fn, out[out.length - 1]));
    const rows = TRANSITIONS[fn];
    const choices = fn === 'dominant' && ctx.styles?.includes('blues')
      ? [...rows, BLUES_RETROGRESSION]
      : rows;
    fn = weightedPick(ctx.rng, choices);
  }
  return out;
}

// ---- Stage 2b: filling the plan -----------------------------------------

function slotsFromTemplate(t: Template, ctx: Context, phraseIndex: number): Slot[] {
  return templateNumerals(t, ctx.mode).map((chordOf) => ({
    numeral: chordOf.numeral,
    bars: chordOf.bars,
    startTick: 0,
    durationTicks: 0,
    phrase: phraseIndex,
    locked: false,
    source: 'template' as const,
    templateId: t.id,
    tags: t.tags,
  }));
}

function endsOnDominant(slots: readonly Slot[], planned: CadenceType | null): boolean {
  if (planned !== null) return planned === 'HC';
  const last = slots[slots.length - 1]?.numeral;
  return last !== undefined && last.fn === 'dominant' && last.appliedTo === undefined;
}

function fill(ctx: Context, plan: PhrasePlan, improviseRate: number): Slot[] {
  const byPhrase: Slot[][] = [];
  let afterDominant = false;
  for (const ph of plan.phrases) {
    if (ph.repeatOf !== undefined) {
      // A sentence restates its basic idea. The copy is exact here and costs
      // no draw from the Rng; the transformation passes below see it as two
      // independent stretches of music and may vary the second, which is what
      // a real sentence does anyway.
      byPhrase.push(byPhrase[ph.repeatOf].map((slot) => ({
        ...slot, numeral: { ...slot.numeral }, phrase: ph.index,
      })));
      afterDominant = endsOnDominant(byPhrase[ph.index], ph.cadence);
      continue;
    }
    const query = {
      bars: ph.bars, mode: ctx.mode, styles: ctx.styles, cadence: ph.cadence, afterDominant,
      // The *resolved* values, not the raw options: a filter reading the
      // raw option would exclude nothing whenever the caller left the flag
      // unset while the pass below happily added the same chords. The
      // query and the pass have to agree about what was asked for.
      allowApplied: ctx.allowApplied, allowBorrowed: ctx.allowBorrowed,
      allowDiminished: ctx.diminished,
    };
    let candidates = candidateTemplates(query);
    // A style the corpus cannot serve at this length narrows to nothing; fall
    // back to the whole corpus rather than to silence.
    if (candidates.length === 0 && ctx.styles?.length) {
      candidates = candidateTemplates({ ...query, styles: undefined });
    }
    const quote = candidates.length > 0 && !chance(ctx.rng, improviseRate);
    if (quote) {
      const chosen = weightedPick(ctx.rng, candidates.map((value) => ({
        value, weight: templateWeight(value, query),
      })));
      byPhrase.push(slotsFromTemplate(chosen, ctx, ph.index));
    } else {
      byPhrase.push(machineFill(ctx, ph.bars, 'tonic').map((n) => ({
        numeral: n,
        bars: 1,
        startTick: 0,
        durationTicks: 0,
        phrase: ph.index,
        locked: false,
        source: 'functional' as const,
        tags: ctx.styles?.length === 1 ? [ctx.styles[0]] : [],
      })));
    }
    afterDominant = endsOnDominant(byPhrase[ph.index], ph.cadence);
  }
  return byPhrase.flat();
}

/** Bars to ticks, once, before anything asks where in the bar a chord falls. */
function layOut(slots: Slot[], ts: TimeSignature): void {
  let bars = 0;
  for (const slot of slots) {
    const start = bars * ts.barTicks;
    const duration = slot.bars * ts.barTicks;
    if (!Number.isInteger(start) || !Number.isInteger(duration)) {
      throw new Error(`a chord of ${slot.bars} bars does not land on a whole tick in ${ts.id}`);
    }
    slot.startTick = start;
    slot.durationTicks = duration;
    bars += slot.bars;
  }
}

// ---- Stage 4, decided early: the cadences -------------------------------

interface CadenceWrite { index: number; numeral: RomanNumeral }

function tonicNumeral(ctx: Context, inversion = 0, picardy = false): RomanNumeral {
  const typeId = picardy ? 'maj' : defaultTypeId(ctx.mode, 1);
  return numeral(1, typeId, { inversion, fn: 'tonic' });
}

function dominantNumeral(ctx: Context, existing?: RomanNumeral): RomanNumeral {
  // Keep a seventh the corpus already wrote; a V7 rewritten as a bare triad is
  // a cadence enforced at the cost of the chord it was enforcing.
  const keepSeventh = existing !== undefined && existing.degree === 5
    && existing.appliedTo === undefined
    && chordType(existing.typeId).family === 'seventh';
  const seventh = keepSeventh || (ctx.sevenths && chance(ctx.rng, 0.4));
  return numeral(5, seventh ? 'dom7' : 'maj', { fn: 'dominant' });
}

function predominantNumeral(ctx: Context): RomanNumeral {
  // iv6 before the dominant is the Phrygian half cadence, which is what a
  // minor key does here and the reason this is not simply "ii6".
  if (ctx.mode === 'minor') return numeral(4, 'min', { inversion: 1, fn: 'predominant' });
  return numeral(2, 'min', { inversion: 1, fn: 'predominant' });
}

function submediantNumeral(ctx: Context): RomanNumeral {
  return numeral(6, defaultTypeId(ctx.mode, 6), { fn: 'tonic' });
}

function subdominantNumeral(ctx: Context): RomanNumeral {
  return numeral(4, defaultTypeId(ctx.mode, 4), { fn: 'predominant' });
}

/**
 * What a cadence will be, decided once.
 *
 * Separating the decision from the writing is what lets the writing happen
 * twice: once before the transformations, so an applied dominant can aim at a
 * cadential chord and know what it is aiming at, and once after, so no
 * transformation can have moved it. The second application is the guarantee,
 * and it draws nothing from the Rng, so it cannot disagree with the first.
 */
function planCadence(ctx: Context, slots: readonly Slot[], indices: readonly number[], cadence: CadenceType): CadenceWrite[] {
  const last = indices[indices.length - 1];
  const penult = indices[indices.length - 2];
  const anteIndex = indices.length >= 3 ? indices[indices.length - 3] : undefined;
  const writes: CadenceWrite[] = [];

  // A Picardy third: the only borrowing that belongs to the cadence itself.
  const picardy = ctx.mode === 'minor' && ctx.picardy
    && (cadence === 'PAC' || cadence === 'IAC') && chance(ctx.rng, 0.25);

  switch (cadence) {
    case 'PAC':
      writes.push({ index: last, numeral: tonicNumeral(ctx, 0, picardy) });
      writes.push({ index: penult, numeral: dominantNumeral(ctx, slots[penult].numeral) });
      break;
    case 'IAC':
      // Imperfect by the inversion, which is why this one is exempt from the
      // root-position rule the other authentic cadence insists on.
      writes.push({ index: last, numeral: tonicNumeral(ctx, 1, picardy) });
      writes.push({ index: penult, numeral: dominantNumeral(ctx, slots[penult].numeral) });
      break;
    case 'HC':
      writes.push({ index: last, numeral: dominantNumeral(ctx, slots[last].numeral) });
      break;
    case 'DC':
      writes.push({ index: last, numeral: submediantNumeral(ctx) });
      writes.push({ index: penult, numeral: dominantNumeral(ctx, slots[penult].numeral) });
      break;
    case 'PC':
      writes.push({ index: last, numeral: tonicNumeral(ctx) });
      writes.push({ index: penult, numeral: subdominantNumeral(ctx) });
      break;
  }

  // Whatever now sits in front of the cadence must be able to precede it. A
  // half cadence whose penultimate chord is also a dominant says nothing, and
  // a dominant in front of the plagal subdominant is the retrogression this
  // generator exists to avoid.
  const written = new Set(writes.map((w) => w.index));
  const before = cadence === 'HC' ? penult : anteIndex;
  if (before !== undefined && !written.has(before)) {
    const there = slots[before].numeral;
    if (there.fn === 'dominant' && there.appliedTo === undefined) {
      writes.push({
        index: before,
        numeral: cadence === 'PC' ? tonicNumeral(ctx) : predominantNumeral(ctx),
      });
    }
  }
  return writes;
}

/**
 * Write a slot unless a cadence owns it.
 *
 * Every transformation is supposed to leave locked slots alone, and four
 * of the five checked. `repairRetrogressions` did not: its `else` branch
 * rewrote the *second* chord of a pair with no check at all, so a locked
 * predominant following a locked dominant was silently overwritten — and
 * once the end-of-pipeline assertion existed, that became a thrown error
 * out of `generateHarmony` rather than a slightly odd chord.
 *
 * The invariant belongs on the write rather than on a sweep afterwards.
 * Routed through here a pass cannot forget the check, because there is
 * nowhere left to forget it, and a pass that tries becomes "this write
 * did nothing" instead of a crash three calls later.
 *
 * Found by the altitude review, against the comment one line above the
 * assertion claiming every mutator already checked.
 */
function writeSlot(slot: Slot, numeral: RomanNumeral): void {
  if (slot.locked) return;
  slot.numeral = numeral;
}

function applyCadences(slots: Slot[], writes: readonly CadenceWrite[]): void {
  for (const write of writes) {
    slots[write.index].numeral = write.numeral;
    slots[write.index].locked = true;
  }
}

// ---- Stage 3: the transformations ---------------------------------------

/** Degrees worth tonicising: diatonic, consonant, and not the tonic itself. */
const TONICISABLE: Record<Mode, readonly Degree[]> = {
  major: [2, 3, 4, 5, 6],
  // ii in minor is diminished, and a diminished chord cannot be tonicised.
  minor: [3, 4, 5, 6, 7],
};

/**
 * Applied dominants.
 *
 * This has to run over a finished sequence. Whether V/ii is a secondary
 * dominant or a wrong note depends entirely on whether ii comes next, and a
 * generator choosing chord by chord does not yet know. The chord before the
 * target is converted rather than a new one inserted, so the resolution is
 * guaranteed by construction instead of hoped for.
 */
function applyAppliedDominants(ctx: Context, slots: Slot[], rate: number): void {
  for (let i = 1; i < slots.length - 1; i++) {
    const here = slots[i];
    const target = slots[i + 1].numeral;
    if (here.locked || here.numeral.appliedTo !== undefined) continue;
    if (slots[i - 1].numeral.appliedTo !== undefined) continue;
    if (target.appliedTo !== undefined || target.chromaticAlter !== 0) continue;
    if (!TONICISABLE[ctx.mode].includes(target.degree)) continue;
    if (!chance(ctx.rng, rate)) continue;
    writeSlot(here, numeral(5, ctx.sevenths ? 'dom7' : 'maj', { appliedTo: target.degree }));
  }
}

function borrowedOptions(ctx: Context): Array<{ value: RomanNumeral; weight: number }> {
  const out: Array<{ value: RomanNumeral; weight: number }> = [];
  // The half-diminished ii is a borrowing *and* a diminished chord, so it
  // waits for both switches. A chord that two settings each describe has
  // to satisfy both or one of them is not telling the truth — turning
  // diminished triads off and still hearing ii° because borrowing was on
  // is the same complaint ADR 0017 makes, one level down.
  if (ctx.mode === 'major') {
    out.push({ value: numeral(4, 'min', { fn: 'predominant' }), weight: 5 });
    if (ctx.diminished) {
      out.push({ value: numeral(2, 'm7b5', { fn: 'predominant' }), weight: 3 });
    }
    out.push({ value: numeral(6, 'maj', { chromaticAlter: -1, fn: 'predominant' }), weight: 2 });
    out.push({ value: numeral(7, 'maj', { chromaticAlter: -1, fn: 'predominant' }), weight: 1 });
  } else {
    // The Dorian fourth, which is the borrowing a minor key actually makes.
    out.push({ value: numeral(4, 'maj', { fn: 'predominant' }), weight: 3 });
    if (ctx.diminished) {
      out.push({ value: numeral(2, 'm7b5', { fn: 'predominant' }), weight: 3 });
    }
  }
  if (ctx.neapolitan) {
    // The Neapolitan, in first inversion because that is where it lives.
    out.push({
      value: numeral(2, 'maj', { chromaticAlter: -1, inversion: 1, fn: 'predominant' }),
      weight: 2,
    });
  }
  return out;
}

/**
 * Borrowed chords, and only in place of a predominant.
 *
 * Swapping one predominant for another cannot create the V–IV retrogression,
 * because whatever was legal in front of the chord that was there is legal in
 * front of this one. Borrowing onto a tonic could, which is why it does not
 * happen here.
 */
function applyBorrowing(ctx: Context, slots: Slot[], rate: number): void {
  const options = borrowedOptions(ctx);
  for (let i = 1; i < slots.length; i++) {
    const here = slots[i];
    if (here.locked) continue;
    if (here.numeral.fn !== 'predominant' || here.numeral.appliedTo !== undefined) continue;
    if (here.numeral.chromaticAlter !== 0) continue;
    // Moving the root of a chord an applied dominant is aiming at would leave
    // that dominant resolving nowhere.
    if (slots[i - 1].numeral.appliedTo !== undefined) continue;
    if (!chance(ctx.rng, rate)) continue;
    here.numeral = { ...weightedPick(ctx.rng, options) };
  }
}

/** The bass note a numeral's inversion puts underneath it. */
export function bassNote(key: Key, n: RomanNumeral): Pitch {
  const tones = spellChord(realizeNumeral(key, n));
  const inv = ((n.inversion % tones.length) + tones.length) % tones.length;
  return tones[inv];
}

function bassStep(key: Key, n: RomanNumeral): number {
  return ((diatonicOf(bassNote(key, n)) % 7) + 7) % 7;
}

/** Signed distance between two staff steps, by the shorter way round. */
function stepDelta(from: number, to: number): number {
  let d = (to - from) % 7;
  if (d > 3) d -= 7;
  if (d < -3) d += 7;
  return d;
}

export function isSixFour(n: RomanNumeral): boolean {
  const type = chordType(n.typeId);
  if (type.family !== 'triad') return false;
  const size = type.semitones.length;
  return (((n.inversion % size) + size) % size) === 2;
}

/**
 * Which of the two legal six-fours this is, or null.
 *
 * A triad in second inversion is a dissonance that has to be explained. Only
 * two explanations are accepted anywhere: the cadential six-four, which sits
 * on a strong beat over the bass of the dominant it is about to become, and
 * the passing six-four, whose bass walks in and out by step in one direction.
 * Everything else is the commonest artefact a chord generator produces, and
 * refusing it is what this function is for.
 */
export function sixFourKind(
  key: Key, ts: TimeSignature, startTick: number,
  previous: RomanNumeral | undefined, here: RomanNumeral, next: RomanNumeral | undefined,
): 'cadential' | 'passing' | null {
  if (!isSixFour(here)) return null;
  const bass = bassStep(key, here);
  const after = next === undefined ? undefined : bassStep(key, next);
  if (next !== undefined && after === bass
    && next.fn === 'dominant' && next.appliedTo === undefined && next.inversion === 0
    // Stronger than a plain beat: the downbeat everywhere, and the half-bar
    // accent in the meters that have one.
    && metricWeight(ts, startTick) >= beatLevel(ts) + 1) {
    return 'cadential';
  }
  if (previous !== undefined && after !== undefined) {
    const into = stepDelta(bassStep(key, previous), bass);
    const outOf = stepDelta(bass, after);
    if (Math.abs(into) === 1 && into === outOf) return 'passing';
  }
  return null;
}

/**
 * Whether inverting this chord would strand the six-four in front of it.
 *
 * A six-four is legal because of where its bass came from and where it goes,
 * and the chord it goes to is the one this pass is about to move. The pass
 * walks forwards, so that chord is still in root position when the six-four
 * is approved and may be inverted one step later — which turns a passing
 * six-four's descent into a neighbour, or takes the dominant out from under a
 * cadential one, leaving a second inversion with no explanation at all.
 */
function strandsPrecedingSixFour(
  ctx: Context, slots: readonly Slot[], index: number, replacement: RomanNumeral,
): boolean {
  const before = slots[index - 1];
  if (before === undefined || !isSixFour(before.numeral)) return false;
  return sixFourKind(ctx.key, ctx.ts, before.startTick,
    slots[index - 2]?.numeral, before.numeral, replacement) === null;
}

/**
 * Inversions, chosen to turn a bass leap into a bass step.
 *
 * Nothing is inverted for variety. An inversion has to shorten the bass line
 * measurably and produce a real step on one side of the chord, which is the
 * only reason a figured bass exists in the first place.
 */
function applyInversions(ctx: Context, slots: Slot[], rate: number): void {
  for (let i = 1; i < slots.length - 1; i++) {
    const here = slots[i];
    if (here.locked || here.numeral.inversion !== 0) continue;
    const previous = slots[i - 1].numeral;
    const next = slots[i + 1].numeral;
    const before = bassStep(ctx.key, previous);
    const after = bassStep(ctx.key, next);
    const cost = (step: number) => Math.abs(stepDelta(before, step)) + Math.abs(stepDelta(step, after));
    const rootCost = cost(bassStep(ctx.key, here.numeral));

    let best: RomanNumeral | undefined;
    let bestCost = rootCost;
    const size = chordType(here.numeral.typeId).semitones.length;
    for (let inversion = 1; inversion < size; inversion++) {
      const candidate = { ...here.numeral, inversion };
      if (isSixFour(candidate)
        && sixFourKind(ctx.key, ctx.ts, here.startTick, previous, candidate, next) === null) {
        continue;
      }
      const step = bassStep(ctx.key, candidate);
      // A seventh in the bass is a dissonance in the lowest voice and has
      // nowhere to go but down a step. Inverting that far to fix a leap and
      // leaving the dissonance hanging trades one fault for a worse one.
      if (inversion === size - 1 && chordType(candidate.typeId).family === 'seventh'
        && stepDelta(step, after) !== -1) continue;
      const stepwise = Math.abs(stepDelta(before, step)) === 1 || Math.abs(stepDelta(step, after)) === 1;
      const candidateCost = cost(step);
      if (stepwise && candidateCost <= bestCost - 2) { best = candidate; bestCost = candidateCost; }
    }
    if (best === undefined || !chance(ctx.rng, rate)) continue;
    if (strandsPrecedingSixFour(ctx, slots, i, best)) continue;
    here.numeral = best;
  }
}

/**
 * The last word on the retrogression.
 *
 * Neither the machine nor the corpus produces D→PD, but enforcement can:
 * replacing a half cadence's penultimate dominant with a predominant leaves
 * whatever was in front of it sitting on a V–IV join. Rather than unwind that
 * inside the cadence logic, it is repaired here, by turning whichever of the
 * pair a cadence does not own into a tonic.
 *
 * This runs *before* the transformations, not after, so that an applied
 * dominant is never aimed at a chord that is about to be replaced. Blues keeps
 * its V–IV, which is idiomatic there and a mistake everywhere else.
 */
function repairRetrogressions(ctx: Context, slots: Slot[]): void {
  for (let i = 0; i + 1 < slots.length; i++) {
    const a = slots[i];
    const b = slots[i + 1];
    if (a.numeral.fn !== 'dominant' || a.numeral.appliedTo !== undefined) continue;
    if (b.numeral.fn !== 'predominant' || b.numeral.appliedTo !== undefined) continue;
    if (a.tags.includes('blues') && b.tags.includes('blues')) continue;
    // Prefer rewriting the dominant; fall back to the predominant. Where
    // a cadence owns both, neither moves and the retrogression stands —
    // which is honest, and is what the lock means.
    if (!a.locked) writeSlot(a, tonicNumeral(ctx));
    else writeSlot(b, tonicNumeral(ctx));
  }
}

// ---- Putting it together -------------------------------------------------

function phraseIndices(slots: readonly Slot[], phraseIndex: number): number[] {
  const out: number[] = [];
  slots.forEach((slot, i) => { if (slot.phrase === phraseIndex) out.push(i); });
  return out;
}

export function generateHarmony(rng: Rng, options: HarmonyOptions): Harmony {
  const ctx: Context = {
    rng,
    key: options.key,
    mode: options.key.mode,
    ts: options.timeSignature,
    styles: options.styles,
    modalMinorV: options.modalMinorV ?? false,
    // Every device is off unless asked for. Under `grade` these defaulted
    // on above a threshold, so a caller that named none of them still got
    // whatever its number happened to buy; now a caller that names none
    // gets plain diatonic harmony, which is the thing you can describe
    // without reference to a table.
    sevenths: options.sevenths ?? false,
    diminished: options.diminished ?? false,
    picardy: options.picardy ?? false,
    neapolitan: options.neapolitan ?? false,
    allowApplied: options.allowAppliedDominants ?? false,
    allowBorrowed: options.allowBorrowed ?? false,
  };

  const plan = planPhrases(rng, {
    bars: options.bars, form: options.form, styles: options.styles, cadences: options.cadences,
  });
  const slots = fill(ctx, plan, options.improviseRate ?? 0.35);
  layOut(slots, ctx.ts);

  // Decided once and written twice: see planCadence.
  const writes: CadenceWrite[] = [];
  const cadenceAt: Array<{ index: number; cadence: CadenceType }> = [];
  for (const ph of plan.phrases) {
    if (ph.cadence === null) continue;
    const indices = phraseIndices(slots, ph.index);
    writes.push(...planCadence(ctx, slots, indices, ph.cadence));
    cadenceAt.push({ index: indices[indices.length - 1], cadence: ph.cadence });
  }
  applyCadences(slots, writes);
  repairRetrogressions(ctx, slots);

  if (ctx.allowApplied) applyAppliedDominants(ctx, slots, 0.3);
  if (ctx.allowBorrowed) applyBorrowing(ctx, slots, 0.25);
  if (options.allowInversions ?? false) applyInversions(ctx, slots, 0.6);

  // The transformations above are written to leave locked slots alone, and
  // this is what makes that a fact rather than a convention.
  //
  // An assertion rather than a second `applyCadences`, which is what stood
  // here. That call could not fail: every mutator checks `locked`, so each
  // slot it rewrote already held the value it was writing. Its own comment
  // called it "the guarantee" and it was a repair — and a repair is the
  // worst of the three options for exactly the case it exists for. Add a
  // transformation that forgets the `locked` check and the overwrite
  // silently undoes its work on the cadence chords, the generator looks
  // right, the new pass is ineffective on the chords that matter most, and
  // nothing says so. Deleting it would at least let the damage show;
  // asserting names it.
  //
  // Found by the architect reading the pipeline against its own header.
  for (const write of writes) {
    const held = slots[write.index].numeral;
    if (held !== write.numeral) {
      throw new Error(
        `A transformation rewrote the cadence at slot ${write.index}: `
        + `expected ${numeralText(write.numeral)}, found ${numeralText(held)}. `
        + 'Every pass that mutates a slot must skip the locked ones.',
      );
    }
  }

  const marker = new Map(cadenceAt.map((c) => [c.index, c.cadence]));
  const events: HarmonyEvent[] = slots.map((slot, i) => ({
    numeral: slot.numeral,
    chord: realizeNumeral(ctx.key, slot.numeral),
    startTick: slot.startTick,
    durationTicks: slot.durationTicks,
    phrase: slot.phrase,
    cadence: marker.get(i),
    source: slot.source,
    templateId: slot.templateId,
    tags: slot.tags,
  }));
  return { key: ctx.key, timeSignature: ctx.ts, plan, events };
}
