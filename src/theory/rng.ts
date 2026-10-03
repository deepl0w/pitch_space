/**
 * Seeded random source.
 *
 * Every generator in `src/theory/` and `src/generate/` takes one of these
 * rather than calling Math.random, so an exercise is reproducible from its
 * seed. That is what lets a user report "seed 48213 gave me a bar that does
 * not scan" and lets a test assert over ten thousand generated exercises
 * without snapshotting any of them.
 *
 * Minting a seed is not this layer's job and does not happen here. The core
 * spends seeds; the app layer mints one when the user asks for a new
 * exercise, which is where the nondeterminism belongs and where it is
 * visible. See docs/adr/0005.
 */
export interface Rng {
  /** Uniform in [0, 1) */
  next(): number;
  readonly seed: number;
}

/**
 * mulberry32 — small, fast, and good enough for musical choices.
 *
 * The seed is rejected rather than coerced. `>>> 0` silently maps NaN to 0,
 * truncates a fraction and wraps at 2^32, so `makeRng(0)` and
 * `makeRng(2 ** 32)` were one stream reporting two different seeds — and a
 * seed that does not identify its own stream is the one thing this module
 * exists to provide. Minting is the app layer's job (ADR 0005), so a bad seed
 * here is a bug there, and should say so.
 */
export function makeRng(seed: number): Rng {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error(`Seed must be an integer in [0, 2^32): got ${seed}`);
  }
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
