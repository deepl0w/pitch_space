import type { ItemId, ItemOutcome } from '../exercises/types';
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
export const SETTINGS_SCHEMA = 1;

export interface SettingsDocV1 {
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

export type SettingsDoc = SettingsDocV1;

export const SETTINGS_DEFAULTS: SettingsDoc = { exercises: {}, lastExercise: null };

/**
 * Empty at version 1, and checked to be the right kind of empty.
 *
 * `steps[n - 1]` takes a version-`n` document to version `n + 1`, so a
 * release that bumps {@link SETTINGS_SCHEMA} without appending a step fails
 * here rather than in the field.
 */
export const SETTINGS_MIGRATIONS: readonly MigrationStep[] = [];

/**
 * Repair towards the defaults, field by field.
 *
 * Total, because a missing preference should cost the user that preference
 * and not the screen. Unknown keys under `exercises` are kept: they belong to
 * an exercise type this build does not have, and dropping them would wipe a
 * user's settings every time they ran an older release.
 */
export function coerceSettings(data: unknown): SettingsDoc {
  if (typeof data !== 'object' || data === null) return { ...SETTINGS_DEFAULTS };
  const doc = data as Partial<SettingsDocV1>;
  const exercises = typeof doc.exercises === 'object' && doc.exercises !== null
    ? { ...doc.exercises }
    : {};
  return {
    exercises,
    lastExercise: typeof doc.lastExercise === 'string' ? doc.lastExercise : null,
  };
}

/* -- attempts ------------------------------------------------------------- */

export const ATTEMPT_SCHEMA = 1;

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

export type Attempt = AttemptV1;

export const ATTEMPT_MIGRATIONS: readonly MigrationStep[] = [];

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

export function attemptRow(attempt: Attempt): AttemptRow {
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
  const a = data as Partial<AttemptV1>;
  if (typeof a.id !== 'string' || a.id === '') throw new Error('Attempt has no id');
  if (typeof a.exerciseType !== 'string') throw new Error(`Attempt ${a.id} has no exercise type`);
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
    startedAt: a.startedAt,
    answeredAt: a.answeredAt,
    items: [...a.items],
    outcomes: a.outcomes.map((o) => ({ ...o })),
    correct: a.correct,
  };
}

assertStepsCoverVersions('settings', SETTINGS_SCHEMA, SETTINGS_MIGRATIONS);
assertStepsCoverVersions('attempt', ATTEMPT_SCHEMA, ATTEMPT_MIGRATIONS);
