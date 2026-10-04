import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ItemId, Presentation } from '../exercises/types';
import { memoryLog, type Log } from './persistence';
import { indexedDbAvailable, indexedDbLog } from './indexedDbLog';
import { migrate } from './migrate';
import {
  ATTEMPT_MIGRATIONS, ATTEMPT_SCHEMA, attemptRow, coerceAttempt,
  type Attempt, type AttemptRow,
} from './schema';

/**
 * Attempt history, in IndexedDB because it appends without bound.
 *
 * The other half of the split in ADR 0006. A log of every exercise a person
 * has ever answered outgrows the few megabytes localStorage allows, and the
 * one storage that does not is asynchronous — so this store hydrates after
 * the first paint, and says which of its three states it is in rather than
 * presenting an empty history as a complete one.
 *
 * It is not a scheduler. It records; `src/exercises/` decides what an item is
 * and what counts as getting one right. See ADR 0007.
 */

export type ProgressStatus = 'loading' | 'ready' | 'unavailable';

export interface ProgressState {
  status: ProgressStatus;
  /** Oldest first. */
  attempts: readonly Attempt[];
  /**
   * Rows that were stored but could not be read back.
   *
   * Surfaced rather than swallowed: a non-zero count here is the first
   * evidence a migration is wrong, and it is invisible if a bad row is
   * silently skipped.
   */
  unreadable: number;
  load(): Promise<void>;
  record(attempt: Attempt): Promise<void>;
  clear(): Promise<void>;
}

export type ProgressStore = StoreApi<ProgressState>;

/**
 * IndexedDB where there is one, memory where there is not.
 *
 * A browser with storage disabled still gets a working app with a history
 * that lasts the session, which is better than a screen that will not load.
 */
export function defaultAttemptLog(): Log<AttemptRow> {
  return indexedDbAvailable() ? indexedDbLog<AttemptRow>() : memoryLog<AttemptRow>();
}

export function createProgressStore(log: Log<AttemptRow> = defaultAttemptLog()): ProgressStore {
  return createStore<ProgressState>((set, get) => ({
    status: 'loading',
    attempts: [],
    unreadable: 0,

    async load() {
      try {
        const rows = await log.all();
        const attempts: Attempt[] = [];
        let unreadable = 0;
        for (const row of rows) {
          // Per row, because `coerceAttempt` refuses by throwing: a single
          // half-written record would otherwise land in the outer catch and
          // report the user's entire history as unavailable. The step table
          // is asserted complete at import, so the other throw `migrate` has
          // — a gap in that table — cannot reach here.
          try {
            const outcome = migrate<Attempt>(row, {
              current: ATTEMPT_SCHEMA,
              steps: ATTEMPT_MIGRATIONS,
              validate: coerceAttempt,
            });
            if (outcome.ok) attempts.push(outcome.value);
            else unreadable++;
          } catch {
            unreadable++;
          }
        }
        // Sorted here rather than trusted from the index, because a row
        // written by a release that indexed a different field would come
        // back in an order nothing downstream expects.
        attempts.sort((a, b) => a.answeredAt - b.answeredAt);
        set({ status: 'ready', attempts, unreadable });
      } catch {
        set({ status: 'unavailable', attempts: [], unreadable: 0 });
      }
    },

    async record(attempt) {
      // Added to memory first and kept there whatever storage does. Losing a
      // session's worth of answers because a quota was hit mid-practice is a
      // worse failure than a history that does not survive the tab.
      set({ attempts: [...get().attempts, attempt] });
      try {
        await log.append(attemptRow(attempt));
      } catch {
        set({ status: 'unavailable' });
      }
    },

    async clear() {
      await log.clear();
      set({ attempts: [], unreadable: 0 });
    },
  }));
}

export const progressStore = createProgressStore();

export function useProgress<T>(selector: (state: ProgressState) => T): T {
  return useStore(progressStore, selector);
}

/* -- reading the record --------------------------------------------------- */

export interface ItemTally {
  seen: number;
  correct: number;
  /** Epoch milliseconds of the most recent attempt that tested this item. */
  lastSeenAt: number;
}

/**
 * Fold a history into per-item counts.
 *
 * A fold, not a schedule: it has no opinion about when anything is due. It is
 * here because it is the shape the scheduler will read, and because the
 * screen needs to say something true about how the user is doing — and
 * because writing it proves the record is actually consumable per item,
 * which is the claim ADR 0007 makes.
 *
 * Keyed by a Map in insertion order, which is fine: nothing musical is being
 * decided here, so ADR 0002's rule about iteration order does not apply.
 */
/**
 * The key a tally is kept under: an item, and the sense it was tested through.
 *
 * Not an ItemId with the presentation baked into the string. An id is a
 * compatibility commitment — it keys a user's history across releases — and
 * one encoding two orthogonal things cannot be changed along either axis
 * without breaking the other. See ADR 0010.
 */
export type TallyKey = `${Presentation}:${ItemId}`;

export function tallyKey(item: ItemId, presentation: Presentation): TallyKey {
  return `${presentation}:${item}`;
}

/**
 * How each item has gone, counted separately by eye and by ear.
 *
 * Summing the two was wrong and the contract already said so: reading a minor
 * third off the staff and hearing one are different skills, and a learner is
 * routinely fluent at one and lost at the other. Blending them hides exactly
 * the weakness the schedule exists to find.
 */
export function tallyItems(attempts: readonly Attempt[]): Map<TallyKey, ItemTally> {
  const tally = new Map<TallyKey, ItemTally>();
  for (const attempt of attempts) {
    for (const outcome of attempt.outcomes) {
      const key = tallyKey(outcome.item, attempt.presentation);
      const entry = tally.get(key) ?? { seen: 0, correct: 0, lastSeenAt: 0 };
      entry.seen++;
      if (outcome.correct) entry.correct++;
      entry.lastSeenAt = Math.max(entry.lastSeenAt, attempt.answeredAt);
      tally.set(key, entry);
    }
  }
  return tally;
}
