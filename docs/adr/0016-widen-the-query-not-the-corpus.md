# ADR 0016 — Widen the query, not the corpus, and only when it pays on its own

- **Status:** Accepted
- **Date:** 2026-10-05

Answers the question [0011](0011-what-a-catalogue-owes.md) left open. That
record found three of thirty-three progression templates unreachable on the
default path, said the mismatch must be *visible* rather than that the corpus
wins, and named its own revisit: *a progression exercise is built — decide then
whether the exercise varies the closing cadence or whether those three templates
go.* The exercise is built and the trigger has fired.

## Context

`leading-tone-close`, `axis-iv` and `plagal` declare closing cadences of `IAC`,
`DC` and `PC`. The phrase planner's default vocabulary is `PAC`, or `HC` for
blues, so template selection filtered all three out before they could be chosen.
They were not dead — `harmony.test.ts` sweeps all five cadence types — which is
exactly why nobody noticed: the suite exercised a path the app did not.

Two moves close the gap and they are not symmetrical.

**Pruning** deletes the three and leaves the corpus matching the query. It is
honest, it is one commit, and it is irreversible in the way that matters: the
templates are the musical asset, written by someone who knew what a vii°6 close
teaches, and a future exercise that wants them has to have them written again.

**Widening** teaches the planner to ask for the other three cadences. It
preserves the asset — and it carries a real hazard, which is the reason this
record exists rather than a commit message. Widening a query to make unused data
reachable is motivated reasoning wearing an engineering hat. The corpus becomes
the justification for the feature, and the feature's merit is never examined.

## Decision

**Widen the query rather than prune the corpus — but only where the widening is
worth having for its own sake, judged without reference to the data it
rescues.**

Here it is. The close is a setting, `varyCadence`, which lets the planner ask
for any of the five cadence types. The justification that makes it legitimate is
pedagogical and independent: **a learner who only ever hears V–I never learns to
hear a deceptive close as deceptive.** That argument would stand if the three
templates had never been written, and it is the test this decision has to pass.

Where no such argument exists, the corpus is the thing that moves. An entry
nothing can legitimately ask for is decoration, and 0011's obligation is that
the mismatch be visible — not that it be resolved in the data's favour.

The coverage is asserted **by name**: the test requires `DC` and `PC`
specifically, because "more kinds of close than before" would stay true with the
two that matter still missing and a third having appeared.

## Consequences

The musical asset survives, and the app gains a question it could not previously
ask. Both of those are good and only one of them was the goal.

0011's reachability obligation is now met for templates in the only way it could
be — not by a test that proves every entry reachable, which would have to model
every setting an exercise might offer, but by an exercise that reaches them and
a test that names what it reaches.

The same question is already queued behind this one. `allowAppliedDominants` and
`allowBorrowed` gate only the transformation passes that *add* those chords;
neither excludes a template that carries one in its data. Making them filter the
corpus would be a *narrowing* of the query, and would make more templates
unreachable at low grades — the mirror image of this decision, governed by the
same obligation in 0011, and a reason to decide it deliberately rather than by
fixing what looks like a bug.

### What this costs

**The principle is easier to state than to apply.** "Worth having for its own
sake" is a judgement, and the person making it is the person who wants the data
kept. The honest check is whether the feature would have been proposed with the
corpus empty; that is answerable but not testable, and nothing here enforces it.

**A setting is not free.** Every option on the settings panel is one more thing
a learner has to understand before they can practise, and one more axis across
which their history is sliced — the `(ItemId, Presentation)` key of
[0010](0010-presentation-is-part-of-what-an-attempt-means.md) does not include
the cadence setting, so attempts made with it on and off are pooled. That is
probably right, since the item being practised is the same, but it was not
decided.

**It sets a precedent that favours keeping things.** Three templates were
preserved by adding a feature. The next unreachable entry will arrive with this
record as a citation, and the independence test is the only thing standing
between it and a settings panel grown one checkbox at a time to justify data
nobody asked for.

## Revisit when

- **An unreachable entry has no independent argument for reaching it.** That is
  the case this record is written to distinguish, and the answer there is
  deletion. If it is instead resolved by widening, this record has failed at the
  one thing it exists to do.
- **The applied-dominant and borrowed flags are made honest.** Decide then
  whether they filter the corpus or are renamed to say what they do, and check
  what the narrowing costs in reachability at low grades before choosing.
- **The settings panel needs a second axis of this kind.** Two is a pattern; at
  that point ask whether the planner's vocabulary should be derived from the
  corpus rather than configured alongside it.
