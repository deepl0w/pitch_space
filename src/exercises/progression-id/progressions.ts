import { makeRng, pick } from '../../theory/rng';
import { ALL_KEYS, type Key, type Mode, keyId, keyName } from '../../theory/key';
import { type Pitch } from '../../theory/pitch';
import { noteValue, timeSignature } from '../../theory/meter';
import {
  CADENCE_NAMES, type CadenceType, type RomanNumeral, numeralText, realizePitches,
} from '../../theory/roman';
import { generateHarmony } from '../../generate/harmony';
import type { StyleTag } from '../../generate/templates';
import { establishingCadence } from '../../generate/tonicize';
import { ESTABLISHING, chordVoices } from '../cadence';
import type { Voice } from '../../audio/output/synth';
import type { Clef, ScoreNote, ScoreSpec } from '../render/toVexflow';
import { presentationField } from '../types';
import type {
  BaseSettings, ExerciseBase, ExerciseSpec, ItemId, Result, SettingsSchema,
} from '../types';

/**
 * Name each chord of a progression by what it is doing in the key.
 *
 * The answer is a roman numeral — a degree and a quality — and not a
 * voicing. That is the whole design constraint here, and everything below
 * follows from it.
 *
 * **Inversions are off.** A numeral with figures is a different answer from
 * the same numeral without them, so admitting inversions would turn a
 * palette of seven buttons into one of thirty and change the question from
 * "what is this chord doing" to "what is this chord doing and which note is
 * in the bass". Both are worth asking; they are not the same exercise, and
 * the second is unanswerable by ear for most learners at the point they can
 * do the first. The generator is told `allowInversions: false` rather than
 * the grader being told to ignore them, because a staff showing a figure the
 * user was never asked for would be marking its own answer as incomplete.
 *
 * **Borrowed chords are a setting, on the same terms as applied
 * dominants.** They were hardwired off, and the reason given was that they
 * are reachable only by numerals outside the mode's diatonic set, so a
 * palette that grew whenever the generator reached outside it would
 * announce the answer by its own shape. That is the right objection to a
 * palette that tracks the seed, and it is not an objection to a setting:
 * turning one on extends the palette for *every* question rather than only
 * the ones that use it, which is the difference between a harder exercise
 * and a tell. Applied dominants already worked this way.
 *
 * What the flag cost while it was hardwired was the last two templates no
 * query could reach — the iv in rhythm changes and the ♯iv°7 in jazz
 * blues, which `catalogues.test.ts` names and asks `candidateTemplates`
 * about directly. With this they are reachable, and the corpus is whole.
 *
 * A test asserts the containment both ways: every numeral the generator
 * produces is in the palette, and the palette does not depend on what this
 * particular seed produced.
 */

export const PROGRESSION_EXERCISE_ID = 'progression-id';

/** Where the answer is written. A progression is bass-and-chords, so grand-ish. */
export const CLEFS: readonly Clef[] = ['treble', 'bass'];

export interface ProgressionSettings extends BaseSettings {
  /**
   * Which traditions to draw progressions from. Empty means all of them.
   *
   * This and the four switches below replaced a single `grade` dial, and
   * the dial is what was wrong rather than its range. One number gated
   * six unrelated things — which templates, which chords were in the
   * vocabulary, sevenths at cadences, the Picardy third, sevenths on
   * applied dominants and the Neapolitan — so a learner who wanted to
   * drill twelve-bar blues had to accept half-diminished predominants
   * along with it, and one who wanted sevenths had to accept whatever
   * else grade 4 happened to include. None of those implications was
   * ever claimed by anyone; they are what you get when a list of
   * features is sorted and the sort becomes the only way in.
   */
  styles: readonly StyleTag[];
  /** ii7, V7, iiø7, and a seventh on a cadential or applied dominant. */
  sevenths: boolean;
  /** The diminished triads: vii° in major, ii° in minor. */
  diminished: boolean;
  /** A major tonic closing a minor progression. */
  picardy: boolean;
  /** The Neapolitan sixth. */
  neapolitan: boolean;
  /**
   * How long the progression is, asked for directly.
   *
   * Its own control rather than a consequence of the grade. The dial
   * used to decide both, so a learner who wanted six bars picked "3",
   * got eight, and was told afterwards — and moving to "4" changed
   * something invisible while the bar count stayed the same. A setting
   * whose only concrete fact is not the one that tracks it teaches the
   * user to stop touching it.
   *
   * The generator always supported any length; nothing but this field
   * was missing.
   */
  bars: number;
  modes: readonly Mode[];
  /**
   * Extends the palette with V/x.
   *
   * Says what it does, which it did not until ADR 0017: the generator flag
   * behind it used to gate only the pass that *added* applied dominants, so
   * a template written with one was quoted anyway and `V/IV` arrived from
   * grade 7 with the setting off. The control was therefore honest at
   * difficulties 1 to 3 and dishonest at 4 and 5. It excludes now.
   */
  appliedDominants: boolean;
  /**
   * Whether the generator may reach into the parallel mode.
   *
   * Extends the palette for every question while it is on, the same way
   * applied dominants do, so it is a harder exercise and not a tell.
   */
  borrowed: boolean;
  /**
   * Let the close be any of the five cadence types rather than whatever the
   * phrase plan asks for.
   *
   * ADR 0011 left three templates unreachable on the default path because
   * the planner only ever asks for a half cadence or a perfect authentic
   * one. This is the setting that reaches the other three, and it is a
   * teaching setting as much as a coverage one: a learner who only ever
   * hears V-I never learns to hear a deceptive close as deceptive.
   */
  varyCadence: boolean;
  clef: Clef;
}

export interface ProgressionExercise extends ExerciseBase {
  readonly type: typeof PROGRESSION_EXERCISE_ID;
  readonly keyId: string;
  /** One per chord, in order. The answer. */
  readonly numerals: readonly string[];
  /** The chord tones behind each numeral, for sounding and engraving. */
  readonly voicings: readonly (readonly Pitch[])[];
  readonly cadence: CadenceType | null;
  readonly clef: Clef;
  /** The cadence that puts the key in the ear, as chords. */
  readonly context: readonly (readonly Pitch[])[];
  /** Every numeral that may be chosen, in a fixed order. */
  readonly palette: readonly string[];
}

export interface ProgressionResponse {
  /** One numeral per slot; a slot the user left blank is the empty string. */
  numerals: readonly string[];
  latencyMs?: number;
}

/**
 * The lengths worth offering. The generator takes any of them — checked
 * from two to sixteen bars, every one generating cleanly — so this list is
 * a judgement about what is useful to practise and not a limit of the
 * engine.
 */
export const BAR_CHOICES = [2, 4, 6, 8, 12, 16] as const;

/** Every tradition the corpus is tagged with, in the order they are offered. */
export const STYLE_CHOICES: readonly StyleTag[] = [
  'classical', 'baroque', 'folk', 'pop', 'rock', 'jazz', 'blues', 'flamenco',
];

const STYLE_LABELS: Record<StyleTag, string> = {
  classical: 'Classical', baroque: 'Baroque', folk: 'Folk', pop: 'Pop',
  rock: 'Rock', jazz: 'Jazz', blues: 'Blues', flamenco: 'Flamenco',
};

export const PROGRESSION_DEFAULTS: ProgressionSettings = {
  styles: STYLE_CHOICES,
  sevenths: false,
  diminished: false,
  picardy: false,
  neapolitan: false,
  presentation: 'listen',
  bars: 4,
  modes: ['major'],
  appliedDominants: false,
  borrowed: false,
  varyCadence: false,
  clef: 'treble',
};

const ALL_CADENCES: readonly CadenceType[] = ['PAC', 'IAC', 'HC', 'DC', 'PC'];

/**
 * Every numeral the generator can produce in a mode, as a triad, with the
 * mode's own chords first in degree order.
 *
 * **Written out and locked by a test rather than derived.** Three
 * assumptions about where chords come from were wrong in a row, and each
 * one shipped a palette that could not answer its own question — most
 * usefully that `allowAppliedDominants` and `allowBorrowed` gated only the
 * passes that *added* those chords and let the corpus quote them anyway.
 * ADR 0017 made both flags exclude, so this list is now the short one it
 * always looked like it should be; before that fix it also had to carry a
 * borrowed `iv` and a `V/IV` that arrived with both flags off.
 *
 * The honest source is the generator, enumerated and asserted against on
 * every run. A palette that drifts behind it fails the containment test;
 * it cannot fail quietly.
 *
 * One palette per mode rather than per grade, though the reachable
 * set does grow with grade. A palette listing exactly what this grade
 * can produce would say how many chords are in play before the user had
 * named one.
 *
 * Every entry is reachable: the minor `v` is *not* here, because the modal
 * minor dominant is a style flag this exercise never sets, and an option
 * that can never be right is a control that lies about what it offers.
 */
const PALETTE: Record<Mode, readonly string[]> = {
  major: ['I', 'ii', 'iii', 'IV', 'V', 'vi'],
  // The Picardy third is reachable in minor without borrowing: raising the
  // leading tone is how a minor key cadences rather than a loan from
  // elsewhere.
  minor: ['i', 'III', 'iv', 'V', 'VI', 'VII', 'I'],
};

/**
 * What the diminished-triads setting adds.
 *
 * These sat in the base palette, which was right while a grade dial
 * decided them: the palette was deliberately blind to the grade, so it
 * listed vii° always and the generator produced it only above grade 6.
 * Measured, that left one button on screen that no setting could make
 * the right answer — the single over-listing this exercise had, and the
 * reason the schedule's item list could not promise an exact count.
 *
 * With a switch of its own there is nothing to be blind about. The
 * palette grows when the user turns diminished chords on, the same way
 * it grows for sevenths and borrowing, and the exercise stops offering
 * a chord it will not set.
 */
const DIMINISHED: Record<Mode, readonly string[]> = {
  major: ['viio'],
  minor: ['iio', '#viio'],
};

/**
 * What the applied-dominant setting adds.
 *
 * V/I is just V, and in major V/vii would tonicise a diminished triad,
 * which is not a key anything modulates to. **In minor the seventh degree
 * is not diminished** — it is the subtonic, a major triad, and tonicising
 * it is how a minor key reaches its relative major. `V/VII` was missing
 * here for one commit too many because the major-mode reason was applied
 * to a mode it is not true of.
 *
 * Found by sweeping the settings a user can set rather than the ones the
 * containment test swept. It was reachable in minor with applied dominants
 * at sixteen bars from grade 4 — so the generator asked for a chord with
 * no button under it, and a listener who named it correctly had no way to
 * say so.
 */
const APPLIED: Record<Mode, readonly string[]> = {
  major: ['V/II', 'V/III', 'V/IV', 'V/V', 'V/VI'],
  minor: ['V/III', 'V/IV', 'V/V', 'V/VI', 'V/VII'],
};

/**
 * What the borrowed-chord setting adds: the parallel mode's chords.
 *
 * Major borrows from minor, which is the common direction and the larger
 * list. Minor borrows the major fourth, and both modes reach the
 * Neapolitan. Enumerated from the generator over the whole settings space
 * rather than reasoned out, for the reason ADR 0017 records: three
 * assumptions in a row about where chords come from were wrong, and each
 * shipped a palette that could not answer its own question.
 */
const BORROWED: Record<Mode, readonly string[]> = {
  major: ['iv', 'iio', 'bII', 'bVI', 'bVII'],
  minor: ['IV', 'bII'],
};

/**
 * What only the two together reach, which is one template's worth.
 *
 * Jazz blues is twelve bars, carries a ♯iv°7 and a ii–V of IV, and is
 * excluded by either flag alone — so these two numerals need both open and
 * belong to neither list. A conjunction is worth the awkwardness of a
 * third table only because the alternative is offering buttons that cannot
 * be right, which is the complaint ADR 0011 makes about a catalogue entry
 * nothing can reach.
 */
const BORROWED_APPLIED: Record<Mode, readonly string[]> = {
  major: ['#ivo', 'ii/IV'],
  minor: [],
};

/**
 * Seventh chords are reduced to their triad before they are asked about.
 *
 * Telling V7 from V is a question about a chord's quality, which is what
 * the chord identification exercise is for; asking it here would double the
 * palette and change what this exercise trains. The seventh is dropped from
 * the sounding chord too rather than only from the answer, so what is heard
 * is what can be named — the alternative is a staff showing a note the
 * palette has no word for, which is how the inversion version of this
 * problem would have gone.
 */
const TRIAD_OF: Record<string, string> = {
  maj7: 'maj', dom7: 'maj', min7: 'min', minmaj7: 'min',
  m7b5: 'dim', dim7: 'dim', aug7: 'aug',
};

/**
 * Every numeral the user may choose.
 *
 * Depends on the mode and on one setting, and never on what this seed
 * produced: a palette listing exactly the numerals present would answer the
 * question.
 */
export function paletteFor(
  mode: Mode, { appliedDominants, borrowed, diminished }: PaletteOptions,
): string[] {
  return [
    ...PALETTE[mode],
    ...(diminished ? DIMINISHED[mode] : []),
    ...(appliedDominants ? APPLIED[mode] : []),
    ...(borrowed ? BORROWED[mode] : []),
    ...(appliedDominants && borrowed ? BORROWED_APPLIED[mode] : []),
  ];
}

/** The settings the palette depends on, named so a third cannot be forgotten. */
export interface PaletteOptions {
  appliedDominants: boolean;
  borrowed: boolean;
  diminished: boolean;
}

/**
 * Every numeral and cadence these settings can ask about.
 *
 * The palette is already exactly this list for the numerals — it is the
 * row of buttons the user picks from, and two tests hold it to being
 * neither larger nor smaller than what the generator produces. Deriving
 * the schedule from it rather than from a second enumeration means the
 * two cannot disagree.
 *
 * Numerals only. `generate` also attaches a `cadence:` item, and
 * `gradeProgression` never credits one — the user names chords, and the
 * cadence is a property of the progression rather than a separate
 * question. So a cadence is contained and not tested, the same way
 * `degree-id` contains the key it happened to pick, and putting it in
 * the schedule's denominator would add rows that nothing can ever
 * answer.
 */
export function progressionItems(settings: ProgressionSettings): readonly ItemId[] {
  const modes = settings.modes.length ? settings.modes : PROGRESSION_DEFAULTS.modes;
  return modes.flatMap(
    (mode) => paletteFor(mode, settings).map((n) => `progression:${mode}:${n}` as ItemId),
  );
}

export function generateProgression(
  spec: ExerciseSpec<ProgressionSettings>,
): ProgressionExercise {
  const rng = makeRng(spec.seed);
  const settings = spec.settings;
  const modes = settings.modes.length ? settings.modes : PROGRESSION_DEFAULTS.modes;
  const mode = pick(rng, modes);

  // Any key within four accidentals, so the exercise trains the function
  // rather than the chord names. Someone who only ever hears C major learns
  // "that was F", which is what this exercise exists not to teach.
  const key = pick(rng, ALL_KEYS.filter((k) => k.mode === mode && Math.abs(k.accidentals) <= 4));
  // A fallback and not the setting: a stored length from a release that
  // offered a different set, or a hand-edited one, lands here.
  const bars = BAR_CHOICES.includes(settings.bars as typeof BAR_CHOICES[number])
    ? settings.bars : PROGRESSION_DEFAULTS.bars;

  const harmony = generateHarmony(rng, {
    key,
    timeSignature: timeSignature('4/4'),
    bars,
    styles: settings.styles,
    sevenths: settings.sevenths,
    diminished: settings.diminished,
    picardy: settings.picardy,
    neapolitan: settings.neapolitan,
    // All three exclude rather than merely decline to add (ADR 0017), so
    // the palette is exactly what can be heard.
    allowInversions: false,
    allowBorrowed: settings.borrowed,
    allowAppliedDominants: settings.appliedDominants,
    cadences: settings.varyCadence ? { final: pick(rng, ALL_CADENCES) } : undefined,
  });

  const asked = harmony.events.map((e) => asTriad(e.numeral));
  const numerals = asked.map(numeralText);
  const voicings = asked.map((n) => realizePitches(key, n));
  const cadence = harmony.plan.phrases[harmony.plan.phrases.length - 1]?.cadence ?? null;

  return {
    type: PROGRESSION_EXERCISE_ID,
    seed: spec.seed,
    presentation: settings.presentation,
    // The item is the numeral in a mode, not the chord: a V in E flat and a
    // V in A are the same thing to learn, and keying on the chord would
    // split one skill across fifteen keys.
    items: [
      ...numerals.map((n) => `progression:${mode}:${n}` as ItemId),
      ...(cadence ? [`cadence:${cadence}` as ItemId] : []),
    ],
    keyId: keyId(key),
    numerals,
    voicings,
    cadence,
    clef: settings.clef,
    context: establishingCadence(key),
    palette: paletteFor(mode, settings),
  };
}

/**
 * The numeral as this exercise asks it: root position, triad.
 *
 * Inversions are already off at generation, so that half is a guard rather
 * than a transform — but `allowInversions: false` is the generator's
 * promise and this file's palette is what breaks if it is ever not kept.
 * The seventh is a real reduction, applied to the sounding chord as well as
 * to the answer.
 */
function asTriad(n: RomanNumeral): RomanNumeral {
  const typeId = TRIAD_OF[n.typeId] ?? n.typeId;
  return typeId === n.typeId && n.inversion === 0 ? n : { ...n, typeId, inversion: 0 };
}

export function gradeProgression(
  exercise: ProgressionExercise, response: ProgressionResponse,
): Result {
  const key = keyFor(exercise);
  const per = exercise.numerals.map((want, i) => response.numerals[i] === want);
  const right = per.filter(Boolean).length;
  const correct = right === exercise.numerals.length;

  return {
    correct,
    feedback: correct
      ? `Yes — ${exercise.numerals.join(' – ')} in ${keyName(key)}${cadenceTail(exercise)}.`
      : `${right} of ${exercise.numerals.length}. It was `
        + `${exercise.numerals.join(' – ')} in ${keyName(key)}${cadenceTail(exercise)}.`,
    // Per chord, not per progression: a learner who hears every chord but
    // the deceptive one has learned six things and missed one, and a single
    // verdict would teach the schedule they know none of them. ADR 0007.
    outcomes: exercise.numerals.map((want, i) => ({
      item: `progression:${key.mode}:${want}` as ItemId,
      correct: per[i],
      latencyMs: response.latencyMs,
    })),
  };
}

function cadenceTail(exercise: ProgressionExercise): string {
  return exercise.cadence ? `, closing on ${CADENCE_NAMES[exercise.cadence].toLowerCase()}` : '';
}

export function keyFor(exercise: ProgressionExercise): Key {
  return ALL_KEYS.find((k) => keyId(k) === exercise.keyId)!;
}

/**
 * The establishing cadence, a gap, then the progression as block chords.
 *
 * The gap matters more here than in the single-note exercises: without it
 * the establishing cadence is heard as the first three chords of the answer,
 * and the user counts wrong before they have heard anything.
 */
export function progressionVoices(exercise: ProgressionExercise): Voice[] {
  const voices = chordVoices(exercise.context, ESTABLISHING);
  const after = exercise.context.length * ESTABLISHING.eventGap + 0.5;
  // Slower and longer than the establishing cadence: this is the question
  // rather than the preamble, and it has to be followable.
  const body = chordVoices(exercise.voicings, { eventGap: 1.1, hold: 1.0 });
  return [...voices, ...body.map((v) => ({ ...v, start: v.start + after }))];
}

/** The progression engraved, one whole-note chord per slot. */
export function progressionScoreSpec(exercise: ProgressionExercise): ScoreSpec {
  const notes: ScoreNote[] = exercise.voicings.map((pitches) => ({
    pitches: [...pitches], value: noteValue('w'),
  }));
  return { notes, clef: exercise.clef, key: keyFor(exercise) };
}

export function progressionQuestionSpec(exercise: ProgressionExercise): ScoreSpec | null {
  // Reading it is harmonic analysis: the chords are on the staff and the
  // work is naming what each one is doing, which is the same skill by eye.
  return exercise.presentation === 'read' ? progressionScoreSpec(exercise) : null;
}


function coerceModes(value: unknown): readonly Mode[] {
  if (!Array.isArray(value)) return PROGRESSION_DEFAULTS.modes;
  const kept = value.filter((m): m is Mode => m === 'major' || m === 'minor');
  return kept.length ? [...new Set(kept)] : PROGRESSION_DEFAULTS.modes;
}

export const progressionSettings: SettingsSchema<ProgressionSettings> = {
  defaults: PROGRESSION_DEFAULTS,
  fields: [
    presentationField(),
    {
      kind: 'multi',
      id: 'styles',
      label: 'Styles',
      options: STYLE_CHOICES.map((t) => ({ id: t, label: STYLE_LABELS[t] })),
      selected: (s) => s.styles,
      // Refused when empty, like the other multi-selects: unticking your
      // last style is a slip, and the honest response is for the tick not
      // to come off. The generator reads an empty list as "all styles"
      // because a stored or hand-edited one can still arrive that way,
      // but the panel never produces one — a row of chips with none lit
      // cannot say whether it means everything or nothing.
      apply: (s, options) => (options.length === 0 ? s : {
        ...s, styles: STYLE_CHOICES.filter((t) => options.includes(t)),
      }),
    },
    {
      kind: 'choice',
      id: 'bars',
      // The unit goes in the caption and the options carry the number,
      // for the reason the accidental count does: "2 bars 4 bars 6 bars
      // 8 bars 12 bars 16 bars" says "bars" six times and wraps a single
      // choice onto two rows to do it.
      label: 'Length (bars)',
      options: BAR_CHOICES.map((b) => ({ id: `${b}`, label: `${b}` })),
      selected: (s) => `${s.bars}`,
      apply: (s, option) => ({ ...s, bars: Number(option) }),
    },
    {
      kind: 'multi',
      id: 'modes',
      label: 'Modes',
      options: [{ id: 'major', label: 'Major' }, { id: 'minor', label: 'Minor' }],
      selected: (s) => [...s.modes],
      apply: (s, options) => ({ ...s, modes: coerceModes(options) }),
    },
    {
      kind: 'choice',
      id: 'clef',
      label: 'Clef',
      options: [{ id: 'treble', label: 'Treble' }, { id: 'bass', label: 'Bass' }],
      selected: (s) => s.clef,
      apply: (s, option) => ({ ...s, clef: option === 'bass' ? 'bass' : 'treble' }),
    },
    /*
      The switches are named and not explained. Each carried a
      parenthetical gloss — "(V of a chord other than the tonic)",
      "(vii° in major, ii° in minor)" — which read well while there were
      two of them and turned the panel into a wall of wrapped uppercase
      at seven. These are standard terms for anyone practising chord
      progressions by ear, and the readout names every chord it played
      after each answer, which teaches them better than a label can.
    */
    {
      kind: 'toggle',
      id: 'appliedDominants',
      label: 'Applied dominants',
      // Captions the whole run; the rest of it says nothing.
      group: 'Harmony in play',
      selected: (s) => s.appliedDominants,
      apply: (s, on) => ({ ...s, appliedDominants: on }),
    },
    {
      kind: 'toggle',
      id: 'sevenths',
      label: 'Sevenths',
      selected: (s) => s.sevenths,
      apply: (s, on) => ({ ...s, sevenths: on }),
    },
    {
      kind: 'toggle',
      id: 'diminished',
      label: 'Diminished triads',
      selected: (s) => s.diminished,
      apply: (s, on) => ({ ...s, diminished: on }),
    },
    {
      kind: 'toggle',
      id: 'picardy',
      label: 'Picardy third',
      // Nothing to close major when nothing is in minor.
      relevant: (s) => s.modes.includes('minor'),
      selected: (s) => s.picardy,
      apply: (s, on) => ({ ...s, picardy: on }),
    },
    {
      kind: 'toggle',
      id: 'neapolitan',
      label: 'Neapolitan sixth',
      // The Neapolitan is reached through the borrowing pass — it is one of
      // the chromatic predominants `borrowedOptions` offers — so with
      // borrowing off this switch could be ticked and did nothing at all.
      // Declaring the dependency rather than removing it: asking for a bII6
      // while refusing borrowed chords is a contradiction, and the panel
      // drops a field that says it is irrelevant.
      relevant: (s) => s.borrowed,
      selected: (s) => s.neapolitan,
      apply: (s, on) => ({ ...s, neapolitan: on }),
    },
    {
      kind: 'toggle',
      id: 'borrowed',
      label: 'Borrowed chords',
      selected: (s) => s.borrowed,
      apply: (s, on) => ({ ...s, borrowed: on }),
    },
    {
      kind: 'toggle',
      id: 'varyCadence',
      label: 'Vary the close',
      selected: (s) => s.varyCadence,
      apply: (s, on) => ({ ...s, varyCadence: on }),
    },
  ],
  coerce(stored: unknown): ProgressionSettings {
    const raw = (typeof stored === 'object' && stored !== null ? stored : {}) as
      Record<string, unknown>;
    return {
      styles: Array.isArray(raw.styles) && raw.styles.length > 0
        ? STYLE_CHOICES.filter((t) => (raw.styles as unknown[]).includes(t))
        : PROGRESSION_DEFAULTS.styles,
      sevenths: raw.sevenths === true,
      diminished: raw.diminished === true,
      picardy: raw.picardy === true,
      neapolitan: raw.neapolitan === true,
      presentation: raw.presentation === 'read' ? 'read' : 'listen',
      bars: BAR_CHOICES.includes(raw.bars as typeof BAR_CHOICES[number])
        ? raw.bars as number : PROGRESSION_DEFAULTS.bars,
      modes: coerceModes(raw.modes),
      appliedDominants: raw.appliedDominants === true,
      borrowed: raw.borrowed === true,
      varyCadence: raw.varyCadence === true,
      clef: CLEFS.includes(raw.clef as Clef) ? raw.clef as Clef : PROGRESSION_DEFAULTS.clef,
    };
  },
};

