import { makeRng, pick } from '../../theory/rng';
import { ALL_KEYS, type Key, type Mode, keyId, keyName, relativeKey, signatureLetters } from '../../theory/key';
import type { Clef, ScoreSpec } from '../render/toVexflow';
import type {
  BaseSettings, Difficulty, ExerciseBase, ExerciseSpec, ItemId, Result, SettingsSchema,
} from '../types';

/**
 * Key identification: read a key signature and name the key.
 *
 * The one thing this exercise has to get right is that **a key signature does
 * not name a key**. Two sharps is D major and B minor, and no amount of
 * looking at the staff will separate them. So the question always says which
 * mode it wants, and the answer set is restricted to that mode. An exercise
 * that showed two sharps and accepted only "D major" would be marking a
 * correct answer wrong.
 */

export const KEY_EXERCISE_ID = 'key-id';

export const CLEFS: readonly Clef[] = ['treble', 'bass', 'alto', 'tenor'];

export interface KeySettings extends BaseSettings {
  /** Which modes may be asked about. */
  modes: readonly Mode[];
  clefs: readonly Clef[];
}

export interface KeyExercise extends ExerciseBase {
  readonly type: typeof KEY_EXERCISE_ID;
  readonly keyId: string;
  readonly mode: Mode;
  readonly clef: Clef;
  /** Every key of the asked-for mode within the difficulty, as answer options. */
  readonly choices: readonly string[];
}

export interface KeyResponse {
  keyId: string;
}

/**
 * How many accidentals a difficulty reaches.
 *
 * Grouped the way they are learned rather than evenly: the first step is the
 * keys with none or one, and the last is the far side of the circle where
 * seven accidentals and a double-named tonic live.
 */
const ACCIDENTAL_LIMIT: Record<Difficulty, number> = {
  1: 1, 2: 2, 3: 4, 4: 5, 5: 7,
};

export const KEY_DEFAULTS: KeySettings = {
  difficulty: 2,
  modes: ['major'],
  clefs: ['treble'],
};

/** Keys askable at a difficulty, in circle-of-fifths order. */
export function keyPool(settings: KeySettings, mode: Mode): Key[] {
  const limit = ACCIDENTAL_LIMIT[settings.difficulty];
  return ALL_KEYS
    .filter((k) => k.mode === mode && Math.abs(k.accidentals) <= limit)
    .sort((a, b) => a.accidentals - b.accidentals);
}

export function generateKey(spec: ExerciseSpec<KeySettings>): KeyExercise {
  const rng = makeRng(spec.seed);
  // Settings arrive coerced, but generation must not fall over on a stored
  // shape from a release that allowed an empty list.
  const modes: readonly Mode[] = spec.settings.modes.length ? spec.settings.modes : KEY_DEFAULTS.modes;
  const clefs: readonly Clef[] = spec.settings.clefs.length ? spec.settings.clefs : KEY_DEFAULTS.clefs;
  const mode = pick(rng, modes);
  const clef = pick(rng, clefs);
  const pool = keyPool(spec.settings, mode);
  const key = pick(rng, pool);

  const items: ItemId[] = [
    `key:${keyId(key)}` as ItemId,
    // The signature itself is the thing being read, and it is shared with the
    // relative key — so a user who learns two sharps from B minor has learned
    // something that helps them in D major too.
    `signature:${key.accidentals}` as ItemId,
  ];

  return {
    type: KEY_EXERCISE_ID,
    seed: spec.seed,
    items,
    keyId: keyId(key),
    mode,
    clef,
    choices: pool.map(keyId),
  };
}

export function gradeKey(exercise: KeyExercise, response: KeyResponse): Result {
  const correct = response.keyId === exercise.keyId;
  const asked = ALL_KEYS.find((k) => keyId(k) === exercise.keyId)!;
  const relative = relativeKey(asked);
  const letters = signatureLetters(asked);
  const described = letters.length === 0
    ? 'no sharps and no flats'
    : `${letters.length} ${asked.accidentals > 0 ? 'sharp' : 'flat'}${letters.length > 1 ? 's' : ''} (${letters.join(' ')})`;

  return {
    correct,
    feedback: correct
      ? `Yes — ${described} is ${keyName(asked)}, and ${keyName(relative)} alongside it.`
      : `That signature is ${described}: ${keyName(asked)}. Its relative is ${keyName(relative)}.`,
    outcomes: [
      { item: `key:${exercise.keyId}` as ItemId, correct },
      { item: `signature:${asked.accidentals}` as ItemId, correct },
    ],
  };
}

/**
 * The question, engraved: a stave carrying the signature and nothing else.
 *
 * No notes on purpose. Anything on the staff would be a second thing to read,
 * and the one being tested is the signature.
 */
export function keyScoreSpec(exercise: KeyExercise): ScoreSpec {
  const key = ALL_KEYS.find((k) => keyId(k) === exercise.keyId)!;
  return { notes: [], clef: exercise.clef, key };
}

function coerceModes(value: unknown): readonly Mode[] {
  const all: Mode[] = ['major', 'minor'];
  if (!Array.isArray(value)) return KEY_DEFAULTS.modes;
  const kept = all.filter((m) => value.includes(m));
  return kept.length ? kept : KEY_DEFAULTS.modes;
}

function coerceClefs(value: unknown): readonly Clef[] {
  if (!Array.isArray(value)) return KEY_DEFAULTS.clefs;
  const kept = CLEFS.filter((c) => value.includes(c));
  return kept.length ? kept : KEY_DEFAULTS.clefs;
}

export function coerceKeySettings(stored: unknown): KeySettings {
  const raw = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>;
  const difficulty = Number(raw.difficulty);
  return {
    difficulty: ([1, 2, 3, 4, 5] as const).includes(difficulty as Difficulty)
      ? difficulty as Difficulty
      : KEY_DEFAULTS.difficulty,
    modes: coerceModes(raw.modes),
    clefs: coerceClefs(raw.clefs),
  };
}

export const keySettingsSchema: SettingsSchema<KeySettings> = {
  defaults: KEY_DEFAULTS,
  coerce: coerceKeySettings,
  fields: [
    {
      kind: 'choice', id: 'difficulty', label: 'How far round the circle',
      options: [
        { id: '1', label: 'Up to one accidental' },
        { id: '2', label: 'Up to two' },
        { id: '3', label: 'Up to four' },
        { id: '4', label: 'Up to five' },
        { id: '5', label: 'All fifteen' },
      ],
      selected: (s) => String(s.difficulty),
      apply: (s, option) => ({ ...s, difficulty: Number(option) as Difficulty }),
    },
    {
      kind: 'multi', id: 'modes', label: 'Asked about',
      options: [
        { id: 'major', label: 'Major keys' },
        { id: 'minor', label: 'Minor keys' },
      ],
      // Refusing the empty set rather than accepting it: unticking the last
      // mode is a slip, and the honest response is for the tick not to come off.
      selected: (s) => s.modes,
      apply: (s, options) => (options.length === 0 ? s : { ...s, modes: coerceModes(options) }),
    },
    {
      kind: 'multi', id: 'clefs', label: 'Clefs',
      options: CLEFS.map((c) => ({ id: c, label: c[0].toUpperCase() + c.slice(1) })),
      selected: (s) => s.clefs,
      apply: (s, options) => (options.length === 0 ? s : { ...s, clefs: coerceClefs(options) }),
    },
  ],
};
