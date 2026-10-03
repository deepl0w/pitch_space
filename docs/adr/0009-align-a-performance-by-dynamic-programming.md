# ADR 0009 — Align a performance by dynamic programming, not by nearest neighbour

- **Status:** Accepted
- **Date:** 2026-10-04

Sits under [0001](0001-a-pure-core.md), which is what makes this a decision
with evidence behind it rather than an opinion: the aligner is a pure function
over two arrays of numbers, so every claim below was checked by running it.
Takes its input from the detector [0008](0008-an-onset-is-a-rise-in-the-frames-own-spectrum.md)
describes.

## Context

Judging a rhythm means deciding which attack the player made answers which
note the exercise wrote. Everything a practice app wants to say afterwards —
you missed this one, you added that one, you are forty milliseconds behind the
click — is a statement about that correspondence, so the correspondence is the
whole problem and the arithmetic afterwards is bookkeeping.

The obvious implementation walks the written notes and takes the nearest
attack to each. It is wrong, and it is wrong in the one direction a practice
app must never err in: **it flatters the player.** Nothing in it stops a single
attack being the nearest to two written notes, so a performance that played
four notes where eight were written comes back as eight notes all present and
slightly off. The error it hides is the error the exercise exists to catch.

Turning the loop round — walk the attacks, take the nearest written note —
hides the mirror image of the same error, reporting spurious extra notes as
though they were the written ones. Consuming each match greedily so that
nothing can be used twice does stop the double-counting, but only by making
the answer depend on the order the loop happened to run in: whichever note is
visited first takes the attack it wants, and a later note that needed it more
goes without.

There is a second requirement that nearest neighbour does not even address.
Music is a sequence. An attack cannot answer the fourth written note if the
attack after it answers the second, and a method with no notion of order will
cheerfully produce exactly that on a performance that is merely late.

What is wanted is the single best **one-to-one, order-preserving**
correspondence between two ascending lists — which is the sequence-alignment
problem, and has an exact answer rather than a heuristic one.

## Decision

Align with a Needleman–Wunsch table over the two lists, in
[`rhythmAlign.ts`](../../src/audio/dsp/rhythmAlign.ts). Every written note is
matched, missed, or displaced by an attack that was inserted; the cheapest such
alignment is found in O(n·m), which for a bar of music is nothing, and the
traceback is the report.

Three numbers define the cost model.

**The window** is `min(100 ms, 0.25 × beat)`. A quarter of a beat is exactly
half the gap between adjacent eighth notes, and so the widest window that
cannot put one attack in range of two of them. The ceiling is there because
human timing perception does not get looser just because the music is slow: at
40 bpm a quarter beat is 375 ms and nobody hears a note 375 ms late as on time.
100 ms is also four hops of the onset detector and comfortably more than the
20 ms or so the detector places an attack to, so the window is a statement
about playing rather than about measurement error.

**The score inside the window is graded**, 1 dead on falling to 0 at the edge,
rather than pass/fail. The edge of the window is not a musical event: a note
99 ms late and a note 101 ms late were played the same way, and a score that
jumps between them is telling the player about the threshold rather than about
their playing. The shape of the fall is linear because nothing measures which
shape is right, and the tests assert that it is continuous and monotone rather
than pinning its value anywhere — a curve nobody can measure is a tuning
decision, and the project's convention rules out pinning those.

**An unmatched note costs 0.75**, against a scale on which a perfect note costs
nothing and one at or beyond the edge of the window costs 1. This is the only
number here that encodes a judgement, and it is worth being exact about which
one. When an attack is too far from a written note to score, the alignment has
two ways to describe it: call it that note played badly, costing 1, or call the
note missed and the attack spare, costing twice the gap. Any value strictly
between 0.5 and 1 produces the behaviour wanted — a *lone* wild attack stays
the note it was nearest to, with its error, because "one note, badly late" is a
smaller claim than "a note missing and a different note added"; but as soon as
two consecutive notes would need the same excuse, one dropped note explains
both at once and the alignment says so and re-aligns the rest. **The interval
is the decision and 0.75 is merely its middle.** Swept against the suite, 0.5
up to but not including 1 is green, and both ends are pinned by tests rather
than described here and forgotten.

The aligner returns no overall score. Weighting a missed note against a spare
attack is a grading policy, it will differ between a sight-reading exercise and
a rhythm drill, and it belongs with the exercise rather than in `audio/dsp/`.
What is returned is the per-note error, a per-note score, the two lists of
indices, and the mean *signed* error — which separates lag from scatter, since
a player consistently 40 ms behind the click and a player who is merely untidy
want different advice and look identical under an absolute mean.

## Consequences

The failure that motivated this cannot happen: playing only the downbeats of a
bar of eighths reports four matches and four missed notes, and no attack index
appears twice in the report. Three invariants are asserted over 300 seeded
performances rather than over the handful of cases anyone thinks to write by
hand — every written note accounted for exactly once, every attack accounted
for exactly once, and the matches monotone in both lists.

The report distinguishes faults that a simpler method conflates. A dropped note
is one deletion and an exactly-aligned tail, not a phrase of smeared notes. A
consistent lag is eight equal errors. Drift is eight growing ones, with nothing
missed and nothing spare, because the player is late rather than playing
different notes.

The decision is protected by tests rather than by this record. Replacing the
table with nearest neighbour turns nine tests red; moving the gap cost past
either end of its interval turns one red at each end; unclamping the score,
making it pass/fail, unsigning the error, dropping either reversal in the
traceback, removing the tolerance ceiling, removing the tempo scaling, dropping
the ascending-order check and ignoring the tolerance override are each red.
Those were run, not assumed.

### What this costs

**The window is sized for eighths.** At a tempo fast enough to be reading
sixteenths, a quarter of a beat is as wide as a whole sixteenth. The alignment
is still one-to-one so nothing is double-counted, but a sixteenth played a
whole subdivision late still scores something. The repair is a window keyed to
the shortest value the exercise actually contains, and it needs the exercise to
say what that value is — so it belongs with the rhythm exercise rather than
here.

**There is no tempo following.** A performance played perfectly at the wrong
tempo is reported as a performance that drifts, because that is what it looks
like against a fixed grid. That is arguably the right answer for a practice app
with a metronome running, but it is a choice, and anything wanting to praise an
expressive rubato would need the grid to be warped rather than fixed, which is
a different algorithm and a replacement of this record rather than an extension
of it.

**Order-preserving means two notes played in the wrong order cannot be
reported as swapped**, only as one of them missed and the other spare. For
rhythm that is correct — a rhythm has no notes to swap — but it is a real limit
if this is ever reused for pitch sequences.

**Ties are broken arbitrarily.** Where two alignments cost the same, the table
prefers a match, then a deletion, then an insertion. They are ties by the stated
measure, so any of the three is as good an answer, and the only promise is that
the same two lists always give the same one. A mutation that changes the
preference order passes the whole suite, deliberately.

**One attack per event.** A strummed chord is several attacks within a few
milliseconds and will be reported as one match and several spare notes. Nothing
here knows that, and the onset detector's 50 ms separation rule is the only
thing standing between a chord and a wall of insertions.

## Revisit when

- **The rhythm exercise lands.** It is the first caller, it is what makes the
  eighth-sized window matter, and it is where the grading policy this record
  deliberately omits will have to be decided.
- **Anyone wants credit for a performance at its own tempo** rather than
  against the written grid. That is tempo warping, not alignment, and it
  supersedes this.
- **Polyphony arrives** — a chord, a rolled chord, two hands. Several attacks
  standing for one written event breaks the one-to-one assumption that the
  whole method rests on.
- **The gap cost is ever moved outside 0.5 to 1.** Two tests will say so. The
  interval, not the value, is what this record decided, and leaving it is a
  decision about what the report should say rather than a tuning tweak.
