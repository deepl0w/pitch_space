/**
 * Where nondeterminism enters the application.
 *
 * The core admits none at all (ADR 0005): `src/theory/` and `src/generate/`
 * spend seeds and never mint them. Minting happens once per exercise, at the
 * moment the user asks for a new one, and that is an application event — so
 * it lives here, above the scanned directories, in one file rather than
 * scattered across the call sites that need it.
 *
 * **0005 states the opposite of a rule and this file is the answer to it.**
 * Under *What this costs* it says there is no shared helper, that minting is
 * therefore a line per call site, and that this is "an opportunity for one of
 * them to do it badly — seeding from `Date.now()`". That is a predicted
 * failure, not a threshold for when a helper is earned; an earlier version of
 * this comment credited the record with the second and it says only the
 * first. The helper exists here because the registry makes the prediction
 * certain rather than likely: every exercise type needs a seed, so the
 * scattered version is five call sites rather than a hypothetical one.
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
