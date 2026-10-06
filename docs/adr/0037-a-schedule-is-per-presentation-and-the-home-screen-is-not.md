# ADR 0037 — A schedule is per presentation, and the home screen is not

- **Status:** Accepted
- **Date:** 2026-10-06

Decides what the first caller of `state/schedule.ts` has to settle, before one
is written. Takes [`roadmap-readiness.md`](../roadmap-readiness.md)'s G3 and G4
together, because they are facets of one question and separating them is how a
seam gets designed for a consumer that does not exist.

## Context

The app's stated purpose is a platform for spaced repetition.
[`schedule.ts`](../../src/state/schedule.ts) is written, tested, and reasoned
about across [0007](0007-an-attempt-records-per-event-item-attribution.md),
[0013](0013-knowing-the-answer-narrows-what-judging-has-to-do.md),
[0024](0024-the-progress-view-lists-what-was-tested.md) and
[0032](0032-the-generator-is-a-draw-not-a-search.md). It has **no production
importer at all**:

```bash
grep -rn "state/schedule" src/ | grep -v '\.test\.'   # nothing
```

Every exercise still draws a fresh random seed. The module's own header says
"a record nothing schedules from is a scoreboard", and that has been true of
the scheduler since it was written.

**More is built than this project's own review believed.** `ProgressStatus` is
`'loading' | 'ready' | 'unavailable'` and has been since 4 October;
`PracticeScreen` branches on it; `dueCount`'s comment already names it as the
thing a caller must check. G4's architectural half was done two days before
the review said it was missing. The inventory below is measured rather than
recalled, for that reason.

| Piece | State |
| --- | --- |
| `schedule`, `dueCount`, `dueAt` | built, tested, no caller |
| `ProgressStatus` tri-state | built and used |
| `tallyItems` fold, `tallyKey(item, presentation)` | built and used |
| `items(settings)` denominator | built, no production caller |
| `ExerciseSpec.prefer` | built; honoured by 5 of 7 types |

## The question nobody has asked

`schedule(askable, tallies, presentation, now)` takes a presentation, and
`tallyKey` composes item with presentation because
[0010](0010-presentation-is-part-of-what-an-attempt-means.md) decided reading a
third and hearing one are two skills. **So a schedule is per exercise type and
per presentation**, and there are twelve such pairs: five types offering both,
two offering one.

A due count on the home screen is a single number. There is no single number.

Summing across presentations reproduces, one level up, the failure the sweeps
already found and the roadmap already recorded: a card that *"summed a family"*,
so a learner who narrowed to one interval and answered it twelve times running
watched the count go from five to four, the rest being scale-degree items no
amount of interval practice can clear. Summing *listen* and *read* has exactly
that shape — practice on one never clears the other, and nothing on the card
would say so.

## Decision

**A due figure names its presentation, or it is not shown.** "Twelve to
practise" is not a fact about anything; "eight to hear, four to read" is. Where
a surface cannot carry two numbers it carries the one for the presentation the
learner last used, and says which.

**The first caller computes `askable` from the exercise and may pass a wider
set than the settings allow.** `schedule` takes `askable` as a parameter, so
nothing in the module stops this; what is missing is downstream, and this
record adds it: **`ScheduledItem` gains a way to say *reachable*.** A due item
the settings exclude is then representable — the roadmap's `m7b5` that is due
when triads only are allowed — and the schedule can say so rather than silently
never showing it. Without that field a wider set arrives indistinguishable from
a narrower one, which is why G3 cannot be answered by the caller alone.

**A declined wish is recorded as a declined wish.** Progression and rhythm
answer `aims: 'none'`, so for two of seven types the schedule can order items
it cannot ask for. The caller must not treat "asked and not received" as
"asked": it reconciles against `exercise.items` as 0032 says, and **the fact
that the wish was declined is kept**, because otherwise a due item in those two
types goes unpractised with no evidence anywhere except a tally that does not
move.

**Nothing is shown while `status` is `'loading'`, and `'unavailable'` says so
in words.** Already built, already used; this record fixes it as the contract
the first caller inherits rather than a detail of one screen.

## Consequences

The scheduler acquires a caller whose requirements are written down before it
exists, which is the opposite of how the harmony generator and the cell
catalogue acquired theirs — both reached production with their first query
unexamined, which [0011](0011-what-a-catalogue-owes.md) and
[0027](0027-configure-by-naming-what-an-exercise-contains.md) then had to
measure after the fact.

G4 reduces to a copy and layout problem, its architecture being done. G3
becomes one field.

### What this costs

**Per-presentation counts make the home screen busier at exactly the moment it
should be simplest.** Two numbers per card, or one number plus a qualifier, on
a screen whose job is to get a learner into an exercise. The honest version is
harder to read than the dishonest one, which is the trade the roadmap already
named when it asked for no streaks and no manufactured urgency.

**A `reachable` field is a second thing every caller must handle**, and the
first version of anything handles the common case. A caller that ignores it
behaves exactly as today, silently, which makes it the kind of field that is
added and then not read.

**Recording a declined wish is a new kind of record with no reader yet.**
Nothing consumes it today, and 0032 already notes that a schedule which cannot
steer two exercise types is a real limit on spaced repetition for two of six
kinds of practice. This makes the limit visible without making it smaller.

**None of it addresses latency**, which the roadmap calls the thing that
distinguishes this from a flashcard deck and which
[0018](0018-uncalibrated-is-not-zero.md), [0025](0025-agreement-among-trials-that-share-an-error-is-not-confidence.md)
and [0026](0026-a-measurement-signal-does-not-inherit-a-listening-level.md)
leave `null` for most users. The first caller must work without it, and this
record does not make that less disappointing.

## Revisit when

- **The first caller is written.** Every decision here is about a consumer that
  does not exist, which is the bet [0012](0012-the-judge-consumes-performed-notes-not-audio.md)
  made deliberately and which can go the same way: if the real caller wants
  something else, this record was a guess made early rather than a constraint
  discovered late.
- **A surface wants one number across presentations.** The answer is no, and
  the reason is the family-card failure; but somebody will ask, and they should
  find the reason rather than the refusal.
- **An exercise moves from `aims: 'none'` to anything else.** Two of seven is
  what makes the declined-wish record worth keeping; one of seven might not be.

## Addendum, 6 October 2026 — the inventory is generated now

The table above says it is measured rather than recalled. That was the right
instinct and it is only true on the day it was measured, which is this
record's own sixth-convention problem: a summary needs a mechanism, not a
promise about how it was made.

So the four figures it turns on are generated by
[`tools/report-facts.sh`](../../tools/report-facts.sh), which already exists
for exactly this and did not read anything about the scheduler:

```
scheduler       0 production importer(s)
aiming          5 exact, 0 lossy, 2 none
schedules       12 (type x presentation) pair(s)
exercises       7 built
```

Importers rather than mentions, because the three references to the scheduler
in `PracticeScreen` are comments describing what it wants. The twelve pairs are
counted from the `presentations` arrays, which is what a schedule is keyed on.

The prompt for this was noticing that the error which made the table necessary
— an architecture review reporting a tri-state missing two days after it
shipped — is not prevented by a table that was accurate once. Both halves are
now checkable by running one command.

## Addendum, 6 October 2026 — a streak does not know how many answers it beat

A constraint on the first caller, found while settling where the askable pool
lives. Not a decision this record takes; a thing it would be expensive to meet
for the first time during the wiring.

**`ItemTally` is `{ seen, correct, lastSeenAt, streak }` and `dueAt` spaces on
`streak` alone.** A correct answer out of thirteen alternatives and a correct
answer out of two fold into it identically. So narrowing a pool makes a streak
cheap, the schedule spaces the item out, and it does so on evidence that barely
supports it — which from inside is indistinguishable from an app that has
stopped teaching you.

**It has a floor, and the floor is one.** A pool of one is accepted: the
coercion only falls back to defaults at zero, and the settings panel refuses
only the chip holding a pool open. Measured through the definition itself:

```
POOL            [6]
CHOICES         [6]
FORCED-CORRECT  5 of 5
```

The sole button is the answer. A learner can click it repeatedly, build an
unbounded streak, and be scheduled at `MAX_INTERVAL_MS` on **no information at
all**. That is not a gradual weakening of evidence; it is a state where the
signal is zero and the mechanism cannot tell.

**The information is not lost.** `exercise.choices` now carries what the
learner actually saw, frozen at generation — which is the honest denominator
here, because `Attempt.settings` gives the pool the *generator* was allowed and
those two diverge the moment settings move under a live question. Every attempt
already records enough to say how many alternatives its answer beat; the fold
does not keep it. That is G1's shape again — captured in the log, dropped on
the way to the scheduler — and cheap for the same reason, since nothing needs
backfilling.

**What this record does not do is decide the remedy.** Weighting a streak by
pool size, refusing to schedule below some pool size, and treating a
single-choice question as untested are all answerable, and all of them are
decisions about what a score means — which [0036](0036-one-question-two-windows.md)
left with the user for the same reason. The constraint is only that **a
scheduler reading `streak` alone can be driven to "mastered" by clicking**, and
whoever writes the first caller should know that before they read it.

## Addendum, 6 October 2026 — `attempt.correct` has no consumer and is not dead

Noted after the tester found that `attempt.correct` is validated on write and
read by nothing: the fold reads `outcomes`, the screen reads the fold, `dueAt`
reads the tally. A write-only field cannot be wrong in a way anything notices,
and it is the kind of field a tidy-up removes.

It should not be removed, and [0007](0007-an-attempt-records-per-event-item-attribution.md)'s
reason for keeping it has gone from anticipatory to live. 0007 said `correct`
is "recorded rather than folded, because it is not derivable from the
outcomes: a bar can be failed overall while most of its notes were right."

That is true in exactly one exercise today, and the mechanism is specific.
Rhythm's outcomes are per written cell, and a cell is credited when every
onset in it was placed; the verdict additionally requires nothing **extra**.
An added tap belongs to no written cell, so the outcomes structurally cannot
see it:

```
expected [0, 0.5, 1.0]   played [0, 0.25, 0.5, 1.0]
MATCHED 3   MISSED 0   EXTRA 1   VERDICT false
every written note placed: true
```

So `correct` carries one fact the outcomes cannot: **the learner played
something that was not written.** A first caller that folds only outcomes is
blind to spurious playing, and only in rhythm — which is also the only
exercise answered by performance rather than by choosing, so it is the one
where the event is possible at all.

That does not make the field urgent. It makes it the opposite of dead, and it
means the question for the first caller is not "should this be removed" but
"does the schedule want to know that a learner is adding notes" — which is a
different question and has an answer.
