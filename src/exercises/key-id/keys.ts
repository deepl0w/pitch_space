import { makeRng, pick } from '../../theory/rng';
import { ALL_KEYS, type Key, type Mode, keyId, keyName, relativeKey, signatureLetters } from '../../theory/key';
import type { Clef, ScoreSpec } from '../render/toVexflow';
import type {
  BaseSettings, ExerciseBase, ExerciseSpec, ItemId, Result, SettingsSchema,
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

/*
  This exercise reads a key signature and names the key. It had two other
  sources and has shed both.

  Hearing the key went first: with no reference pitch it asks for absolute
  pitch and nothing else (ADR 0028).

  Inferring the key from accidentals written into the notes, with the
  signature withheld, went second. It is a real skill — it is what you do
  with music that has modulated away from the signature it prints — but
  what this exercise drew was a plain ascending scale, which does not pose
  that question. Naming the key of a written-out scale is reading the scale,
  and the answer is its first note. Offering it beside the signature reading
  implied two skills where the app only ever exercised one.
*/

export interface KeySettings extends BaseSettings {
  /** How far round the circle to go: 0 is C major alone, 7 is all fifteen. */
  maxAccidentals: number;
  /** Which modes may be asked about. */
  modes: readonly Mode[];
  clefs: readonly Clef[];
}

export interface KeyExercise extends ExerciseBase {
  readonly type: typeof KEY_EXERCISE_ID;
  readonly keyId: string;
  readonly mode: Mode;
  readonly clef: Clef;
  /** Every key of the asked-for mode within the accidental limit, as answer options. */
  readonly choices: readonly string[];
}

export interface KeyResponse {
  keyId: string;
}

/**
 * How far round the circle the questions reach, as the accidental count
 * itself.
 *
 * This was a shared 1-to-5 `difficulty` indexing a private table that read
 * `{1: 1, 2: 2, 3: 4, 4: 5, 5: 7}` — so the dial offered five of the eight
 * limits that exist and silently refused three and six, for no reason
 * except that five rows is a tidy number of rows. Naming the real quantity
 * costs nothing and makes every limit askable, which is the point: a
 * learner working on the three-accidental keys can now ask for exactly
 * those.
 */
export const MAX_ACCIDENTALS = 7;

/**
 * Key identification is a reading exercise, and only a reading exercise.
 *
 * It had an ear mode: a I–IV–V–I cadence, no reference pitch, name the
 * key. That question cannot be answered without absolute pitch. A
 * listener with relative pitch hears the same thing in every key, by
 * definition, so the exercise asked for a faculty most musicians do not
 * have and cannot train — and then marked them wrong for not having it,
 * session after session, with no way to tell that from failing at
 * something learnable.
 *
 * Two ADRs were spent inside that mistake. 0020 collapsed the six
 * enharmonic pairs because they sound identical; 0022 stopped crediting
 * a signature nobody had seen. Both were right about the question they
 * were asked, and neither could have found this: they were fixing the
 * marking of an exercise that should not have been set. See ADR 0028.
 *
 * What remains needs no mode control at all. The question is on the
 * staff, which is what makes this the exercise that proves the contract
 * does not assume every exercise sounds.
 */
export const KEY_DEFAULTS: KeySettings = {
  maxAccidentals: 2,
  presentation: 'read',
  modes: ['major'],
  clefs: ['treble'],
};

/** Keys askable within the limit, in circle-of-fifths order. */
export function keyPool(settings: KeySettings, mode: Mode): Key[] {
  return ALL_KEYS
    .filter((k) => k.mode === mode && Math.abs(k.accidentals) <= settings.maxAccidentals)
    .sort((a, b) => a.accidentals - b.accidentals);
}

/**
 * Every key and signature these settings can ask about.
 *
 * Both the key and the signature it carries, because both are genuinely
 * tested: someone who has learned two sharps from B minor has learned
 * something that counts in D major, and the schedule should know that.
 *
 * Built from `keyPool`, the same function `generate` draws from, rather
 * than from `ALL_KEYS` filtered by hand.
 */
export function keyItems(settings: KeySettings): readonly ItemId[] {
  const modes = settings.modes.length ? settings.modes : KEY_DEFAULTS.modes;
  const items = new Set<ItemId>();
  for (const mode of modes) {
    for (const key of keyPool(settings, mode)) {
      items.add(`key:${keyId(key)}` as ItemId);
      items.add(`signature:${key.accidentals}` as ItemId);
    }
  }
  return [...items];
}

export function generateKey(spec: ExerciseSpec<KeySettings>): KeyExercise {
  const rng = makeRng(spec.seed);
  // Settings arrive coerced, but generation must not fall over on a stored
  // shape from a release that allowed an empty list.
  const modes: readonly Mode[] = spec.settings.modes.length ? spec.settings.modes : KEY_DEFAULTS.modes;
  const clefs: readonly Clef[] = spec.settings.clefs.length ? spec.settings.clefs : KEY_DEFAULTS.clefs;
  const mode = pick(rng, modes);
  const clef = pick(rng, clefs);

  // Six flats and six sharps are different signatures and telling them
  // apart is the skill, so nothing collapses here.
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
    presentation: spec.settings.presentation,
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

/** What the question itself shows, which is the whole of it here. */
export function keyQuestionSpec(exercise: KeyExercise): ScoreSpec | null {
  return keyScoreSpec(exercise);
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
  return {
    maxAccidentals: clampAccidentals(raw.maxAccidentals),
    // Always read. A stored `listen` is from a release that offered an
    // ear mode this one does not, and is dropped like any other setting
    // whose option has gone.
    presentation: 'read',
    modes: coerceModes(raw.modes),
    clefs: coerceClefs(raw.clefs),
  };
}

/** Every limit the circle has, so none of them is unaskable. */
export const ACCIDENTAL_CHOICES: readonly number[] =
  Array.from({ length: MAX_ACCIDENTALS + 1 }, (_, n) => n);

/**
 * The number, and only the number.
 *
 * These read "C major and A minor only", "Up to 3 accidentals", "All
 * fifteen keys" — eight sentences that wrapped a single choice over four
 * rows and said the same word six times. The caption carries the sense
 * once; each option only has to carry what distinguishes it, which is a
 * digit.
 */
function accidentalLabel(n: number): string {
  return String(n);
}

function clampAccidentals(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_ACCIDENTALS ? n : KEY_DEFAULTS.maxAccidentals;
}

export const keySettingsSchema: SettingsSchema<KeySettings> = {
  defaults: KEY_DEFAULTS,
  coerce: coerceKeySettings,
  fields: [
    /*
      No presentation control and no source control. Both were choices
      between one real option and one that should not have been offered,
      and a choice with one option cannot change the question — the rule
      this app already applies to an inert field. The note at the top of
      this file says what each of them was and why it went.
    */
    {
      kind: 'choice', id: 'maxAccidentals', label: 'Up to how many accidentals',
      options: ACCIDENTAL_CHOICES.map((n) => ({ id: String(n), label: accidentalLabel(n) })),
      selected: (s) => String(s.maxAccidentals),
      apply: (s, option) => ({ ...s, maxAccidentals: clampAccidentals(Number(option)) }),
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
      // No staff is drawn for a heard question (ADR 0020), so a clef
      // chooses nothing.
      relevant: (s) => s.presentation === 'read',
      options: CLEFS.map((c) => ({ id: c, label: c[0].toUpperCase() + c.slice(1) })),
      selected: (s) => s.clefs,
      apply: (s, options) => (options.length === 0 ? s : { ...s, clefs: coerceClefs(options) }),
    },
  ],
};
