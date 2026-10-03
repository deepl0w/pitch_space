/**
 * Seeded random source.
 *
 * Every generator in `src/theory/` takes one of these rather than calling
 * Math.random, so an exercise is reproducible from its seed. That is what lets
 * a user report "seed 48213 gave me a bar that does not scan" and lets a test
 * assert over ten thousand generated exercises without snapshotting any of them.
 */
export interface Rng {
  /** Uniform in [0, 1) */
  next(): number;
  readonly seed: number;
}

/** mulberry32 — small, fast, and good enough for musical choices. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    seed,
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function rngInt(rng: Rng, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(rng.next() * (maxInclusive - minInclusive + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from empty list');
  return items[Math.floor(rng.next() * items.length)];
}

export function chance(rng: Rng, probability: number): boolean {
  return rng.next() < probability;
}

export interface Weighted<T> {
  value: T;
  weight: number;
}

export function weightedPick<T>(rng: Rng, items: readonly Weighted<T>[]): T {
  const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
  if (total <= 0) throw new Error('weightedPick needs at least one positive weight');
  let r = rng.next() * total;
  for (const item of items) {
    r -= Math.max(0, item.weight);
    if (r < 0) return item.value;
  }
  return items[items.length - 1].value;
}

export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Pick `count` distinct items, or all of them if there are fewer. */
export function sample<T>(rng: Rng, items: readonly T[], count: number): T[] {
  return shuffled(rng, items).slice(0, count);
}
