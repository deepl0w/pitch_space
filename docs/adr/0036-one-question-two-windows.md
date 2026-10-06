# ADR 0036 — One question, two windows

- **Status:** Accepted
- **Date:** 2026-10-06

Relates the two windows in the grading chain, which have never been compared.
The inverse of [0035](0035-an-onset-is-an-attack-a-note-is-a-decision-about-attacks.md):
there one knob served two jobs, here one question has two knobs.

## Context

"Is this the same note?" is asked twice, at two stages, by two numbers derived
in unrelated ways and living in different files:

| | Derived from | At 160 bpm |
| --- | --- | --- |
| `separationForOnsets` | the shortest gap the exercise writes, ÷ 3 | **15.6 ms** |
| `toleranceFor` | the tempo alone, `min(0.1, 0.25 × beat)` | **93.8 ms** |

Six to one, and nothing relates them. One asks whether two attacks are one
note; the other asks whether an attack is the note that was written. They are
the same question about the same pair of notes at two points in one chain.

**The wider one is exactly twice the shortest gap the generator writes.**
Measured: the tightest interval in the cell library is `s_tt` at 46.9 ms at
160 bpm, and `toleranceFor(60/160)` is 93.75 ms. The ratio is 2.00.

So a note can be matched to its neighbour's written position. Playing one note
onto the next one's time, with everything else correct:

```
matched 4   missed []   extra []   errors [0, 46.9, 0, 0] ms
```

**Nothing reports that two notes sounded at one instant.** The alignment stays
one-to-one, nothing is missed, nothing is extra, and the displaced note scores
0.5 rather than failing. The learner is told their timing was half right on
one note, where what happened is that they played it in the wrong place.

A uniformly displaced performance *is* caught, because the boundaries have
nowhere to go — a whole passage shifted by one gap reports one missed and one
extra at the ends while the interior matches with **zero** error. That is a
narrower escape than it looks: the evidence is two notes however long the
passage, so it thins as the music lengthens.

**`TOLERANCE_BEATS`' own comment predicts this and names the repair.** It says
the window "is sized for eighths, and at a tempo fast enough to be reading
sixteenths it is as wide as a whole sixteenth", that "the grading would stop
meaning anything", and that the fix is "a separate window keyed to the shortest
value the exercise actually contains … and it wants the exercise to say what
that value is."

It is right and it understates by a factor of two. At 160 bpm the tolerance is
one sixteenth exactly, which is what the comment claims — but the generator
writes thirty-seconds, so it is **two** of the shortest value actually
present. And the quantity the comment said was missing now exists:
`separationForOnsets` computes it.

## Decision

**Both windows derive from the shortest value the exercise contains.** One
question gets one source of truth. The exercise knows what it wrote; neither
window should be inferring it from the tempo.

**The constraint any remedy must satisfy: the tolerance is narrower than the
shortest gap the exercise writes.** Wider than that and a note can be matched
to a position it was not played in, which keeps the alignment one-to-one while
emptying it of meaning — the comment's own prediction, now measured. This is
falsifiable and it is not a matter of taste, so it belongs in a record even
though the number does not.

**What the number is, and what a score should mean, is the user's and not
this record's.** Narrowing the window makes grading stricter, and a learner
who was passing yesterday fails today on the same playing. That is a decision
about the standard rather than a correctness fix, and it has gone to them.
This record fixes the *relation* between the two windows and deliberately
leaves the value open.

## Consequences

The grading chain stops being able to disagree with itself about what a note
is. A rule the detector enforces at 15.6 ms cannot be undone by an aligner
accepting 93.8 ms two stages later.

0035's conclusion generalises: both records are the same fault seen from
opposite sides, which is a sign the chain's windows want deriving together
rather than each being tuned where it sits.

### What this costs

**It makes the app stricter without telling anyone.** A learner's score on
unchanged playing will fall, and nothing in the app says the standard moved.
Shipping a stricter grader silently is its own kind of dishonesty, and the
remedy is product work this record does not do.

**Two performances of the same written rhythm at different tempi get different
windows**, which is correct and is hard to explain. "Why did the same playing
score worse at a slower tempo" has a good answer and not a short one.

**It couples both windows to an underived constant.** `separationForOnsets`
divides the shortest gap by three, and its own comment says the derivation is
"not settled" and that nothing has yet shown it fixes the defect it was
written for. Keying tolerance to the same quantity makes that unverified ÷3
load-bearing twice over.

**The escape it closes is the narrow one.** Interior displacement is caught by
this; the uniformly-shifted performance was already caught, barely, by its
edges. A learner who is consistently and entirely late is the case neither
window addresses, and that is the more likely human error.

## Revisit when

- **The user rules on what the score should mean.** That is the gate on the
  number, and this record's constraint is what any answer has to satisfy.
- **`separationForOnsets`' ÷3 is derived or measured.** It becomes
  load-bearing for grading as well as detection the moment this lands.
- **An exercise supplies notes it did not generate** — an imported score,
  which [`roadmap-readiness.md`](../roadmap-readiness.md) names as the thing
  that breaks `generate(spec)`. "The shortest value the exercise contains" is
  a different question when the exercise did not write it.
