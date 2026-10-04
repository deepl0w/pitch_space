# ADR 0013 — Knowing the answer narrows what judging has to do

- **Status:** Accepted
- **Date:** 2026-10-04

Narrows [0007](0007-an-attempt-records-per-event-item-attribution.md) and
[0009](0009-align-a-performance-by-dynamic-programming.md) on one point each,
and answers a question 0007 explicitly left open. Both records stand otherwise.
Follows from the framing established in
[0012](0012-the-judge-consumes-performed-notes-not-audio.md): the app generated
the exercise, so it holds the symbolic answer before the user plays a note.

## Context

Two earlier records each carry a pessimistic note about polyphony, and both
were written from the same unexamined assumption — that judging has to work out
what was played.

0009, on rhythm alignment: *"A strummed chord is several attacks within a few
milliseconds and will be reported as one match and several spare notes. Nothing
here knows that."* Its revisit list goes further, saying polyphony would break
"the one-to-one assumption that the whole method rests on".

0007, on attribution: *"A chord played wrong on a real instrument may be
judgeable only as a whole."* It leaves the consequence open — whether such an
exercise should report no outcomes, or one outcome per item at reduced
confidence.

Both are reasonable if the judge is transcribing. Naming an unknown chord from
audio is genuinely hard, and a whole-chord verdict is the honest output of a
process that cannot localise.

But the judge is not transcribing. It is checking a hypothesis it already
holds, which is what the field calls score following. That changes what the
hard part is, and it changes it in the direction of less work rather than more.

## Decision

**Judging asks only questions it already knows the answer to.** Three
consequences, each narrowing something previously assumed harder.

**A chord localises.** For each pitch class the exercise expects, ask whether it
is present. That is a per-item question with a per-item answer, so a chord
yields one outcome per chord tone rather than a single verdict on the whole.
0007's "judgeable only as a whole" describes transcription, not verification,
and the exercise it was waiting for may never arrive.

**Polyphony does not break the alignment method.** 0009's one-to-one assumption
is a property of its *input*, not of dynamic programming. The caller knows that
expected event three is a four-note chord, so it can say so — by collapsing
attacks within the chord's own window before aligning, or by carrying expected
multiplicity alongside expected times. Either keeps the table one-to-one over
events. The detector's 50 ms separation rule stops being the only thing between
a chord and a wall of insertions, because the caller was never required to
pretend it did not know.

**An inconclusive hearing produces no outcome at all.** This settles the
question 0007 left open: not one outcome per item at reduced confidence, and
certainly not a wrong one. It follows from 0007's own principle — `outcomes`
carries only what the response actually *tested* — because a note that was not
heard was not tested. The distinction is the whole point: low confidence means
*nothing was heard*, which is a fact about the room, the microphone or the
instrument's decay. Recording it as a failure would teach the schedule that the
user cannot play something they may well have played, and would do it
systematically to whoever has the worst room. A silent exercise must be able to
produce an empty outcome list and have that mean "no evidence" rather than
"all wrong".

## Consequences

Chord exercises do not require polyphonic transcription, which removes what
looked like the largest unbuilt problem in the app. Deciding whether a known
set of pitch classes is present is a weaker question than asking what was
played, and it is answerable from the chroma the DSP layer already computes.

The two pessimistic notes in 0007 and 0009 should not drive design any more. In
particular nobody needs to build a whole-chord verdict path, and nobody needs a
confidence field on `ItemOutcome` to express a half-heard chord tone — the
absence of an outcome expresses it.

It also tells the capture layer what to optimise. Recall matters more than
precision: a spurious detected pitch class can be checked against the expected
set and discarded, whereas a missed one costs an outcome. That is the opposite
of the trade a transcriber would make.

### What this costs

**None of this is measured, and that is the real weakness of this record.** The
claim that pitch-class presence can be tested reliably enough to grade on is
reasoning plus the observed practice of other apps, not a number from this
codebase. The experiment that would settle it is specific and worth naming: take
recorded chords on a real instrument, strummed and blocked, with the
corresponding expected pitch-class sets, and measure per-pitch-class recall at
the chroma threshold the detector would use. If recall on inner voices of a
strummed guitar chord is poor, "a chord localises" is still true in principle
and useless in practice, and the fallback is the whole-chord verdict 0007
imagined. **Until that is measured this record is a direction, not a result.**

**"No outcome" is indistinguishable from "not attempted".** An exercise the user
abandoned and one where nothing was heard both produce an empty outcome list.
The schedule should treat them the same — neither is evidence — but any future
analytics that wants to count abandonment will need a signal this record does
not provide.

**It makes the grader depend on the expected answer in a new way.** A grader
that asks only about expected pitch classes cannot report what the user played
*instead*, which is exactly the feedback a learner wants: "you played a minor
third, not a major one". That requires looking beyond the hypothesis, and the
cheap version — checking the few near-miss pitch classes as well as the expected
ones — should be designed in rather than retrofitted.

## Correction, 4 October 2026

**This record twice says a chord's pitch-class presence is answerable from "the
chroma the DSP layer already computes". There is no chroma in the DSP layer.**
`src/audio/dsp/` exports FFT utilities, an onset detector, a YIN pitch detector
and the rhythm alignment, and the string "chroma" does not appear anywhere
under `src/audio/`. `CLAUDE.md` and [0001](0001-a-pure-core.md) both list chroma
among the layer's contents, which is where the belief came from; both were
describing what the layer is *for*, and this record read them as describing what
it holds.

Added rather than edited, because the decision above does not depend on it: a
chord still localises to per-tone questions, polyphony still does not break
0009's method, and an inconclusive hearing still produces no outcome. What
changes is the schedule. The measurement this record calls for cannot be run
today — there is nothing to measure — so the order is: build a chroma feature,
then measure per-pitch-class recall, then build the chord exercise on whichever
answer comes back. Treating "a chord localises" as settled before that sequence
runs is exactly the mistake this correction exists to prevent.

The error is the same one [0005](0005-seeds-are-minted-outside-the-core.md)
caught on [0002](0002-generation-is-reproducible-from-its-seed.md): a claim
about this codebase asserted from reading the prose around it rather than from
reading the code. It is worth noticing that it happened again, in a record whose
author had just written that it should not.

## Revisit when

- **The chord recall measurement exists.** It is the gate on this whole record.
  If it fails for strummed polyphony specifically, consider whether chord
  exercises are MIDI-only on the audio path's worst case, which 0012 already
  allows an exercise to declare.
- **A grader first wants to say what was played instead of what was asked.**
  That is the near-miss case above, and it is the point at which "ask only
  questions you know the answer to" stops being sufficient on its own.
- **An exercise produces an empty outcome list often enough to notice.** That is
  the signal that capture is failing rather than that users are wrong, and
  nothing currently distinguishes the two.
