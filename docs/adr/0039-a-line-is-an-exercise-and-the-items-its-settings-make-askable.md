# ADR 0039 — A line is an exercise and the items its settings make askable

- **Status:** Accepted
- **Date:** 2026-10-07

Records the user's ruling that progress is per settings combination, and
answers the question they were not asked: **which** settings are part of a
combination's identity. Changes what `tallyKey` keys on, and therefore what an
export contains.

## Context

The user has ruled that a **progression line** is an (exercise, settings
combination) pair and that everything is per line. Practising minor 2nds and
major 2nds is one line; adding minor 3rds is a different one, inheriting
nothing — not the completion grade and **not the per-question due dates**. Put
the strict and soft readings directly, they chose strict, and gave the reason:
a correct answer out of two choices is not evidence about the same question out
of three.

That arrives at the hazard [0037](0037-a-schedule-is-per-presentation-and-the-home-screen-is-not.md)'s
addendum recorded from the other side — a streak that does not know how many
alternatives it beat — and settles it more firmly than weighting would have.
Under weighting, the one-item pool measured there still builds a streak at a
discount. Under separation it builds a streak **for a line that contains one
item**, which is true and harmless.

**What was left open is the whole difficulty: which settings constitute the
combination.** Taken literally it is all of them, and that is unusable. Interval
identification alone has thirteen interval toggles, which is eight thousand
subsets before anything else is varied, and a learner who changes clef loses
every line they have.

## Decision

**A line is `(exercise, the item set its settings make askable, presentation)`.**
A setting is part of a line's identity **if and only if it changes
`items(settings)`**.

This is not a new mechanism. `items(settings)` is already on every
`ExerciseDefinition`, already the schedule's denominator, and already returns
ids that [0011](0011-what-a-catalogue-owes.md) makes a compatibility
commitment. The identity is that set, canonically ordered.

**It follows the user's own reasoning rather than approximating it.** Their
argument was about the answer space — two choices against three — and
`items(settings)` *is* the answer space. Widening a pool changes the set and
starts a new line, which is the strict reading they chose. Narrowing does too,
in both directions, which is the same rule applied honestly.

**Presentation stays explicit**, because `items` does not vary with it while
[0010](0010-presentation-is-part-of-what-an-attempt-means.md) says reading a
third and hearing one are two skills. That is what `tallyKey` already composes,
and it is unchanged.

**Settings that do not change the set are not identity**, which is the clause
doing the work. Clef, octave range, tonic choice and tempo leave
`items(settings)` alone: an `interval:m3:up` is the same item on any stave. A
learner changing clef keeps their line, and so does a release that adds a
setting nobody has set.

**And the rule carries its own escape.** If someone concludes that reading an
interval on an alto stave is genuinely a different skill, the remedy is not to
add clef to the identity — it is to make the item say so, because the item is
what the schedule is tracking. `interval:m3:up:alto` would then be a different
item, the set would differ, and the line would separate by the same rule. **The
question "is this setting part of the identity?" becomes "does this setting
change which thing is being practised?", and the answer is recorded where it is
already a compatibility commitment.**

## Consequences

`tallyKey(item, presentation)` becomes `tallyKey(line, item)` with the line
carrying the exercise, the canonical set and the presentation. Nothing in
production calls `schedule`, so the cost is tests and records rather than
behaviour — which is the cheapest this change will ever be.

An export is defined by this shape rather than bolted to it: a history is a
set of lines, each with its items and their state, and a line's identity is
reconstructible from the exercise and the set without reading any settings
blob. That matters because settings outlive the release that wrote them and
the identity must not depend on a schema anyone will migrate.

The item sets are small — at defaults, four to fourteen items per exercise —
so a canonical key is a sorted join rather than something requiring a hash.

### What this costs

**A learner who widens a pool loses visible progress and the app must say so
rather than appearing to forget them.** This is the user's explicit choice and
it is still the thing most likely to feel like a bug: ticking one more interval
resets a grade that took a week. The data is not lost — the old line keeps its
history — but a screen that shows the new line and says nothing about the old
one is indistinguishable from a reset. That is a presentational obligation this
record creates and does not discharge.

**Narrowing starts a new line too, and that is less obviously right.** Going
from three intervals to two is arguably practising a subset of what you already
knew, and the strict rule says it is a fresh line with nothing carried. The
user chose strict for widening; narrowing was not put to them separately, and
this record applies the same rule for consistency rather than because they said
so. If that turns out to be wrong, it is the half to revisit.

**A line's identity can grow large in principle.** Thirteen interval toggles is
eight thousand possible sets, and a learner who fiddles can accumulate lines
that each hold one or two attempts. Nothing prunes them, nothing merges them,
and a history is a set of lines with no upper bound on how many.

**It couples the schedule's identity to `items(settings)`'s stability.** That
function now decides which histories exist, so changing what an exercise
returns — adding an item kind, splitting one — reshapes every line that
contained it. 0011's obligation on ids extends to the *set*, and nothing
currently tests that an exercise's item set is stable across a release.

## Revisit when

- **A learner complains that widening felt like a reset.** That is the first
  cost arriving, and the answer is a screen that names both lines rather than a
  change to this rule.
- **Someone proposes adding a setting to the identity directly.** The answer is
  the escape above — change the item, not the key — and if that is unworkable
  for some setting, the rule has met a case it does not cover and should be
  narrowed deliberately rather than by exception.
- **Line count becomes a number anyone notices.** Pruning, merging or
  presenting lines in groups are all answers; none is needed until the
  accumulation is real.
- **Narrowing is put to the user.** This record decided it by symmetry and
  would rather be corrected than inferred from.

## Addendum, 7 October 2026 — it also closes something that was holding by luck

Noticed after the fact and worth a reader knowing, because a decision that
quietly fixes a latent fault is the kind of thing an author rarely spots and a
later reader benefits from.

**`tallyKey(item, presentation)` has no exercise dimension**, so two exercises
emitting the same id share a tally. Nothing has gone wrong, and the reason is
narrower than "the ids are disjoint". Measured across all seven exercises at
their defaults:

| Set | Disjoint? |
| --- | --- |
| Denominators — what `items(settings)` returns | **yes** |
| Contained — what a generated exercise carries | **no**: `key:` is shared |
| Outcomes — what a grader credits | **yes** |

Degree identification contains `key:<id>` and never credits it; key
identification both contains and credits it. So the overlap is real in the
recorded `items` and closed at the outcome layer by one exercise declining to
claim what it showed — which is
[0022](0022-an-outcome-for-evidence-that-was-never-shown.md)'s rule holding a
door shut that nobody had noticed was a door.

**[0041](0041-practice-that-counts-towards-nothing.md) is the case that would
have opened it.** A curated rhythm library and a generated rhythm exercise both
credit `cell:<id>`, both as outcomes, and both would have folded into one tally
under a key that cannot tell them apart. Under this record they are different
lines, because the exercise is part of the line, and the question does not
arise.

So the dimension added here for the user's reason — a line is per exercise and
per settings — also removes a dependency on an accident that was about to stop
holding. That is luck rather than foresight and is recorded as such.

**The disjointness was described to me as holding everywhere.** It holds for
denominators, which is what a scheduler reads today and what was measured. It
does not hold for the recorded `items`, which is what a key over attempts
actually indexes — the distinction being exactly the one
[0007](0007-an-attempt-records-per-event-item-attribution.md) keeps two lists
for.
