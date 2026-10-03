import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { localStorageSlot, type Slot } from './persistence';
import { migrate, versioned, type Versioned } from './migrate';
import {
  coerceSettings, SETTINGS_DEFAULTS, SETTINGS_KEY, SETTINGS_MIGRATIONS, SETTINGS_SCHEMA,
  type SettingsDoc,
} from './schema';

/**
 * User preferences, hydrated synchronously at construction.
 *
 * Synchronous is the whole point. Preferences decide what the first paint
 * looks like — which exercise is open, and the theme once there is a toggle
 * for one — and anything read after that paint is something the user watches
 * the app change its mind about. localStorage is the only web storage that
 * can answer before a render, which is most of why this half of the split
 * exists (ADR 0006).
 *
 * The store is constructed at module load rather than in an effect for the
 * same reason, and takes its slot as an argument so a test gets a real store
 * over a fake device.
 */

export interface SettingsState {
  doc: SettingsDoc;
  /**
   * False when the stored document came from a later release than this one.
   *
   * The app runs on defaults and writes nothing, rather than overwriting
   * settings it cannot read with settings it invented. A downgrade — or the
   * second tab during a deploy — should cost the session, not the account.
   */
  persisting: boolean;
  setExerciseSettings(exerciseId: string, settings: unknown): void;
  setLastExercise(exerciseId: string | null): void;
  reset(): void;
}

export type SettingsStore = StoreApi<SettingsState>;

export function createSettingsStore(
  slot: Slot<Versioned<unknown>> = localStorageSlot<Versioned<unknown>>(SETTINGS_KEY),
): SettingsStore {
  const outcome = migrate<SettingsDoc>(slot.read(), {
    current: SETTINGS_SCHEMA,
    steps: SETTINGS_MIGRATIONS,
    validate: coerceSettings,
  });

  const doc = outcome.ok ? outcome.value : { ...SETTINGS_DEFAULTS };
  const persisting = !(outcome.ok === false && outcome.reason === 'from-the-future');

  // Paying the migration once, here, rather than on every read. An absent
  // document is left absent: writing defaults on first load would make the
  // app indistinguishable from one the user had already configured.
  if (outcome.ok && outcome.migrated) slot.write(versioned(SETTINGS_SCHEMA, doc));

  const store = createStore<SettingsState>((set, get) => {
    function commit(next: SettingsDoc) {
      set({ doc: next });
      if (get().persisting) slot.write(versioned(SETTINGS_SCHEMA, next));
    }
    return {
      doc,
      persisting,
      setExerciseSettings(exerciseId, settings) {
        commit({ ...get().doc, exercises: { ...get().doc.exercises, [exerciseId]: settings } });
      },
      setLastExercise(exerciseId) {
        commit({ ...get().doc, lastExercise: exerciseId });
      },
      reset() {
        // Clearing is the one thing a non-persisting store may still write,
        // because the user asked for the unreadable document to go — and once
        // it has gone there is nothing left to protect, so writing resumes.
        slot.clear();
        set({ doc: { ...SETTINGS_DEFAULTS }, persisting: true });
      },
    };
  });
  return store;
}

/** The app's one store. Constructed at import, which is what makes it synchronous. */
export const settingsStore = createSettingsStore();

export function useSettings<T>(selector: (state: SettingsState) => T): T {
  return useStore(settingsStore, selector);
}
