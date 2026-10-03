# ADR 0005 — Seeds are minted outside the core

- **Status:** Accepted
- **Date:** 2026-10-03

Narrows [0002](0002-generation-is-reproducible-from-its-seed.md), which allowed
`randomSeed()` as the one entry point through which entropy could reach
`src/theory/`. That carve-out is withdrawn: the function has been deleted and
the core now admits no entropy at all. The rest of 0002 — that generation is a
pure function of its seed and settings, and that no clock or iteration order
may decide a musical outcome — stands unchanged and is strengthened by this.

## Context

0002 was written to settle a contradiction. `CLAUDE.md` said that nothing in
`theory/` or `generate/` may call `Math.random`; `randomSeed()` in
`src/theory/rng.ts` called it. The record resolved this by drawing the rule one
level up, around the musical choice rather than around the call: minting a seed
was permitted and pure-by-construction everywhere downstream. The enforcing test
was to assert that `randomSeed` was the *sole* caller rather than that there
were none.

That reasoning rested on a premise nobody had checked — that the function earns
its place. It does not. `randomSeed()` has no callers anywhere in the
repository, and never had any; it was written speculatively alongside the rest
of `rng.ts` before there was anything to call it.

Checking what would eventually call it is what settles the question. Minting a
seed happens exactly once per exercise, at the moment the user asks for a new
one. That is an application event: it belongs with the button that raises it,
in a store or a screen, not in a module whose other nine exports are pure
functions of their arguments. The core never needs to mint a seed. It is handed
one and spends it.

So the carve-out was not protecting a necessary exception. It was protecting a
function that the layer should not have contained in the first place, and the
two readings of the rule had been argued at some length without either of us
asking whether the code under discussion needed to exist.

## Decision

**`src/theory/` and `src/generate/` admit no entropy whatsoever.** No
`Math.random`, no `crypto.getRandomValues`, no clock. `randomSeed()` is deleted
rather than relocated, because a one-line call to `Math.random` at the point of
use is clearer than an import that exists to launder it.

Seeds are minted by whatever raises the "new exercise" event, which lives above
the core and outside the scanned directories. A seed arrives at the engine as
an ordinary number in an `ExerciseSpec`, which is also what makes it
shareable, loggable and replayable.

`makeRng(seed)` remains in `src/theory/rng.ts` and is the only way a generator
obtains randomness. Spending a seed is the core's job; minting one is not.

## Consequences

`CLAUDE.md`'s rule is now true exactly as it has always been written, and needs
no amendment. That was the point: a rule whose statement and whose enforcement
agree costs nothing to remember, whereas a rule with a documented exception has
to be re-read every time someone wonders whether their case is the exception.

The enforcing test in `src/architecture.test.ts` collapses from a scoped
line-range check — find every `Math.random`, confirm there is exactly one,
confirm its line number falls inside `randomSeed`'s body, skip the doc comment
that also mentions it — to a single assertion that the list is empty. That
version had already been wrong once, asserting that `rng.ts` was the only
*file* rather than that `randomSeed` was the only *caller*, which would have let
a second generator be added beside it. An empty-list assertion has no such
failure mode.

Reproducibility is unaffected and marginally better evidenced: with no entropy
in the scanned directories at all, "this exercise reproduces from its seed" is
a property of the whole core rather than of everything except one function.

### What this costs

The app layer now has to mint seeds itself, and there is no shared helper for
it. That is a line of code per call site and an opportunity for one of them to
do it badly — seeding from `Date.now()`, or reusing a seed across exercises so
that a session repeats itself. Nothing in this record prevents that; the
architecture test cannot see those directories, and should not be extended to,
because entropy is legitimate there.

A reader who meets `makeRng` and asks "where does a seed come from, then?" gets
no answer from `rng.ts`. The module's doc comment points here, which is weaker
than a function they could jump to.

One narrowing record exists for a function that was never called, which is
arguably more ceremony than the change deserved. It is here because 0002's
argument is published and append-only, and a reader who finds 0002 alone would
otherwise go looking for a `randomSeed` that no longer exists.

## Revisit when

- **A second place needs to mint a seed and the two disagree about how.** The
  moment there are two call sites, a `newSeed()` helper in the app layer earns
  its place — above the core, where entropy is allowed, and tested for range
  rather than for determinism.
- **Deterministic replay of a whole session is wanted**, not just of one
  exercise. That needs a seed sequence rather than independent seeds, and the
  thing that generates the sequence is a stateful object with a home somewhere
  — at which point where it lives is worth deciding deliberately rather than
  inheriting from this record.
