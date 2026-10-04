import type { Log } from './persistence';

/**
 * A {@link Log} over IndexedDB, written against the raw API.
 *
 * `idb` is in `node_modules` as a transitive dependency of workbox, and
 * importing it would work today — but a transitive dependency is not a
 * contract, and this would break on the day `vite-plugin-pwa` changes what it
 * pulls in. What is needed here is open, put, getAll, count and clear; the
 * promise wrapper for those is the sixty lines below, against roughly the
 * same number of lines of justification for taking the dependency. See the
 * handoff note.
 *
 * Two versions matter here and they are not the same number:
 *
 * - **{@link DB_VERSION}** is IndexedDB's own, and changes only when the
 *   object stores or indexes change. It is what `onupgradeneeded` sees.
 * - The **record schema version** travels on each record and is migrated on
 *   read, by `src/state/migrate.ts`. It is deliberately not the DB version,
 *   because rewriting every row inside an upgrade transaction is how a user
 *   with a long history gets a blocked tab on the morning of a release.
 */

/**
 * Still `music-practice`, after the app was renamed to Pitch Space.
 *
 * A database name is not a display name: it is the address of
 * everything a user has already recorded. Renaming it does not move
 * the history, it opens a different, empty database and leaves the old
 * one on disk — so the rename would read, to anyone who had practised,
 * as the app having forgotten them.
 *
 * The same reasoning ADR 0007 gives for item ids. Changing it is a
 * migration, not an edit, and is worth doing only alongside the export
 * and import the roadmap already owes.
 */
const DB_NAME = 'music-practice';
export const DB_VERSION = 1;
export const ATTEMPTS_STORE = 'attempts';
/** Reading oldest-first without sorting in memory, and what "recent" will key on. */
const BY_TIME = 'by-answered-at';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    // Reading the global throws rather than returning undefined in some
    // locked-down contexts, the same way localStorage does.
    return false;
  }
}

/**
 * Records are keyed by their own `id`, so appending the same attempt twice —
 * which a double-tap or a React strict-mode double-effect will do — stores it
 * once rather than inflating the user's history.
 */
export interface Keyed {
  id: string;
  answeredAt: number;
}

export function indexedDbLog<T extends Keyed>(storeName = ATTEMPTS_STORE): Log<T> {
  let opening: Promise<IDBDatabase> | null = null;

  function open(): Promise<IDBDatabase> {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id' });
          store.createIndex(BY_TIME, 'answeredAt');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // A second tab on a newer release will have bumped the version and is
        // waiting on this connection; holding it open blocks them both.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
    });
    // A failed open must not be cached, or every later call reports a fault
    // that may have been a one-off.
    opening.catch(() => { opening = null; });
    return opening;
  }

  async function transact<R>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<R>): Promise<R> {
    const db = await open();
    const tx = db.transaction(storeName, mode);
    const result = await run(tx.objectStore(storeName));
    // Resolving on the transaction rather than on the request: a put whose
    // request succeeded can still be rolled back, and reporting success
    // before the commit is how a lost record looks like a saved one.
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
    return result;
  }

  return {
    async append(record) {
      await transact('readwrite', async (store) => { await request(store.put(record)); });
    },
    async all() {
      return transact('readonly', (store) => request(store.index(BY_TIME).getAll() as IDBRequest<T[]>));
    },
    async count() {
      return transact('readonly', (store) => request(store.count()));
    },
    async clear() {
      await transact('readwrite', async (store) => { await request(store.clear()); });
    },
  };
}
