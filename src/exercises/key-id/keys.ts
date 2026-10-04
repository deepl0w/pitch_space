import { makeRng, pick } from '../../theory/rng';
import { cadencePitches } from '../../generate/tonicize';
import { ALL_KEYS, type Key, type Mode, keyId, keyName, keyPitches, relativeKey, signatureLetters } from '../../theory/key';
import { positionFor } from '../../theory/circle';
import { pitchName } from '../../theory/pitch';
import type { Pitch } from '../../theory/pitch';
import { noteValue } from '../../theory/meter';
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

/**
 * Where the evidence for the key comes from.
 *
 * Three genuinely different skills wearing one name. Reading a signature is
 * counting sharps. Inferring a key from the accidentals written into the
 * notes is what you do with music that has no signature, or has modulated
 * away from the one it prints. Hearing the key is neither — it is finding the
 * tonic by ear, and a musician can be fluent at the first two and lost at the
 * third.
 */
export type KeySource = 'signature' | 'accidentals' | 'passage';

export const KEY_SOURCE_LABELS: Record<KeySource, string> = {
  signature: 'From the key signature',
  accidentals: 'From the notes, with no signature',
  passage: 'By ear, from a short passage',
};

export interface KeySettings extends BaseSettings {
  /** How far round the circle to go: 0 is C major alone, 7 is all fifteen. */
  maxAccidentals: number;
  /** Which modes may be asked about. */
  modes: readonly Mode[];
  clefs: readonly Clef[];
  /** Used when reading; hearing always means a passage. */
  readSource: Exclude<KeySource, 'passage'>;
}

export interface KeyExercise extends ExerciseBase {
  readonly type: typeof KEY_EXERCISE_ID;
  readonly keyId: string;
  readonly mode: Mode;
  readonly clef: Clef;
  readonly source: KeySource;
  /** Every key of the asked-for mode within the accidental limit, as answer options. */
  readonly choices: readonly string[];
  /** The notes shown or sounded, spelled. Empty when the signature is the question. */
  readonly pitches: readonly Pitch[];
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

export const KEY_DEFAULTS: KeySettings = {
  maxAccidentals: 2,
  presentation: 'read',
  modes: ['major'],
  clefs: ['treble'],
  readSource: 'signature',
};

/** Keys askable within the limit, in circle-of-fifths order. */
export function keyPool(settings: KeySettings, mode: Mode): Key[] {
  return ALL_KEYS
    .filter((k) => k.mode === mode && Math.abs(k.accidentals) <= settings.maxAccidentals)
    .sort((a, b) => a.accidentals - b.accidentals);
}

/**
 * The spellings of one sounding tonic, ordered with the canonical one first.
 *
 * Taken from the circle rather than from a table written here. `circle.ts`
 * already decides which spelling leads — "fewest accidentals first, so the
 * ordinary spelling leads and the enharmonic twin sits behind it" — and a
 * second rule in this file could only drift from it. The six-against-six
 * ties, Gb/F# and Eb/D# minor, fall to `ALL_KEYS` order; `keys.test.ts`
 * pins the winners by name, because the canonical spelling is an item id
 * and reordering that array would silently refile a learner's history.
 */
function spellingsOf(key: Key): readonly Key[] {
  const at = positionFor(key);
  return key.mode === 'major' ? at.major : at.minor;
}

/** The spelling that stands for a sounding tonic. ADR 0020. */
function canonicalFor(key: Key): Key {
  return spellingsOf(key)[0];
}

/** The twin spelling, where the sound has two. */
function twinOf(key: Key): Key | null {
  const both = spellingsOf(key);
  return both.length > 1 ? both.find((k) => keyId(k) !== keyId(canonicalFor(key)))! : null;
}

/**
 * What a by-ear choice is called: "Gb / F# major".
 *
 * Both spellings, canonical first, so a listener who names the sound the
 * other way finds their answer on the screen rather than concluding the app
 * disagrees with them. The canonical leads because it is the one the
 * feedback names and the one the attempt is filed under.
 */
export function soundingKeyName(key: Key): string {
  const twin = twinOf(key);
  if (twin === null) return keyName(key);
  return `${pitchName(canonicalFor(key).tonic, false)} / ${pitchName(twin.tonic, false)} ${key.mode}`;
}

/**
 * The keys askable by ear: one per sounding tonic, twelve per mode.
 *
 * Nothing leaves the pool that a musician would call a key — the three
 * collapsed pairs in each mode are two spellings of one sound, and by ear
 * that is one answer. Offering both and marking one wrong is the defect
 * 0020 was written about; the exercise's own opening comment forbids it.
 *
 * A key inside the limit always has its canonical spelling inside it
 * too, because the canonical is the one with no more accidentals.
 */
export function soundingPool(settings: KeySettings, mode: Mode): Key[] {
  const seen = new Set<string>();
  const out: Key[] = [];
  for (const key of keyPool(settings, mode)) {
    const canonical = canonicalFor(key);
    if (seen.has(keyId(canonical))) continue;
    seen.add(keyId(canonical));
    out.push(canonical);
  }
  return out.sort((a, b) => a.accidentals - b.accidentals);
}

/** The scale of the key, which is where its accidentals are visible. */
function scaleFor(key: Key): Pitch[] {
  return keyPitches({ ...key, tonic: { ...key.tonic, octave: 4 } });
}

/**
 * Every key and signature these settings can ask about.
 *
 * **Signatures only when the question is read.** Asked by eye, a
 * signature is genuinely tested and genuinely shared: someone who has
 * learned two sharps from B minor has learned something that counts in D
 * major, and the schedule should know that. Asked by ear there is no
 * signature on the screen, `gradeKey` credits only the key, and listing
 * them anyway put five items into the denominator that nothing could
 * ever answer — half of this exercise's listening count, and a due badge
 * that could not be cleared. Caught by measuring listed against reached
 * rather than by reading the grader.
 *
 * Built from the same `keyPool`/`soundingPool` split `generate` uses, not
 * from `ALL_KEYS` filtered by hand, because by ear the three enharmonic
 * pairs collapse to one askable key (ADR 0020) and a hand-rolled version
 * would promise six questions that cannot be told apart.
 */
export function keyItems(settings: KeySettings): readonly ItemId[] {
  const modes = settings.modes.length ? settings.modes : KEY_DEFAULTS.modes;
  const byEar = settings.presentation === 'listen';
  const items = new Set<ItemId>();
  for (const mode of modes) {
    for (const key of byEar ? soundingPool(settings, mode) : keyPool(settings, mode)) {
      items.add(`key:${keyId(key)}` as ItemId);
      if (!byEar) items.add(`signature:${key.accidentals}` as ItemId);
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

  const source: KeySource = spec.settings.presentation === 'listen'
    ? 'passage'
    : spec.settings.readSource;

  // The pool depends on how the question is asked, not only on how far round
  // the circle it reaches. By ear the askable unit is the sounding key, so
  // the three enharmonic pairs in each mode collapse to one choice (ADR
  // 0020); on the page six flats and six sharps are different signatures and
  // telling them apart is the skill, so the reading pools are untouched.
  const pool = source === 'passage'
    ? soundingPool(spec.settings, mode)
    : keyPool(spec.settings, mode);
  const key = pick(rng, pool);

  const items: ItemId[] = [
    `key:${keyId(key)}` as ItemId,
    // The signature itself is the thing being read, and it is shared with the
    // relative key — so a user who learns two sharps from B minor has learned
    // something that helps them in D major too.
    `signature:${key.accidentals}` as ItemId,
  ];

  const pitches = source === 'signature' ? []
    : source === 'accidentals' ? scaleFor(key)
      : cadencePitches(key);

  return {
    type: KEY_EXERCISE_ID,
    seed: spec.seed,
    presentation: spec.settings.presentation,
    items,
    keyId: keyId(key),
    mode,
    clef,
    source,
    choices: pool.map(keyId),
    pitches,
  };
}

/** "6 flats", "1 sharp", "no sharps or flats" — the count, not the signature. */
function countOf(key: Key): string {
  const n = Math.abs(key.accidentals);
  if (n === 0) return 'no sharps or flats';
  return `${n} ${key.accidentals > 0 ? 'sharp' : 'flat'}${n > 1 ? 's' : ''}`;
}

export function gradeKey(exercise: KeyExercise, response: KeyResponse): Result {
  const correct = response.keyId === exercise.keyId;
  const asked = ALL_KEYS.find((k) => keyId(k) === exercise.keyId)!;
  const relative = relativeKey(asked);
  const letters = signatureLetters(asked);
  const described = letters.length === 0
    ? 'no sharps and no flats'
    : `${letters.length} ${asked.accidentals > 0 ? 'sharp' : 'flat'}${letters.length > 1 ? 's' : ''} (${letters.join(' ')})`;
  const heard = exercise.source === 'passage';
  const twin = twinOf(asked);
  /*
    The bridge from the ear to the page, and the one thing a listener who
    named the sound correctly still has to learn: this sound is written with
    six flats, and the same sound with six sharps is spelled the other way.

    It counts the accidentals without calling them a signature and without
    listing their letters. Naming a signature would repeat the claim ADR 0022
    removed — there was none on screen — and the letters are a reading
    detail nobody heard.
  */
  const written = twin === null
    ? `written with ${countOf(asked)}`
    : `written with ${countOf(asked)} — or as ${keyName(twin)}, with ${countOf(twin)}`;

  return {
    correct,
    feedback: heard
      ? (correct
        ? `Yes — that was ${keyName(asked)}, ${written}.`
        : `That was ${keyName(asked)}, ${written}.`)
      : (correct
        ? `Yes — ${described} is ${keyName(asked)}, and ${keyName(relative)} alongside it.`
        : `That signature is ${described}: ${keyName(asked)}. Its relative is ${keyName(relative)}.`),
    outcomes: [
      { item: `key:${exercise.keyId}` as ItemId, correct },
      // No signature outcome by ear (ADR 0022). Nothing was shown, and for
      // the six enharmonic pairs the signature is precisely what the ear
      // cannot recover — six flats against six sharps is the distinction
      // 0020 collapsed the question over. `exercise.items` keeps both, since
      // that list is what the question contained rather than what it tested.
      ...(heard ? [] : [{ item: `signature:${asked.accidentals}` as ItemId, correct }]),
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
  if (exercise.source === 'signature') return { notes: [], clef: exercise.clef, key };
  // No signature on purpose for the other two: in the reading form that is
  // the whole question, and in the listening form showing one would answer it.
  return {
    notes: exercise.pitches.map((p) => ({ pitches: [p], value: noteValue('q') })),
    clef: exercise.clef,
  };
}

/** What the question itself shows, which is nothing when it is asked by ear. */
export function keyQuestionSpec(exercise: KeyExercise): ScoreSpec | null {
  if (exercise.source === 'passage') return null;
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
    presentation: raw.presentation === 'listen' ? 'listen' : 'read',
    modes: coerceModes(raw.modes),
    clefs: coerceClefs(raw.clefs),
    readSource: raw.readSource === 'accidentals' ? 'accidentals' : 'signature',
  };
}

/** Every limit the circle has, so none of them is unaskable. */
export const ACCIDENTAL_CHOICES: readonly number[] =
  Array.from({ length: MAX_ACCIDENTALS + 1 }, (_, n) => n);

function accidentalLabel(n: number): string {
  if (n === 0) return 'C major and A minor only';
  if (n === MAX_ACCIDENTALS) return 'All fifteen keys';
  return `Up to ${n} accidental${n === 1 ? '' : 's'}`;
}

function clampAccidentals(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_ACCIDENTALS ? n : KEY_DEFAULTS.maxAccidentals;
}

export const keySettingsSchema: SettingsSchema<KeySettings> = {
  defaults: KEY_DEFAULTS,
  coerce: coerceKeySettings,
  fields: [
    {
      kind: 'choice', id: 'presentation', label: 'Asked',
      options: [
        { id: 'read', label: 'By eye' },
        { id: 'listen', label: 'By ear' },
      ],
      selected: (s) => s.presentation,
      apply: (s, option) => ({ ...s, presentation: option === 'listen' ? 'listen' : 'read' }),
    },
    {
      kind: 'choice', id: 'readSource', label: 'Read from',
      // Nothing is read when the question is a cadence.
      relevant: (s) => s.presentation === 'read',
      options: [
        { id: 'signature', label: 'The key signature' },
        { id: 'accidentals', label: 'The notes, no signature' },
      ],
      selected: (s) => s.readSource,
      apply: (s, option) => ({
        ...s,
        readSource: option === 'accidentals' ? 'accidentals' : 'signature',
      }),
    },
    {
      kind: 'choice', id: 'maxAccidentals', label: 'How far round the circle',
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
