# ADR 0044 — Deterministic is not the same as seeded

- **Status:** Accepted
- **Date:** 2026-10-08

[0002](0002-generation-is-reproducible-from-its-seed.md) requires that an
exercise reproduce from its seed. This says the stronger thing that was always
meant: that the seed is what *decides*. The two come apart, and a defect living
in the gap passes every guard the repository has.

## Context

Aiming an interval exercise at a unison froze the direction. A unison has one
item and both directions produce it, so the wish matched two `(semitones,
direction)` pairs; the code took the first, which is whichever way
`settings.directions` happened to list. Every wished unison came out the same
way forever.

**Nothing was irreproducible.** The same seed and the same settings gave the
same exercise, every time. 0002 was satisfied in the letter and emptied in the
substance: a musical dimension stopped being chosen by the seed and started
being chosen by the order of an array.

`CLAUDE.md` already forbids this, and names it by its mechanism — no
`Math.random`, no clock, and no letting `Set`/`Map` iteration order decide a
musical choice. `src/architecture.test.ts` enforces that last clause by
matching `[...new Set(` and its siblings. **The unison defect used a different
mechanism — first-match on a plain array — and walked past a guard written
against the one that had bitten before.**

That is the shape to generalise. A `Set` spread is not forbidden because it is
random; it is forbidden because the resulting order is *incidental* — it comes
from how upstream code happened to insert, not from the music and not from the
seed. `find` on an array, indexing `[0]`, a sort by id, and a first match are
all the same fault wearing different clothes.

## Decision

**Every musical choice is made by the seed. Reproducibility is a consequence of
that, not a substitute for it.**

Concretely: where more than one value would satisfy the constraints in force, the
choice among them goes through the `Rng`. Taking the first, the smallest or the
one that happened to be listed earliest is a defect even when it is perfectly
repeatable.

**The corollary for aiming, which is what prompted this**: a wish decides what
the item decides and no more. [0032](0032-the-generator-is-a-draw-not-a-search.md)
says a wish may be declined and that the schedule reconciles against
`exercise.items` rather than against the request. It does not say what honouring
a wish may *additionally* fix, because until an item collapsed two settings
values onto one outcome there was no case where that could differ. There is now,
and the rule is that narrowing to an item narrows nothing else.

## How this is checked, and why the existing guards could not

**The symptom is not irreproducibility, so no reproducibility test can see it.**
Run the generator a thousand times with a thousand seeds and the unison bug
produces a thousand perfectly correct, perfectly repeatable exercises. What is
wrong is not any one of them; it is that a dimension the settings permit never
varies across the whole thousand.

So the check has a different shape from 0002's: **over many seeds, every value
the settings allow should actually appear.** That is a coverage property, it
fails loudly when a dimension freezes, and it is the only one of the two that
could have caught this. `src/exercises/aiming.test.ts` has it as "freezes only
what the wish decides, and nothing else that was varying", derived per field
rather than listed, which is what makes it survive a new field being added.

**And the mechanism guard should stay narrow rather than be widened.** The
temptation is to extend `architecture.test.ts` to match `find`, `[0]` and
sorts. That would fire constantly on the many correct uses of all three and
earn itself ignored, which the ADR index's second convention already warns is
the failure mode — a guard scoped wider than what can change the thing it
guards is noise, and noise is how a guard stops being read. The `Set` rule
keeps its narrow scope because `[...new Set(` into a choice is almost never
right. The general rule is carried by the coverage property instead, which
tests the outcome rather than the spelling.

## What this costs

**A coverage property needs to know what should vary**, which a grep does not.
Each exercise has to say which dimensions its settings open up, or the check
derives it and inherits whatever the derivation misses. The tester measured
exactly that limit on the day: the spelling mutant survives the aiming check,
because `pitches` varies by register alone when the spelling is pinned, so a
field several things feed into cannot show one of them freezing. That is
recorded in the test rather than left looking covered.

So this record does not claim the property is a complete guard. It claims it is
the right *kind* of guard, and that the gaps in it are visible — which is the
distinction `docs/misread-instruments.md` is entirely about, applied here to the
instrument this record proposes.

## Revisit when

**A dimension is found frozen that the coverage property was supposed to
watch.** That is the signal that the derivation missed a field, not that the
approach is wrong, and the fix is to name the field rather than to widen a
pattern match.
