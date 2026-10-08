import { describe, expect, it } from 'vitest';
import { createProgressStore, defaultAttemptLog, tallyItems, tallyKey } from './progressStore';
import type { ProgressLine } from './line';
import { memoryLog, type Log } from './persistence';
import type { ItemId } from '../exercises/types';
import { versioned } from './migrate';
import { ATTEMPT_SCHEMA, attemptRow, type Attempt, type AttemptRow } from './schema';

/**
 * The history store, over a log a test owns.
 *
 * Three states rather than two: a history that has not loaded yet and a
 * history that cannot load are both "no attempts" to a careless screen, and
 * the difference is whether the user is about to lose something.
 */

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    id: 'a1',
    exerciseType: 'interval-id',
    seed: 1,
    settings: {},
    presentation: 'listen',
    startedAt: 1_000,
    answeredAt: 2_000,
    items: ['interval:m3:up'],
    /*
      Every fixture declares a line, because the fold skips an attempt
      without one — untracked practice (0041) and pre-line history (0042)
      are both real and neither is an error. A fixture that left this off
      would make `tallyItems` return an empty map, which the positive
      cases below would catch and the negative ones would not: `has(key)`
      is `false` for an item that was never credited *and* for a history
      that was never folded.
    */
    askable: ['interval:m3:up', 'interval:P5:up'],
    outcomes: [{ item: 'interval:m3:up', correct: true }],
    correct: true,
    ...over,
  };
}

/** The line every fixture above belongs to, which its tally hangs from. */
const LINE: ProgressLine = {
  exercise: 'interval-id',
  askable: ['interval:m3:up', 'interval:P5:up'] as ItemId[],
  presentation: 'listen',
};

/** A log that refuses everything, as a device with no storage quota does. */
function brokenLog(): Log<AttemptRow> {
  const refuse = () => Promise.reject(new Error('no storage'));
  return { append: refuse, all: refuse, count: refuse, clear: refuse };
}

describe('loading a history', () => {
  it('starts out loading, with nothing to show yet', () => {
    const store = createProgressStore(memoryLog<AttemptRow>());
    expect(store.getState().status).toBe('loading');
    expect(store.getState().attempts).toEqual([]);
    expect(store.getState().unreadable).toBe(0);
  });

  it('becomes ready and empty where there is nothing stored', async () => {
    // Distinct from "loading": an empty history the user can trust is a
    // different claim from one the app has not looked at.
    const store = createProgressStore(memoryLog<AttemptRow>());
    await store.getState().load();
    expect(store.getState().status).toBe('ready');
    expect(store.getState().attempts).toEqual([]);
  });

  it('reads back what was stored', async () => {
    const stored = attempt();
    const store = createProgressStore(memoryLog([attemptRow(stored)]));
    await store.getState().load();
    expect(store.getState().attempts).toEqual([stored]);
  });

  it('sorts by the time answered rather than trusting the order it was handed', async () => {
    // A row written by a release that indexed a different field would come
    // back in an order nothing downstream expects.
    const rows = [
      attemptRow(attempt({ id: 'c', answeredAt: 300 })),
      attemptRow(attempt({ id: 'a', answeredAt: 100 })),
      attemptRow(attempt({ id: 'b', answeredAt: 200 })),
    ];
    const store = createProgressStore(memoryLog(rows));
    await store.getState().load();
    expect(store.getState().attempts.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('skips a row it cannot read, keeps the rest, and says how many', async () => {
    // Surfaced rather than swallowed: a non-zero count here is the first
    // evidence a migration is wrong.
    const rows = [
      attemptRow(attempt({ id: 'good', answeredAt: 100 })),
      versioned(ATTEMPT_SCHEMA, { id: 'half-written' }) as AttemptRow,
      { id: 'unversioned', answeredAt: 150 } as AttemptRow,
      attemptRow(attempt({ id: 'also-good', answeredAt: 200 })),
    ];
    const store = createProgressStore(memoryLog(rows));
    await store.getState().load();

    expect(store.getState().attempts.map((a) => a.id)).toEqual(['good', 'also-good']);
    expect(store.getState().unreadable).toBe(2);
    expect(store.getState().status).toBe('ready');
  });

  /**
   * A row written by a newer release is intact, and counting it as unreadable
   * told the user their history was corrupt. The obvious response to that is
   * to clear the history — which is the one action that would actually destroy
   * it, and the data would otherwise have come back on the next update.
   *
   * Reported separately so the screen can say which of the two happened.
   */
  it('separates a row from a newer release from a row it cannot read', async () => {
    const rows = [
      attemptRow(attempt({ id: 'good', answeredAt: 100 })),
      versioned(ATTEMPT_SCHEMA + 1, attempt({ id: 'newer' })) as AttemptRow,
      versioned(ATTEMPT_SCHEMA + 9, attempt({ id: 'much-newer' })) as AttemptRow,
      { id: 'unversioned', answeredAt: 150 } as AttemptRow,
    ];
    const store = createProgressStore(memoryLog(rows));
    await store.getState().load();

    expect(store.getState().attempts.map((a) => a.id)).toEqual(['good']);
    expect(store.getState().fromNewerRelease).toBe(2);
    expect(store.getState().unreadable).toBe(1);
    expect(store.getState().status).toBe('ready');
  });

  it('forgets a newer-release count when a later load finds none', async () => {
    const store = createProgressStore(memoryLog([
      versioned(ATTEMPT_SCHEMA + 1, attempt({ id: 'newer' })) as AttemptRow,
    ]));
    await store.getState().load();
    expect(store.getState().fromNewerRelease).toBe(1);

    await store.getState().clear();
    expect(store.getState().fromNewerRelease).toBe(0);
  });

  it('says it is unavailable when the device will not answer', async () => {
    const store = createProgressStore(brokenLog());
    await store.getState().load();
    expect(store.getState().status).toBe('unavailable');
    expect(store.getState().attempts).toEqual([]);
  });

  it('forgets a previous reading rather than mixing it with a failed one', async () => {
    let fail = false;
    const inner = memoryLog([attemptRow(attempt())]);
    const store = createProgressStore({
      ...inner,
      all: () => (fail ? Promise.reject(new Error('gone')) : inner.all()),
    });
    await store.getState().load();
    expect(store.getState().attempts).toHaveLength(1);

    fail = true;
    await store.getState().load();
    expect(store.getState().status).toBe('unavailable');
    expect(store.getState().attempts).toEqual([]);
  });
});

describe('recording an attempt', () => {
  it('keeps it in the session and writes it to the device', async () => {
    const log = memoryLog<AttemptRow>();
    const store = createProgressStore(log);
    const recorded = attempt();
    await store.getState().record(recorded);

    expect(store.getState().attempts).toEqual([recorded]);
    expect(await log.all()).toEqual([attemptRow(recorded)]);
  });

  it('keeps the session even when the device refuses the write', async () => {
    // Losing a session's worth of answers because a quota was hit
    // mid-practice is a worse failure than a history that does not survive
    // the tab.
    const store = createProgressStore(brokenLog());
    const recorded = attempt();
    await store.getState().record(recorded);

    expect(store.getState().attempts).toEqual([recorded]);
    expect(store.getState().status).toBe('unavailable');
  });

  it('appends in the order they were answered', async () => {
    const store = createProgressStore(memoryLog<AttemptRow>());
    await store.getState().record(attempt({ id: 'a', answeredAt: 100 }));
    await store.getState().record(attempt({ id: 'b', answeredAt: 200 }));
    expect(store.getState().attempts.map((a) => a.id)).toEqual(['a', 'b']);
  });
});

describe('clearing a history', () => {
  it('empties the device as well as the session', async () => {
    const log = memoryLog<AttemptRow>();
    const store = createProgressStore(log);
    await store.getState().record(attempt());
    await store.getState().clear();

    expect(store.getState().attempts).toEqual([]);
    expect(store.getState().unreadable).toBe(0);
    expect(await log.count()).toBe(0);
  });
});

describe('choosing where attempts go', () => {
  it('falls back to memory where there is no IndexedDB', async () => {
    // Under node there is none, which is the same position as a browser
    // with storage disabled: a working app with a history that lasts the
    // session, rather than a screen that will not load.
    const log = defaultAttemptLog();
    await log.append(attemptRow(attempt()));
    expect(await log.count()).toBe(1);
  });
});

describe('folding a history into per-item counts', () => {
  const m3 = 'interval:m3:up';
  const p5 = 'interval:P5:up';

  it('counts nothing from nothing', () => {
    expect(tallyItems([]).size).toBe(0);
  });

  it('counts how often each item was tested and how often it was right', () => {
    const tally = tallyItems([
      attempt({ outcomes: [{ item: m3, correct: true }] }),
      attempt({ outcomes: [{ item: m3, correct: false }] }),
      attempt({ outcomes: [{ item: p5, correct: true }] }),
    ]);
    // m3 ends on a wrong answer, so its streak is 0 where p5's is 1 — the
    // field the schedule reads, and the one totals cannot give it.
    expect(tally.get(tallyKey(LINE, m3 as ItemId)))
      .toEqual({ seen: 2, correct: 1, lastSeenAt: 2000, streak: 0 });
    expect(tally.get(tallyKey(LINE, p5 as ItemId)))
      .toEqual({ seen: 1, correct: 1, lastSeenAt: 2000, streak: 1 });
  });

  it('counts every item one attempt tested, not just the first', () => {
    const tally = tallyItems([attempt({
      outcomes: [{ item: m3, correct: true }, { item: p5, correct: false }],
    })]);
    expect(tally.get(tallyKey(LINE, m3 as ItemId))?.correct).toBe(1);
    expect(tally.get(tallyKey(LINE, p5 as ItemId))?.correct).toBe(0);
    expect(tally.get(tallyKey(LINE, p5 as ItemId))?.seen).toBe(1);
  });

  it('credits only what was tested, never what the exercise merely contained', () => {
    // This is the whole claim: an item in the bar that the user was not
    // asked about must not teach the schedule that they know it.
    const tally = tallyItems([attempt({
      items: [m3, p5],
      outcomes: [{ item: m3, correct: true }],
    })]);
    expect(tally.get(tallyKey(LINE, m3 as ItemId)))
      .toEqual({ seen: 1, correct: 1, lastSeenAt: 2000, streak: 1 });
    expect(tally.has(tallyKey(LINE, p5 as ItemId))).toBe(false);
  });

  it('remembers the most recent sighting, whatever order the attempts arrive in', () => {
    // Both orders, because keeping the first and keeping the last agree on
    // a history that only ever runs one way.
    const seen = (times: number[]) => tallyItems(
      times.map((answeredAt) => attempt({ answeredAt, outcomes: [{ item: m3, correct: true }] })),
    ).get(tallyKey(LINE, m3 as ItemId))?.lastSeenAt;
    expect(seen([500, 100])).toBe(500);
    expect(seen([100, 500])).toBe(500);
  });
});

describe('tallying by eye and by ear', () => {
  const m3 = 'interval:m3:up' as ItemId;
  /** The same answer space, read rather than heard — a different line. */
  const READING: ProgressLine = { ...LINE, presentation: 'read' };

  /**
   * ADR 0010: progress is tracked against the item *and* the sense it was
   * tested through. The contract already said so; the code summed them, so
   * a user fluent by eye and hopeless by ear showed as middling at both —
   * hiding exactly the weakness the schedule exists to find.
   */
  it('keeps a read attempt and a heard attempt at one item apart', () => {
    const tally = tallyItems([
      attempt({ id: 'r', presentation: 'read', outcomes: [{ item: m3, correct: true }] }),
      attempt({ id: 'l', presentation: 'listen', outcomes: [{ item: m3, correct: false }] }),
    ]);
    expect(tally.get(tallyKey(READING, m3 as ItemId)))
      .toEqual({ seen: 1, correct: 1, lastSeenAt: 2000, streak: 1 });
    expect(tally.get(tallyKey(LINE, m3 as ItemId)))
      .toEqual({ seen: 1, correct: 0, lastSeenAt: 2000, streak: 0 });
    expect(tally.size).toBe(2);
  });

  /*
    The key is built rather than concatenated at each call site, and the
    item id survives it whole.

    Asserted as a suffix rather than as the finished string: the line's
    half is `lineKey`'s business and `line.test.ts` pins its shape, while
    what this half owes is that an id full of colons — every id has at
    least one — comes back out unmangled. That is why the join is two
    colons and not one, and a single colon would let a line ending in one
    and an item beginning with one produce another pair's key.
  */
  it('builds a key that keeps the item id intact', () => {
    expect(tallyKey(LINE, m3)).toMatch(/::interval:m3:up$/);
    expect(tallyKey(READING, m3)).toMatch(/::interval:m3:up$/);
    expect(tallyKey(LINE, m3), 'the two presentations share one key')
      .not.toBe(tallyKey(READING, m3));
  });
});
