# ADR 0002 — Generation is reproducible from its seed

- **Status:** Accepted
- **Date:** 2026-10-03

Rests on the boundary [0001](0001-a-pure-core.md) draws. A core that cannot
reach the platform is most of the way to being reproducible already; this
record says what the rest of it is, and corrects the way the rule is currently
worded.

## Context

Exercises are generated, not authored. That makes two things hard that are easy
in an app with a fixed corpus.

A user cannot send you the exercise. They can say "the rhythm in bar three
didn't scan", and without a seed there is nothing to look at. With a seed there
is a bug report.

And the generator cannot be tested by example. Pinning a seed to an expected
melody would be a snapshot of a tuning decision, and the project's own
convention rules that out: tests assert constraints, never aesthetics. What
replaces it is the property test — generate ten thousand exercises and assert
that every one of them cadences, stays in range, and resolves its suspensions
downwards. That is only a test if the ten thousand are the same ten thousand
next time. Otherwise a failure that appears on CI cannot be reproduced locally,
and the suite becomes something people re-run until it is green.

## Decision

**Given the same seed and the same settings, generation produces the same
exercise.** Every musical choice in `src/theory/` and `src/generate/` is drawn
from an explicitly passed [`Rng`](../../src/theory/rng.ts) and from nothing
else. No clock, no ambient entropy, and no iteration order that the engine is
free to choose.

The last clause is the one that is easy to break silently. A `Set` or a `Map`
may be used for membership and for keyed lookup; it may not be the thing that
decides a musical outcome. Spreading a `Set` into an array and picking from it
is a defect even when it looks stable, because the order came from insertion
history rather than from a rule. Where a collection built from a `Set` feeds a
choice, sort it first on a musical key.

### Where the entropy is allowed in

`CLAUDE.md` states the rule as "nothing in `theory/` or `generate/` may call
`Math.random`". Read literally, that is already false:
[`randomSeed()`](../../src/theory/rng.ts) calls `Math.random` and lives in
`src/theory/rng.ts`. It is the only such call in the directory.

The function is not the defect, and deleting it would not improve anything —
something has to mint a fresh seed when the user asks for a new exercise, and
`rng.ts` is the honest place for it. The rule is worded one level too low. What
matters is not whether `Math.random` appears in a file, but whether a *musical
choice* depends on it.

So the constraint is drawn around the choice rather than around the call:

- **Minting a seed** is where nondeterminism enters, deliberately, once per
  exercise. `randomSeed()` is the only function allowed to do it, and it is the
  only entry point in the core that is not a pure function of its arguments.
- **Spending a seed** is everything downstream, and is pure. `makeRng(seed)` and
  every generator that takes an `Rng` must be reproducible.

A test enforcing this asserts that `randomSeed` is the sole `Math.random` caller
under `theory/` and `generate/`, rather than that there are none. A rule stated
so that the code already breaks it is a rule that teaches people to ignore the
check.

## Consequences

The seed travels with the exercise, so it can be displayed, logged in a bug
report, and used to reconstruct exactly what the user saw. A regression test for
a reported defect is a seed and an assertion.

Property tests become the primary tool for the generator. The sort inside
[`identifyChord`](../../src/theory/chord.ts) shows the shape this takes: it
ranks by chord family and then by inversion, both read from ordered arrays, so a
diminished seventh's four equally good roots come back in the same order every
time — which is what makes "did the answer the user played appear in the
accepted set" a stable question.

Today the rule holds. Every `Set` in `src/theory/` is either sorted immediately
after being spread ([`chord.ts`](../../src/theory/chord.ts)) or used only for
membership ([`key.ts`](../../src/theory/key.ts),
[`scale.ts`](../../src/theory/scale.ts)); both `Map`s are keyed lookups that are
never iterated.

### What this costs

**It constrains how generators may be written, permanently.** Caching keyed by
object identity, memoisation that changes traversal order, parallelism over
choices, and `Promise.all` over anything that draws from the `Rng` are all off
the table inside the core. None is attractive today; each will look attractive
once at some point, and each would be found only by someone chasing a seed that
reproduced on one machine and not another.

**Reproducibility is only as stable as the generator's call sequence.** Any
change to how many times a generator draws from the `Rng` — inserting one extra
`chance()` early on — renumbers every subsequent draw and changes every seed's
output. That is correct behaviour, not a bug, but it means an old bug report's
seed stops reproducing after an unrelated refactor, and that will be confusing
at exactly the wrong moment. Seeds are reproducible within a version, not
across versions.

**`mulberry32` is a commitment.** Changing the algorithm in
[`makeRng`](../../src/theory/rng.ts) invalidates every seed ever recorded. It is
a fine choice for musical selection and there is no reason to touch it, but it
is now part of the observable contract rather than an implementation detail.

## Revisit when

A generator first wants to draw from more than one `Rng`, or to fork one — the
usual trigger is wanting rhythm and melody to vary independently from the same
seed. The reproducibility argument survives that, but only if the forking rule
is itself deterministic, so decide it deliberately rather than per-generator.

Or when a persisted seed from an older version is found not to reproduce. That
is the cost above arriving in the field, and it is the point to decide whether
exercises need a format version alongside the seed.

## Addendum, 19 October 2026 — the tuple gained a third member

The Decision above says *given the same seed and the same settings*. Since
`03ad9e3` that is one input short: the schedule names the item the next
question should aim at, `PracticeScreen` passes it as `ExerciseSpec.prefer`,
and an exercise that can aim generates a different question for the same
`(seed, settings)` depending on what was wished. Generation is a function of
`(seed, settings, wish)`.

**Nothing in the Decision's reasoning is weakened, and that is worth saying
before the correction, because the two are easy to confuse.** Every musical
choice is still drawn from an explicitly passed `Rng` and from nothing else.
No clock reaches the core, no ambient entropy, no iteration order deciding a
musical outcome. The wish is an *input*, handed in from above exactly as the
seed is and by the same argument as [0005](0005-seeds-are-minted-outside-the-core.md);
it is not the core reaching out for something. A pure function of three things
is as pure as a pure function of two.

What changes is the reporting unit, which is half of why this record exists.
A seed alone was the bug report. For the five types that aim it no longer is,
and the failure mode is the quiet one: the seed still produces *an* exercise,
plausibly the right shape, just not the one the user saw. The repair was made
with the change rather than after it — the attempt stores `wished` (schema v4),
and `ExerciseBoundary` prints `seed N, aimed at <item>` rather than the seed
alone — so a reported attempt and a reported crash both still reproduce. The
promise that moved is narrower than it looks: not *reproducible*, but *what
you must quote to reproduce*.

The property tests are untouched for a different reason, and it is luck
sitting on top of a good default rather than design. They call `generate`
without a `prefer`, so the ten thousand are the same ten thousand. A future
suite that varies the wish will need it in whatever it prints on failure, for
the same reason the screen does.

**Two of seven types do not aim at all** — progression and rhythm answer
`aims: 'none'` — so for those a seed remains sufficient. That is a difference
between exercises in what reproducing one requires, which nothing in this
record anticipated and which is cheap only while the boundary is `aims`.
