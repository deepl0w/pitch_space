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
