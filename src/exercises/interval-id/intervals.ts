import { makeRng, pick, rngInt, chance } from '../../theory/rng';
import { diatonicOf, midiOf, pitchFromMidi, pitchName, respell, type Pitch } from '../../theory/pitch';
import {
  directedIntervalName, intervalBetween, intervalName,
  INTERVAL_MNEMONICS, SIMPLE_INTERVAL_NAMES,
} from '../../theory/interval';
import { noteValue } from '../../theory/meter';
import { schedule } from '../../audio/output/schedule';
import type { Voice } from '../../audio/output/synth';
import type { Clef, ScoreNote } from '../render/toVexflow';
import type {
  Difficulty, ExerciseBase, ExerciseSpec, ItemId, Result, SettingsSchema,
} from '../types';

/**
 * Interval identification: two notes sound, the user says which interval
 *
 * Everything in this file is a pure function of its arguments. The component
 * next door renders it and the screen records the result; the claims live
 * here, where a property test can reach them over ten thousand seeds.
 */

export const INTERVAL_EXERCISE_ID = 'interval-id';

export type IntervalDirection = 'up' | 'down' | 'harmonic';

/** Canonical order, so a settings list does not depend on insertion order. */
export const INTERVAL_DIRECTIONS: readonly IntervalDirection[] = ['up', 'down', 'harmonic'];

/** The widest interval this exercise presents, and the widest it has names for. */
export const MAX_SEMITONES = 12;

/**
 * Ear-training names, by semitone distance, as item-id slugs.
 *
 * Semitones rather than spelling, because this is an ear-training exercise:
 * an augmented fourth and a diminished fifth are the same sound, nobody can
 * hear which one was written, and a schedule that tracked them as two items
 * would be tracking something the user was never asked. `tritone` is the name
 * that admits this, and it is the one docs/ROADMAP.md already uses.
 *
 * These strings are part of every item id, so they are a compatibility
 * commitment from the first release. See ADR 0007.
 */
export const INTERVAL_SLUGS: readonly string[] = [
  'unison', 'm2', 'M2', 'm3', 'M3', 'P4', 'tritone', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8',
];

/**
 * The item a presentation of this interval exercises: `interval:m3:up`.
 *
 * A unison gets two segments rather than three. Played up and played down it
 * is the same sound and the same skill, so collapsing it keeps one history
 * instead of three that can never be told apart — and the theory layer agrees,
 * since `intervalBetween` reports no direction for a unison at all. Item ids
 * already vary in arity across kinds (`chord:m7b5` against `chord:dom7:inv2`),
 * so this costs nothing a parser was not already paying.
 */
export function intervalItemId(semitones: number, direction: IntervalDirection): ItemId {
  const slug = INTERVAL_SLUGS[semitones];
  if (slug === undefined) throw new Error(`No interval slug for ${semitones} semitones`);
  return semitones === 0 ? 'interval:unison' : `interval:${slug}:${direction}`;
}

/* -- settings ------------------------------------------------------------- */

export interface IntervalSettings {
  difficulty: Difficulty;
  /** Semitone distances that may be drawn, ascending and distinct. */
  semitones: readonly number[];
  directions: readonly IntervalDirection[];
  clef: Clef;
}

const CLEFS: readonly Clef[] = ['treble', 'bass', 'alto', 'tenor'];

export const INTERVAL_DEFAULTS: IntervalSettings = {
  difficulty: 2,
  // Every simple interval above the unison. Narrowing is what the settings
  // panel is for; a default that starts narrow hides most of the exercise
  // behind a control the user has no reason to open yet.
  semitones: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  directions: ['up'],
  clef: 'treble',
};

function coerceIntervalSettings(stored: unknown): IntervalSettings {
  const raw = (typeof stored === 'object' && stored !== null ? stored : {}) as Partial<IntervalSettings>;

  const difficulty = [1, 2, 3, 4, 5].includes(raw.difficulty as number)
    ? raw.difficulty as Difficulty
    : INTERVAL_DEFAULTS.difficulty;

  // Sorted and de-duplicated here rather than trusted, so a hand-edited or
  // older document cannot make the generator's candidate pool depend on the
  // order someone happened to write it in.
  const semitones = Array.isArray(raw.semitones)
    ? [...new Set(raw.semitones.filter(
      (s): s is number => Number.isInteger(s) && s >= 0 && s <= MAX_SEMITONES,
    ))].sort((a, b) => a - b)
    : [];

  const directions = Array.isArray(raw.directions)
    ? INTERVAL_DIRECTIONS.filter((d) => (raw.directions as unknown[]).includes(d))
    : [];

  return {
    difficulty,
    // An empty pool is a screen with nothing to generate, so it falls back
    // rather than surfacing as an error the user cannot act on from here.
    semitones: semitones.length > 0 ? semitones : INTERVAL_DEFAULTS.semitones,
    directions: directions.length > 0 ? directions : INTERVAL_DEFAULTS.directions,
    clef: CLEFS.includes(raw.clef as Clef) ? raw.clef as Clef : INTERVAL_DEFAULTS.clef,
  };
}

export const intervalSettingsSchema: SettingsSchema<IntervalSettings> = {
  defaults: INTERVAL_DEFAULTS,
  coerce: coerceIntervalSettings,
  fields: [
    {
      kind: 'choice', id: 'difficulty', label: 'Range',
      options: [
        { id: '1', label: 'Around the staff' },
        { id: '2', label: 'Narrow' },
        { id: '3', label: 'Medium' },
        { id: '4', label: 'Wide' },
        { id: '5', label: 'The whole keyboard' },
      ],
      selected: (s) => String(s.difficulty),
      apply: (s, option) => ({ ...s, difficulty: Number(option) as Difficulty }),
    },
    {
      kind: 'multi', id: 'semitones', label: 'Intervals',
      options: INTERVAL_SLUGS.map((_, semitones) => ({
        id: String(semitones),
        label: SIMPLE_INTERVAL_NAMES[semitones],
      })),
      selected: (s) => s.semitones.map(String),
      // Refusing the empty set rather than accepting it and failing in
      // `pick`: the user unticking their last interval is a slip, and the
      // honest response is for the tick not to come off.
      apply: (s, options) => (options.length === 0 ? s : {
        ...s,
        semitones: options.map(Number).sort((a, b) => a - b),
      }),
    },
    {
      kind: 'multi', id: 'directions', label: 'Played',
      options: [
        { id: 'up', label: 'Ascending' },
        { id: 'down', label: 'Descending' },
        { id: 'harmonic', label: 'Together' },
      ],
      selected: (s) => s.directions,
      apply: (s, options) => (options.length === 0 ? s : {
        ...s,
        directions: INTERVAL_DIRECTIONS.filter((d) => options.includes(d)),
      }),
    },
    {
      kind: 'choice', id: 'clef', label: 'Clef',
      options: CLEFS.map((c) => ({ id: c, label: c })),
      selected: (s) => s.clef,
      apply: (s, option) => ({ ...s, clef: option as Clef }),
    },
  ],
};

/* -- generation ----------------------------------------------------------- */

export interface IntervalExercise extends ExerciseBase {
  readonly type: typeof INTERVAL_EXERCISE_ID;
  readonly semitones: number;
  readonly direction: IntervalDirection;
  /** In the order they sound; for a harmonic interval, lower then upper. */
  readonly pitches: readonly [Pitch, Pitch];
  readonly clef: Clef;
}

/**
 * The conventional spelling of each semitone distance, as staff steps.
 *
 * Six semitones is written as an augmented fourth rather than a diminished
 * fifth. Either is defensible and neither is audible; fixing one keeps the
 * engraved answer stable for a given seed, which is what ADR 0002 asks of
 * everything downstream of a seed.
 */
const DIATONIC_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 7];

/** Middle of each staff, so the drawn answer sits on the lines rather than above them. */
const CLEF_CENTRE: Record<Clef, number> = { treble: 71, alto: 60, tenor: 57, bass: 50 };

/** Semitones either side of the staff centre that the lower note may fall in. */
const SPREAD: Record<Difficulty, readonly [number, number]> = {
  // Never narrower than an octave, or an octave interval would have no room
  // to be placed at all once the second note has to fit too.
  1: [-5, 7],
  2: [-9, 11],
  3: [-12, 14],
  4: [-16, 19],
  5: [-21, 24],
};

/**
 * The MIDI range both notes are kept inside, for a given clef and difficulty.
 *
 * Exported because it is the claim worth testing about placement — that no
 * exercise ever puts a note off the end of the staff it is drawn on — and a
 * test that reconstructed the arithmetic would only be testing itself.
 */
export function pitchWindow(settings: IntervalSettings): readonly [number, number] {
  const centre = CLEF_CENTRE[settings.clef];
  const [below, above] = SPREAD[settings.difficulty];
  return [centre + below, centre + above];
}

export function generateInterval(spec: ExerciseSpec<IntervalSettings>): IntervalExercise {
  const { settings } = spec;
  const rng = makeRng(spec.seed);

  const semitones = pick(rng, settings.semitones);
  const direction = pick(rng, settings.directions);
  const preferFlats = chance(rng, 0.5);

  const [windowLow, windowHigh] = pitchWindow(settings);
  // The window is narrowed by the interval rather than the second note being
  // clamped afterwards: clamping would silently shrink an interval that ran
  // off the end of the staff into a different one.
  const low = windowLow + (direction === 'down' ? semitones : 0);
  const high = windowHigh - (direction === 'down' ? 0 : semitones);
  const firstMidi = rngInt(rng, low, Math.max(low, high));

  const first = pitchFromMidi(firstMidi, preferFlats);
  const sign = direction === 'down' ? -1 : 1;
  // Spelled from the staff step up, not from the MIDI number: C-F# and C-Gb
  // are the same sound and different notes, and an exercise that engraved
  // whichever the enharmonic table happened to prefer would print a minor
  // third as an augmented second about half the time.
  const second = respell(
    diatonicOf(first) + sign * DIATONIC_STEPS[semitones],
    firstMidi + sign * semitones,
  );

  return {
    type: INTERVAL_EXERCISE_ID,
    seed: spec.seed,
    semitones,
    direction,
    pitches: [first, second],
    clef: settings.clef,
    items: [intervalItemId(semitones, direction)],
  };
}

/* -- answering ------------------------------------------------------------ */

export interface IntervalResponse {
  /** The semitone distance the user chose. */
  semitones: number;
  /** Milliseconds from the first playback to the tap. */
  latencyMs?: number;
}

/**
 * Graded on the sound, not on the spelling.
 *
 * The user answers "tritone", and whether the engraver wrote an augmented
 * fourth or a diminished fifth is the renderer's business. The spelled name
 * still goes into the feedback, because seeing that the tritone they just
 * heard was written A4 is the whole bridge between the ear and the page.
 */
export function gradeInterval(exercise: IntervalExercise, response: IntervalResponse): Result {
  const correct = response.semitones === exercise.semitones;
  const [from, to] = exercise.pitches;
  // intervalBetween takes its pair in either order and reports the direction
  // separately, so a descending pair needs no reordering here — and a unison
  // reports no direction at all, which is why the harmonic case is the only
  // one that has to suppress the word.
  const measured = intervalBetween(from, to);
  const spelled = exercise.direction === 'harmonic'
    ? intervalName(measured)
    : directedIntervalName(measured);

  const heard = SIMPLE_INTERVAL_NAMES[exercise.semitones];
  const played = `${pitchName(from)} to ${pitchName(to)}`;
  const mnemonic = INTERVAL_MNEMONICS[exercise.semitones];

  return {
    correct,
    feedback: correct
      ? `Yes — ${heard}, ${played}, spelled ${spelled}.`
      : `No: that was ${heard} (${played}, spelled ${spelled})`
        + `${mnemonic ? `. Think ${mnemonic}` : ''}.`,
    outcomes: [{
      item: exercise.items[0],
      correct,
      ...(response.latencyMs === undefined ? {} : { latencyMs: response.latencyMs }),
    }],
  };
}

/* -- presenting ----------------------------------------------------------- */

/** Seconds between the two notes of a melodic interval. */
const MELODIC_GAP = 0.75;

export function intervalVoices(exercise: IntervalExercise): Voice[] {
  const midis = exercise.pitches.map(midiOf);
  if (exercise.direction === 'harmonic') {
    return schedule([{ midis }], { eventGap: 0, rollGap: 0, hold: 2.2 });
  }
  return schedule(midis.map((midi) => ({ midis: [midi] })), {
    eventGap: MELODIC_GAP, rollGap: 0, hold: 1.1,
  });
}

/** The answer, engraved. Shown only once the user has committed to one. */
export function intervalScoreNotes(exercise: IntervalExercise): ScoreNote[] {
  if (exercise.direction === 'harmonic') {
    return [{ pitches: exercise.pitches, value: noteValue('w') }];
  }
  return exercise.pitches.map((pitch) => ({ pitches: [pitch], value: noteValue('h') }));
}
