# ADR 0035 — An onset is an attack; a note is a decision about attacks

- **Status:** Accepted
- **Date:** 2026-10-06

Settles where a hammer's attack cluster is merged, after the recorded tier
[0034](0034-test-data-that-cannot-be-committed-is-fetched-and-its-absence-is-announced.md)
describes found that one constant is being asked to satisfy two requirements
that pull opposite ways. Narrows
[0008](0008-an-onset-is-a-rise-in-the-frames-own-spectrum.md) on what its
output means.

## Context

The recorded tier ran and found what synthesised signals could not. A
Karplus–Strong pluck has one clean attack; a hammer does not. Measured, one
struck piano note per file:

| File | Onsets detected |
| --- | --- |
| A1 | **24** — first five at 0.02, 0.09, 0.20, 0.28, 0.35 s |
| F2 | 7 |
| A3 | 2 (the second at 7.5 s — the damper) |
| A5 | 4 |

A hammer strike spreads energy over roughly a third of a second and the
spectral flux peaks repeatedly, **70 to 110 ms apart**.

**`MIN_SEPARATION_SECONDS` states the conflict in its own comment without
knowing it.** It is 0.05, justified like this:

> at 200 bpm a sixteenth note is 75 ms, which is faster than anybody
> sight-reads, so 50 ms cannot swallow a note the exercise asked for.

That is a correct argument for an *upper* bound of 75 ms, set by rhythm
grading. Merging a piano's attack cluster needs a *lower* bound of about
110 ms, set by the instrument. **There is no value that satisfies both**, and
the 75 ms the comment names as the thing it must not swallow is the middle of
the range it would have to swallow.

So the number is not wrong. One knob is being asked two questions.

## Decision

**`detectOnsets` reports attacks and does not decide how many notes they are.**
That is what it measures — a rise in the frame's own spectrum — and 0008's
argument is unchanged. `MIN_SEPARATION_SECONDS` keeps the job its comment
describes: refusing the double-trigger of a single physical event within one
frame or two, bounded by what rhythm grading can tolerate. It is not widened,
because widening it would cost the rhythm exercise a note it was asked to
hear, to fix a problem rhythm grading does not have.

**Merging an attack cluster into one note belongs in note assembly, which is
the only layer with the evidence to do it.** `analyse` in
[`listen.ts`](../../src/audio/capture/listen.ts) already maps each onset to a
`HeardNote` and already computes a pitch over each one. A struck A1's
twenty-four flux peaks share a fundamental; a genuine sixteenth run does not.
**Time alone cannot separate those two cases, which is precisely why one
time-based constant cannot serve both** — and pitch continuity can, at a layer
that is already holding the pitch.

**This sharpens what the seam carries.**
[0012](0012-the-judge-consumes-performed-notes-not-audio.md) decided the judge
consumes performed notes rather than audio. The corollary this record adds is
that **a performed note is a conclusion, not a measurement**: the audio chain
assembles it from an onset and the pitch estimates that follow, and deciding
that four flux peaks are one note is part of assembling it rather than part of
detecting anything.

**The defect stays red until it is fixed.** It is recorded as `it.fails` with
the measurements, so it goes red the day it starts passing — which is what a
fixed defect should do, and is better than a softened constant that makes the
symptom disappear from one test and appear in the rhythm exercise.

## Consequences

The rhythm exercise keeps a tolerance it was tuned for, and the piano problem
is fixed where a piano can be told from a fast passage. Two requirements get
two mechanisms.

0008's output acquires a stated meaning it was relying on implicitly: an onset
is evidence of an attack, and the count of onsets is not a count of notes.
Anything reading `onsets.length` as a number of notes is wrong, and that is now
a sentence rather than an assumption.

### What this costs

**Note assembly becomes the hard part, and nothing has designed it.** Merging
by pitch continuity needs a rule — how close in cents, over how long, through
how much clarity — and every one of those is a constant with the same problem
as the one this record declined to widen. It moves the difficulty to a layer
where the evidence is better; it does not make it small.

**A merge rule can swallow a real repeated note.** The same pitch struck twice
quickly is exactly what the cluster looks like, and a trill or a repeated note
in a sight-reading line is music a learner will actually play. Whatever rule
lands has to tell a hammer's decay from a second strike, which is a harder
discrimination than the one being avoided.

**`it.fails` is a defect with a date and no owner.** It keeps the measurements
and it does not schedule the work, so the piano case stays broken for as long
as nobody picks it up — visibly, which is the point, but broken.

**One instrument, four files.** The 70–110 ms figure is one library's piano.
A guitar, a struck string and a wind attack are different envelopes, and a
rule tuned on this corpus is tuned on a sample of one instrument — the
measured-through caution in the index's fifth convention, applied to the
evidence this record rests on.

## Revisit when

- **Note assembly is written.** The merge rule is the decision this record
  defers, and the repeated-note case above is the thing to design against
  first rather than discover.
- **A second instrument is recorded.** The cluster spacing is measured on one
  piano library; a plucked or bowed corpus is what says whether 70–110 ms is a
  property of hammers or of this sample set.
- **Anything reads `onsets.length` as a note count.** That is the assumption
  this record exists to forbid, and it is the kind that reappears in a new
  caller rather than being reintroduced where it was removed.
