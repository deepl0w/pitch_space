import { expect, it } from 'vitest';
import type { Log } from './persistence';

/**
 * What every {@link Log} promises, asked of each implementation in turn.
 *
 * There are two of them — one in memory and one over IndexedDB — and the
 * memory one is what the app falls back to when a device will not open a
 * database. A fallback that behaves differently from the thing it replaces is
 * not a fallback, so the promises are written once here and the two
 * implementations are each made to keep them.
 *
 * Not a test file: it exports a suite rather than declaring one, so it is
 * imported by the tests that run it and never collected on its own.
 */

/** The smallest record either implementation will store. */
export interface TestRecord {
  id: string;
  answeredAt: number;
  note: string;
}

export function record(id: string, answeredAt: number, note = id): TestRecord {
  return { id, answeredAt, note };
}

/**
 * @param make a log with nothing in it. Called per assertion, so an
 * implementation backed by a real database must be reset between them.
 */
export function logContract(make: () => Log<TestRecord>): void {
  it('starts empty, and says so rather than making the caller guess', async () => {
    const log = make();
    expect(await log.all()).toEqual([]);
    expect(await log.count()).toBe(0);
  });

  it('reads back what it was given', async () => {
    const log = make();
    await log.append(record('a', 1));
    expect(await log.all()).toEqual([record('a', 1)]);
  });

  it('appends rather than replacing', async () => {
    const log = make();
    await log.append(record('a', 1));
    await log.append(record('b', 2));
    await log.append(record('c', 3));
    expect(await log.all()).toEqual([record('a', 1), record('b', 2), record('c', 3)]);
  });

  it('counts what it holds', async () => {
    const log = make();
    expect(await log.count()).toBe(0);
    await log.append(record('a', 1));
    expect(await log.count()).toBe(1);
    await log.append(record('b', 2));
    expect(await log.count()).toBe(2);
  });

  it('returns the records oldest first', async () => {
    // The interface says so, and the progress store reads a history in the
    // order it means to show it.
    const log = make();
    for (const [id, at] of [['a', 10], ['b', 20], ['c', 30]] as const) {
      await log.append(record(id, at));
    }
    expect((await log.all()).map((r) => r.answeredAt)).toEqual([10, 20, 30]);
  });

  it('hands out a snapshot, not its own list', async () => {
    const log = make();
    await log.append(record('a', 1));
    (await log.all()).push(record('ghost', 2));
    expect(await log.count()).toBe(1);
  });

  it('empties on clear, and is usable afterwards', async () => {
    const log = make();
    await log.append(record('a', 1));
    await log.append(record('b', 2));
    await log.clear();
    expect(await log.all()).toEqual([]);
    expect(await log.count()).toBe(0);

    await log.append(record('c', 3));
    expect(await log.all()).toEqual([record('c', 3)]);
  });

  it('clears an empty log without complaint', async () => {
    const log = make();
    await expect(log.clear()).resolves.toBeUndefined();
    expect(await log.count()).toBe(0);
  });
}
