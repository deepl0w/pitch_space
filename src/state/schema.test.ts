import { describe, expect, it } from 'vitest';
import {
  ATTEMPT_MIGRATIONS, ATTEMPT_SCHEMA, SETTINGS_DEFAULTS, SETTINGS_MIGRATIONS,
  SETTINGS_SCHEMA, attemptRow, coerceAttempt, coerceSettings, settingsDefaults,
  type Attempt,
} from './schema';
import { assertStepsCoverVersions, migrate, versioned } from './migrate';

/**
 * The two coercions, which are the only things standing between a
 * hand-edited device and the rest of the app.
 *
 * They are deliberately unalike and the tests say so: a preference repairs
 * towards its default because losing one is cheaper than refusing to render,
 * and a recorded attempt throws because inventing a history is worse than
 * admitting to a gap in one.
 */

const attempt: Attempt = {
  id: 'a1',
  exerciseType: 'interval-id',
  seed: 7919,
  settings: { difficulty: 2 },
  presentation: 'listen' as const,
  startedAt: 1_700_000_000_000,
  answeredAt: 1_700_000_004_000,
  items: ['interval:m3:up'],
  outcomes: [{ item: 'interval:m3:up', correct: true, latencyMs: 4000 }],
  correct: true,
};

/** `attempt` with one field replaced or removed, as it would arrive from storage. */
function broken(field: keyof Attempt, value: unknown): unknown {
  const copy: Record<string, unknown> = { ...attempt };
  if (value === undefined) delete copy[field];
  else copy[field] = value;
  return copy;
}

describe('coercing a settings document', () => {
  it('repairs anything at all into a usable document', () => {
    const rubbish = [undefined, null, 0, '', 'nonsense', [], true, () => {}];
    for (const value of rubbish) {
      expect(coerceSettings(value)).toEqual({ exercises: {}, lastExercise: null });
    }
  });

  it('keeps settings belonging to exercise types this build does not have', () => {
    // Dropping them would wipe a user's settings every time they opened an
    // older release, which is the sort of loss nobody attributes correctly.
    const doc = coerceSettings({
      exercises: { 'interval-id': { difficulty: 4 }, 'not-yet-written': { x: 1 } },
      lastExercise: 'interval-id',
    });
    expect(doc.exercises).toEqual({
      'interval-id': { difficulty: 4 }, 'not-yet-written': { x: 1 },
    });
    expect(doc.lastExercise).toBe('interval-id');
  });

  it('forgets a last exercise that is not a string, rather than storing one', () => {
    for (const value of [undefined, null, 7, {}, ['interval-id']]) {
      expect(coerceSettings({ exercises: {}, lastExercise: value }).lastExercise).toBeNull();
    }
  });

  it('replaces an exercises map that is not a map', () => {
    for (const value of [undefined, null, 'none', 42]) {
      expect(coerceSettings({ exercises: value, lastExercise: null }).exercises).toEqual({});
    }
  });

  it('hands back a document nobody else holds a reference to', () => {
    // The returned exercises map used to be the module-level defaults'
    // own object, so one caller editing it in place changed what every
    // later first run was given.
    const first = coerceSettings(null);
    first.exercises['interval-id'] = { difficulty: 5 };
    expect(coerceSettings(null).exercises).toEqual({});
    expect(SETTINGS_DEFAULTS.exercises).toEqual({});

    const source = { exercises: { a: 1 }, lastExercise: null };
    const copied = coerceSettings(source);
    copied.exercises.b = 2;
    expect(source.exercises).toEqual({ a: 1 });
  });

  it('agrees with the defaults it is paired with', () => {
    expect(coerceSettings(SETTINGS_DEFAULTS)).toEqual(SETTINGS_DEFAULTS);
    expect(settingsDefaults()).toEqual(SETTINGS_DEFAULTS);
    expect(settingsDefaults()).not.toBe(settingsDefaults());
  });
});

describe('coercing a recorded attempt', () => {
  it('accepts one it wrote itself, through a round trip in storage', () => {
    expect(coerceAttempt(JSON.parse(JSON.stringify(attempt)))).toEqual(attempt);
  });

  it('accepts an outcome with no latency, which not every exercise can measure', () => {
    const noLatency = broken('outcomes', [{ item: 'interval:P5:up', correct: false }]);
    expect(coerceAttempt(noLatency).outcomes).toEqual([{ item: 'interval:P5:up', correct: false }]);
  });

  it('accepts an attempt that tested none of the items it contained', () => {
    // A skipped exercise is evidence of nothing, and the schedule has to be
    // able to tell that from evidence of failure.
    expect(coerceAttempt(broken('outcomes', [])).outcomes).toEqual([]);
  });

  it('refuses anything that is not an object at all', () => {
    for (const value of [undefined, null, 0, 'attempt', []]) {
      // An array reaches the field checks and fails on the id; what matters
      // is that none of these comes back as a readable record.
      expect(() => coerceAttempt(value)).toThrow();
    }
  });

  it('refuses a record with a field missing or of the wrong kind', () => {
    const rejected: Array<[keyof Attempt, unknown, RegExp]> = [
      ['id', undefined, /no id/],
      ['id', '', /no id/],
      ['id', 42, /no id/],
      ['exerciseType', undefined, /no exercise type/],
      ['exerciseType', 7, /no exercise type/],
      ['seed', undefined, /no seed/],
      ['seed', '7919', /no seed/],
      ['seed', Number.NaN, /no seed/],
      ['seed', Number.POSITIVE_INFINITY, /no seed/],
      ['startedAt', undefined, /no timestamps/],
      ['startedAt', Number.NaN, /no timestamps/],
      ['answeredAt', undefined, /no timestamps/],
      ['answeredAt', '2026-10-04', /no timestamps/],
      ['items', undefined, /no item list/],
      ['items', 'interval:m3:up', /no item list/],
      ['items', ['interval:m3:up', 3], /no item list/],
      ['outcomes', undefined, /unreadable outcomes/],
      ['outcomes', {}, /unreadable outcomes/],
      ['outcomes', [null], /unreadable outcomes/],
      ['outcomes', [{ correct: true }], /unreadable outcomes/],
      ['outcomes', [{ item: 'interval:m3:up' }], /unreadable outcomes/],
      ['outcomes', [{ item: 7, correct: true }], /unreadable outcomes/],
      ['outcomes', [{ item: 'i', correct: 'yes' }], /unreadable outcomes/],
      ['outcomes', [{ item: 'i', correct: true, latencyMs: 'fast' }], /unreadable outcomes/],
      ['correct', undefined, /no verdict/],
      ['correct', 1, /no verdict/],
    ];
    for (const [field, value, message] of rejected) {
      expect(() => coerceAttempt(broken(field, value)), `${field} = ${String(value)}`)
        .toThrow(message);
    }
  });

  it('keeps settings whatever shape they are, including absent', () => {
    // They belong to the exercise type, which is the only thing that can
    // read them; refusing a shape this file does not understand would make
    // every exercise type a change to this file.
    expect(coerceAttempt(broken('settings', undefined)).settings).toBeUndefined();
    expect(coerceAttempt(broken('settings', 'whatever')).settings).toBe('whatever');
  });

  it('copies the arrays out, so the caller cannot edit the stored row', () => {
    const stored = JSON.parse(JSON.stringify(attempt)) as Attempt;
    const read = coerceAttempt(stored);
    read.items.push('interval:P5:up');
    read.outcomes[0].correct = false;
    expect(stored.items).toEqual(['interval:m3:up']);
    expect(stored.outcomes[0].correct).toBe(true);
  });
});

describe('the stored row', () => {
  it('stamps the current schema version and lifts out what the store keys on', () => {
    const row = attemptRow(attempt);
    expect(row).toEqual({
      v: ATTEMPT_SCHEMA, data: attempt, id: attempt.id, answeredAt: attempt.answeredAt,
    });
  });

  it('lifts the key and the index out of the payload rather than beside it', () => {
    // An index on `data.answeredAt` would need rebuilding by an upgrade
    // transaction the first time the payload moved that field.
    const row = attemptRow({ ...attempt, id: 'b2', answeredAt: 42 });
    expect(row.id).toBe('b2');
    expect(row.answeredAt).toBe(42);
  });

  /**
   * Raising the schema version and teaching the writer the new field are two
   * edits, and between them this stamps the new version onto data that does
   * not have it yet. Vite serves code that has not been type-checked, so the
   * window is real and it was hit: rows went in marked v2 with no
   * `presentation`.
   *
   * Such a row is refused on read, correctly — and it is already at the
   * current version, so no later step will ever come back for it. It is the
   * one unrecoverable shape in the whole store, and the cheapest place to
   * make it unreachable is the moment before it is written.
   */
  it('refuses to stamp the current version onto a row it could not read back', () => {
    const missing = { ...attempt } as Record<string, unknown>;
    delete missing.presentation;
    expect(() => attemptRow(missing as unknown as Attempt)).toThrow(/presentation/);
  });

  it('refuses any payload the reader would reject, not just that one', () => {
    for (const field of ['id', 'exerciseType', 'seed', 'startedAt', 'items', 'outcomes', 'correct'] as const) {
      expect(() => attemptRow(broken(field, undefined) as Attempt), field).toThrow();
    }
  });

  it('still writes a good attempt, and one that reads back identically', () => {
    const row = attemptRow(attempt);
    const read = migrate<Attempt>(row, {
      current: ATTEMPT_SCHEMA, steps: ATTEMPT_MIGRATIONS, validate: coerceAttempt,
    });
    expect(read.ok && read.value).toEqual(attempt);
  });
});

describe('the migration tables in this file', () => {
  it('cover every version short of the current one', () => {
    // Asserted at import too; here so that a bump without a step fails as a
    // test rather than as an app that will not start.
    expect(() => assertStepsCoverVersions('settings', SETTINGS_SCHEMA, SETTINGS_MIGRATIONS))
      .not.toThrow();
    expect(() => assertStepsCoverVersions('attempt', ATTEMPT_SCHEMA, ATTEMPT_MIGRATIONS))
      .not.toThrow();
  });
});

describe('upgrading an attempt from v1 to v2', () => {
  /**
   * The first migration this app has ever run, over the one thing in it a
   * user cannot get back. A migration that silently does nothing is worse
   * than one that fails: the data is still there, every reader sees a field
   * that was never filled, and nothing says so.
   */
  const v1 = (over: Record<string, unknown> = {}) => ({
    id: 'old-1',
    exerciseType: 'interval-id',
    seed: 7,
    settings: { difficulty: 2 },
    startedAt: 1_000,
    answeredAt: 2_000,
    items: ['interval:m3:up'],
    outcomes: [{ item: 'interval:m3:up', correct: true }],
    correct: true,
    ...over,
  });

  const upgrade = (stored: unknown) =>
    migrate<Attempt>(versioned(1, stored), {
      current: ATTEMPT_SCHEMA,
      steps: ATTEMPT_MIGRATIONS,
      validate: coerceAttempt,
    });

  it('gives an attempt written before the field existed one it can be read by', () => {
    const out = upgrade(v1());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // 'listen' is what happened, not a default: reading was not an option
    // any exercise offered when these rows were written.
    expect(out.value.presentation).toBe('listen');
    expect(out.migrated).toBe(true);
  });

  it('prefers a presentation the row already carried inside its settings', () => {
    const out = upgrade(v1({ settings: { difficulty: 2, presentation: 'read' } }));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.presentation).toBe('read');
  });

  it('leaves everything else about the attempt alone', () => {
    const out = upgrade(v1());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.id).toBe('old-1');
    expect(out.value.seed).toBe(7);
    expect(out.value.outcomes).toEqual([{ item: 'interval:m3:up', correct: true }]);
    expect(out.value.correct).toBe(true);
  });

  // The check runs on migrated data, so a step that forgot the field has to
  // be refused rather than stored half-upgraded.
  it('refuses a v2 attempt that has no presentation at all', () => {
    expect(() => coerceAttempt(v1())).toThrow(/presentation/);
  });
});
