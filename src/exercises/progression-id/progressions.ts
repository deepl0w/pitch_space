import { makeRng, pick } from '../../theory/rng';
import { ALL_KEYS, type Key, type Mode, keyId, keyName } from '../../theory/key';
import { midiOf, type Pitch } from '../../theory/pitch';
import { noteValue, timeSignature } from '../../theory/meter';
import {
  CADENCE_NAMES, type CadenceType, type RomanNumeral, numeralText, realizePitches,
} from '../../theory/roman';
import { generateHarmony } from '../../generate/harmony';
import { cadencePitches } from '../../generate/tonicize';
import { schedule } from '../../audio/output/schedule';
import type { Voice } from '../../audio/output/synth';
import type { Clef, ScoreNote, ScoreSpec } from '../render/toVexflow';
import type {
  BaseSettings, Difficulty, ExerciseBase, ExerciseSpec, ItemId, Result, SettingsSchema,
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
 * **Borrowed chords are off for the same reason**: they are reachable only
 * by numerals outside the mode's diatonic set, and a palette that grew
 * whenever the generator reached outside it would announce the answer by its
 * own shape. Applied dominants are a setting, and turning them on extends
 * the palette for *every* question rather than only the ones that use them —
 * which is the difference between a harder exercise and a tell.
 *
 * A test asserts the containment both ways: every numeral the generator
 * produces is in the palette, and the palette does not depend on what this
 * particular seed produced.
 */

export const PROGRESSION_EXERCISE_ID = 'progression-id';

/** Where the answer is written. A progression is bass-and-chords, so grand-ish. */
export const CLEFS: readonly Clef[] = ['treble', 'bass'];

export interface ProgressionSettings extends BaseSettings {
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
  /** The cadence that puts the key in the ear before the question. */
  readonly context: readonly Pitch[];
  /** Every numeral that may be chosen, in a fixed order. */
  readonly palette: readonly string[];
}

export interface ProgressionResponse {
  /** One numeral per slot; a slot the user left blank is the empty string. */
  numerals: readonly string[];
  latencyMs?: number;
}

/**
 * How many chords a difficulty asks for, and how much the generator may use.
 *
 * Exported because it is the only difficulty-to-grade mapping the codebase
 * has, which makes it the query every catalogue is measured against — ADR
 * 0021 measures the rhythm cells through it and found two stranded above its
 * top grade. Asserting that against the real table rather than a copy of its
 * numbers is what makes the finding fail if someone narrows a band.
 */
export const SHAPE_AT: Record<Difficulty, { bars: number; grade: number }> = {
  1: { bars: 4, grade: 2 },
  2: { bars: 4, grade: 4 },
  3: { bars: 8, grade: 5 },
  4: { bars: 8, grade: 7 },
  5: { bars: 8, grade: 9 },
};

/** What actually differs between the five, in the user's terms. */
const DIFFICULTY_BLURBS: Record<Difficulty, string> = {
  1: 'four bars, the plainest progressions',
  2: 'four bars, a wider corpus',
  3: 'eight bars',
  4: 'eight bars, sevenths and inversions',
  5: 'eight bars, everything',
};

export const PROGRESSION_DEFAULTS: ProgressionSettings = {
  difficulty: 2,
  presentation: 'listen',
  modes: ['major'],
  appliedDominants: false,
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
 * One palette per mode rather than per difficulty, though the reachable
 * set does grow with grade. A palette listing exactly what this difficulty
 * can produce would say how many chords are in play before the user had
 * named one.
 *
 * Every entry is reachable: the minor `v` is *not* here, because the modal
 * minor dominant is a style flag this exercise never sets, and an option
 * that can never be right is a control that lies about what it offers.
 */
const PALETTE: Record<Mode, readonly string[]> = {
  major: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'viio'],
  // The Picardy third and the raised leading-tone diminished triad are both
  // reachable in minor without borrowing: raising the leading tone is how a
  // minor key cadences rather than a loan from elsewhere.
  minor: ['i', 'iio', 'III', 'iv', 'V', 'VI', 'VII', 'I', '#viio'],
};

/**
 * What the applied-dominant setting adds. V/I is just V, and V/vii would
 * tonicise a diminished triad, which is not a key anything modulates to.
 */
const APPLIED: Record<Mode, readonly string[]> = {
  major: ['V/II', 'V/III', 'V/IV', 'V/V', 'V/VI'],
  minor: ['V/III', 'V/IV', 'V/V', 'V/VI'],
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
export function paletteFor(mode: Mode, appliedDominants: boolean): string[] {
  return appliedDominants ? [...PALETTE[mode], ...APPLIED[mode]] : [...PALETTE[mode]];
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
  const shape = SHAPE_AT[settings.difficulty];

  const harmony = generateHarmony(rng, {
    key,
    timeSignature: timeSignature('4/4'),
    bars: shape.bars,
    grade: shape.grade,
    // All three exclude rather than merely decline to add (ADR 0017), so
    // the palette is exactly what can be heard.
    allowInversions: false,
    allowBorrowed: false,
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
    context: cadencePitches(key),
    palette: paletteFor(mode, settings.appliedDominants),
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
  const context = chunk(exercise.context, 3);
  const voices = schedule(
    context.map((midis) => ({ midis: midis.map(midiOf) })),
    { eventGap: 0.55, rollGap: 0, hold: 0.5 },
  );
  const after = context.length * 0.55 + 0.5;
  const body = schedule(
    exercise.voicings.map((pitches) => ({ midis: pitches.map(midiOf) })),
    { eventGap: 1.1, rollGap: 0, hold: 1.0 },
  );
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

function chunk(pitches: readonly Pitch[], size: number): Pitch[][] {
  const out: Pitch[][] = [];
  for (let i = 0; i < pitches.length; i += size) out.push(pitches.slice(i, i + size));
  return out;
}

function coerceModes(value: unknown): readonly Mode[] {
  if (!Array.isArray(value)) return PROGRESSION_DEFAULTS.modes;
  const kept = value.filter((m): m is Mode => m === 'major' || m === 'minor');
  return kept.length ? [...new Set(kept)] : PROGRESSION_DEFAULTS.modes;
}

export const progressionSettings: SettingsSchema<ProgressionSettings> = {
  defaults: PROGRESSION_DEFAULTS,
  fields: [
    {
      kind: 'choice',
      id: 'presentation',
      label: 'How',
      options: [{ id: 'listen', label: 'Hear it' }, { id: 'read', label: 'Read it' }],
      selected: (s) => s.presentation,
      apply: (s, option) => ({ ...s, presentation: option === 'read' ? 'read' : 'listen' }),
    },
    {
      kind: 'choice',
      id: 'difficulty',
      label: 'Difficulty',
      // Named rather than measured in bars. The label used to read
      // "1 — 4 bars" through "5 — 8 bars", where the one concrete fact in
      // it was not what moved: two levels share four bars and three share
      // eight, while the thing that actually changes across all five is
      // how much of the corpus and how many devices are in play. A label
      // whose only number is the one that does not track the setting
      // teaches the wrong thing about the setting.
      options: ([1, 2, 3, 4, 5] as Difficulty[]).map((d) => ({
        id: `${d}`, label: `${d} — ${DIFFICULTY_BLURBS[d]}`,
      })),
      selected: (s) => `${s.difficulty}`,
      apply: (s, option) => ({ ...s, difficulty: coerceDifficulty(Number(option)) }),
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
    {
      kind: 'toggle',
      id: 'appliedDominants',
      label: 'Applied dominants (V of a chord other than the tonic)',
      selected: (s) => s.appliedDominants,
      apply: (s, on) => ({ ...s, appliedDominants: on }),
    },
    {
      kind: 'toggle',
      id: 'varyCadence',
      label: 'Vary the close (not every phrase ends V–I)',
      selected: (s) => s.varyCadence,
      apply: (s, on) => ({ ...s, varyCadence: on }),
    },
  ],
  coerce(stored: unknown): ProgressionSettings {
    const raw = (typeof stored === 'object' && stored !== null ? stored : {}) as
      Record<string, unknown>;
    return {
      difficulty: coerceDifficulty(raw.difficulty),
      presentation: raw.presentation === 'read' ? 'read' : 'listen',
      modes: coerceModes(raw.modes),
      appliedDominants: raw.appliedDominants === true,
      varyCadence: raw.varyCadence === true,
      clef: CLEFS.includes(raw.clef as Clef) ? raw.clef as Clef : PROGRESSION_DEFAULTS.clef,
    };
  },
};

function coerceDifficulty(value: unknown): Difficulty {
  const n = Number(value);
  return (Number.isInteger(n) && n >= 1 && n <= 5 ? n : PROGRESSION_DEFAULTS.difficulty) as Difficulty;
}
