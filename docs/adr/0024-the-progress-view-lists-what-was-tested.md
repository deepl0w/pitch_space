# ADR 0024 — The progress view lists what was tested, not what was shown

- **Status:** Accepted
- **Date:** 2026-10-04

Settles the question [0022](0022-an-outcome-for-evidence-that-was-never-shown.md)
created and declined to answer. It takes
[0007](0007-an-attempt-records-per-event-item-attribution.md)'s two lists and
says which of them a *reader* is owed, which is the one thing that chain of
records has never said.

## Context

0022 stopped `gradeKey` recording a `signature:` outcome for a heard attempt,
and kept the item in `exercise.items`, because contained-and-not-tested is the
state 0007 holds two lists to express. Correct, and it produced a row.

The readout in [`PracticeScreen`](../../src/ui/screens/PracticeScreen.tsx) maps
over `exercise.items`. So a by-ear learner now reads, under "How this has
gone":

```
5 sharps — not recorded yet
```

and it will say that after every by-ear attempt they ever make, because nothing
by ear will ever record it.

**The readout's own comment already names the right rule and the code does
something else.** It says the list is "a list of what was practised" — and
`exercise.items` is a list of what was *shown*. The comment was written to
justify de-duplicating repeated chords and is correct about the principle it
invokes; nothing enforced it, which is the convention about comments stating
constraints arriving on the same day it was written down.

### "Not recorded yet" is doing three jobs

This is the part that makes the fix worth a record rather than a patch. The
string appears whenever `tally` has no entry, and that happens for three
unrelated reasons:

1. **Never tested** — a genuinely new item. The learner should see it.
2. **Not testable in this presentation** — 0022's signature. Permanent, and
   says nothing about the learner.
3. **Tested but no evidence this time** — [0013](0013-knowing-the-answer-narrows-what-judging-has-to-do.md)'s
   inconclusive hearing, where a note was played and not heard. Transient, and
   says something about the room.

One phrase, three meanings, and the second is indistinguishable from the first
to anyone reading it. A learner seeing "5 sharps — not recorded yet" forever
will reasonably conclude they are failing to practise something.

## Decision

**The progress view lists the items the attempt's outcomes cover.** Not
`exercise.items`. The de-duplication stays, for the reason its comment gives —
a progression names the same chord twice and the second card says nothing.

This is 0007's split read the way it was always meant: **`items` is for the
scheduler and `outcomes` is for the learner.** The scheduler needs to know what
was shown and not tested, because never-shown and shown-but-untested want
different responses from it. A learner needs to know how they did at what they
were asked. Neither list is wrong; they have different readers and the view was
reading the scheduler's one.

**"Not recorded yet" then means exactly one thing** — an item tested now for
the first time, with no prior history. Cause 2 disappears from the view
entirely, which is right, because it was never a fact about the learner.

**Cause 3 is not solved here and must not be silently swallowed.** A note
played and not heard is worth telling someone about, and the place for it is
the attempt's `feedback`, which already exists and is already prose about this
attempt. 0013 decided such a note produces no outcome; this record decides the
progress tally is not where its absence gets reported. Whoever builds the first
exercise that can produce an inconclusive hearing owes the user that sentence.

**The rule generalises past key identification**, which is why it is here
rather than in the screen. Any exercise whose items depend on presentation will
produce items that cannot fill under one of them. The rule is about what a
progress list means, and it holds before the next such exercise is written.

## Consequences

The by-ear row disappears without `gradeKey`, `exercise.items`, the attempt
schema or the scheduler's input changing at all. 0022 stands exactly as
written, which is the test of whether this is the right layer: the contract was
already correct and only its reader was wrong.

A `Result` now has a second consumer with a stated purpose. `outcomes` was a
record for the schedule that the view happened not to use; it becomes the thing
the view is built on, which makes 0007's distinction load-bearing in two
directions rather than one.

### What this costs

**An item shown and not tested becomes invisible to the learner.** That is the
intent, and it has a victim: someone who wants to know what the exercise
contained — which chords were in that progression, say, including the ones the
grader did not ask about — can no longer see it here. The defence is that this
panel is headed "How this has gone" and that is a different question, but
"what was in that?" is a reasonable thing to want and this record removes the
only place it was answered.

**It depends on `outcomes` being populated, and an empty list now empties the
panel.** An exercise that graded as a whole rather than per item would show a
verdict and no rows, where today it shows rows with no counts. That is more
honest and it is also a blank space where there was content, which looks like a
bug to anyone who has not read this.

**Three meanings become two, not one.** Causes 1 and 3 still share the phrase
until somebody writes the feedback sentence this record asks for and does not
specify. The conflation that remains is the subtler of the two and it will be
easy to forget, because the loud instance — the permanent row — will be gone.

## Revisit when

- **The first exercise that can produce an inconclusive hearing ships.** That
  is cause 3 arriving for real, and the feedback sentence above stops being a
  note in a record and becomes a thing someone has to write.
- **Anyone asks to see what an exercise contained.** The cost above landing. The
  answer is probably a second, differently-headed view rather than putting
  `items` back in this one, but it should be decided then rather than assumed
  now.
- **A scheduler is built and wants the view to mirror it.** The two lists have
  different readers by this record; a request to make the learner's view match
  the scheduler's input is a request to undo it, and should be argued rather
  than merged.
