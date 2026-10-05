import { describe, expect, it } from 'vitest';
import { chance, makeRng, pick, rngInt, sample, shuffled, weightedPick } from './rng';

const draws = (seed: number, n: number) => {
  const rng = makeRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('makeRng', () => {
  it('replays the same sequence from the same seed', () => {
    // An exercise a user reports by its seed has to reproduce exactly.
    for (const seed of [0, 1, 48213, 0xffffffff]) {
      expect(draws(seed, 32)).toEqual(draws(seed, 32));
    }
  });

  it('gives different seeds different sequences', () => {
    const first = new Set(Array.from({ length: 500 }, (_, i) => makeRng(i).next()));
    expect(first.size).toBe(500);
  });

  it('stays in [0, 1)', () => {
    /*
      Collected and asserted once, rather than twice per draw.

      The draws were never the cost. Four hundred thousand `expect` calls
      were: this took 1.6 seconds and the same loop reporting at the end
      takes 6 milliseconds, and the proof sits in the test immediately below
      — it draws the same 200,000 values from the same seed, asserts ten
      times instead of four hundred thousand, and runs in 7ms.

      That mattered beyond tidiness. At 1.6s against a 5000ms default this
      sat inside the same margin that made the progression sweep fail on CI
      and nowhere else, so it was a test reporting the runner rather than the
      generator.

      The diagnostic gets better rather than worse. Two bare comparisons
      named the offending value; this names the draw it came from, which is
      what you need to reproduce it.
    */
    const rng = makeRng(1);
    const outside: Array<{ draw: number; value: number }> = [];
    for (let i = 0; i < 200_000; i++) {
      const value = rng.next();
      // A rejected range rather than two comparisons, which reads as the
      // one question being asked. It is not a NaN fix: `expect(NaN)
      // .toBeGreaterThanOrEqual(0)` fails too, checked rather than
      // reasoned about, so the old pair caught NaN as well.
      if (!(value >= 0 && value < 1)) outside.push({ draw: i, value });
    }
    expect(outside).toEqual([]);
  });

  it('is roughly uniform', () => {
    const rng = makeRng(1);
    const buckets = new Array(10).fill(0);
    const n = 200_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rng.next() * 10)]++;
    for (const count of buckets) expect(Math.abs(count / (n / 10) - 1)).toBeLessThan(0.05);
  });

  it('refuses a seed that would not identify its own stream', () => {
    // `>>> 0` used to coerce silently, so makeRng(0) and makeRng(2 ** 32) were
    // one stream reporting two different seeds. Minting is the app layer's job
    // under ADR 0005, so a bad seed is a bug there and has to say so.
    for (const seed of [-1, 1.5, NaN, Infinity, 2 ** 32, 2 ** 53]) {
      expect(() => makeRng(seed), `${seed}`).toThrow(/Seed must be an integer/);
    }
  });

  it('accepts both ends of the range a 32-bit seed can take', () => {
    for (const seed of [0, 0xffffffff]) expect(() => makeRng(seed)).not.toThrow();
  });

  it('reports the seed it was actually given', () => {
    for (const seed of [0, 1, 48213, 0xffffffff]) expect(makeRng(seed).seed).toBe(seed);
  });

  it('takes any seed the app layer mints', () => {
    // Seeds come from outside the core under ADR 0005, so every value a
    // 32-bit mint can produce has to replay.
    for (const seed of [0, 1, 0x7fffffff, 0x80000000, 0xffffffff]) {
      expect(draws(seed, 8)).toEqual(draws(seed, 8));
    }
  });
});

describe('the helpers', () => {
  it('keeps rngInt within its bounds and reaches both of them', () => {
    const rng = makeRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 50_000; i++) {
      const v = rngInt(rng, 1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rngInt(makeRng(3), 5, 5)).toBe(5);
  });

  it('honours the ends of chance', () => {
    expect(chance(makeRng(1), 0)).toBe(false);
    expect(chance(makeRng(1), 1)).toBe(true);
  });

  it('picks only from the list, and refuses an empty one', () => {
    const rng = makeRng(11);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 1000; i++) expect(items).toContain(pick(rng, items));
    expect(() => pick(rng, [])).toThrow(/empty/);
  });

  it('weights a pick in proportion, and never picks a zero weight', () => {
    const rng = makeRng(99);
    const counts = { a: 0, b: 0, c: 0 };
    const n = 60_000;
    for (let i = 0; i < n; i++) {
      counts[weightedPick(rng, [
        { value: 'a' as const, weight: 1 },
        { value: 'b' as const, weight: 3 },
        { value: 'c' as const, weight: 0 },
      ])]++;
    }
    expect(counts.c).toBe(0);
    expect(counts.a / n).toBeCloseTo(0.25, 2);
    expect(counts.b / n).toBeCloseTo(0.75, 2);
  });

  it('refuses a weighting with nothing to pick', () => {
    for (const items of [[], [{ value: 'x', weight: 0 }], [{ value: 'x', weight: -5 }]]) {
      expect(() => weightedPick(makeRng(1), items)).toThrow(/positive weight/);
    }
  });

  it('shuffles into a permutation without touching the input', () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    const rng = makeRng(5);
    for (let i = 0; i < 2000; i++) {
      const out = shuffled(rng, items);
      expect([...out].sort((a, b) => a - b)).toEqual(items);
    }
    expect(items).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('shuffles without favouring any position', () => {
    const rng = makeRng(5);
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    const n = 40_000;
    const firstPosition = new Array(8).fill(0);
    for (let i = 0; i < n; i++) firstPosition[shuffled(rng, items)[0]]++;
    for (const count of firstPosition) expect(Math.abs(count / (n / 8) - 1)).toBeLessThan(0.05);
  });

  it('samples distinct items, and caps at the size of the list', () => {
    const items = [0, 1, 2, 3, 4, 5, 6, 7];
    const rng = makeRng(3);
    for (let i = 0; i < 1000; i++) {
      const out = sample(rng, items, 3);
      expect(out).toHaveLength(3);
      expect(new Set(out).size).toBe(3);
      for (const v of out) expect(items).toContain(v);
    }
    expect(sample(rng, items, 20)).toHaveLength(items.length);
    expect(sample(rng, items, 0)).toEqual([]);
  });
});
