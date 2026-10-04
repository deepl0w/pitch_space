import { makeRng, pick } from '../../theory/rng';
import { ALL_KEYS, type Mode, keyId, keyName, keyPitches } from '../../theory/key';
import { midiOf, pitchName, type Pitch } from '../../theory/pitch';
import { noteValue } from '../../theory/meter';
import { establishingCadence } from '../../generate/tonicize';
import { ESTABLISHING, chordVoices } from '../cadence';
import type { Voice } from '../../audio/output/synth';
import type { Clef, ScoreSpec } from '../render/toVexflow';
import type {
  BaseSettings, Difficulty, ExerciseBase, ExerciseSpec, ItemId, Result, SettingsSchema,
} from '../types';

/**
 * Functional ear training: a key is established, then one note sounds, and
 * the answer is what that note is *doing* in the key.
 *
 * Distinct from interval identification on purpose, and the distinction is
 * the point of having both. Naming the gap between two notes is a
 * measurement; naming a degree is hearing a pitch's pull towards a tonic,
 * and the movable-do tradition holds that the first does not transfer to
 * reading real music while the second does. Whether that is right is a
 * question about what the app teaches, so the app offers both rather than
 * choosing.
 *
 * It is also a different question with different answers, which is why it is
 * a separate exercise rather than a setting on the other one.
 */

export const DEGREE_EXERCISE_ID = 'degree-id';

export const CLEFS: readonly Clef[] = ['treble', 'bass', 'alto', 'tenor'];

/** How a degree is named. Both traditions, because both are taught. */
export type DegreeNaming = 'number' | 'solfege';

const SOLFEGE_MAJOR = ['do', 're', 'mi', 'fa', 'sol', 'la', 'ti'];
// Movable do, la-based minor: the relative major's syllables, started on la.
const SOLFEGE_MINOR = ['la', 'ti', 'do', 're', 'mi', 'fa', 'sol'];

export function degreeLabelFor(degree: number, mode: Mode, naming: DegreeNaming): string {
  if (naming === 'number') return `${degree}`;
  return (mode === 'major' ? SOLFEGE_MAJOR : SOLFEGE_MINOR)[degree - 1];
}

export interface DegreeSettings extends BaseSettings {
  /** Which degrees may be asked, 1-7. */
  degrees: readonly number[];
  modes: readonly Mode[];
  naming: DegreeNaming;
  clef: Clef;
  /** Re-establish the key before every question, or only at the start. */
  reestablish: boolean;
}

export interface DegreeExercise extends ExerciseBase {
  readonly type: typeof DEGREE_EXERCISE_ID;
  readonly keyId: string;
  readonly degree: number;
  readonly pitch: Pitch;
  readonly clef: Clef;
  /**
   * The cadence that puts the key in the ear, as chords; empty when it is
   * not resounded.
   *
   * Chords rather than a flat list, because `establishingCadence` already
   * returns them grouped and the flat form had to be guessed back into
   * threes by every caller — a guess about what `spellChord` returns, and
   * wrong the moment any chord in the progression takes a seventh.
   */
  readonly context: readonly (readonly Pitch[])[];
  readonly choices: readonly number[];
}

export interface DegreeResponse {
  degree: number;
  latencyMs?: number;
}

/** How far from the tonic a difficulty reaches. */
const DEGREES_AT: Record<Difficulty, number[]> = {
  // The tonic triad first: the three notes a key is built on, and the ones
  // whose pull is most obvious.
  1: [1, 3, 5],
  2: [1, 2, 3, 5],
  3: [1, 2, 3, 4, 5],
  4: [1, 2, 3, 4, 5, 6],
  5: [1, 2, 3, 4, 5, 6, 7],
};

/**
 * The preset whose degree set this is, or null for a set somebody built by
 * hand.
 *
 * The scope picker and the degree chips control the same property, and a
 * picker that keeps claiming "the whole scale" after two degrees are
 * unticked is a control lying about the state it is showing. Deriving the
 * picker's value from the degrees makes the chips the single source and the
 * picker a shortcut into it.
 */
export function presetFor(degrees: readonly number[]): Difficulty | null {
  const wanted = [...degrees].sort((a, b) => a - b).join(',');
  for (const level of [1, 2, 3, 4, 5] as Difficulty[]) {
    if (DEGREES_AT[level].join(',') === wanted) return level;
  }
  return null;
}

export const DEGREE_DEFAULTS: DegreeSettings = {
  difficulty: 2,
  presentation: 'listen',
  degrees: DEGREES_AT[2],
  modes: ['major'],
  naming: 'number',
  clef: 'treble',
  reestablish: true,
};

export function generateDegree(spec: ExerciseSpec<DegreeSettings>): DegreeExercise {
  const rng = makeRng(spec.seed);
  const settings = spec.settings;
  const modes = settings.modes.length ? settings.modes : DEGREE_DEFAULTS.modes;
  const mode = pick(rng, modes);

  // Any key, so the exercise trains the function rather than the pitch. A
  // learner who only ever hears C major learns "that was E", which is the
  // thing this exercise exists not to teach.
  const keys = ALL_KEYS.filter((k) => k.mode === mode && Math.abs(k.accidentals) <= 4);
  const key = pick(rng, keys);

  const allowed = settings.degrees.length ? settings.degrees : DEGREE_DEFAULTS.degrees;
  const degree = pick(rng, allowed);
  const scale = keyPitches({ ...key, tonic: { ...key.tonic, octave: 4 } });
  const pitch = scale[degree - 1];

  return {
    type: DEGREE_EXERCISE_ID,
    seed: spec.seed,
    presentation: settings.presentation,
    items: [
      // The item is the degree in a mode, not the pitch: that is the skill.
      `degree:${degree}:${mode}` as ItemId,
      `key:${keyId(key)}` as ItemId,
    ],
    keyId: keyId(key),
    degree,
    pitch,
    clef: settings.clef,
    context: settings.reestablish ? establishingCadence(key) : [],
    choices: [...allowed].sort((a, b) => a - b),
  };
}

export function gradeDegree(
  exercise: DegreeExercise, response: DegreeResponse, naming: DegreeNaming = 'number',
): Result {
  const correct = response.degree === exercise.degree;
  const key = ALL_KEYS.find((k) => keyId(k) === exercise.keyId)!;
  const said = degreeLabelFor(exercise.degree, key.mode, naming);
  return {
    correct,
    feedback: correct
      ? `Yes — ${said}, which is ${pitchName(exercise.pitch, false)} in ${keyName(key)}.`
      : `That was ${said} — ${pitchName(exercise.pitch, false)} in ${keyName(key)}.`,
    outcomes: [
      { item: `degree:${exercise.degree}:${key.mode}` as ItemId, correct, latencyMs: response.latencyMs },
    ],
  };
}

/**
 * The cadence, then the note.
 *
 * A gap after the context, so the question is heard as a question rather
 * than as a fifth chord.
 */
export function degreeVoices(exercise: DegreeExercise): Voice[] {
  const voices = chordVoices(exercise.context, ESTABLISHING);
  const after = exercise.context.length === 0
    ? 0
    : exercise.context.length * ESTABLISHING.eventGap + 0.35;
  voices.push({ midi: midiOf(exercise.pitch), start: after, duration: 1.4 });
  return voices;
}


/** Shown once answered, or as the question when the exercise is read. */
export function degreeScoreSpec(exercise: DegreeExercise): ScoreSpec {
  const key = ALL_KEYS.find((k) => keyId(k) === exercise.keyId)!;
  return { notes: [{ pitches: [exercise.pitch], value: noteValue('w') }], clef: exercise.clef, key };
}

export function degreeQuestionSpec(exercise: DegreeExercise): ScoreSpec | null {
  // Reading it means seeing the note against the key signature and working
  // out its degree — the same skill through the eye.
  return exercise.presentation === 'read' ? degreeScoreSpec(exercise) : null;
}

function coerceDegrees(value: unknown, fallback: readonly number[]): readonly number[] {
  if (!Array.isArray(value)) return fallback;
  const kept = [...new Set(value.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7))]
    .sort((a, b) => a - b);
  return kept.length ? kept : fallback;
}

export function coerceDegreeSettings(stored: unknown): DegreeSettings {
  const raw = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>;
  const difficulty = ([1, 2, 3, 4, 5] as const).includes(raw.difficulty as Difficulty)
    ? raw.difficulty as Difficulty
    : DEGREE_DEFAULTS.difficulty;
  const modes: Mode[] = (['major', 'minor'] as Mode[])
    .filter((m) => Array.isArray(raw.modes) && raw.modes.includes(m));
  return {
    difficulty,
    presentation: raw.presentation === 'read' ? 'read' : 'listen',
    degrees: coerceDegrees(raw.degrees, DEGREES_AT[difficulty]),
    modes: modes.length ? modes : DEGREE_DEFAULTS.modes,
    naming: raw.naming === 'solfege' ? 'solfege' : 'number',
    clef: CLEFS.includes(raw.clef as Clef) ? raw.clef as Clef : DEGREE_DEFAULTS.clef,
    reestablish: raw.reestablish !== false,
  };
}

export const degreeSettingsSchema: SettingsSchema<DegreeSettings> = {
  defaults: DEGREE_DEFAULTS,
  coerce: coerceDegreeSettings,
  fields: [
    {
      kind: 'choice', id: 'presentation', label: 'Asked',
      options: [{ id: 'listen', label: 'By ear' }, { id: 'read', label: 'By eye' }],
      selected: (s) => s.presentation,
      apply: (s, option) => ({ ...s, presentation: option === 'read' ? 'read' : 'listen' }),
    },
    {
      // The only control over which degrees are asked. There was a preset
      // picker beside it and the two went out of step the moment a chip was
      // unticked — the picker kept saying "the whole scale" over five
      // degrees. A preset that cannot be read back is also a control the
      // contract test rightly refuses, since selecting it changes nothing.
      // The presets survive as the default rather than as a second control.
      kind: 'multi', id: 'degrees', label: 'Degrees',
      options: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ id: String(d), label: String(d) })),
      selected: (s) => s.degrees.map(String),
      apply: (s, options) => {
        if (options.length === 0) return s;
        const degrees = coerceDegrees(options.map(Number), s.degrees);
        // Keep the shared ordinal meaning something: where the hand-picked
        // set happens to be a preset, say so.
        return { ...s, degrees, difficulty: presetFor(degrees) ?? s.difficulty };
      },
    },
    {
      kind: 'multi', id: 'modes', label: 'Modes',
      options: [{ id: 'major', label: 'Major' }, { id: 'minor', label: 'Minor' }],
      selected: (s) => s.modes,
      apply: (s, options) => (options.length === 0 ? s : {
        ...s, modes: (['major', 'minor'] as Mode[]).filter((m) => options.includes(m)),
      }),
    },
    {
      kind: 'choice', id: 'naming', label: 'Named as',
      options: [
        { id: 'number', label: 'Numbers (1 2 3)' },
        { id: 'solfege', label: 'Solfège (do re mi)' },
      ],
      selected: (s) => s.naming,
      apply: (s, option) => ({ ...s, naming: option === 'solfege' ? 'solfege' : 'number' }),
    },
    {
      kind: 'toggle', id: 'reestablish', label: 'Re-establish the key each time',
      selected: (s) => s.reestablish,
      apply: (s, on) => ({ ...s, reestablish: on }),
    },
  ],
};
