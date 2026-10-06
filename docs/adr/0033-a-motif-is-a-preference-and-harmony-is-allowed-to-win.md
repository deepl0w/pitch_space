# ADR 0033 — A motif is a preference, and harmony is allowed to win

- **Status:** Accepted
- **Date:** 2026-10-06

Records the first place in `generate/` where two generators want different
things and neither is wrong, and why that resolution cannot be asserted as a
number.

## Context

[`motif.ts`](../../src/generate/motif.ts) is the layer between rhythm and
melody. It decides the form — which bar restates which — and emits a **shape**:
a preferred melodic interval for each onset. The reason it exists is that the
melody search's failure mode "is blandness rather than illegality": constraints
refuse what is wrong and nothing in them makes a tune, because real melodies
are mostly one short idea said again.

A shape could have been a constraint. It is a preference, weighed by the
melody search against harmony, range and its own rules, and the reason is
musical:

> the same movement from a different starting note lands on a different
> chord — so a restatement that insisted on its intervals would break the
> strong-beat rule the moment it was transposed, which is how a repetition
> stops sounding like one and starts sounding like a mistake.

So the two layers genuinely conflict. The motif wants the same intervals; the
harmony wants chord tones on strong beats; a transposed restatement cannot
always have both. **The resolution is a weight rather than a precedence** —
`offShape: 0.8` per semitone away from what the motif asked for.

### Why the agreement rate cannot be a test

The weight was tuned by measuring what it buys, which is interval agreement
between bars that restate the same motif. Over sixty seeds, four bars each:

| weight | agreement | weight | agreement |
| --- | --- | --- | --- |
| none | 12% | 0.8 | 46% |
| 0.18 | 19% | 1.5 | 51% |
| 0.4 | 34% | 3.0 | 53% |

Set at the knee. The interesting part is the ceiling: it flattens near half,
and **the remaining half is not failure**. A restatement sits over different
chords, so an interval that was a third the first time has to be a fourth to
stay a chord tone. Half is what agreement looks like when harmony is allowed
to win.

That makes a ceiling unassertable in both directions. A threshold above the
cap can never fail, because harmony holds agreement below it whatever the
weight says. A threshold below the cap is the tuned rate wearing a test's
clothes, and pinning it would make the dial unturnable — which this project
has a convention against, because the weights are a tuning problem with no
ground truth.

## Decision

**The shape is a preference and the hard constraints win.** A motif declares
how an idea moves; where it lands is the search's business. No constraint in
`generate/` is ever softened to let a motif have its way.

**The claim that gets asserted is a relation, not a rate.** A bar that
restates a motif agrees with its original more than an unrelated bar does. If
that is false the shape is doing nothing, whatever the number happens to be,
and no amount of retuning is the answer. The measured margins live in the
comment where somebody retuning will read them; the test carries a threshold
well under the smallest margin observed, so it fails when the relation breaks
and not when the dial moves.

**A measured ceiling is evidence about the design, not a target.** The flatten
near half is the two layers' conflict made visible, and it is the number most
likely to be mistaken for a shortfall by someone trying to improve it. Driving
agreement higher means letting the motif override harmony, which is the
failure this record exists to prevent.

## Consequences

The project gets its first worked example of asserting a constraint where the
obvious thing to assert is a rate — which is the convention `CLAUDE.md` states
and which had, until now, no case where the distinction was hard.

Anyone raising `offShape` is choosing more repetition and worse harmony, and
the comment says so with the numbers that show the trade flattening. That is a
tuning decision somebody can make on evidence rather than on taste.

### What this costs

**Nothing stops the weight being raised past the knee.** The relation test
passes at any weight that does anything at all, and the comment is the only
thing arguing against 3.0. That is deliberate — pinning the rate is the
alternative and it is worse — but it means the guard against "more repetition
at any cost" is prose.

**The ceiling is measured on one corpus of seeds and treated as structural.**
The claim that harmony caps agreement near half is an inference from sixty
seeds at one set of settings. It is a sound inference and it is not a proof;
a template corpus with more static harmony would raise the cap, and the record
would then be describing a property of the templates rather than of the
layering.

**Two layers resolved by a weight have no stated precedence**, so a third
preference — a contour target, a register plan — has nowhere to say how it
ranks against these two. The weights are commensurable only because somebody
measured them together, and the next one will be tuned against a moving pair.

**It does not say what a motif is worth.** The record justifies preference
over constraint and says nothing about whether 46% agreement produces music
anyone wants to play, which is the question a musician would ask first and
the one nothing here can answer.

## Revisit when

- **A third soft preference is added to the melody search.** Two weights tuned
  against each other is a pair; three wants a stated order, or an argument for
  why they stay commensurable.
- **The template corpus changes substantially.** The near-half ceiling is
  measured against today's harmony, and 0030 keeps that corpus hand-written —
  so a wave of new templates is the event that would move it.
- **Somebody wants higher agreement.** The answer is in the table: past the
  knee it buys a few per cent and pays for them against harmony and range.
  Revisit only with a measurement that says the trade has changed.
