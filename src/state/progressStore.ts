import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ItemId } from '../exercises/types';
import { lineKey, type ProgressLine } from './line';
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
  /**
   * Rows written by a later release than this one.
   *
   * Counted apart from {@link unreadable} because the two need opposite
   * words. A row this release cannot parse may be damaged; a row from a newer
   * release is intact and will read again on the next update. Calling the
   * second one unreadable told the user their history was corrupt, and the
   * obvious response to that — clearing it — is the one action that would
   * actually destroy it.
   */
  fromNewerRelease: number;
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
    fromNewerRelease: 0,

    async load() {
      try {
        const rows = await log.all();
        const attempts: Attempt[] = [];
        let unreadable = 0;
        let fromNewerRelease = 0;
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
            else if (outcome.reason === 'from-the-future') fromNewerRelease++;
            else unreadable++;
          } catch {
            unreadable++;
          }
        }
        // Sorted here rather than trusted from the index, because a row
        // written by a release that indexed a different field would come
        // back in an order nothing downstream expects.
        attempts.sort((a, b) => a.answeredAt - b.answeredAt);
        set({ status: 'ready', attempts, unreadable, fromNewerRelease });
      } catch {
        set({ status: 'unavailable', attempts: [], unreadable: 0, fromNewerRelease: 0 });
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
      set({ attempts: [], unreadable: 0, fromNewerRelease: 0 });
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
  /**
   * Consecutive correct answers ending at the most recent attempt.
   *
   * Totals cannot space anything. An item answered right four times and
   * then wrong, and one answered wrong first and then right four times,
   * have the same `seen` and the same `correct` and are in opposite
   * states: the first has just been forgotten and the second has just
   * been learned. The streak is the smallest thing that tells them apart,
   * and it is what {@link dueAt} reads.
   */
  streak: number;
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
 * The key a tally is kept under: a progression line, and an item in it.
 *
 * Not an ItemId with anything baked into the string. An id is a
 * compatibility commitment — it keys a user's history across releases —
 * and one encoding two orthogonal things cannot be changed along either
 * axis without breaking the other. See ADR 0010.
 *
 * **The line is here rather than the presentation alone because of ADR
 * 0039.** Getting an interval right out of two choices is not evidence
 * about the same interval out of thirteen, so the answer space is part
 * of what a tally is about. The presentation has not gone — it is inside
 * the line, where `items(settings)` does not vary with it and 0010 says
 * it must still separate.
 */
export type TallyKey = `${string}::${ItemId}`;

/**
 * Two colons, because one is already inside both halves.
 *
 * `lineKey` joins on `|` and `,` and every item id contains `:`, so a
 * single colon here would let a line ending in one and an item beginning
 * with one produce the same key as a different pair. The tester measured
 * the separators in `lineKey` across 6,495 ids; this is the same hazard
 * one level up and the same answer.
 */
export function tallyKey(line: ProgressLine, item: ItemId): TallyKey {
  return `${lineKey(line)}::${item}`;
}

/**
 * The line an attempt belongs to, or nothing.
 *
 * Nothing when the attempt carries no askable set — practice that counts
 * towards no progression (ADR 0041), and history written before lines
 * existed (ADR 0042). Both are real and neither is an error, so this
 * returns `undefined` rather than inventing an empty line: an empty
 * answer space is itself a line, and folding every untracked attempt
 * into it would read as progress against nothing.
 */
export function lineOf(attempt: Attempt): ProgressLine | undefined {
  if (attempt.askable === undefined) return undefined;
  return {
    exercise: attempt.exerciseType,
    askable: attempt.askable,
    presentation: attempt.presentation,
  };
}

/**
 * The line a learner last practised among a set of exercise types, if any.
 *
 * **The home screen's problem, and why it needs this rather than a sum.**
 * A figure there has to name its presentation or not be shown
 * ([0037](../../docs/adr/0037-a-schedule-is-per-presentation-and-the-home-screen-is-not.md)),
 * because hearing a minor third and reading one are different skills kept
 * in different lines. A card has room for one figure, so the rule is the
 * presentation last used — which means finding it rather than summing
 * across them, and summing is what the retired session counts did.
 *
 * Takes a set of types because a card is a family: the route opens
 * `interval-id`, and the attempts underneath it may name any member.
 *
 * `attempts` is oldest first, so this walks backwards and stops at the
 * first hit. Returns nothing when the learner has never practised one of
 * these types, or practised only in ways that carry no line — untracked
 * practice (ADR 0041) and history older than lines (ADR 0042) both reach
 * here and neither is an error.
 */
export function lastLineAmong(
  attempts: readonly Attempt[],
  types: ReadonlySet<string>,
): ProgressLine | undefined {
  for (let i = attempts.length - 1; i >= 0; i -= 1) {
    const attempt = attempts[i];
    if (!types.has(attempt.exerciseType)) continue;
    const line = lineOf(attempt);
    if (line !== undefined) return line;
  }
  return undefined;
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
  // Sorted here rather than trusted from the caller, because `streak` is the
  // one field whose value depends on the order and this is the function that
  // needs it. The store already reads the log in `answeredAt` order, so this
  // is usually a no-op — but a guard belongs with the thing it guards, and
  // "the caller happens to sort" is not a property of this function.
  const inOrder = [...attempts].sort((a, b) => a.answeredAt - b.answeredAt);
  for (const attempt of inOrder) {
    /*
      An attempt outside every line contributes nothing — not even a
      sighting. ADR 0041: generated practice must not disturb what
      tracked practice built, and stamping `lastSeenAt` from it would
      move a due date the learner never advanced.
    */
    const line = lineOf(attempt);
    if (line === undefined) continue;
    for (const outcome of attempt.outcomes) {
      const key = tallyKey(line, outcome.item);
      const entry = tally.get(key) ?? { seen: 0, correct: 0, lastSeenAt: 0, streak: 0 };
      entry.seen++;
      if (outcome.correct) entry.correct++;
      entry.streak = outcome.correct ? entry.streak + 1 : 0;
      entry.lastSeenAt = Math.max(entry.lastSeenAt, attempt.answeredAt);
      tally.set(key, entry);
    }
  }
  return tally;
}
