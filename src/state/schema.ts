import type { ItemId, ItemOutcome, Presentation } from '../exercises/types';
import { assertStepsCoverVersions, type MigrationStep, type Versioned } from './migrate';
import { DEFAULT_INSTRUMENT_ID, isInstrumentId } from '../audio/output/instruments';

/**
 * Every shape this app writes to a user's device, with its version.
 *
 * One file, because the thing that goes wrong with persisted schemas is that
 * the shape and the version that describes it drift apart in separate files.
 * The migration tables live beside the shapes they migrate to, and both are
 * exported so a test can walk them.
 */

/* -- settings ------------------------------------------------------------- */

/** Unchanged by the rename to Pitch Space, for the reason `DB_NAME` gives. */
export const SETTINGS_KEY = 'music-practice:settings';
export const SETTINGS_SCHEMA = 3;

/**
 * Where an input-latency correction came from.
 *
 * Measured and typed-in are both legitimate and are not the same evidence:
 * a measured figure can be re-measured and compared, a typed one is the
 * user's judgement and re-offering to measure over the top of it is
 * presumptuous. One field, read at one place, and it is on probation — if
 * nothing ever branches on it, it is a column carried forever for a
 * decision nobody makes.
 */
export type LatencySource = 'measured' | 'manual';

export interface AudioSettings {
  /**
   * What the round trip costs, in milliseconds, or **null for not known**.
   *
   * Null is not zero and the difference is the whole point (ADR 0018). Zero
   * is a device that measured at zero; null is a device nobody has measured.
   * A reader that conflates them treats every uncalibrated setup as a
   * perfect one, which is a claim about hardware the app has no business
   * making — and calibration is offered rather than required, so null is
   * the normal case and not an edge.
   */
  inputLatencyMs: number | null;
  /** Null exactly when `inputLatencyMs` is. */
  source: LatencySource | null;
  /** Epoch milliseconds, so a stale calibration can be noticed. */
  measuredAt: number | null;
}

interface SettingsDocV1 {
  /**
   * Per-exercise settings, keyed by `ExerciseDefinition.id`.
   *
   * Opaque here on purpose: the settings schema belongs to the exercise type
   * and is coerced by it. Typing them in this file would mean an exercise
   * type could not be added without editing the persistence layer, which is
   * the seam the registry exists to avoid.
   */
  exercises: Record<string, unknown>;
  /** Which exercise the practice screen opens on; null on a first run. */
  lastExercise: string | null;
}

/**
 * Version 2 adds the audio correction.
 *
 * An extension rather than a widened v1, for the reason `AttemptV2` is: the
 * migration step is the only thing allowed to know the old shape, and a type
 * named for the old one that is quietly the new one misleads exactly the
 * reader who went looking for what changed.
 */
export interface SettingsDocV2 extends SettingsDocV1 {
  audio: AudioSettings;
}

/**
 * How the app looks and sounds, as opposed to what it asks.
 *
 * Separate from `audio` above, which is a *measurement* of the hardware and
 * not a preference — ADR 0018 turns on that distinction, and a volume the
 * user dragged sitting in the same object as a latency the app measured is
 * how the two become indistinguishable.
 */
export interface AppearanceSettings {
  /**
   * `system` follows `prefers-color-scheme`, which is what the stylesheet
   * does when no `data-theme` attribute is set. It is the default because a
   * user who has told their operating system has already answered.
   */
  theme: 'system' | 'light' | 'dark';
  /**
   * Which synthesised voice the app plays in, by id.
   *
   * An id rather than the instrument itself, because this is written to
   * a user's device: storing the partials and envelope would freeze a
   * release's idea of a piano into every profile that ever chose one,
   * and tuning it afterwards would reach nobody. An id that no longer
   * exists repairs to the default below, which is the same rule every
   * other field here follows.
   */
  instrument: string;
  /**
   * Output level, 0 to 1, as a fraction of the engine's own level rather
   * than an absolute: `synth.ts` sets a master gain chosen so a chord does
   * not clip, and this scales it. One is that level and not full scale.
   */
  volume: number;
}

export const APPEARANCE_DEFAULTS: AppearanceSettings = {
  theme: 'system', volume: 1, instrument: DEFAULT_INSTRUMENT_ID,
};

/** Version 3 adds the preferences that are not about a particular exercise. */
export interface SettingsDocV3 extends SettingsDocV2 {
  appearance: AppearanceSettings;
}

export type SettingsDoc = SettingsDocV3;

/** Nothing measured. The shape every first run and every decline has. */
export const UNCALIBRATED: AudioSettings = {
  inputLatencyMs: null, source: null, measuredAt: null,
};

/**
 * A fresh defaults document, built rather than shared.
 *
 * {@link SETTINGS_DEFAULTS} is one object, and spreading it copies only the
 * top level — so every caller that took `{ ...SETTINGS_DEFAULTS }` was handed
 * the *same* `exercises` map, and the first one to write a key into it
 * changed what every later first run was given.
 */
export function settingsDefaults(): SettingsDoc {
  return {
    exercises: {}, lastExercise: null,
    audio: { ...UNCALIBRATED }, appearance: { ...APPEARANCE_DEFAULTS },
  };
}

/** The defaults as a value, for comparison. Call {@link settingsDefaults} to own one. */
export const SETTINGS_DEFAULTS: SettingsDoc = settingsDefaults();

/**
 * `steps[n - 1]` takes a version-`n` document to version `n + 1`, so a
 * release that bumps {@link SETTINGS_SCHEMA} without appending a step fails
 * here rather than in the field.
 */
export const SETTINGS_MIGRATIONS: readonly MigrationStep[] = [
  // 1 -> 2: nobody who wrote a v1 document had calibrated, because there
  // was nothing to calibrate with. Uncalibrated is what happened rather
  // than a default, which is the same reasoning the attempt migration used
  // for 'listen' — and the same reason it must be null and not zero.
  (data) => ({ ...(data as Record<string, unknown>), audio: { ...UNCALIBRATED } }),
  // 2 -> 3: nobody who wrote a v2 document had expressed a preference, so
  // the defaults are what happened rather than a guess at what they wanted
  // — and `system` in particular is the absence of a choice rather than a
  // choice of light or dark.
  (data) => ({
    ...(data as Record<string, unknown>), appearance: { ...APPEARANCE_DEFAULTS },
  }),
];

/**
 * Repair towards the defaults, field by field.
 *
 * Total, because a missing preference should cost the user that preference
 * and not the screen. Unknown keys under `exercises` are kept: they belong to
 * an exercise type this build does not have, and dropping them would wipe a
 * user's settings every time they ran an older release.
 */
export function coerceSettings(data: unknown): SettingsDoc {
  if (typeof data !== 'object' || data === null) return settingsDefaults();
  const doc = data as Partial<SettingsDocV3>;
  const exercises = typeof doc.exercises === 'object' && doc.exercises !== null
    ? { ...doc.exercises }
    : {};
  return {
    exercises,
    lastExercise: typeof doc.lastExercise === 'string' ? doc.lastExercise : null,
    audio: coerceAudio(doc.audio),
    appearance: coerceAppearance(doc.appearance),
  };
}

/**
 * Repairs field by field, because these are independent preferences.
 *
 * Unlike {@link coerceAudio} below, where three fields are one fact: a
 * nonsense volume says nothing about the theme, so keeping the readable
 * half is the behaviour that costs the user least.
 */
function coerceAppearance(value: unknown): AppearanceSettings {
  if (typeof value !== 'object' || value === null) return { ...APPEARANCE_DEFAULTS };
  const a = value as Partial<AppearanceSettings>;
  const theme = a.theme === 'light' || a.theme === 'dark' || a.theme === 'system'
    ? a.theme : APPEARANCE_DEFAULTS.theme;
  // Finite and in range. A stored NaN would silence the app with no way
  // back from inside the slider.
  const volume = typeof a.volume === 'number' && Number.isFinite(a.volume)
    ? Math.min(1, Math.max(0, a.volume))
    : APPEARANCE_DEFAULTS.volume;
  /*
    No version bump for this field, and that is the point of repairing
    field by field: a stored document written before the instrument
    existed has no `instrument` key, reads as unknown, and becomes the
    default. A migration step would do the same thing and would also
    have to be kept in step with the catalogue, which can retire a
    voice — an id that was valid when written and is not now takes the
    same path as one that never was.
  */
  const instrument = isInstrumentId(a.instrument)
    ? a.instrument : APPEARANCE_DEFAULTS.instrument;
  return { theme, volume, instrument };
}

/**
 * Repairs towards uncalibrated, and towards it *completely*.
 *
 * The three fields are one fact in three parts, so a document with a
 * latency and no source is not two thirds of a calibration — it is a
 * document nobody can say the provenance of, and keeping the number while
 * dropping the provenance is how a dragged slider becomes indistinguishable
 * from a measurement. Any inconsistency resets all three.
 */
function coerceAudio(value: unknown): AudioSettings {
  if (typeof value !== 'object' || value === null) return { ...UNCALIBRATED };
  const a = value as Partial<AudioSettings>;

  // Explicitly finite, so NaN and Infinity do not survive as a "measurement".
  const ms = typeof a.inputLatencyMs === 'number' && Number.isFinite(a.inputLatencyMs)
    ? a.inputLatencyMs : null;
  const source = a.source === 'measured' || a.source === 'manual' ? a.source : null;
  if (ms === null || source === null) return { ...UNCALIBRATED };

  // A negative correction would move a played note earlier than it was
  // heard, which is not a latency; and a stored figure past the plausible
  // range is a measurement that should have been refused.
  if (ms < 0 || ms > 500) return { ...UNCALIBRATED };

  const measuredAt = typeof a.measuredAt === 'number' && Number.isFinite(a.measuredAt)
    ? a.measuredAt : null;
  return { inputLatencyMs: ms, source, measuredAt };
}

/* -- attempts ------------------------------------------------------------- */

export const ATTEMPT_SCHEMA = 3;

/**
 * One answered exercise, in the shape a spaced-repetition scheduler will
 * later read. See ADR 0007 for why the attribution is per item.
 *
 * Nothing here is a scheduler. There is no ease, no interval and no due
 * date — those are state the scheduler derives and owns. This is the
 * evidence it derives them from, and it is recorded now because evidence
 * cannot be backfilled.
 */
export interface AttemptV1 {
  id: string;
  /** `ExerciseDefinition.id`. */
  exerciseType: string;
  /**
   * What the exercise was generated from. With `settings` this reproduces
   * exactly what the user saw (ADR 0002, ADR 0005), which is what turns a
   * complaint into a bug report.
   */
  seed: number;
  settings: unknown;
  /** Epoch milliseconds. */
  startedAt: number;
  answeredAt: number;
  /** Every item the rendering contained, whether or not it was tested. */
  items: ItemId[];
  /** Only the items this response tested, with per-item credit and latency. */
  outcomes: ItemOutcome[];
  /**
   * The exercise as a whole.
   *
   * Not derivable from `outcomes` in general — a sight-reading bar can be
   * failed overall while most of its notes were right — so it is recorded
   * rather than folded.
   */
  correct: boolean;
}

/**
 * Version 2 adds the sense the question was put to.
 *
 * Written as an extension of v1 rather than by growing v1 in place. The
 * shapes have to stay distinct because `migrate.ts` makes the step the only
 * thing allowed to know the old one — and a type named for the old shape
 * that is quietly the new one misleads precisely the reader who went looking
 * for what changed.
 */
export interface AttemptV2 extends AttemptV1 {
  /**
   * Read or heard.
   *
   * A named field rather than a reach into `settings`, which is `unknown` and
   * validated by nothing. ADR 0010 makes this part of what an attempt means —
   * progress is tracked per item *and* per presentation — and a schedule
   * keyed on a field no reader checks is the fragile kind.
   */
  presentation: Presentation;
}

/**
 * Version 3 adds the answer space the question was drawn from.
 *
 * ADR 0039: progress belongs to a line, and a line is identified by the
 * set of items its settings make askable rather than by the settings
 * themselves. So the attempt has to carry the set — settings get
 * migrated and the identity must not move when they do.
 *
 * **Optional, and that is the migration.** An attempt written before this
 * field cannot be given one: recovering it would mean calling today's
 * `items(settings)` on yesterday's settings, which is the dependency 0039
 * exists to avoid, performed in the release most likely to have changed
 * the answer. So a v2 attempt arrives with `askable` absent, joins no
 * line, and advances no progress.
 *
 * Nothing is destroyed. The row stays in the log and stays exportable, so
 * the porting system owed below has something to port.
 *
 * **This is a licence with a term, not a policy.** The user's ruling, 6
 * October: history is highly changeable while the project is young and
 * need not survive a release; when settings settle, history becomes
 * portable and versioned. Implemented and left unwritten, "no migration
 * for now" becomes "this app does not migrate history", and the person
 * who finds out is a learner who lost a month.
 */
export interface AttemptV3 extends AttemptV2 {
  /**
   * Everything the settings could have asked, as `items(settings)`
   * returned it when the question was generated.
   *
   * Not the items the exercise *contained* — that is `items`, a subset,
   * and a set cannot be recovered from a subset. This is the answer
   * space, which is what the user's two-choices-against-three argument
   * was about.
   */
  askable?: readonly ItemId[];
}

export type Attempt = AttemptV3;

export const ATTEMPT_MIGRATIONS: readonly MigrationStep[] = [
  // 2 -> 3 is deliberately a no-op, and that is the decision rather than
  // an omission. `askable` is optional precisely so this step has nothing
  // to do: inventing a set from `settings` would call today's `items` on
  // yesterday's settings, and leaving the row out would destroy a history
  // the porting system is owed. See AttemptV3.
  //
  // 1 -> 2: give every attempt a presentation of its own.
  //
  // Attempts written before the field existed were all heard — reading was
  // not an option any exercise offered — so 'listen' is what happened rather
  // than a guess. A few late v1 rows carry it inside `settings`; prefer that
  // where it is there. Leaving them unlabelled would have merged a user's
  // whole history into whichever bucket the reader defaulted to.
  (data) => {
    const a = data as Record<string, unknown>;
    const stored = (a.settings as { presentation?: unknown } | null)?.presentation;
    return { ...a, presentation: stored === 'read' ? 'read' : 'listen' };
  },
  // 2 -> 3: nothing, and the nothing is the decision.
  //
  // A v2 attempt cannot be given an askable set. Recovering one means
  // calling today's `items(settings)` on yesterday's settings, which is
  // the dependency ADR 0039 exists to avoid, in the release most likely
  // to have changed the answer. So the row passes through unchanged,
  // arrives with `askable` absent, and joins no line.
  //
  // It is not dropped, which is the other half: the user's ruling makes
  // history disposable *for now* and owes a porting system later, and a
  // step that deleted rows would leave that system nothing to port.
  (data) => data,
];

/**
 * The row as IndexedDB stores it: the versioned payload, plus the two fields
 * the object store keys and indexes on.
 *
 * Duplicated out of the payload rather than indexed into it, because an index
 * on `data.answeredAt` would have to be rebuilt by an upgrade transaction the
 * first time the payload's version changed that field's path — which is the
 * expensive upgrade the record-level versioning exists to avoid.
 */
export interface AttemptRow extends Versioned<unknown> {
  id: string;
  answeredAt: number;
}

/**
 * Stamp an attempt with the current version, having first checked it can be
 * read back at that version.
 *
 * Raising {@link ATTEMPT_SCHEMA} and teaching the writer the new field are two
 * edits, and between them this stamped the new version onto data that did not
 * have it yet. The dev server serves code it has not type-checked, so the
 * window is real and it was hit: rows went in marked v2 with no
 * `presentation`.
 *
 * A row like that is refused on read, correctly, and it is already at the
 * current version — so no later migration step will ever come back for it. It
 * is the one unrecoverable shape in the store, and the cheapest place to make
 * it unreachable is here, one line before it exists. Failing at the write is
 * loud and costs the session's storage; failing at the read is silent and
 * costs the user their history.
 */
export function attemptRow(attempt: Attempt): AttemptRow {
  coerceAttempt(attempt);
  return { v: ATTEMPT_SCHEMA, data: attempt, id: attempt.id, answeredAt: attempt.answeredAt };
}

function isOutcome(value: unknown): value is ItemOutcome {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Partial<ItemOutcome>;
  return typeof o.item === 'string' && typeof o.correct === 'boolean'
    && (o.latencyMs === undefined || typeof o.latencyMs === 'number');
}

/**
 * Every presentation that may appear in a stored attempt.
 *
 * Deliberately its own list and not `PRESENTATION_LABELS`' keys: these are
 * a compatibility commitment (ADR 0010) and the labels are not, so a mode
 * removed from the UI must still load the history it produced. Adding to
 * this is how a new mode becomes storable; removing from it is a migration.
 */
const STORED_PRESENTATIONS: readonly Presentation[] = ['read', 'listen', 'play'];

/*
  A predicate rather than a bare `includes`, so the check still narrows.

  `includes` returns a boolean and leaves the field `Presentation |
  undefined`, which the assignment below then needs a cast to accept — and a
  cast there would make the check decorative: it would be the cast, not the
  test, deciding what the field is. That is what the two comparisons this
  replaced were quietly doing right.
*/
function isStoredPresentation(value: unknown): value is Presentation {
  return STORED_PRESENTATIONS.includes(value as Presentation);
}

/**
 * Throws rather than repairing, unlike {@link coerceSettings}.
 *
 * This is the user's own history: a row that cannot be read is not a row
 * whose defaults we know, and fabricating one would feed the schedule
 * evidence nobody produced. The reader skips it and says how many it skipped.
 */
export function coerceAttempt(data: unknown): Attempt {
  if (typeof data !== 'object' || data === null) throw new Error('Attempt is not an object');
  const a = data as Partial<AttemptV3>;
  if (typeof a.id !== 'string' || a.id === '') throw new Error('Attempt has no id');
  if (typeof a.exerciseType !== 'string') throw new Error(`Attempt ${a.id} has no exercise type`);
  /*
    Checked against the list rather than against two names, because this is
    the gate a *new* presentation has to pass. Written as two comparisons it
    read as validation and behaved as an allow-list, so adding "Playing"
    would have thrown on every attempt a learner recorded in it — a history
    refused at load by the code that exists to preserve it. The migration
    above is why that matters more here than elsewhere: a row this rejects
    is not skipped, it stops the read.
  */
  if (!isStoredPresentation(a.presentation)) {
    throw new Error(`Attempt ${a.id} has no presentation`);
  }
  // `typeof` rather than `Number.isFinite` alone, which accepts the value but
  // does not narrow away `undefined`.
  if (typeof a.seed !== 'number' || !Number.isFinite(a.seed)) {
    throw new Error(`Attempt ${a.id} has no seed`);
  }
  if (typeof a.startedAt !== 'number' || !Number.isFinite(a.startedAt)
    || typeof a.answeredAt !== 'number' || !Number.isFinite(a.answeredAt)) {
    throw new Error(`Attempt ${a.id} has no timestamps`);
  }
  if (!Array.isArray(a.items) || !a.items.every((i): i is ItemId => typeof i === 'string')) {
    throw new Error(`Attempt ${a.id} has no item list`);
  }
  if (!Array.isArray(a.outcomes) || !a.outcomes.every(isOutcome)) {
    throw new Error(`Attempt ${a.id} has unreadable outcomes`);
  }
  if (typeof a.correct !== 'boolean') throw new Error(`Attempt ${a.id} has no verdict`);
  /*
    Absent is legal and malformed is not. A v2 row has no askable set by
    design (see AttemptV3) and joins no line; a row carrying something
    that is not a list of ids is a row this reader cannot trust, and the
    file's rule is to skip such a row rather than repair it.
  */
  if (a.askable !== undefined
    && (!Array.isArray(a.askable) || !a.askable.every((i): i is ItemId => typeof i === 'string'))) {
    throw new Error(`Attempt ${a.id} has an unreadable askable set`);
  }
  return {
    id: a.id,
    exerciseType: a.exerciseType,
    seed: a.seed,
    settings: a.settings,
    presentation: a.presentation,
    startedAt: a.startedAt,
    answeredAt: a.answeredAt,
    items: [...a.items],
    outcomes: a.outcomes.map((o) => ({ ...o })),
    correct: a.correct,
    // Spread rather than assigned, so an absent set stays absent instead
    // of becoming an explicit `undefined` that an export would then write.
    ...(a.askable === undefined ? {} : { askable: [...a.askable] }),
  };
}

assertStepsCoverVersions('settings', SETTINGS_SCHEMA, SETTINGS_MIGRATIONS);
assertStepsCoverVersions('attempt', ATTEMPT_SCHEMA, ATTEMPT_MIGRATIONS);
