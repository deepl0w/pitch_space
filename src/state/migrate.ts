/**
 * Versioned persisted documents, and the one function that brings them
 * forward.
 *
 * This exists at version 1, with an empty step table, on purpose. Review
 * history is the first thing in this app whose loss would actually matter to
 * someone (docs/ROADMAP.md), and a migration path written after the first
 * release has to be written against data that is already in the field — at
 * which point the shape it has to read is whatever shipped, guessed at from
 * the source history. Writing the runner now costs an afternoon; writing it
 * later costs a guess.
 *
 * Every stored value is wrapped rather than versioned in place, so the
 * version is readable without knowing the shape it describes. A bare document
 * with a `v` field cannot be told apart from a document whose own schema
 * happens to use that name.
 */

export interface Versioned<T> {
  /** Schema version of `data`, counting from 1. */
  v: number;
  data: T;
}

/**
 * One step forward, from version `n` to version `n + 1`.
 *
 * Typed loosely at both ends because the input is by definition a shape the
 * current release no longer has a type for. The step is where the knowledge
 * of the old shape lives, and it is the only place in the codebase allowed to
 * know it.
 */
export type MigrationStep = (data: unknown) => unknown;

export type MigrationOutcome<T> =
  | { ok: true; value: T; migrated: boolean }
  /** Nothing stored, which is the ordinary first-run case rather than a fault. */
  | { ok: false; reason: 'absent' }
  /** Not a versioned document at all: hand-edited, truncated, or another app's key. */
  | { ok: false; reason: 'unreadable' }
  /**
   * Written by a later release than this one.
   *
   * Reached by a downgrade, or by two tabs on different deploys. Refused
   * rather than guessed at, because the alternative is reading a field that
   * has changed meaning and writing the result back over the good copy.
   */
  | { ok: false; reason: 'from-the-future'; found: number };

function isVersioned(value: unknown): value is Versioned<unknown> {
  return typeof value === 'object' && value !== null
    && 'v' in value && Number.isInteger((value as Versioned<unknown>).v)
    && 'data' in value;
}

/**
 * Bring a stored document up to `current`, applying `steps[n - 1]` to move
 * from version `n` to `n + 1`.
 *
 * `migrated` is reported rather than inferred, so a caller can write the
 * upgraded document straight back and a caller that only reads need not.
 * `validate` runs last and on every path, because a migration chain that ends
 * in the right *version* has still only been checked against the shapes its
 * author imagined.
 */
export function migrate<T>(
  stored: unknown,
  options: {
    current: number;
    steps: readonly MigrationStep[];
    /**
     * Last check, on migrated data.
     *
     * A preference repairs towards its default, because losing one is
     * cheaper than refusing to render a screen. A user's own record throws
     * instead, so a caller reading many of them skips the bad one and keeps
     * the rest rather than quietly inventing a history.
     */
    validate: (data: unknown) => T;
  },
): MigrationOutcome<T> {
  if (stored === null || stored === undefined) return { ok: false, reason: 'absent' };
  if (!isVersioned(stored)) return { ok: false, reason: 'unreadable' };
  if (stored.v < 1) return { ok: false, reason: 'unreadable' };
  if (stored.v > options.current) {
    return { ok: false, reason: 'from-the-future', found: stored.v };
  }

  let data = stored.data;
  for (let v = stored.v; v < options.current; v++) {
    const step = options.steps[v - 1];
    if (!step) {
      // A gap in the table is a packaging mistake, not user data going wrong,
      // and it would otherwise present as settings silently resetting.
      throw new Error(`No migration from schema version ${v} to ${v + 1}`);
    }
    data = step(data);
  }
  return { ok: true, value: options.validate(data), migrated: stored.v !== options.current };
}

/** Wrap a document for storage at the current version. */
export function versioned<T>(v: number, data: T): Versioned<T> {
  return { v, data };
}

/**
 * The table has exactly one step per version short of the current one.
 *
 * Asserted at startup and in a test rather than discovered when a user with
 * an old document opens the app, which is the only time the gap would
 * otherwise show.
 */
export function assertStepsCoverVersions(name: string, current: number, steps: readonly MigrationStep[]): void {
  if (steps.length !== current - 1) {
    throw new Error(
      `${name} is at schema version ${current} but has ${steps.length} migration step(s); expected ${current - 1}`,
    );
  }
}
