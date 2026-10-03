import { describe, expect, it } from 'vitest';
import { assertStepsCoverVersions, migrate, versioned, type MigrationStep } from './migrate';

/**
 * The migration path, tested at version 1 — when there is nothing real to
 * migrate yet.
 *
 * That is the point. The tables in `schema.ts` are empty because nothing has
 * shipped twice, so the runner is exercised against synthetic step tables
 * instead. By the time there is a real step to write, the thing it plugs
 * into will already have been shown to chain, to refuse a document from the
 * future, and to notice a gap in its own table.
 */

/** Steps that stamp what they did, so a chain's order is visible in the result. */
const addField = (name: string): MigrationStep => (data) =>
  ({ ...(data as object), [name]: true });

const asIs = (data: unknown) => data as Record<string, unknown>;

describe('migrating a stored document', () => {
  it('reports an absent document as absent rather than as broken', () => {
    // The ordinary first run. A caller that cannot tell these apart either
    // nags a new user about corruption or hides a real fault.
    for (const nothing of [null, undefined]) {
      expect(migrate(nothing, { current: 1, steps: [], validate: asIs }))
        .toEqual({ ok: false, reason: 'absent' });
    }
  });

  it('refuses anything that is not a versioned document', () => {
    const notDocuments = [
      42, 'string', [], {}, { v: 1 }, { data: {} },
      { v: '1', data: {} }, { v: 1.5, data: {} }, { v: 0, data: {} }, { v: -1, data: {} },
    ];
    for (const value of notDocuments) {
      expect(migrate(value, { current: 1, steps: [], validate: asIs }))
        .toEqual({ ok: false, reason: 'unreadable' });
    }
  });

  it('passes a current document through without claiming to have migrated it', () => {
    const outcome = migrate(versioned(2, { kept: 1 }), {
      current: 2, steps: [addField('a')], validate: asIs,
    });
    expect(outcome).toEqual({ ok: true, value: { kept: 1 }, migrated: false });
  });

  it('chains every step between the stored version and the current one', () => {
    const outcome = migrate(versioned(1, { kept: 1 }), {
      current: 4, steps: [addField('a'), addField('b'), addField('c')], validate: asIs,
    });
    expect(outcome).toEqual({
      ok: true, migrated: true, value: { kept: 1, a: true, b: true, c: true },
    });
  });

  it('starts from the version the document says, not from the first step', () => {
    const outcome = migrate(versioned(3, { kept: 1 }), {
      current: 4, steps: [addField('a'), addField('b'), addField('c')], validate: asIs,
    });
    expect(outcome).toEqual({ ok: true, migrated: true, value: { kept: 1, c: true } });
  });

  it('applies the steps in order', () => {
    const trail: number[] = [];
    const mark = (n: number): MigrationStep => (data) => { trail.push(n); return data; };
    migrate(versioned(1, {}), { current: 4, steps: [mark(1), mark(2), mark(3)], validate: asIs });
    expect(trail).toEqual([1, 2, 3]);
  });

  it('refuses a document written by a later release', () => {
    // Reached by a downgrade or by two tabs on different deploys. Reading a
    // field that has changed meaning and writing it back is how a user loses
    // settings they can see in the other tab.
    expect(migrate(versioned(5, {}), { current: 2, steps: [addField('a')], validate: asIs }))
      .toEqual({ ok: false, reason: 'from-the-future', found: 5 });
  });

  it('throws on a gap in its own table rather than resetting the user', () => {
    // A packaging mistake, not user data going wrong, and it would otherwise
    // present as settings quietly reverting to their defaults.
    expect(() => migrate(versioned(1, {}), { current: 3, steps: [addField('a')], validate: asIs }))
      .toThrow(/No migration from schema version 2 to 3/);
  });

  it('validates on the way out, migrated or not', () => {
    const seen: unknown[] = [];
    const validate = (data: unknown) => { seen.push(data); return data as object; };
    migrate(versioned(1, { from: 1 }), { current: 1, steps: [], validate });
    migrate(versioned(1, { from: 1 }), { current: 2, steps: [addField('a')], validate });
    expect(seen).toEqual([{ from: 1 }, { from: 1, a: true }]);
  });

  it('lets a validator refuse, for data worth losing rather than guessing at', () => {
    expect(() => migrate(versioned(1, {}), {
      current: 1, steps: [], validate: () => { throw new Error('unreadable record'); },
    })).toThrow('unreadable record');
  });
});

describe('the step table', () => {
  it('accepts a table with exactly one step per version short of current', () => {
    expect(() => assertStepsCoverVersions('x', 1, [])).not.toThrow();
    expect(() => assertStepsCoverVersions('x', 3, [addField('a'), addField('b')])).not.toThrow();
  });

  it('catches a version bumped without a step, and a step without a bump', () => {
    expect(() => assertStepsCoverVersions('settings', 2, [])).toThrow(/expected 1/);
    expect(() => assertStepsCoverVersions('settings', 1, [addField('a')])).toThrow(/expected 0/);
  });
});
