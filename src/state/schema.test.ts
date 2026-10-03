import { describe, expect, it } from 'vitest';
import {
  attemptRow, coerceAttempt, coerceSettings, settingsDefaults,
  ATTEMPT_SCHEMA, SETTINGS_DEFAULTS, SETTINGS_MIGRATIONS, SETTINGS_SCHEMA,
  ATTEMPT_MIGRATIONS,
  type Attempt,
} from './schema';
import { assertStepsCoverVersions } from './migrate';

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
