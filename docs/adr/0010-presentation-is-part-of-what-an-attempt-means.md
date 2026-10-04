# ADR 0010 — Presentation is part of what an attempt means

- **Status:** Accepted
- **Date:** 2026-10-04

Extends [0007](0007-an-attempt-records-per-event-item-attribution.md), which
made an attempt report per-item outcomes so credit and blame could localise.
This record says what else has to be true of an outcome before two of them can
be compared.

## Context

Every exercise here can be asked two ways. `read` puts the question on the staff
and sounds nothing; `listen` sounds it and leaves the staff empty until the
answer is given. [`Presentation`](../../src/exercises/types.ts) names the two,
and a definition declares which it supports — a key signature has nothing to
hear, and sight reading is reading by definition.

These are different skills. Naming a minor third off the staff and naming one by
ear share a name and almost nothing else, and a learner can be fluent at one
while hopeless at the other. That is not a subtlety; it is the ordinary
condition of someone who learned from sheet music, or of someone who learned by
ear and never read.

The machinery is already careful about it. `presentation` is carried on the
generated exercise rather than read from settings at render time, so changing
the setting mid-question cannot change the question. The screen freezes the
settings it generated from in its `Round` and records *those* with the attempt,
not the live ones — so what the user was actually asked is recoverable from
history rather than inferred from whatever the store holds now.

What is missing is the other end. The schedule this is all feeding — designed in
[`docs/ROADMAP.md`](../ROADMAP.md) — tracks progress per `ItemId`, and an
`ItemId` has no presentation component: `interval:m3:up` is the same string
whether it was read or heard.

## Decision

**An outcome is identified by the item *and* the presentation it was tested
through. The two together are the key; neither alone is.**

Concretely, progress is aggregated by `(ItemId, Presentation)` rather than by
`ItemId`. A user who has answered `interval:m3:up` correctly nine times by
sight and never by ear has not learned `interval:m3:up`; they have learned half
of it, and a schedule that cannot see the half will stop showing them the part
they cannot do.

**The presentation stays out of the `ItemId` itself.** Folding it in —
`interval:m3:up@listen` — would work and is tempting because it needs no new
plumbing. It is rejected because item ids are a compatibility commitment from
the first release: they key the user's history, and renaming one silently
orphans everything learned about it. An id that encodes two orthogonal things is
an id that cannot be changed along one axis without breaking the other. The pair
is explicit; the compound string hides the join.

`ItemId` therefore keeps meaning "the thing being practised", and presentation
remains "the sense it was practised through", with the aggregation key being
both.

## Consequences

The data needed for this is already recorded. No migration of existing history
is required, and nothing has to be backfilled — which is the reason to decide it
now rather than when the scheduler is written. An identifier decision taken
before there is history to migrate costs nothing; the same decision taken after
costs either the history or a migration.

It also makes a real feature possible later at no extra cost: showing a user that
they read intervals well and hear them badly is a genuinely useful thing to tell
someone, and it falls out of the key rather than needing to be built.

### What this costs

**The code does not do this yet, and today's behaviour contradicts the
contract.** [`tallyItems`](../../src/state/progressStore.ts) keys its map by
`outcome.item` alone, so read and listen attempts at the same item are summed
into one tally. The per-item counts the practice screen shows — "7 of 9 right"
— blend both senses today. Meanwhile
[`types.ts`](../../src/exercises/types.ts) already states that "progress is
tracked against the item *and* the sense it was tested through". That sentence
describes this record's decision, not the current code. One of the two had to
move, and this is the one that should: the sentence is right.

**Presentation is recorded inside an opaque blob.** The attempt stores
`settings: unknown`, and `presentation` is reachable only because
[`BaseSettings`](../../src/exercises/types.ts) guarantees every exercise's
settings carry it. `coerceAttempt` deliberately throws rather than repairing,
but it validates the fields it names and passes `settings` through untouched, so
nothing checks that the presentation is actually there. Keying the schedule on a
field that no reader validates is the fragile part of this decision, and the
honest fix is to promote `presentation` to a named field on the attempt rather
than leaving it to be dug out.

**It doubles the item space the schedule tracks**, for exercises that support
both senses. That is the intended meaning rather than an accident — there really
are twice as many things to learn — but it halves the evidence behind each one,
and a schedule tuned on blended counts will behave differently once they are
split.

## Revisit when

- **The scheduler is built.** This record says what the key is; it does not say
  how a review of one presentation should affect the interval for the other.
  They are not independent — hearing a third surely teaches you something about
  reading one — and the first version will probably treat them as if they were.
  Decide deliberately at that point whether a correct `listen` answer shortens
  the `read` interval at all.
- **An exercise appears whose two presentations are not the same item.** The
  menu already describes note identification as having absolute and relative
  modes, which are modes *within* the item rather than senses it is tested
  through. If a third axis like that arrives, check that it is genuinely a
  dimension of the attempt and not a different item, before adding it to the
  key by analogy with this one.
