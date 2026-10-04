# ADR 0022 — An outcome for evidence that was never shown

- **Status:** Accepted
- **Date:** 2026-10-04

Found by the tester while implementing
[0020](0020-by-ear-the-unit-is-the-sounding-key.md), and past what 0020
decides. It is the same rule as 0020 — [0007](0007-an-attempt-records-per-event-item-attribution.md)'s,
that an outcome is a claim the user was asked — applied to the *other* item
`gradeKey` writes.

## Context

[`gradeKey`](../../src/exercises/key-id/keys.ts) records two outcomes on every
attempt, unconditionally:

```
{ item: `key:${exercise.keyId}`,        correct },
{ item: `signature:${asked.accidentals}`, correct },
```

The second is right when the question was a key signature. It is the item
[0011](0011-what-a-catalogue-owes.md) and 0007 are quoted on, and `keys.ts`
explains it well: the signature "is shared with the relative key — so a user
who learns two sharps from B minor has learned something that helps them in D
major too."

**By ear, no signature is shown.** `generateKey` sets `source: 'passage'` for
the `listen` presentation, `keyQuestionSpec` returns `null` for that source, and
the staff is deliberately empty. The user hears a I–IV–V–I cadence and names a
key. Recording `signature:-6` against that attempt claims they were asked how
many flats were on a stave they were never shown.

For the six enharmonic pairs it is sharper still, and it is the exact inverse
of what 0020 fixed. 0020 collapsed the *key* question because the ear cannot
separate G♭ from F♯. The signature is the thing that separates them — six flats
against six sharps — so by ear it is not merely untested but **unanswerable in
principle**. The one item the hearing cannot support is the one being recorded
with confidence.

The prose has the same fault. The feedback reads "That signature is 6 flats
(B♭ E♭ A♭ D♭ G♭ C♭): G♭ major" after a question that showed no signature.

## Decision

**`gradeKey` records no `signature:` outcome when `source` is `'passage'`.**
One outcome for a by-ear attempt, the key, which is what was asked.

**`exercise.items` is unchanged.** It keeps both entries, because 0007 draws
exactly this distinction: `items` is what the rendering *contained* and
`outcomes` is what the response *tested*. A by-ear exercise does contain a
signature — the key has one, the generator knows it — and the user was not
tested on it. That is 0007's "never shown" against "shown and not tested", and
dropping the item as well would erase the distinction the record exists to
preserve.

**The feedback stops naming a signature the user did not see**, and says what
they did hear instead. A wrong claim in prose is the same wrong claim; it is
simply not stored.

## Consequences

By-ear key attempts stop feeding a signature-reading history that no by-ear
question tested, so a schedule reading `signature:` sees only attempts where a
signature was actually on screen.

Together with 0020, every outcome the by-ear path writes is now something the
listener was genuinely asked, and the exercise's two sources stop
cross-contaminating each other's progress.

### What this costs

**A learner loses credit they may feel they earned.** Someone who hears a
cadence, names G♭ major, and knows perfectly well it has six flats now gets
nothing recorded for the signature. The defence is that knowing it and being
asked it are different, and 0007 is about the second — but the first is real,
and a user who notices will think the app is being stingy rather than careful.

**It is a conditional in a grader that had none.** `gradeKey` was a flat
function of its inputs; it now branches on `source`, and the next presentation
added to this exercise will have to decide which branch it belongs to rather
than inheriting a default. That is the correct cost of the distinction being
real, but it is a cost.

**The `accidentals` source is left as it is, and is arguable.** Reading a key
from written accidentals with no signature does test something signature-like,
so the outcome stays. Someone could reasonably say that the item means *the
printed signature* and should be withheld there too. The line is drawn at
whether notation carrying the accidentals was on screen, which is defensible
and is not the only defensible place.

## Revisit when

- **A third source is added to key identification.** The branch above is a
  two-way choice today and becomes a table then, and the question is whether
  the rule belongs on `KeySource` as a property rather than in `gradeKey` as a
  condition.
- **Any other exercise writes an outcome for an item it did not put in front of
  the user.** This is the second instance in one grader; a third anywhere makes
  it a check worth running over the registry rather than a decision per
  exercise.

## Addendum, 4 October 2026

Found by the tester implementing this record. It is a consequence this record
creates and did not foresee, and it needs a decision that is not this record's
to take.

**The readout renders `exercise.items` directly, so withholding the outcome
makes a permanent empty row.** A by-ear learner now sees a line under "How this
has gone" reading "5 sharps — not recorded yet", and it will say that forever,
because nothing by ear will ever record it.

That is this record working. `items` keeps the signature because the rendering
contained it, the outcome is withheld because the listener was not tested on
it, and "shown and not tested" is precisely the state
[0007](0007-an-attempt-records-per-event-item-attribution.md) keeps two lists
to express. The decision above is unchanged.

**What is wrong is the view.** A progress list is read as "here is how you are
doing", and an item this presentation can never move does not belong in it —
the distinction `items` carries is for a scheduler, which wants to know what
was shown, not for a learner, who wants to know what they can improve. The
readout is shared by every exercise, so this is one decision about what a
progress list is for rather than a patch to key identification.

Left undecided here deliberately: it is a view-level question, the readout
belongs to no record yet, and guessing at it from inside a grading record is
how a shared component acquires an exercise-specific rule.
