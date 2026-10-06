import { describe, expect, it } from 'vitest';
import { createSettingsStore } from './settingsStore';
import { memorySlot, type Slot } from './persistence';
import { versioned, type Versioned } from './migrate';
import { EXERCISE_TYPES, findExerciseType } from '../exercises/registry';
import {
  APPEARANCE_DEFAULTS, SETTINGS_DEFAULTS, SETTINGS_SCHEMA, UNCALIBRATED, type SettingsDoc,
} from './schema';

/**
 * The preferences store, over a slot a test owns.
 *
 * Hydration happens at construction rather than in an effect, which is what
 * makes the first paint right; that also makes it testable without a React
 * tree, so these are assertions about the store and not about a component.
 */

type Stored = Versioned<unknown>;

/** A slot that counts its writes, so "wrote nothing" is assertable. */
function countingSlot(initial: Stored | null = null): Slot<Stored> & { writes: Stored[] } {
  const inner = memorySlot<Stored>(initial);
  const writes: Stored[] = [];
  return {
    writes,
    read: inner.read,
    write(value) { writes.push(value); inner.write(value); },
    clear() { inner.clear(); },
  };
}

const doc = (over: Partial<SettingsDoc> = {}): SettingsDoc => ({
  exercises: {}, lastExercise: null, audio: { ...UNCALIBRATED },
  appearance: { ...APPEARANCE_DEFAULTS }, ...over,
});

describe('hydrating the settings store', () => {
  it('starts on the defaults when the device holds nothing', () => {
    const store = createSettingsStore(memorySlot<Stored>());
    expect(store.getState().doc).toEqual(SETTINGS_DEFAULTS);
    expect(store.getState().persisting).toBe(true);
  });

  it('writes nothing on a first run', () => {
    // Writing defaults at startup would make a user who has configured
    // nothing indistinguishable from one who has, and there is no way back
    // from that.
    const slot = countingSlot();
    createSettingsStore(slot);
    expect(slot.writes).toEqual([]);
    expect(slot.read()).toBeNull();
  });

  it('reads back what a previous session stored', () => {
    const stored = doc({ exercises: { 'interval-id': { difficulty: 4 } }, lastExercise: 'interval-id' });
    const store = createSettingsStore(memorySlot<Stored>(versioned(SETTINGS_SCHEMA, stored)));
    expect(store.getState().doc).toEqual(stored);
  });

  it('repairs a stored document rather than refusing to start', () => {
    const store = createSettingsStore(
      memorySlot<Stored>(versioned(SETTINGS_SCHEMA, { lastExercise: 42, junk: true })),
    );
    expect(store.getState().doc).toEqual(SETTINGS_DEFAULTS);
    expect(store.getState().persisting).toBe(true);
  });

  it('starts fresh on a document that is not a document, and still persists', () => {
    // Another app's key, or a truncated write. There is nothing here worth
    // protecting, so the next preference the user sets is stored.
    const slot = countingSlot({ nonsense: true } as unknown as Stored);
    const store = createSettingsStore(slot);
    expect(store.getState().doc).toEqual(SETTINGS_DEFAULTS);
    expect(store.getState().persisting).toBe(true);
    store.getState().setLastExercise('interval-id');
    expect(slot.read()).toEqual(versioned(SETTINGS_SCHEMA, doc({ lastExercise: 'interval-id' })));
  });

  it('owns the defaults it starts on', () => {
    const first = createSettingsStore(memorySlot<Stored>());
    first.getState().setExerciseSettings('interval-id', { difficulty: 5 });
    expect(createSettingsStore(memorySlot<Stored>()).getState().doc).toEqual(SETTINGS_DEFAULTS);
  });
});

describe('changing a setting', () => {
  it('keeps it, and writes it through at the current schema version', () => {
    const slot = countingSlot();
    const store = createSettingsStore(slot);
    store.getState().setExerciseSettings('interval-id', { difficulty: 4 });

    expect(store.getState().doc.exercises).toEqual({ 'interval-id': { difficulty: 4 } });
    expect(slot.read()).toEqual(versioned(SETTINGS_SCHEMA, store.getState().doc));
  });

  it('leaves other exercise types alone', () => {
    const store = createSettingsStore(memorySlot<Stored>());
    store.getState().setExerciseSettings('interval-id', { difficulty: 4 });
    store.getState().setExerciseSettings('rhythm', { bars: 2 });
    expect(store.getState().doc.exercises)
      .toEqual({ 'interval-id': { difficulty: 4 }, rhythm: { bars: 2 } });
  });

  it('remembers which exercise was last open, and can forget it again', () => {
    const store = createSettingsStore(memorySlot<Stored>());
    store.getState().setLastExercise('interval-id');
    expect(store.getState().doc.lastExercise).toBe('interval-id');
    store.getState().setLastExercise(null);
    expect(store.getState().doc.lastExercise).toBeNull();
  });

  it('replaces the document rather than editing it, so subscribers see a change', () => {
    const store = createSettingsStore(memorySlot<Stored>());
    const before = store.getState().doc;
    store.getState().setLastExercise('interval-id');
    expect(store.getState().doc).not.toBe(before);
    expect(before.lastExercise).toBeNull();
  });
});

describe('a document from a later release', () => {
  const future = versioned(SETTINGS_SCHEMA + 1, { exercises: { future: {} }, lastExercise: 'x' });

  it('is not read, and not overwritten either', () => {
    // A downgrade, or the second tab during a deploy. The session runs on
    // defaults; the account keeps what the newer release wrote.
    const slot = countingSlot(future);
    const store = createSettingsStore(slot);
    expect(store.getState().doc).toEqual(SETTINGS_DEFAULTS);
    expect(store.getState().persisting).toBe(false);

    store.getState().setLastExercise('interval-id');
    expect(store.getState().doc.lastExercise).toBe('interval-id');
    expect(slot.writes).toEqual([]);
    expect(slot.read()).toEqual(future);
  });

  it('is thrown away only when the user asks, and then writing resumes', () => {
    const slot = countingSlot(future);
    const store = createSettingsStore(slot);
    store.getState().reset();

    expect(slot.read()).toBeNull();
    expect(store.getState().doc).toEqual(SETTINGS_DEFAULTS);
    expect(store.getState().persisting).toBe(true);

    store.getState().setLastExercise('interval-id');
    expect(slot.read()).toEqual(versioned(SETTINGS_SCHEMA, doc({ lastExercise: 'interval-id' })));
  });
});

describe('resetting', () => {
  it('clears the device as well as the session', () => {
    const slot = countingSlot();
    const store = createSettingsStore(slot);
    store.getState().setExerciseSettings('interval-id', { difficulty: 5 });
    store.getState().reset();

    expect(store.getState().doc).toEqual(SETTINGS_DEFAULTS);
    expect(slot.read()).toBeNull();
  });

  it('leaves a document nobody else is holding', () => {
    const store = createSettingsStore(memorySlot<Stored>());
    store.getState().reset();
    store.getState().doc.exercises['interval-id'] = { difficulty: 1 };
    expect(SETTINGS_DEFAULTS.exercises).toEqual({});
  });
});

/**
 * A document with years on it, read the way the screen reads one.
 *
 * The migration cases in `schema.test.ts` stop at the document and the
 * coercion cases in `registry.test.ts` start from a blob. Between them is
 * the trip a returning user actually makes — storage, migration, the
 * document, then each exercise's own `coerce` — and **neither half was ever
 * checked against the other's output**, which is the same gap the rhythm
 * chain had.
 *
 * The fixture is what a real profile looks like rather than what a test
 * usually builds: written at version 1, carrying settings from builds that
 * had a grade dial, an exercise this release does not ship, and a
 * `lastExercise` pointing at it.
 */
describe('a settings document with history in it', () => {
  /** The oldest schema this app has, with a user's accumulated choices in it. */
  const aged = versioned(1, {
    exercises: {
      // 0027 removed the grade dial; a document written before that still
      // has one, beside choices this build does understand.
      'interval-id': { grade: 7, clef: 'bass', directions: ['up'] },
      'rhythm-id': { difficulty: 4, tempo: 132, bars: 2 },
      // An exercise this release does not have. `coerceSettings` promises
      // to keep it, because dropping it wipes the settings of anyone who
      // runs an older build afterwards.
      'not-yet-written': { whatever: [1, 2, 3] },
    },
    lastExercise: 'not-yet-written',
  });

  it('is readable, and migrated once rather than on every load', () => {
    const slot = countingSlot(aged);
    const store = createSettingsStore(slot);
    expect(store.getState().persisting).toBe(true);
    expect(slot.writes).toHaveLength(1);
    expect(slot.writes[0].v).toBe(SETTINGS_SCHEMA);
  });

  it('keeps the settings of an exercise this build does not have', () => {
    const store = createSettingsStore(countingSlot(aged));
    expect(store.getState().doc.exercises['not-yet-written'])
      .toEqual({ whatever: [1, 2, 3] });
  });

  it('gives every exercise something it can generate from', () => {
    /*
      The join, travelled rather than assumed. `PracticeScreen` reads
      `doc.exercises[id]` and hands it straight to the definition's
      `coerce`; this does the same and then generates, because settings
      that coerce and cannot generate are settings that break the screen
      rather than the store.
    */
    const store = createSettingsStore(countingSlot(aged));
    const stored = store.getState().doc.exercises;
    for (const definition of EXERCISE_TYPES) {
      const settings = definition.settings.coerce(stored[definition.id]);
      expect(() => definition.generate({ seed: 7919, settings }), definition.id).not.toThrow();
      expect(definition.items(settings).length, `${definition.id} can ask nothing`)
        .toBeGreaterThan(0);
    }
  });

  it('does not delete a newer release\'s field when an older build writes', () => {
    /*
      The loss this trip was chased to find, and it does not happen where
      it looks like it happens.

      A field a newer release added survives hydration — `coerceSettings`
      keeps the exercises map whole — and the exercise's own `coerce` then
      drops it, correctly, because a closed valid shape is what `coerce` is
      for. Nothing is lost yet: the raw blob is still in the document, and
      `PracticeScreen` coerces on *read*.

      It dies on the write. `setExerciseSettings` used to store the coerced
      value in place of the stored one, so the first touch of a settings
      panel in an older build deleted the field permanently — while an
      unknown *exercise* beside it was kept, which is the same promise
      honoured at one level and broken at the next. ADR 0038.

      The fix is a merge and it is one line, which is the problem with it: a
      spread whose left side looks already contained in its right is what a
      tidy-up removes. This case is what makes that removal fail.
    */
    const slot = countingSlot(versioned(SETTINGS_SCHEMA, {
      exercises: {
        'interval-id': { clef: 'bass', octaveRange: [3, 6] },
      },
      lastExercise: null,
    }));
    const store = createSettingsStore(slot);
    const intervals = findExerciseType('interval-id')!;

    // Exactly what the screen does: coerce on read, write back a change.
    const read = intervals.settings.coerce(store.getState().doc.exercises['interval-id']);
    expect(read, 'coerce kept a key it does not know, so this tests nothing')
      .not.toHaveProperty('octaveRange');
    store.getState().setExerciseSettings('interval-id', read);

    const after = store.getState().doc.exercises['interval-id'] as Record<string, unknown>;
    expect(after.octaveRange, 'a field from a newer release was deleted by this build')
      .toEqual([3, 6]);
    expect(after).toMatchObject(read as Record<string, unknown>);
  });

  it('lets the change the user just made win over what was stored', () => {
    /*
      The other direction of the same merge, and the case the first version
      of the one above could not make.

      It asserted that `clef` was still `bass` after the write — but the
      stored blob said `bass` too, so the two sides of the merge agreed and
      which one won was untestable. Reversing the spread passed. A merge has
      a direction and only a value that differs can show it.

      This is the live hazard, not a theoretical one: stale-wins means a
      user changes a setting, the panel writes it, and the old value comes
      straight back.
    */
    const slot = countingSlot(versioned(SETTINGS_SCHEMA, {
      exercises: { 'interval-id': { clef: 'bass', octaveRange: [3, 6] } },
      lastExercise: null,
    }));
    const store = createSettingsStore(slot);
    const intervals = findExerciseType('interval-id')!;

    const read = intervals.settings.coerce(store.getState().doc.exercises['interval-id']);
    const changed = { ...(read as Record<string, unknown>), clef: 'treble' };
    expect(changed.clef, 'the change is not a change').not.toBe(
      (store.getState().doc.exercises['interval-id'] as { clef: string }).clef,
    );
    store.getState().setExerciseSettings('interval-id', changed);

    const after = store.getState().doc.exercises['interval-id'] as Record<string, unknown>;
    expect(after.clef, 'the stored value overwrote the one the user chose').toBe('treble');
    expect(after.octaveRange, 'and the unknown field still survived').toEqual([3, 6]);
  });

  it('carries the choices that outlived the build that wrote them', () => {
    /*
      The half that matters to the user: the obsolete keys are dropped and
      the choices beside them are not. A document that arrives readable and
      silently reset is the failure this whole trip is about, and it looks
      identical to a document that arrived fine.
    */
    const store = createSettingsStore(countingSlot(aged));
    const stored = store.getState().doc.exercises;

    const intervals = findExerciseType('interval-id')!;
    expect((intervals.settings.coerce(stored['interval-id']) as { clef: string }).clef)
      .toBe('bass');

    const rhythm = findExerciseType('rhythm-id')!;
    const settings = rhythm.settings.coerce(stored['rhythm-id']) as
      { tempo: number; bars: number };
    expect(settings.tempo).toBe(132);
    expect(settings.bars).toBe(2);

    // The control: these are not the defaults, so surviving is a claim.
    expect((intervals.settings.defaults as { clef: string }).clef).not.toBe('bass');
    expect((rhythm.settings.defaults as { tempo: number }).tempo).not.toBe(132);
  });
});
