import type { ItemId, ItemOutcome, Presentation } from '../exercises/types';
import { assertStepsCoverVersions, type MigrationStep, type Versioned } from './migrate';

/**
 * Every shape this app writes to a user's device, with its version.
 *
 * One file, because the thing that goes wrong with persisted schemas is that
 * the shape and the version that describes it drift apart in separate files.
 * The migration tables live beside the shapes they migrate to, and both are
 * exported so a test can walk them.
 */

/* -- settings ------------------------------------------------------------- */

export const SETTINGS_KEY = 'music-practice:settings';
export const SETTINGS_SCHEMA = 2;

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

export type SettingsDoc = SettingsDocV2;

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
  return { exercises: {}, lastExercise: null, audio: { ...UNCALIBRATED } };
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
  const doc = data as Partial<SettingsDocV2>;
  const exercises = typeof doc.exercises === 'object' && doc.exercises !== null
    ? { ...doc.exercises }
    : {};
  return {
    exercises,
    lastExercise: typeof doc.lastExercise === 'string' ? doc.lastExercise : null,
    audio: coerceAudio(doc.audio),
  };
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

export const ATTEMPT_SCHEMA = 2;

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

export type Attempt = AttemptV2;

export const ATTEMPT_MIGRATIONS: readonly MigrationStep[] = [
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
 * Throws rather than repairing, unlike {@link coerceSettings}.
 *
 * This is the user's own history: a row that cannot be read is not a row
 * whose defaults we know, and fabricating one would feed the schedule
 * evidence nobody produced. The reader skips it and says how many it skipped.
 */
export function coerceAttempt(data: unknown): Attempt {
  if (typeof data !== 'object' || data === null) throw new Error('Attempt is not an object');
  const a = data as Partial<AttemptV2>;
  if (typeof a.id !== 'string' || a.id === '') throw new Error('Attempt has no id');
  if (typeof a.exerciseType !== 'string') throw new Error(`Attempt ${a.id} has no exercise type`);
  if (a.presentation !== 'read' && a.presentation !== 'listen') {
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
  };
}

assertStepsCoverVersions('settings', SETTINGS_SCHEMA, SETTINGS_MIGRATIONS);
assertStepsCoverVersions('attempt', ATTEMPT_SCHEMA, ATTEMPT_MIGRATIONS);
