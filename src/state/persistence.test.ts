import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { localStorageSlot, memoryLog, memorySlot } from './persistence';
import { logContract, record } from './logContract';

/**
 * The two storage interfaces, and the implementations that are meant to be
 * interchangeable with the real ones.
 *
 * Under jsdom, because the point of `localStorageSlot` is the guard around
 * every access: `localStorage` is a getter that throws rather than returning
 * null when a device has storage disabled, and an unguarded read in the first
 * render is an app that will not start for a minority of users. That claim
 * cannot be made against a stub of the interface — it has to be made against
 * a real `Storage` and against the ways a browser takes one away.
 */

const KEY = 'music-practice:test';

/**
 * Replace the `localStorage` global for one assertion.
 *
 * Defined on the prototype as an accessor, so this restores the descriptor
 * rather than assigning over it.
 */
function withLocalStorage(replacement: PropertyDescriptor, run: () => void): void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(globalThis), 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, ...replacement });
  try {
    run();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

afterEach(() => localStorage.clear());

describe('a slot in memory', () => {
  it('is empty until something is written, unless it was given a value', () => {
    expect(memorySlot<number>().read()).toBeNull();
    expect(memorySlot(7).read()).toBe(7);
  });

  it('reads back the last thing written, and nothing after a clear', () => {
    const slot = memorySlot<{ n: number }>();
    slot.write({ n: 1 });
    slot.write({ n: 2 });
    expect(slot.read()).toEqual({ n: 2 });
    slot.clear();
    expect(slot.read()).toBeNull();
  });

  it('is usable again after being cleared', () => {
    const slot = memorySlot<number>(1);
    slot.clear();
    slot.write(3);
    expect(slot.read()).toBe(3);
  });
});

describe('a slot over localStorage', () => {
  it('survives the slot that wrote it, which is the whole point', () => {
    localStorageSlot<{ theme: string }>(KEY).write({ theme: 'dark' });
    expect(localStorageSlot<{ theme: string }>(KEY).read()).toEqual({ theme: 'dark' });
  });

  it('reads null when nothing has been stored under its key', () => {
    localStorageSlot(KEY).write(1);
    expect(localStorageSlot('music-practice:other').read()).toBeNull();
  });

  it('stores JSON, so another reader finds a document rather than a blob', () => {
    localStorageSlot(KEY).write({ v: 1, data: { lastExercise: 'interval-id' } });
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
      .toEqual({ v: 1, data: { lastExercise: 'interval-id' } });
  });

  it('reads unparseable storage as absent rather than throwing at the first render', () => {
    // Truncated by a browser reclaiming space, or hand-edited. The migration
    // runner is what decides whether to overwrite it; this layer's job is
    // only to not take the app down.
    localStorage.setItem(KEY, '{"v": 1, "data": {');
    expect(localStorageSlot(KEY).read()).toBeNull();
  });

  it('removes only its own key on clear', () => {
    localStorageSlot(KEY).write(1);
    localStorageSlot('music-practice:other').write(2);
    localStorageSlot(KEY).clear();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorageSlot('music-practice:other').read()).toBe(2);
  });

  it('still works where there is no localStorage at all', () => {
    withLocalStorage({ value: undefined, writable: true }, () => {
      const slot = localStorageSlot<number>(KEY);
      expect(() => slot.write(1)).not.toThrow();
      expect(slot.read()).toBeNull();
      expect(() => slot.clear()).not.toThrow();
    });
  });

  it('still works where reading the global itself throws', () => {
    // Cookies blocked: the property access raises a SecurityError rather
    // than returning undefined, which is why the guard is a try and not a
    // typeof check alone.
    withLocalStorage({ get() { throw new Error('access denied'); } }, () => {
      const slot = localStorageSlot<number>(KEY);
      expect(() => slot.write(1)).not.toThrow();
      expect(slot.read()).toBeNull();
      expect(() => slot.clear()).not.toThrow();
    });
  });

  it('fails to persist rather than failing the click, when the quota is full', () => {
    const full = {
      getItem: () => { throw new Error('quota'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('quota'); },
    };
    withLocalStorage({ value: full as unknown as Storage, writable: true }, () => {
      const slot = localStorageSlot<number>(KEY);
      expect(() => slot.write(1)).not.toThrow();
      expect(slot.read()).toBeNull();
      expect(() => slot.clear()).not.toThrow();
    });
  });
});

describe('a log in memory', () => {
  logContract(() => memoryLog());

  it('starts from the records it was handed', async () => {
    const log = memoryLog([record('a', 1)]);
    expect(await log.all()).toEqual([record('a', 1)]);
  });

  it('does not keep the array it was handed', async () => {
    const initial = [record('a', 1)];
    const log = memoryLog(initial);
    await log.append(record('b', 2));
    expect(initial).toHaveLength(1);
  });
});

/**
 * `memoryLog` is two different things and the caller has to say which.
 *
 * As a test double it stands in for working storage: what is under test
 * is everything except the storage, so it claims to be durable and the
 * default suits the dozens of call sites that mean exactly that. As the
 * production fallback for a device that refuses IndexedDB it is
 * genuinely volatile, and a volatile log that claims durability is the
 * defect that shipped — every progress figure gone, the status still
 * `ready`, because nothing failed and `all()` honestly answered `[]`.
 *
 * **The default is the dangerous one, which is a deliberate trade and
 * therefore worth a guard rather than an argument.** Defaulting to
 * volatile would make forgetting the flag loud, at the cost of touching
 * every double in the suite; defaulting to durable keeps those quiet and
 * makes forgetting it silent *in production*, which is the only place it
 * costs anything. So the check is not on the default — it is that no
 * shipped module ever takes it.
 *
 * Derived from the filesystem rather than from a list, so the second
 * fallback somebody writes is covered without this file being touched.
 * That matters more than it looks: all three of this project's
 * silent-degradation defects were invisible precisely because nobody had
 * noticed the code path was a fallback, so a hand-written list of
 * fallbacks can only ever cover the ones already found.
 */
describe('the volatile log in production', () => {
  const shipped = () => {
    const root = join(process.cwd(), 'src');
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          out.push(path);
        }
      }
    };
    walk(root);
    return out;
  };

  it('is constructed somewhere, or this checks nothing', () => {
    const callers = shipped().filter(
      (file) => /\bmemoryLog\s*</.test(readFileSync(file, 'utf8')),
    );
    expect(callers.length, 'no shipped module builds one at all').toBeGreaterThan(0);
  });

  it('never claims to be durable', () => {
    const offenders: string[] = [];
    for (const file of shipped()) {
      const source = readFileSync(file, 'utf8');
      for (const call of source.matchAll(/\bmemoryLog\s*<[^>]*>\s*\(([^;]*?)\)\s*[;,)]/gs)) {
        const args = call[1];
        if (!/durable\s*:\s*false/.test(args)) {
          offenders.push(`${relative(process.cwd(), file)}: memoryLog(${args.trim()})`);
        }
      }
    }
    expect(offenders, 'a shipped fallback that does not admit it is volatile').toEqual([]);
  });
});
