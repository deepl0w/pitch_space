/**
 * Where nondeterminism enters the application.
 *
 * The core admits none at all (ADR 0005): `src/theory/` and `src/generate/`
 * spend seeds and never mint them. Minting happens once per exercise, at the
 * moment the user asks for a new one, and that is an application event — so
 * it lives here, above the scanned directories, in one file rather than
 * scattered across the call sites that need it.
 *
 * ADR 0005 said a shared helper earns its place at the second call site. It
 * is written at the first because the registry guarantees the second: every
 * exercise type needs a seed, and the alternative is five call sites each
 * seeding from `Date.now()` in its own way, which is exactly the failure that
 * record predicted.
 */

/** Exclusive upper bound, matching what `makeRng` accepts. */
const SEED_RANGE = 0x100000000;

function randomUint32(): number {
  // crypto gives a uniform draw over the whole range; Math.random has only 53
  // bits of mantissa and is fine for this, which is why the fallback is not
  // worth more than one line.
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * SEED_RANGE);
}

/**
 * A fresh seed, in the range `makeRng` accepts.
 *
 * Tested for range rather than for determinism, which is the one useful
 * thing to assert about a function whose job is to be unpredictable.
 */
export function newSeed(): number {
  return randomUint32();
}

/**
 * An id for one recorded attempt.
 *
 * Minted rather than derived from the seed: the same exercise can honestly be
 * attempted twice, and a key collision in the attempt log would silently
 * replace the first answer with the second.
 */
export function newAttemptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${randomUint32().toString(36)}`;
}
