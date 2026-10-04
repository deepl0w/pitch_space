import { type Mode } from '../theory/key';
import {
  DIATONIC_SEVENTHS, DIATONIC_TRIADS, type CadenceType, type Degree,
  type HarmonicFunction, type RomanNumeral, numeral,
} from '../theory/roman';

/**
 * The progression corpus.
 *
 * Real harmony is not a Markov chain over chords. A chain produces joins that
 * are locally plausible and a whole that means nothing, because the things
 * that make a progression recognisable — the axis loop, the twelve-bar form,
 * the bridge of rhythm changes — are patterns of a whole phrase and cannot be
 * recovered from any chord-to-chord process. So they are written down.
 *
 * This catalogue is the project's real musical asset: twenty correct templates
 * are worth more than any cleverness in the generator that reads them. It is
 * key-independent by construction — a template is a sequence of numerals, and
 * every one of them is realised through `realizeNumeral`, so the same entry is
 * correct in all fifteen keys (ADR 0004).
 */

export type StyleTag =
  | 'pop' | 'rock' | 'folk' | 'jazz' | 'blues' | 'classical' | 'baroque' | 'flamenco';

export interface TemplateStep {
  degree: Degree;
  /**
   * Omitted takes the diatonic quality of the mode, with the minor dominant
   * raised. Written out where the chord is chromatic or where the template
   * means a quality the mode would not give it.
   */
  typeId?: string;
  /** Ask the diatonic table for the seventh rather than the triad. */
  seventh?: boolean;
  chromaticAlter?: number;
  inversion?: number;
  appliedTo?: Degree;
  /**
   * Overrides the default function, which is read from the degree alone and is
   * wrong wherever a degree is doing something other than its textbook job —
   * the subtonic of an Andalusian cadence is not a dominant. ADR 0004 names
   * this as the field most likely to encode a wrong opinion invisibly.
   */
  fn?: HarmonicFunction;
  /** How much of the phrase this chord occupies. Halves are allowed. */
  bars: number;
}

export interface Template {
  id: string;
  name: string;
  modes: readonly Mode[];
  bars: number;
  steps: readonly TemplateStep[];
  /**
   * The cadence the template arrives at under its own steam, or null when it
   * is a loop that never closes. A template is only offered to a phrase whose
   * plan asks for the same cadence, or to one asking for a cadence it does not
   * claim — in which case enforcement rewrites the tail.
   */
  endsWith: CadenceType | null;
  minGrade: number;
  tags: readonly StyleTag[];
}

function s(
  bars: number, degree: Degree,
  options: Omit<TemplateStep, 'bars' | 'degree'> = {},
): TemplateStep {
  return { bars, degree, ...options };
}

function template(
  id: string, name: string, modes: readonly Mode[], bars: number,
  steps: TemplateStep[], endsWith: CadenceType | null, minGrade: number,
  tags: StyleTag[],
): Template {
  const got = steps.reduce((sum, step) => sum + step.bars, 0);
  if (got !== bars) throw new Error(`template ${id}: steps fill ${got} bars, declared ${bars}`);
  if (steps.length < 2) throw new Error(`template ${id}: a progression needs two chords`);
  return { id, name, modes, bars, steps, endsWith, minGrade, tags };
}

const BOTH: readonly Mode[] = ['major', 'minor'];
const MAJOR: readonly Mode[] = ['major'];
const MINOR: readonly Mode[] = ['minor'];

/**
 * The quality a degree takes when the template does not say.
 *
 * The one departure from the diatonic table is the minor dominant. A minor v
 * has no leading tone and therefore does not cadence; raising it is what makes
 * the chord a dominant at all, so it is the default and the modal v is a style
 * flag a template has to ask for by name.
 */
export function defaultTypeId(mode: Mode, degree: Degree, seventh = false): string {
  if (mode === 'minor' && degree === 5) return seventh ? 'dom7' : 'maj';
  return (seventh ? DIATONIC_SEVENTHS : DIATONIC_TRIADS)[mode][degree - 1];
}

export const TEMPLATES: readonly Template[] = [
  // --- the axis and its rotations ----------------------------------------
  // Four chords that between them carry most of the last seventy years of
  // popular music. The rotations are different progressions, not the same one
  // started elsewhere: where the loop begins decides what it sounds like.
  template('axis', 'I–V–vi–IV', MAJOR, 4,
    [s(1, 1), s(1, 5), s(1, 6), s(1, 4)], null, 1, ['pop', 'rock']),
  template('axis-vi', 'vi–IV–I–V', MAJOR, 4,
    [s(1, 6), s(1, 4), s(1, 1), s(1, 5)], 'HC', 1, ['pop', 'rock']),
  template('axis-iv', 'IV–I–V–vi', MAJOR, 4,
    [s(1, 4), s(1, 1), s(1, 5), s(1, 6)], 'DC', 2, ['pop', 'rock']),
  template('axis-v', 'V–vi–IV–I', MAJOR, 4,
    [s(1, 5), s(1, 6), s(1, 4), s(1, 1)], null, 2, ['pop', 'rock']),

  // --- the fifties loops --------------------------------------------------
  template('doo-wop', 'I–vi–IV–V', MAJOR, 4,
    [s(1, 1), s(1, 6), s(1, 4), s(1, 5)], 'HC', 1, ['pop', 'rock']),
  template('doo-wop-ii', 'I–vi–ii–V', MAJOR, 4,
    [s(1, 1), s(1, 6), s(1, 2), s(1, 5)], 'HC', 2, ['pop', 'jazz']),
  template('royal-road', 'IV–V–iii–vi', MAJOR, 4,
    [s(1, 4), s(1, 5), s(1, 3), s(1, 6)], null, 4, ['pop']),

  // --- two-fives ----------------------------------------------------------
  template('ii-V-I', 'ii–V–I', MAJOR, 4,
    [s(1, 2), s(1, 5), s(2, 1)], 'PAC', 3, ['jazz', 'classical']),
  // Named for the chords it contains: the tonic here is the plain triad the
  // steps ask for, and a cadence's tonic is rewritten to one in any case.
  template('ii7-V7-I', 'ii7–V7–I', MAJOR, 4,
    [s(1, 2, { typeId: 'min7' }), s(1, 5, { typeId: 'dom7' }), s(2, 1)],
    'PAC', 5, ['jazz']),
  template('ii-V', 'ii–V', MAJOR, 2,
    [s(1, 2), s(1, 5)], 'HC', 3, ['jazz', 'classical']),
  template('iiø-V-i', 'iiø7–V7–i', MINOR, 4,
    [s(1, 2, { typeId: 'm7b5' }), s(1, 5, { typeId: 'dom7' }), s(2, 1)],
    'PAC', 5, ['jazz']),

  // --- cadential two-bar units -------------------------------------------
  // The shortest thing that is still a progression, and what a four-bar period
  // is built from.
  template('V-I', 'V–I', BOTH, 2, [s(1, 5), s(1, 1)], 'PAC', 1, ['classical', 'folk']),
  template('I-V', 'I–V', BOTH, 2, [s(1, 1), s(1, 5)], 'HC', 1, ['classical', 'folk']),
  template('I-IV', 'I–IV', BOTH, 2, [s(1, 1), s(1, 4)], null, 1, ['folk', 'pop']),
  template('I-IV-V', 'I–IV–V', BOTH, 2,
    [s(0.5, 1), s(0.5, 4), s(1, 5)], 'HC', 2, ['folk']),
  template('plagal', 'IV–I', BOTH, 2, [s(1, 4), s(1, 1)], 'PC', 1, ['classical', 'folk']),
  template('i-VI', 'i–VI', MINOR, 2, [s(1, 1), s(1, 6, { fn: 'predominant' })],
    null, 2, ['pop', 'rock']),

  // --- four-bar closes ----------------------------------------------------
  template('folk', 'I–IV–V–I', MAJOR, 4,
    [s(1, 1), s(1, 4), s(1, 5), s(1, 1)], 'PAC', 1, ['folk', 'classical']),
  template('desc-fifths', 'iii–vi–ii–V–I', MAJOR, 4,
    [s(0.5, 3), s(0.5, 6), s(1, 2), s(1, 5), s(1, 1)], 'PAC', 4, ['classical', 'jazz']),
  template('desc-fifths-minor', 'III–VI–iiø7–V–i', MINOR, 4,
    [s(0.5, 3), s(0.5, 6, { fn: 'predominant' }), s(1, 2, { typeId: 'm7b5' }),
      s(1, 5), s(1, 1)], 'PAC', 5, ['classical', 'jazz']),
  template('minor-authentic', 'i–iv–V–i', MINOR, 4,
    [s(1, 1), s(1, 4), s(1, 5), s(1, 1)], 'PAC', 2, ['folk', 'classical']),
  template('cadential-four', 'I–vi–ii–V–I', MAJOR, 4,
    [s(1, 1), s(1, 6), s(0.5, 2), s(0.5, 5), s(1, 1)], 'PAC', 3, ['classical', 'jazz']),
  // A vii°6 standing in for the dominant closes an imperfect authentic
  // cadence, not a perfect one: the figure is the point and a PAC needs V in
  // root position.
  template('leading-tone-close', 'I–IV–viio6–I', MAJOR, 4,
    [s(1, 1), s(1, 4), s(1, 7, { typeId: 'dim', inversion: 1, fn: 'dominant' }), s(1, 1)],
    'IAC', 6, ['classical', 'baroque']),

  // --- modal loops --------------------------------------------------------
  // Numerals in a minor key are read against the natural minor here, which is
  // the convention `DIATONIC_TRIADS.minor` and `numeralText` already commit to:
  // the subtonic prints VII, not bVII, and carries no alteration.
  template('andalusian', 'i–VII–VI–V', MINOR, 4,
    [s(1, 1), s(1, 7, { fn: 'other' }), s(1, 6, { fn: 'predominant' }), s(1, 5)],
    'HC', 3, ['flamenco', 'rock', 'classical']),
  template('minor-axis', 'i–VI–III–VII', MINOR, 4,
    [s(1, 1), s(1, 6, { fn: 'predominant' }), s(1, 3), s(1, 7, { fn: 'other' })],
    null, 3, ['pop', 'rock']),
  template('phrygian-half', 'i–iv6–V', MINOR, 2,
    [s(0.5, 1), s(0.5, 4, { inversion: 1 }), s(1, 5)], 'HC', 5, ['classical', 'flamenco']),

  // --- eight bars ---------------------------------------------------------
  template('pachelbel', 'I–V–vi–iii–IV–I–IV–V', MAJOR, 8,
    [s(1, 1), s(1, 5), s(1, 6), s(1, 3), s(1, 4), s(1, 1), s(1, 4), s(1, 5)],
    'HC', 2, ['baroque', 'classical', 'pop']),
  template('pachelbel-head', 'I–V–vi–iii', MAJOR, 4,
    [s(1, 1), s(1, 5), s(1, 6), s(1, 3)], null, 2, ['baroque', 'pop']),
  // Rhythm changes, the A section. The bar-six iv is the borrowed chord the
  // tune is known for, and the bar-five I7 is a dominant of IV however it is
  // spelled, so it is written as one.
  template('rhythm-a', 'Rhythm changes A', MAJOR, 8, [
    s(0.5, 1), s(0.5, 6), s(0.5, 2), s(0.5, 5),
    s(0.5, 1), s(0.5, 6), s(0.5, 2), s(0.5, 5),
    s(0.5, 1), s(0.5, 5, { typeId: 'dom7', appliedTo: 4 }),
    s(0.5, 4), s(0.5, 4, { typeId: 'min' }),
    s(0.5, 1), s(0.5, 5), s(1, 1),
  ], 'PAC', 6, ['jazz']),
  // The bridge: four applied dominants round the circle, each resolving to the
  // next rather than to its own target. That chain is why the resolution test
  // asks for a chord *rooted on* the target rather than for the target itself.
  template('rhythm-b', 'Rhythm changes B', MAJOR, 8, [
    s(2, 5, { typeId: 'dom7', appliedTo: 6 }),
    s(2, 5, { typeId: 'dom7', appliedTo: 2 }),
    s(2, 5, { typeId: 'dom7', appliedTo: 5 }),
    s(2, 5, { typeId: 'dom7' }),
  ], 'HC', 7, ['jazz']),

  // La Folía, and the eight-bar descent that answers it. Both exist so a
  // minor key has eight-bar phrases of its own rather than falling back to the
  // machine every time the plan asks for one.
  template('folia', 'La Folía', MINOR, 8, [
    s(1, 1), s(1, 5), s(1, 1), s(1, 7, { fn: 'other' }),
    s(1, 3), s(1, 7, { fn: 'other' }), s(1, 1), s(1, 5),
  ], 'HC', 4, ['baroque', 'classical', 'flamenco']),
  template('minor-descent', 'i–VII–VI–III–iv–iiø7–V–i', MINOR, 8, [
    s(1, 1), s(1, 7, { fn: 'other' }), s(1, 6, { fn: 'predominant' }), s(1, 3),
    s(1, 4), s(1, 2, { typeId: 'm7b5' }), s(1, 5), s(1, 1),
  ], 'PAC', 5, ['classical', 'baroque']),

  // --- twelve-bar blues ---------------------------------------------------
  // All three end on the turnaround dominant, because within one chorus the
  // harmonic arrival is bar eleven and bar twelve exists to lead back. That is
  // a half cadence, and saying so is what keeps enforcement from rewriting the
  // form's last two bars into something no blues player has ever played.
  template('blues-12', 'Twelve-bar blues', BOTH, 12, [
    s(1, 1), s(1, 1), s(1, 1), s(1, 1),
    s(1, 4), s(1, 4), s(1, 1), s(1, 1),
    s(1, 5), s(1, 4), s(1, 1), s(1, 5),
  ], 'HC', 2, ['blues', 'folk']),
  template('blues-quick-change', 'Twelve-bar blues, quick change', MAJOR, 12, [
    s(1, 1, { typeId: 'dom7' }), s(1, 4, { typeId: 'dom7' }),
    s(1, 1, { typeId: 'dom7' }), s(1, 1, { typeId: 'dom7' }),
    s(1, 4, { typeId: 'dom7' }), s(1, 4, { typeId: 'dom7' }),
    s(1, 1, { typeId: 'dom7' }), s(1, 1, { typeId: 'dom7' }),
    s(1, 5, { typeId: 'dom7' }), s(1, 4, { typeId: 'dom7' }),
    s(1, 1, { typeId: 'dom7' }), s(1, 5, { typeId: 'dom7' }),
  ], 'HC', 5, ['blues', 'rock']),
  template('blues-jazz', 'Jazz blues', MAJOR, 12, [
    s(1, 1, { typeId: 'dom7' }), s(1, 4, { typeId: 'dom7' }), s(1, 1, { typeId: 'dom7' }),
    // ii7–V7 of IV, which is how the fourth bar leads into the subdominant.
    s(0.5, 2, { typeId: 'min7', appliedTo: 4 }), s(0.5, 5, { typeId: 'dom7', appliedTo: 4 }),
    s(1, 4, { typeId: 'dom7' }),
    s(1, 4, { typeId: 'dim7', chromaticAlter: 1, fn: 'dominant' }),
    s(1, 1, { typeId: 'dom7' }),
    s(1, 5, { typeId: 'dom7', appliedTo: 2 }),
    s(1, 2, { typeId: 'min7' }), s(1, 5, { typeId: 'dom7' }),
    s(0.5, 1, { typeId: 'dom7' }), s(0.5, 5, { typeId: 'dom7', appliedTo: 2 }),
    s(0.5, 2, { typeId: 'min7' }), s(0.5, 5, { typeId: 'dom7' }),
  ], 'HC', 8, ['jazz', 'blues']),
];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export function findTemplate(id: string): Template {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown template: ${id}`);
  return found;
}

export interface TemplateChord {
  numeral: RomanNumeral;
  bars: number;
}

/** A template's numerals in a mode, still key-independent. */
export function templateNumerals(t: Template, mode: Mode): TemplateChord[] {
  if (!t.modes.includes(mode)) throw new Error(`template ${t.id} is not written for ${mode}`);
  return t.steps.map((step) => ({
    bars: step.bars,
    numeral: numeral(step.degree, step.typeId ?? defaultTypeId(mode, step.degree, step.seventh), {
      chromaticAlter: step.chromaticAlter,
      inversion: step.inversion,
      appliedTo: step.appliedTo,
      fn: step.fn,
    }),
  }));
}

/**
 * What the template opens on, which decides whether it may follow a phrase
 * that ended on a dominant. A consequent beginning on ii after a half cadence
 * is the V–IV retrogression wearing a phrase boundary as a disguise.
 */
export function startsOn(t: Template, mode: Mode): HarmonicFunction {
  return templateNumerals(t, mode)[0].numeral.fn;
}

export function endsOn(t: Template, mode: Mode): HarmonicFunction {
  const chords = templateNumerals(t, mode);
  return chords[chords.length - 1].numeral.fn;
}

export interface TemplateQuery {
  bars: number;
  mode: Mode;
  grade: number;
  /** The cadence the phrase has been planned to take, or null for none. */
  cadence: CadenceType | null;
  style?: StyleTag;
  /** Set when the previous phrase ended on a dominant. */
  afterDominant?: boolean;
  /**
   * Exclude templates that *contain* an applied or borrowed chord, as
   * distinct from declining to add one (ADR 0017).
   *
   * Both default to permitting, so a caller that does not care is
   * unaffected. A caller that turns one off was previously told only that
   * no more would be added, and still got the ones the corpus quotes —
   * which made a settings toggle built on it honest at the grades where no
   * such template exists and dishonest at the grades where they do.
   */
  allowApplied?: boolean;
  allowBorrowed?: boolean;
}

/** A seventh's underlying triad, for comparing a step's quality to the mode's. */
const TRIAD_OF: Record<string, string> = {
  maj7: 'maj', dom7: 'maj', min7: 'min', minmaj7: 'min',
  m7b5: 'dim', dim7: 'dim', aug7: 'aug',
};

/**
 * Whether a step borrows from outside the mode.
 *
 * Mode-dependent, and it has to be. The first version of this read only
 * `chromaticAlter`, which catches `#ivo7` in the jazz blues and misses the
 * `IV–iv` in rhythm changes entirely — that one is written
 * `{ degree: 4, typeId: 'min' }`, borrowed by *quality* with the degree
 * unaltered. A filter that believed the first version let a borrowed chord
 * through whenever the template spelled it the other way.
 *
 * Reduced to the triad before comparing, so a `dom7` on V is a seventh and
 * not a loan. Applied chords are excluded because they are the other
 * flag's business, and the minor dominant and leading tone are excluded
 * because raising them is how a minor key cadences — that is practice, not
 * borrowing, and treating it as borrowing would exclude nearly every minor
 * template whenever the flag was off.
 */
function isBorrowedIn(step: TemplateStep, mode: Mode): boolean {
  if (step.appliedTo !== undefined) return false;
  if ((step.chromaticAlter ?? 0) !== 0) return true;
  if (step.typeId === undefined) return false;
  if (mode === 'minor' && (step.degree === 5 || step.degree === 7)) return false;
  return (TRIAD_OF[step.typeId] ?? step.typeId) !== DIATONIC_TRIADS[mode][step.degree - 1];
}

/**
 * Which templates carry these chords in their own data.
 *
 * Computed once here rather than per query. If a third such property
 * appears it should be declared on the entry instead, where `template()`
 * can check it at construction like everything else the corpus asserts
 * about itself.
 */
const CARRIES_APPLIED = new Set(
  TEMPLATES.filter((t) => t.steps.some((s) => s.appliedTo !== undefined)).map((t) => t.id),
);
/** Keyed by mode, because borrowing is relative to the mode borrowed into. */
const CARRIES_BORROWED = new Set(
  TEMPLATES.flatMap((t) => t.modes
    .filter((mode) => t.steps.some((step) => isBorrowedIn(step, mode)))
    .map((mode) => `${t.id}:${mode}`)),
);

/**
 * The templates that could fill a phrase.
 *
 * A template claiming a cadence the phrase does not want is excluded rather
 * than overwritten: rewriting the end of a progression that already closes
 * somewhere else produces the worst of both, and the corpus has enough entries
 * to say no. A template claiming none is fair game, and enforcement gives it
 * the ending the plan asked for.
 */
export function candidateTemplates(query: TemplateQuery): Template[] {
  return TEMPLATES.filter((t) => {
    if (t.bars !== query.bars) return false;
    if (!t.modes.includes(query.mode)) return false;
    if (t.minGrade > query.grade) return false;
    if (t.endsWith !== null && t.endsWith !== query.cadence) return false;
    if (query.style !== undefined && !t.tags.includes(query.style)) return false;
    if (query.afterDominant && startsOn(t, query.mode) === 'predominant') return false;
    if (query.allowApplied === false && CARRIES_APPLIED.has(t.id)) return false;
    if (query.allowBorrowed === false && CARRIES_BORROWED.has(`${t.id}:${query.mode}`)) return false;
    return true;
  });
}

/** Exact cadences first, so a phrase that closes itself is preferred to one rewritten. */
export function templateWeight(t: Template, query: TemplateQuery): number {
  let weight = t.endsWith === query.cadence ? 4 : 1;
  if (query.style !== undefined && t.tags[0] === query.style) weight += 2;
  return weight;
}
