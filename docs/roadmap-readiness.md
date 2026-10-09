# What the architecture supports of what is planned

A review of the system against [`ROADMAP.md`](ROADMAP.md), asking one
question: where will the roadmap meet a seam that cannot take it?

**Written as a dated snapshot on 6 October and converted on 9 October into a
document that checks itself**, because the first form was the wrong one for
what this is. A snapshot is right for a report nobody acts on; this one exists
to be acted on, and by 9 October **three of its six gaps had been closed while
it went on asserting them**. That is the failure its own sixth-convention
neighbour describes — a claim that something is *missing* is contradicted by
nobody, because building the thing does not prompt anyone to delete the entry.

So every gap below now carries the command that answers whether it is still
open. Run the command, not the prose.

The answer is mostly reassuring and it has one bad spot. The spaced-repetition
design the roadmap describes is *already built into the contract* — not
planned for, built — because [0007](adr/0007-an-attempt-records-per-event-item-attribution.md)
made the right split before anyone needed it. What is not ready is the signal
the roadmap says distinguishes this app from a flashcard deck, and the place a
user would first see any of it.

This document takes no decisions. It names six gaps, says which are cheap now
and expensive later, and ends with an order. **Three are now closed and are
kept rather than deleted**, because what closed them is the useful part and a
vanished entry teaches nobody.

## Contents

- [What is already in place](#what-is-already-in-place)
- [G1 — the latency signal is recorded and then discarded](#g1--the-latency-signal-is-recorded-and-then-discarded)
- [G2 — the scheduler is a fixed ladder and the roadmap says SM-2](#g2--the-scheduler-is-a-fixed-ladder-and-the-roadmap-says-sm-2)
- [G3 — a due item the settings exclude is unrepresentable](#g3--a-due-item-the-settings-exclude-is-unrepresentable)
- [G4 — the home screen cannot say "I do not know"](#g4--the-home-screen-cannot-say-i-do-not-know)
- [G5 — imported scores break `generate(spec)` and `items(settings)`](#g5--imported-scores-break-generatespec-and-itemssettings)
- [G6 — the roadmap's item ids are not the ids being written](#g6--the-roadmaps-item-ids-are-not-the-ids-being-written)
- [G7 — the visual claims have an instrument and no harness](#g7--the-visual-claims-have-an-instrument-and-no-harness)
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

**The weighting seam exists and is the right shape**, and is now recorded as
[0032](adr/0032-the-generator-is-a-draw-not-a-search.md) — with the limit that
record names: five of seven exercises can be steered exactly and two cannot be
steered at all, because the generator draws rather than searches. Spaced
repetition for progressions and rhythm can observe what came out and not ask
for what is due. The roadmap asks for
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

**Open** (checked 9 October).

```bash
grep -rn 'latencyMs' src/ | grep -v '\.test\.'   # written on an outcome; no reader
```

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

So the attempt log holds the signal and the scheduler cannot see it. **Adding a
latency summary to the fold costs the same whenever it is done**, and needs no
migration.

> **Corrected, 6 October.** This paragraph said the fix was cheap now and
> expensive later, "because the summary cannot be backfilled from tallies that
> never kept it", and went on about whole-log migrations. **`ItemTally` is
> never persisted.** It is a pure fold — `tallyItems(attempts)` builds a fresh
> map, `PracticeScreen` recomputes it with `useMemo`, and the app has exactly
> one object store, `attempts`. The raw `latencyMs` is already on every
> outcome and already validated, so there is nothing to backfill, now or in a
> year.
>
> The error is the index's first convention and it was mine about my own
> document: [0006](adr/0006-settings-in-localstorage-progress-in-indexeddb.md)
> says progress lives in IndexedDB under a versioned migration, and I read
> that as "tallies are stored" rather than checking that they are derived. A
> claim taken from a record instead of from the code.
>
> It matters beyond tidiness — this gap had been picked up as the next piece
> of work on the strength of the ordering below, which was wrong.

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

**Closed 9 October.** The gap asked for "a record either way: adopt SM-2, or say why the ladder is the decision". `ROADMAP.md` now states the ladder as what shipped, names SM-2 as the plan it departed from, and names FSRS retrievability as the successor and why it waits. The divergence is recorded, which is what was wanted; nothing was adopted.

```bash
grep -n 'Leitner ladder' docs/ROADMAP.md
```

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

**Closed.** `ScheduledItem` now carries whether the current settings can ask the item, with a comment saying a due item the settings exclude has to be representable. The contract was widened while `items` still had few callers, which is what the gap asked for.

```bash
grep -n 'interface ScheduledItem' -A 12 src/state/schedule.ts
```

The roadmap:

> A due item may be unreachable under the user's constraints — a `m7b5` that is
> due when the settings allow triads only. The schedule should say so rather
> than silently never showing it.

It cannot currently say so, and not because nobody wrote the branch. The
denominator is `items(settings)` — already filtered by the settings — so an
item the settings exclude is not in the set the scheduler reasons over at all.
`schedule.ts` has no notion of reachability and no place to put one.

Saying so needs a second set: everything the exercise could ever ask against
everything these settings can ask. To be exact about where the gap is —
`schedule(askable, …)` takes the askable set as a parameter, so the *caller*
chooses it and nothing stops a wider one being passed. What is missing is
downstream: `ScheduledItem` is `{ item, tally, due }` with no way to say
*reachable*, so a wider set would arrive indistinguishable from a narrower
one. That is a change to the contract, which is
why it belongs on this list rather than in a backlog — it is cheap while
`items` has one caller and expensive once the home screen, the practice count
and the scheduler all read it.

## G4 — the home screen cannot say "I do not know"

**Architectural half closed; the count itself is unbuilt.** G3 closing also removes the two remaining failures' blocker, since they were G3's.

```bash
grep -rn 'dueCount' src/ui/ | grep -v '\.test\.'   # empty means no count has shipped
```

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
your history*.

> **Corrected, 6 October.** This said "the type the screen reads has two". It
> has three: `ProgressStatus` is `'loading' | 'ready' | 'unavailable'`, it
> landed on 4 October — two days before this review claimed it did not
> exist — and `PracticeScreen` already branches on `'unavailable'`.
> `dueCount`'s own comment names it as the thing a caller must check before
> showing a figure.
>
> **So G4's architectural half is built.** What is unbuilt is the count
> itself, and the two remaining failures below, which are G3's. The same
> fault as G1 in this document and in the same week: a claim about the code
> I did not check, in a review of the code.

0006's first revisit trigger is this moment, and it pre-wrote the wrong answer
so it could be recognised: "the answer is not to move the log into `localStorage`; it is to
decide deliberately what the first frame shows while the log loads, and the
temptation at that moment will be the other one."

The other two failures the sweeps found — a count that moves when settings
change, and a family card summing items no amount of practice on the chosen
ones can clear — are the same shape as G3, and fall out of it.

### The motivating case, measured from outside

A returning-learner pass: ten questions across two exercises on a fresh
profile, closed, reopened. **Home is pixel-identical to a stranger's first
visit** — the same card text for the two exercises just drilled, no badge, no
last-practised, no reordering. Settings' "Your history" panel is three
sentences of privacy prose and, checked in the source, **not one figure and no
reference to the store at all.**

The user role's framing is better than this review's and replaces it:

> Per-category stats exist and are tracked correctly, right now, today. But
> they are invisible from the two places a returning learner would actually
> look. You would have to already be inside the right exercise, looking at the
> right interval, to ever learn the app remembers you at all.

So the gap is not the absent scheduler, which `ROADMAP.md` states plainly and
which misleads nobody. It is **working, accurate data with nowhere to
surface** — a different problem, with a different cost, and the one G4 is
about.

Severity, as they judged it and worth recording in their terms: **a quiet
absence rather than a defect.** Nothing on screen promises progress tracking,
so nothing contradicts itself the way the clef did. Deflating, not alarming —
which is what decides its order against the other open questions rather than
its size.

### Answered: the three sites are one decision, and the user has taken it

[0040](adr/0040-completion-replaces-the-score.md) settles what the figure is —
a completion rather than a count — which retires session-versus-lifetime rather
than relabelling it, and makes the home screen's number a function of how far
each line has advanced. [0039](adr/0039-a-line-is-an-exercise-and-the-items-its-settings-make-askable.md)
settles what it is a figure *of*. The section below stands as the reasoning
that got there.

### The three sites are one decision

Session-versus-lifetime counts with no scope word, the empty history panel,
and the home screen are not three items. They are one question — **what
progress the app shows, where, and what it says when it does not know** —
asked in three places, and each answer has to satisfy constraints that are
already recorded:

- [0037](adr/0037-a-schedule-is-per-presentation-and-the-home-screen-is-not.md)'s
  rule, that a figure names its scope or is not shown, with scope being time
  as readily as presentation;
- [0006](adr/0006-settings-in-localstorage-progress-in-indexeddb.md)'s
  tri-state, which `ProgressStatus` already supplies, so a figure can say *I
  cannot read your history* rather than showing a stranger's number;
- the due count that shipped and was pulled within the hour, which is the
  precedent for what happens when a figure is right and its sentence is not.

Listing them separately is what makes the cheapest-looking one — a count in
the Settings panel, five minutes of work — read as cosmetic. It is the same
five minutes that were spent and reverted once already.

## G5 — imported scores break `generate(spec)` and `items(settings)`

**Open**, and not yet due. Nothing imports a score.

```bash
grep -rln 'MusicXML\|musicxml' src/   # empty means this is still ahead
```

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

**Closed.** The roadmap's table was corrected against the code, and on 9 October verified by the method the table itself demands — running `items()` over every exercise and reading back the prefixes, rather than reading the table. Every prefix and every example checks out.

```bash
# the table names its own method: enumerate rather than read
grep -n 'Correct this table that way or not at all' docs/ROADMAP.md
```

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

## G7 — the visual claims have an instrument and no harness

**Open** (found 9 October).

```bash
grep -nE 'playwright|puppeteer|chrome-remote|webdriver' package.json   # empty
grep -nE 'chrome|headless|9333' test.sh                                 # empty
```

**A different kind of gap from the six above, and worth saying so rather than
forcing the shape.** Those are seams that will not take the work. This is the
absence of a way to check a whole class of claim the work keeps making.

The project *has* the instrument. `docs/RUNNING-THE-APP.md` documents driving
real Chrome over CDP, and it exists because the preview harness misreports this
app in particular — two published findings had to be withdrawn over it. What
does not exist is anything committed: no browser dependency, nothing in
`test.sh`. **The instrument is a procedure someone follows, so a visual claim
is checked exactly when a person remembers to check it.**

Four live needs are already waiting on it, which is what moves this from a
preference to a gap:

- **That the question does not move when the answer appears.** This was
  listed as watching a measured length, `--answer-reserve`, for drift. **The
  length is gone** — a sweep of the other five exercises found key and scale
  identification still moving 113px, because each exercise's answer is a
  different height and one constant cannot stand for six, so the pane is now
  split by a fraction and nothing below the question can reach it. The need
  did not go with it: *stable by construction* is a claim about CSS behaviour
  that nothing checks, and the coupling can be reintroduced by any later
  change. What is wanted is the property, not the figure, and it still has
  nowhere to live.
- **The colour rule.** `src/index.css` states that a verdict which is only a
  hue is no verdict to a colour-blind reader. It is kept everywhere and
  enforced nowhere, and the proposed red-to-green progress reading is the first
  case that would strain it.
- **Touch targets.** The reason the preview harness is distrusted at all.
- **Notation rendering.** `Score` redraws at the measured width; whether the
  result is legible at phone widths is not a thing jsdom can answer.

**One thing this gap has already demonstrated about itself.** The first
bullet above went stale within a day of being written, and **G7's own command
could not catch it** — that command asks whether a harness exists, which is
still no, so the gap stayed correctly open while the reason given for it
quietly stopped being true. A per-gap check tests the gap, not the
justification, and a justification is a claim like any other.

**The cost is why this has not happened and should be stated with the gap.** A
browser harness is slow, flaky and a maintenance burden, and this project has
deliberately bought a fast pure-core suite by keeping the platform at the
edges. Adding a full end-to-end framework would trade that away for four
assertions.

So the proportionate version is not Playwright. It is **one CDP script behind
`test.sh --visual`, asserting a handful of properties against a built app** —
the same procedure `RUNNING-THE-APP.md` already describes, committed instead of
recalled, and kept out of the default run so the fast suite stays fast. That is
also the honest scope: it is a harness for claims nothing else can reach, not a
second test suite.

## The order I would take them in

Cheapest-now-and-dearest-later first, which is not the same as most important.
**G2, G3 and G6 are done** and have left the list. What remains:

1. **G4**, before the due count ships a second time. Its blocker was G3 and
   G3 is closed, so the count is now the whole of it — and it has already been
   removed once for getting this wrong.
2. **G1's signal half**, which is not a task so much as a constraint on
   whatever reads it. See below.
3. **G7**, whenever the first of its four needs is built rather than before.
   It is cheapest to write alongside a claim that wants it — a harness built
   speculatively gets the assertions someone imagined, and the four above are
   real ones already waiting.
4. **G5**, not yet. Flag it in `IN-FLIGHT.md` when `ExerciseSpec` or `items`
   is next touched, so the person widening them knows what is coming.

**The three that closed did so in three different ways, which is worth more
than the fact that they closed.** G3 was closed by someone building the wider
contract this document asked for. G6 was closed by correcting a document
against the code and then verifying it by the method that document names. G2
was closed by *writing down a departure that had already happened* — no code
changed, and the gap was never about the code. Only the first is what "closing
a gap" usually means.

The one I would not defer is G1's absent-latency constraint, which is not a
task but a thing the scheduler's design has to assume from the start: **the
signal the roadmap leans on is `null` for most users and will stay that way
until calibration works.** A schedule built expecting it, and then fed nulls,
is the uncalibrated-attempt problem from 0018 one level up.
