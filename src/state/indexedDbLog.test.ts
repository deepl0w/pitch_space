import { IDBDatabase as FakeDatabase, IDBFactory as FakeFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ATTEMPTS_STORE, DB_VERSION, indexedDbAvailable, indexedDbLog,
} from './indexedDbLog';
import { logContract, record, type TestRecord } from './logContract';
import type { Log } from './persistence';
import { createProgressStore, defaultAttemptLog } from './progressStore';
import { attemptRow, type Attempt, type AttemptRow } from './schema';

/**
 * The IndexedDB log, against a real IndexedDB.
 *
 * It was the one thing in the app with no test at all, for the ordinary
 * reason: jsdom implements no `indexedDB`, so the file could only be reached
 * by a mock of the thing it exists to wrap. `fake-indexeddb` is a complete
 * in-memory implementation of the specification, which means these are the
 * promises the real database keeps and not the promises a mock was written
 * to keep.
 *
 * This is also the only place in the app where a bug costs the user
 * something they cannot get back. Everything else regenerates.
 */

/** A fresh factory per assertion: a new one has no databases in it. */
beforeEach(() => { globalThis.indexedDB = new FakeFactory(); });

/** `structuredClone` is what a real IndexedDB stores, so rows come back detached. */
const rows = (log: Log<TestRecord>) => log.all();

describe('an IndexedDB log', () => {
  logContract(() => indexedDbLog<TestRecord>());

  it('commits before it resolves, so a second connection sees the record', async () => {
    await indexedDbLog<TestRecord>().append(record('a', 1));
    expect(await rows(indexedDbLog<TestRecord>())).toEqual([record('a', 1)]);
  });

  it('waits for the transaction to complete, not for the request to succeed', async () => {
    // A put whose request succeeded can still be rolled back, and reporting
    // success before the commit is how a lost record looks like a saved one.
    // Watched through a listener of our own, because resolving on the
    // request instead still reads back correctly here — the difference only
    // shows in the order the two events happen.
    const real = FakeDatabase.prototype.transaction;
    const order: string[] = [];
    FakeDatabase.prototype.transaction = function transaction(
      this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>
    ) {
      const tx = real.apply(this, args);
      // Registered before the implementation sets `oncomplete`, so this runs
      // first and the resolution cannot be mistaken for the commit.
      // The upgrade transaction that creates the store commits too, and is
      // not the one under test.
      if (tx.mode !== 'versionchange') {
        tx.addEventListener('complete', () => order.push('committed'));
      }
      return tx;
    };

    try {
      await indexedDbLog<TestRecord>().append(record('a', 1));
      order.push('resolved');
    } finally {
      FakeDatabase.prototype.transaction = real;
    }
    expect(order).toEqual(['committed', 'resolved']);
  });

  it('outlives the connection that wrote it', async () => {
    const first = indexedDbLog<TestRecord>();
    await first.append(record('a', 1));
    await first.append(record('b', 2));
    expect(await indexedDbLog<TestRecord>().count()).toBe(2);
  });

  it('reads by the time answered, not by the key it is stored under', async () => {
    // Ids are minted per attempt and sort nothing useful; the index is what
    // makes "oldest first" true. Written so that key order and time order
    // disagree, because they agree by accident in most fixtures.
    const log = indexedDbLog<TestRecord>();
    await log.append(record('zzz', 10));
    await log.append(record('aaa', 30));
    await log.append(record('mmm', 20));
    expect((await log.all()).map((r) => r.id)).toEqual(['zzz', 'mmm', 'aaa']);
  });

  it('stores an attempt once however many times it is appended', async () => {
    // A double-tap, or React's strict-mode double effect. Keyed by the
    // record's own id, so the second write replaces rather than inflating
    // the user's history.
    const log = indexedDbLog<TestRecord>();
    await log.append(record('a', 1, 'first'));
    await log.append(record('a', 1, 'second'));
    expect(await log.count()).toBe(1);
    expect(await log.all()).toEqual([record('a', 1, 'second')]);
  });

  it('clears what is on the device, not just what this connection remembers', async () => {
    const log = indexedDbLog<TestRecord>();
    await log.append(record('a', 1));
    await log.clear();
    expect(await indexedDbLog<TestRecord>().count()).toBe(0);
  });
});

describe('the database it opens', () => {
  it('creates the attempts store keyed by id, with an index on the answer time', async () => {
    await indexedDbLog<TestRecord>().count();

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('music-practice');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      expect(db.version).toBe(DB_VERSION);
      expect([...db.objectStoreNames]).toContain(ATTEMPTS_STORE);
      const store = db.transaction(ATTEMPTS_STORE, 'readonly').objectStore(ATTEMPTS_STORE);
      expect(store.keyPath).toBe('id');
      expect([...store.indexNames]).toEqual(['by-answered-at']);
      expect(store.index('by-answered-at').keyPath).toBe('answeredAt');
    } finally {
      db.close();
    }
  });
});

describe('an IndexedDB that will not open', () => {
  /**
   * Make the next `open` fail the way a locked-down browser fails it: a
   * request that never succeeds and raises `error` instead. Later opens go
   * through, which is what a one-off refusal looks like.
   */
  function failOnce(): void {
    const real = indexedDB.open.bind(indexedDB);
    let failed = false;
    indexedDB.open = ((...args: Parameters<typeof real>) => {
      if (failed) return real(...args);
      failed = true;
      const req = { onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null } as
        unknown as IDBOpenDBRequest & { error: DOMException | null };
      req.error = new DOMException('refused', 'InvalidStateError');
      queueMicrotask(() => req.onerror?.(new Event('error') as never));
      return req;
    }) as typeof indexedDB.open;
  }

  it('reports the failure rather than hanging', async () => {
    failOnce();
    await expect(indexedDbLog<TestRecord>().count()).rejects.toThrow();
  });

  it('does not cache a failed open, so a one-off stays a one-off', async () => {
    // Caching the rejected promise would turn a transient refusal into a
    // history that never comes back for the rest of the session.
    failOnce();
    const log = indexedDbLog<TestRecord>();
    await expect(log.count()).rejects.toThrow();
    await log.append(record('a', 1));
    expect(await log.all()).toEqual([record('a', 1)]);
  });
});

describe('asking whether there is an IndexedDB', () => {
  it('says yes when there is one', () => {
    expect(indexedDbAvailable()).toBe(true);
  });

  it('says no where the global is missing or raises on access', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    try {
      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
      expect(indexedDbAvailable()).toBe(false);

      Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: null });
      expect(indexedDbAvailable()).toBe(false);

      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        get() { throw new DOMException('access denied'); },
      });
      expect(indexedDbAvailable()).toBe(false);
    } finally {
      if (original) Object.defineProperty(globalThis, 'indexedDB', original);
      else Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });
});

describe('a history kept in IndexedDB', () => {
  const attempt = (id: string, answeredAt: number): Attempt => ({
    id,
    exerciseType: 'interval-id',
    seed: 7919,
    settings: { difficulty: 2 },
    presentation: 'listen' as const,
    startedAt: answeredAt - 3_000,
    answeredAt,
    items: ['interval:m3:up'],
    outcomes: [{ item: 'interval:m3:up', correct: true, latencyMs: 3_000 }],
    correct: true,
  });

  it('survives the session that recorded it', async () => {
    // The gap this whole file exists to close: everything above the Log
    // interface had tests, and the one implementation that actually keeps a
    // user's history had none.
    const first = createProgressStore(indexedDbLog<AttemptRow>());
    await first.getState().record(attempt('a', 2_000));
    await first.getState().record(attempt('b', 1_000));

    const next = createProgressStore(indexedDbLog<AttemptRow>());
    await next.getState().load();
    expect(next.getState().status).toBe('ready');
    expect(next.getState().attempts.map((a) => a.id)).toEqual(['b', 'a']);
    expect(next.getState().unreadable).toBe(0);
  });

  it('ignores a row the schema refuses and keeps the readable ones', async () => {
    const log = indexedDbLog<AttemptRow>();
    await log.append({ v: 1, data: { id: 'half' }, id: 'half', answeredAt: 1_500 } as AttemptRow);
    await log.append(attemptRow(attempt('whole', 2_000)));

    const store = createProgressStore(indexedDbLog<AttemptRow>());
    await store.getState().load();
    expect(store.getState().attempts.map((a) => a.id)).toEqual(['whole']);
    expect(store.getState().unreadable).toBe(1);
  });

  it('clears the device when the user clears the history', async () => {
    const store = createProgressStore(indexedDbLog<AttemptRow>());
    await store.getState().record(attempt('a', 1_000));
    await store.getState().clear();
    expect(await indexedDbLog<AttemptRow>().count()).toBe(0);
  });

  it('is what the app reaches for when the device has an IndexedDB', async () => {
    const log = defaultAttemptLog();
    await log.append(attemptRow(attempt('a', 1_000)));
    // Memory would not survive a second log over the same device.
    expect(await indexedDbLog<AttemptRow>().count()).toBe(1);
  });
});
