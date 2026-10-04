import { makeRng, pick } from '../../theory/rng';
import { SCALE_TYPES, scaleType, spellScale, type ScaleType } from '../../theory/scale';
import { midiOf, parsePitch, pitchName, type Pitch } from '../../theory/pitch';
import { noteValue } from '../../theory/meter';
import { schedule } from '../../audio/output/schedule';
import type { Voice } from '../../audio/output/synth';
import type { Clef, ScoreSpec } from '../render/toVexflow';
import type {
  BaseSettings, ExerciseBase, ExerciseSpec, ItemId, Result, SettingsSchema,
} from '../types';

/**
 * Twenty scale types, named by ear or read off the staff.
 *
 * The question is the *type* and never the root, which is why the root is
 * drawn at random and the answer buttons say "Dorian" rather than "D
 * Dorian". A learner who only ever hears the modes from C learns the white
 * notes, not the modes — the same trap scale-degree identification avoids
 * by moving the key, and the reason both exercises transpose.
 *
 * Read aloud, the spelling matters and is not negotiable: a C blues wants
 * G♭ and G, not F♯ and G, and `spellScale` already chooses each accidental
 * by the staff step the scale asks for. The exercise draws what the theory
 * layer spells rather than respelling it.
 */

export const SCALE_EXERCISE_ID = 'scale-id';

export const CLEFS: readonly Clef[] = ['treble', 'bass', 'alto', 'tenor'];

/** How the scale sounds: up, down, or up and back. */
export type ScaleDirection = 'up' | 'down' | 'updown';

export const DIRECTION_LABELS: Record<ScaleDirection, string> = {
  up: 'Ascending',
  down: 'Descending',
  updown: 'Up and back down',
};

/**
 * Where to start the exercise: the four everyone meets first.
 *
 * A default rather than a tier. There is no "scale difficulty" setting and
 * there is not going to be one — which types you practise is the thing you
 * choose, and somebody working on the modes has no use for a dial that
 * reaches them only by also turning on the octatonics (ADR 0027).
 */
const STARTING_TYPES = ['major', 'natural_minor', 'harmonic_minor', 'melodic_minor'];

export interface ScaleSettings extends BaseSettings {
  /** Which scale types may be asked. Never empty; the panel refuses that. */
  types: readonly string[];
  direction: ScaleDirection;
  clef: Clef;
  /**
   * Whether the root moves between questions.
   *
   * On by default, because the type is the question. Off is for the
   * learner who wants to hear the modes against one tonic, which is a
   * real way to practise them and a different one.
   */
  transpose: boolean;
}

export interface ScaleExercise extends ExerciseBase {
  readonly type: typeof SCALE_EXERCISE_ID;
  readonly typeId: string;
  readonly root: Pitch;
  /** One ascending octave, spelled as the scale requires. */
  readonly pitches: readonly Pitch[];
  readonly direction: ScaleDirection;
  readonly clef: Clef;
  readonly choices: readonly string[];
}

export interface ScaleResponse {
  typeId: string;
  latencyMs?: number;
}

export const SCALE_DEFAULTS: ScaleSettings = {
  presentation: 'listen',
  types: STARTING_TYPES,
  direction: 'up',
  clef: 'treble',
  transpose: true,
};

/** The root when the exercise is not transposing: middle-ish, and plain. */
const FIXED_ROOT = parsePitch('C4');

/**
 * Roots drawn from, when it is.
 *
 * Spelled naturals and flats rather than every enharmonic: a scale on G♯
 * and one on A♭ sound identical and differ only in how they are written,
 * so offering both would make two questions out of one by ear and two
 * spellings of one answer by eye. The sharp keys a reader actually meets
 * are here; the double-sharp territory beyond them is not, because
 * `spellScale` would have to write triple accidentals for the altered
 * scales and nothing is learned from reading those.
 */
const ROOTS: readonly Pitch[] = [
  'C4', 'Db4', 'D4', 'Eb4', 'E4', 'F4', 'F#4', 'G4', 'Ab4', 'A4', 'Bb4', 'B4',
].map(parsePitch);

export function allowedTypes(settings: ScaleSettings): ScaleType[] {
  const wanted = settings.types.length ? settings.types : SCALE_DEFAULTS.types;
  // Through SCALE_TYPES rather than by mapping the ids, so the order the
  // buttons appear in is the catalogue's and not the stored list's.
  return SCALE_TYPES.filter((t) => wanted.includes(t.id));
}

/** The item is the type: that is the skill, and the root is deliberately not. */
export function scaleItems(settings: ScaleSettings): readonly ItemId[] {
  return allowedTypes(settings).map((t) => `scale:${t.id}` as ItemId);
}

export function generateScale(spec: ExerciseSpec<ScaleSettings>): ScaleExercise {
  const rng = makeRng(spec.seed);
  const settings = spec.settings;
  const types = allowedTypes(settings);
  const chosen = types.length > 0 ? pick(rng, types) : scaleType(SCALE_DEFAULTS.types[0]);
  const root = settings.transpose ? pick(rng, ROOTS) : FIXED_ROOT;

  return {
    type: SCALE_EXERCISE_ID,
    seed: spec.seed,
    presentation: settings.presentation,
    items: [`scale:${chosen.id}` as ItemId],
    typeId: chosen.id,
    root,
    pitches: spellScale(root, chosen),
    direction: settings.direction,
    clef: settings.clef,
    choices: types.map((t) => t.id),
  };
}

export function gradeScale(exercise: ScaleExercise, response: ScaleResponse): Result {
  const correct = response.typeId === exercise.typeId;
  const asked = scaleType(exercise.typeId);
  const on = pitchName(exercise.root, false);
  return {
    correct,
    feedback: correct
      ? `Yes — ${asked.name}, on ${on}.`
      : `That was ${asked.name}, on ${on}.`,
    outcomes: [
      { item: `scale:${exercise.typeId}` as ItemId, correct, latencyMs: response.latencyMs },
    ],
  };
}

/** Seconds between note onsets, and how long each is held. */
const STEP = 0.26;

/**
 * The scale, in the direction asked for.
 *
 * Up-and-back does not sound the top note twice: a scale turned around on
 * its octave is one gesture, and repeating the turning point makes it two.
 */
export function scaleVoices(exercise: ScaleExercise): Voice[] {
  const up = [...exercise.pitches, octaveAbove(exercise.pitches[0])];
  const order = exercise.direction === 'up' ? up
    : exercise.direction === 'down' ? [...up].reverse()
      : [...up, ...[...up].reverse().slice(1)];
  return schedule(
    order.map((pitch) => ({ midis: [midiOf(pitch)] })),
    { eventGap: STEP, rollGap: 0, hold: STEP * 1.6 },
  );
}

function octaveAbove(pitch: Pitch): Pitch {
  return { ...pitch, octave: pitch.octave + 1 };
}

/**
 * The scale on a staff, closing on the octave.
 *
 * Without a key signature, deliberately: the signature would name the scale
 * for anyone who can read one, which is the question. Every accidental is
 * written in, which is also how a mode or an altered scale is normally
 * printed when it is not the key of the piece.
 */
export function scaleScoreSpec(exercise: ScaleExercise): ScoreSpec {
  const pitches = [...exercise.pitches, octaveAbove(exercise.pitches[0])];
  return {
    notes: pitches.map((p) => ({ pitches: [p], value: noteValue('q') })),
    clef: exercise.clef,
  };
}

export function scaleQuestionSpec(exercise: ScaleExercise): ScoreSpec | null {
  return exercise.presentation === 'read' ? scaleScoreSpec(exercise) : null;
}

function coerceTypes(value: unknown, fallback: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) return fallback;
  const kept = SCALE_TYPES.filter((t) => value.includes(t.id)).map((t) => t.id);
  return kept.length ? kept : fallback;
}

export function coerceScaleSettings(stored: unknown): ScaleSettings {
  const raw = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>;
  const direction = raw.direction as ScaleDirection;
  return {
    presentation: raw.presentation === 'read' ? 'read' : 'listen',
    types: coerceTypes(raw.types, SCALE_DEFAULTS.types),
    direction: direction in DIRECTION_LABELS ? direction : SCALE_DEFAULTS.direction,
    clef: CLEFS.includes(raw.clef as Clef) ? raw.clef as Clef : SCALE_DEFAULTS.clef,
    transpose: raw.transpose !== false,
  };
}

export const scaleSettingsSchema: SettingsSchema<ScaleSettings> = {
  defaults: SCALE_DEFAULTS,
  coerce: coerceScaleSettings,
  fields: [
    {
      kind: 'choice', id: 'presentation', label: 'Asked',
      options: [{ id: 'listen', label: 'By ear' }, { id: 'read', label: 'By eye' }],
      selected: (s) => s.presentation,
      apply: (s, option) => ({ ...s, presentation: option === 'read' ? 'read' : 'listen' }),
    },
    {
      // Twenty chips, and the whole control. There is no family picker
      // beside them: the degree exercise had a preset picker over its own
      // chips and the two went out of step the moment one was unticked
      // (ADR 0027's shape, a level before it was named).
      kind: 'multi', id: 'types', label: 'Scales',
      options: SCALE_TYPES.map((t) => ({ id: t.id, label: t.name })),
      selected: (s) => s.types,
      apply: (s, options) => (options.length === 0 ? s : {
        ...s, types: coerceTypes(options, s.types),
      }),
    },
    {
      kind: 'choice', id: 'direction', label: 'Played',
      // Nothing is played when the scale is read.
      relevant: (s) => s.presentation === 'listen',
      options: (['up', 'down', 'updown'] as ScaleDirection[])
        .map((d) => ({ id: d, label: DIRECTION_LABELS[d] })),
      selected: (s) => s.direction,
      apply: (s, option) => ({
        ...s,
        direction: option in DIRECTION_LABELS ? option as ScaleDirection : s.direction,
      }),
    },
    {
      kind: 'toggle', id: 'transpose', label: 'Start from a different note each time',
      selected: (s) => s.transpose,
      apply: (s, on) => ({ ...s, transpose: on }),
    },
    {
      kind: 'choice', id: 'clef', label: 'Clef',
      // The staff is only drawn for the answer when listening, and the
      // answer is the scale's name — so the clef is a reading setting.
      relevant: (s) => s.presentation === 'read',
      options: CLEFS.map((c) => ({ id: c, label: c[0].toUpperCase() + c.slice(1) })),
      selected: (s) => s.clef,
      apply: (s, option) => ({
        ...s, clef: CLEFS.includes(option as Clef) ? option as Clef : s.clef,
      }),
    },
  ],
};
