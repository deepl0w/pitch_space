/**
 * Where persisted state goes, behind one pair of interfaces so the choice is
 * swappable.
 *
 * Two interfaces rather than one because the two kinds of state this app
 * keeps are not alike, and pretending they are is what forces the wrong
 * storage on one of them (ADR 0006):
 *
 * - **A {@link Slot}** holds one small document that is read before the first
 *   paint. It is synchronous, which is a requirement and not a convenience:
 *   a preference read asynchronously is a preference the user watches the app
 *   change its mind about.
 * - **A {@link Log}** appends without bound and is read in bulk, after the
 *   paint. It is asynchronous because the only storage large enough to hold
 *   it is.
 *
 * Everything above these talks to the interface, so the in-memory
 * implementations here are a complete substitute — which is what lets the
 * stores be tested in the node environment, and what the app falls back to in
 * a browser whose storage is unavailable rather than failing to start.
 */

/** A single document, read and written synchronously. */
export interface Slot<T> {
  /** Null when nothing has been stored, or when storage is unreadable. */
  read(): T | null;
  write(value: T): void;
  clear(): void;
}

/** An append-only record log. */
export interface Log<T> {
  append(record: T): Promise<void>;
  /** Oldest first. The whole log: it is bounded by how much a person practises. */
  all(): Promise<T[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
  /**
   * Whether what is written here survives the tab closing.
   *
   * **A reader cannot tell an empty durable log from a working volatile
   * one**, and the difference is the whole of what a progress figure
   * means: the first is a learner who has not practised, the second is a
   * learner whose history exists and cannot be reached. Both answer
   * `all()` with `[]` and neither throws, so nothing downstream can
   * distinguish them by behaviour — the log has to say.
   *
   * Found when storage was blocked in a browser and every figure on the
   * home screen quietly vanished rather than saying it could not read
   * anything: the fallback worked, which is what made it silent.
   */
  readonly durable: boolean;
}

export function memorySlot<T>(initial: T | null = null): Slot<T> {
  let value = initial;
  return {
    read: () => value,
    write: (next) => { value = next; },
    clear: () => { value = null; },
  };
}

/**
 * A log in memory, which is two different things depending on why it exists.
 *
 * As a test double it stands in for working storage and should say it is
 * durable, because the thing under test is everything *except* the
 * storage. As the fallback when a browser refuses IndexedDB it is
 * genuinely volatile, and saying so is what lets the progress store tell
 * a learner their history is unreachable rather than showing them an
 * empty one. Same object, opposite claims, so the caller states which.
 */
export function memoryLog<T>(
  initial: readonly T[] = [],
  { durable = true }: { durable?: boolean } = {},
): Log<T> {
  let records = [...initial];
  return {
    durable,
    append: async (record) => { records.push(record); },
    all: async () => [...records],
    count: async () => records.length,
    clear: async () => { records = []; },
  };
}

/**
 * A slot over `localStorage`, which is where the synchronous requirement
 * lands us (ADR 0006).
 *
 * Every access is guarded. `localStorage` is a getter that *throws* rather
 * than returning null when cookies are blocked or a Safari private window is
 * at its quota, and it throws on write when full — so an unguarded read in
 * the first render is an app that will not start for a minority of users, and
 * is untestable in the node environment besides. Failing to persist is the
 * right answer to all of it: the app still works, the preference just does
 * not survive the tab.
 */
export function localStorageSlot<T>(key: string): Slot<T> {
  function store(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }
  return {
    read() {
      try {
        const raw = store()?.getItem(key);
        return raw === null || raw === undefined ? null : (JSON.parse(raw) as T);
      } catch {
        // Unparseable is indistinguishable from absent to everything above,
        // and the migration runner is what decides whether to overwrite it.
        return null;
      }
    },
    write(value) {
      try {
        store()?.setItem(key, JSON.stringify(value));
      } catch { /* quota, or a storage-less context: not worth failing a click over */ }
    },
    clear() {
      try {
        store()?.removeItem(key);
      } catch { /* as above */ }
    },
  };
}
