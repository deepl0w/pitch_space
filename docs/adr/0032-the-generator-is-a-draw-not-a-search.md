# ADR 0032 — The generator is a draw, not a search

- **Status:** Accepted
- **Date:** 2026-10-06

Records `prefer` and `Aiming` — the seam the whole schedule attaches to, which
no record covers — and settles why its middle value has no members.

## Context

[`ROADMAP.md`](../ROADMAP.md) asks for "constraints first (hard filter), then
scheduling weights (soft preference), then the seeded draw". That seam is
built: `ExerciseSpec.prefer` carries one `ItemId` the schedule would like
asked, and `ExerciseDefinition.aims` declares what the definition can do about
it. Nothing in `docs/adr/` mentions either, which is the gap this record
closes — the scheduler has exactly one input to generation and it is
undocumented.

**The alternative that was rejected explains the rest of this record.** The
obvious seam was `focus(settings, item)` returning narrowed settings: express
the wish by tightening what the generator already reads. Four of seven
exercises cannot meet that contract, because a roman numeral is an *outcome*
of harmony generation and a rhythm cell an outcome of the filler. There is no
setting meaning "ask me a `viio`".

`prefer` goes around the settings instead. Generation picks from a pool, so it
can pick the one asked for.

### The middle value nobody declares

`Aiming` is `'exact' | 'lossy' | 'none'`. Five exercises declare `exact`, two
declare `none`, **none declares `lossy`**:

```bash
grep -rn "aims:" src/exercises/*/index.ts    # 5 exact, 2 none
```

The empty value is not an oversight. `lossy` — "the wish narrows the field and
cannot close it" — is a property of the *rejected* seam, and both exercises
predicted to need it say so where they turned out not to:

- Key identification was called lossy because `maxAccidentals` narrows the
  circle and never to one key. True of `focus`, and irrelevant to `prefer`:
  "the lossiness was a property of the design that was not taken."
- Degree identification was called lossy because the exercise also reports a
  key and no setting names one. It does not report one — `degreeItems` lists
  `degree:<n>:<mode>` and nothing else — so the key is not in the schedule's
  denominator at all.

Under `focus`, narrowing was the only expressible wish, so a middle was
inevitable. Under `prefer`, an exercise either can name the item as an input
or cannot.

## Decision

**The wish is a wish. A definition declares what it can do with one and may
ignore it, and the schedule reconciles against `exercise.items` afterwards
rather than against what it asked for.** That is what makes a declined wish
safe: the record of what was practised comes from the exercise, not from the
request.

**The generator draws from a pool; it does not search for a result.** This is
the thing `none` is protecting, and it is a decision rather than a missing
feature. Progression and rhythm could be made to aim exactly — weight the
template choice, constrain the filler — but only by turning a seeded draw into
a search for a bar satisfying a predicate. That changes the cost of generation
from bounded to unbounded, and it puts a loop between the seed and the output
where [0002](0002-generation-is-reproducible-from-its-seed.md) currently has
arithmetic.

**`lossy` stays, and it is the marker of that line.** It describes an exercise
that biases its draw toward the wish without guaranteeing it — the first step
from a draw towards a search, and the honest declaration for anyone who takes
it. It is empty today because no generator has crossed that line, **not
because narrowing is impossible**, and recording the difference is the point:
an empty category that means "nobody has done this" is not the same as one
that means "this cannot happen".

**Three values rather than two, for the reason the type already gives**: a
boolean invites an exercise that cannot aim to implement something plausible
instead, which is the silent failure the seam exists to prevent.

## Consequences

The schedule can steer five of seven exercises exactly and cannot steer two at
all. For progressions and rhythm it can only observe what came out — which is
sound, and is a real limit on spaced repetition for two of the six kinds of
practice this app is for. [`roadmap-readiness.md`](../roadmap-readiness.md)
should be read with that in mind.

### What this costs

**An empty middle reads as dead code and will be proposed for deletion.** This
record is the only thing standing between `lossy` and a tidy-up, and a record
is weaker than a member would be. If it is still empty when a third exercise
type is added, that is evidence the line is never going to be crossed and the
type should become a boolean with an honest name.

**Its contract test cannot fail today.** `aiming.test.ts` skips every type at
`if (type.aims !== 'lossy') continue`. That is defensible under the index's
third convention — a definition is tested over its domain rather than over the
inputs its current callers produce — and it is indistinguishable from a
tautology to anyone who has not read that convention. The test should say
which it is.

**`exact` is a strong promise resting on an empirical number.** The test
proves an item is reachable within a seed budget, and the budget is a measured
ceiling rather than a derived one. It will drift as the generators change, and
a budget raised to make a test pass is the promise quietly weakening.

**Declining a wish is invisible to the user and nearly invisible to the
schedule.** A `none` exercise ignores the request and reports what it did ask;
nothing records that the schedule wanted something else and did not get it. If
due items in those two exercises go unpractised for long stretches, the only
evidence will be their tallies not moving.

## Revisit when

- **Any exercise declares `lossy`.** The line has been crossed, the test stops
  being vacuous, and the cost of a bounded draw becoming a search needs
  pricing against [0002](0002-generation-is-reproducible-from-its-seed.md).
- **The schedule wants to steer progressions or rhythm.** That is the same
  question arriving from the other side, and the answer is either `lossy` or
  an admission that two exercise types are unschedulable.
- **A third exercise type is added and the middle is still empty.** Evidence
  that the category is unreachable in practice, whatever this record argues.
