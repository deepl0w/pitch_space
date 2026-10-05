# What the architecture supports of what is planned

A review of the system as it stands on 6 October 2026 against
[`ROADMAP.md`](ROADMAP.md), asking one question: where will the roadmap meet
a seam that cannot take it?

The answer is mostly reassuring and it has one bad spot. The spaced-repetition
design the roadmap describes is *already built into the contract* — not
planned for, built — because [0007](adr/0007-an-attempt-records-per-event-item-attribution.md)
made the right split before anyone needed it. What is not ready is the signal
the roadmap says distinguishes this app from a flashcard deck, and the place a
user would first see any of it.

This document takes no decisions. It names six gaps, says which are cheap now
and expensive later, and ends with an order.

## Contents

- [What is already in place](#what-is-already-in-place)
- [G1 — the latency signal is recorded and then discarded](#g1--the-latency-signal-is-recorded-and-then-discarded)
- [G2 — the scheduler is a fixed ladder and the roadmap says SM-2](#g2--the-scheduler-is-a-fixed-ladder-and-the-roadmap-says-sm-2)
- [G3 — a due item the settings exclude is unrepresentable](#g3--a-due-item-the-settings-exclude-is-unrepresentable)
- [G4 — the home screen cannot say "I do not know"](#g4--the-home-screen-cannot-say-i-do-not-know)
- [G5 — imported scores break `generate(spec)` and `items(settings)`](#g5--imported-scores-break-generatespec-and-itemssettings)
- [G6 — the roadmap's item ids are not the ids being written](#g6--the-roadmaps-item-ids-are-not-the-ids-being-written)
- [The order I would take them in](#the-order-i-would-take-them-in)

## What is already in place

Worth leading with, because it is most of the feature and it was not an
accident.

**Many-to-many attribution, which the roadmap calls "the problem that is not
in the textbooks", is solved in the contract.** `Attempt` carries `items` —
everything the rendering contained — and `outcomes`, one per item the response
actually tested. That is exactly the roadmap's requirement that items
demonstrably got right are credited even when the exercise failed, and items
merely contained get nothing.
[0007](adr/0007-an-attempt-records-per-event-item-attribution.md) decided it;
[0013](adr/0013-knowing-the-answer-narrows-what-judging-has-to-do.md),
[0018](adr/0018-uncalibrated-is-not-zero.md) and
[0024](adr/0024-the-progress-view-lists-what-was-tested.md) are the same rule
meeting new cases, which `judging-chain.md` traces.

**The generator already reports what it exercised**, in both senses the
roadmap needs: `exercise.items` per rendering, and `items(settings)` on the
definition as the schedule's denominator — which the log cannot supply,
because the log says what *has* been asked and the first session is the gap
between that and this.

**The weighting seam exists and is the right shape.** The roadmap asks for
"constraints first (hard filter), then scheduling weights (soft preference),
then the seeded draw". `ExerciseSpec.prefer` is that, implemented as a wish
the generator may decline rather than a command — which is what lets it work
for the exercises where a roman numeral or a rhythm cell is an *outcome* of
generation and not a setting.

**Error localisation works in tick space**, which is what lets an error reach
back to the items that produced it; grading and generation share the
timeline.

**Storage is already versioned**, with `migrate.ts` and a record-at-a-time
read, and `ScoreLayout` ([0029](adr/0029-a-prompt-is-a-component-and-may-use-one.md))
is the prerequisite for "following the music on the staff" and already ships.

## G1 — the latency signal is recorded and then discarded

**The worst of the six, because it is the roadmap's stated differentiator.**

> Latency matters more here than in flashcards. A musician who plays the right
> note after two seconds of thought has not learned it. Grade on correctness
> *and* time-to-attack relative to the tempo, so hesitation shortens the next
> interval even when nothing was wrong.

`ItemOutcome.latencyMs` is captured and validated in
[`schema.ts`](../src/state/schema.ts). It then stops. `ItemTally` is
`{ seen, correct, lastSeenAt, streak }`, and
[`schedule.ts`](../src/state/schedule.ts) reads nothing else:

```bash
grep -n "latency" src/state/schedule.ts src/state/progressStore.ts   # nothing
```

So the attempt log holds the signal and the scheduler cannot see it. That is a
cheap fix today — a rolling latency summary on the tally — and an expensive one
after a history has accrued without it, because the summary cannot be
backfilled from tallies that never kept it. The raw outcomes are in the log, so
a migration is *possible*; it is a whole-log read, which
[0006](adr/0006-settings-in-localstorage-progress-in-indexeddb.md) names as the
operation its record-at-a-time granularity is wrong for.

**And the signal's source is unreliable, which the roadmap does not know.**
[0018](adr/0018-uncalibrated-is-not-zero.md) withholds `latencyMs` when no
calibration is in force; [0025](adr/0025-agreement-among-trials-that-share-an-error-is-not-confidence.md)
found the app's own confidence in a measurement blind to the error that
dominates it; [0026](adr/0026-a-measurement-signal-does-not-inherit-a-listening-level.md)
found the clicks going out 24 dB down. So the plan leans on a number that is
`null` for anyone who has not calibrated, and calibration is three records deep
in trouble. **Whatever the scheduler does with latency has to work when it is
absent**, which is a design constraint the roadmap's paragraph does not carry.

## G2 — the scheduler is a fixed ladder and the roadmap says SM-2

The roadmap: "Scheduler state is per item: ease, interval, due date, lapse
count, plus a short rolling history for the latency signal."

What exists is a fixed ladder — `INTERVALS_MS` indexed by `streak` — with no
ease factor and no lapse count. Two items with the same streak are
indistinguishable, which is the thing an ease factor exists to prevent.

This is not obviously wrong. A Leitner ladder is simpler, has no tuning
parameters to get wrong, and the roadmap's own argument for SM-2 is "about
fifty lines, thoroughly understood" rather than that it is needed. But the
divergence is unrecorded, and an undocumented departure from a written plan is
the kind of thing that gets "corrected" back by someone who read the plan. It
wants a record either way: adopt SM-2, or say why the ladder is the decision.

## G3 — a due item the settings exclude is unrepresentable

The roadmap:

> A due item may be unreachable under the user's constraints — a `m7b5` that is
> due when the settings allow triads only. The schedule should say so rather
> than silently never showing it.

It cannot currently say so, and not because nobody wrote the branch. The
denominator is `items(settings)` — already filtered by the settings — so an
item the settings exclude is not in the set the scheduler reasons over at all.
`schedule.ts` has no notion of reachability and no place to put one.

Saying so needs a second set: everything the exercise could ever ask against
everything these settings can ask. That is a change to the contract, which is
why it belongs on this list rather than in a backlog — it is cheap while
`items` has one caller and expensive once the home screen, the practice count
and the scheduler all read it.

## G4 — the home screen cannot say "I do not know"

The roadmap calls a due count "the whole visible surface of this feature". It
also records that a count shipped once and was removed within the hour, and the
first of its three failures is the architectural one:

> It could not say "I do not know". With storage blocked, the numbers came back
> byte-identical to a brand-new profile, because with no readable history every
> item is unseen and unseen is due.

That is not a copy problem. Settings are synchronous in `localStorage` and
progress is asynchronous in IndexedDB
([0006](adr/0006-settings-in-localstorage-progress-in-indexeddb.md)), so the
first paint has three states — *known*, *nothing practised yet*, *cannot read
your history* — and the type the screen reads has two. 0006's first revisit
trigger is this exact moment, and it pre-wrote the wrong answer so it could be
recognised: "the answer is not to move the log into `localStorage`; it is to
decide deliberately what the first frame shows while the log loads, and the
temptation at that moment will be the other one."

The other two failures the sweeps found — a count that moves when settings
change, and a family card summing items no amount of practice on the chosen
ones can clear — are the same shape as G3, and fall out of it.

## G5 — imported scores break `generate(spec)` and `items(settings)`

The furthest out and the one that stresses the most load-bearing decision.

A score is "not a new exercise type — a *source* the existing ones draw on".
But `ExerciseSpec` is `{ seed, settings, prefer? }`, and
[0002](adr/0002-generation-is-reproducible-from-its-seed.md) and
[0005](adr/0005-seeds-are-minted-outside-the-core.md) make an exercise
reproducible from `(seed, settings)`. An exercise drawn from bar 12 of a user's
imported sonata is not.

Both ways out cost something:

- **The score joins the settings** — a score id and a bar range. `(seed,
  settings)` stays total, and reproduction now requires a file that "stays on
  the device, is never uploaded, and is not shared between users", which the
  roadmap states as a legal constraint. A reported seed reproduces nothing for
  anyone else, which is most of what reproducibility was for.
- **A second seam beside `generate`**, which splits the contract the registry's
  "one import and one array entry" rests on.

`items(settings)` has the same problem one layer up: the items an imported
score exercises depend on the score's contents, so the schedule's denominator
stops being a function of the settings.

Nothing needs deciding now — the roadmap rightly puts this after the generated
types work. What matters is that **the decisions being made now are the ones it
will break**, so whoever extends `ExerciseSpec` or `items` next should know a
score is coming.

## G6 — the roadmap's item ids are not the ids being written

Item ids are a compatibility commitment from the first release
([0011](adr/0011-what-a-catalogue-owes.md), obligation 2). The roadmap's table
and the code disagree:

| Roadmap | Actually written |
| --- | --- |
| `rhythm:dotted_e_s` | `cell:dotted_e_s` |
| `harmony:ii-V-I` | `progression:major:V` |
| `read:treble:ledger_above:A5` | nothing — sight reading is unbuilt |

The code is authoritative, because history is accruing against it. The roadmap
is the document to correct, and it is worth correcting rather than leaving:
a plan naming ids that differ from the shipped ones is how a migration gets
written against the wrong vocabulary.

## The order I would take them in

Cheapest-now-and-dearest-later first, which is not the same as most important.

1. **G6**, minutes. Correct the roadmap's id table against the code before
   anyone plans a migration from it.
2. **G1's storage half**, small now. Put a latency summary on the tally before
   histories accrue without one. The scheduler need not use it yet; what is
   expensive is the backfill, not the read.
3. **G3**, while `items` has one caller. Decide whether the schedule can see
   past the settings, because G4's second and third failures depend on the
   answer and the contract is cheapest to widen now.
4. **G4**, before the due count ships a second time. The tri-state is the
   decision; the count is the easy part, and it has already been removed once
   for getting this wrong.
5. **G2**, whenever the scheduler is next opened. A record either way; no
   urgency, but the divergence should not be discovered by someone reading the
   roadmap.
6. **G5**, not yet. Flag it in `IN-FLIGHT.md` when `ExerciseSpec` or `items`
   is next touched, so the person widening them knows what is coming.

The one I would not defer is G1's absent-latency constraint, which is not a
task but a thing the scheduler's design has to assume from the start: **the
signal the roadmap leans on is `null` for most users and will stay that way
until calibration works.** A schedule built expecting it, and then fed nulls,
is the uncalibrated-attempt problem from 0018 one level up.
