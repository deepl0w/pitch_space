import { describe, expect, it } from 'vitest';
import { createSettingsStore } from './settingsStore';
import { memorySlot, type Slot } from './persistence';
import { versioned, type Versioned } from './migrate';
import { SETTINGS_DEFAULTS, SETTINGS_SCHEMA, UNCALIBRATED, type SettingsDoc } from './schema';

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
  exercises: {}, lastExercise: null, audio: { ...UNCALIBRATED }, ...over,
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
