# ADR 0018 — Uncalibrated is not zero

- **Status:** Accepted
- **Date:** 2026-10-05

Narrows [0014](0014-one-clock-and-the-latency-nobody-can-measure.md) on one
sentence, and applies [0013](0013-knowing-the-answer-narrows-what-judging-has-to-do.md)'s
rule about inconclusive evidence to a second kind of it. 0014 stands otherwise:
one clock, exercise-relative starts, one correction applied once at the capture
boundary, and that correction recorded with the attempt.

## Context

0014 said the input-latency correction is *calibrated, not assumed*, and then:
**"Until calibration exists the correction is zero and that is a known wrong
answer, not a neutral default."**

That sentence was written when calibration was a thing nobody had built, and it
meant *until the feature exists*. The user has now chosen 0014's first horn —
calibration goes in the settings menu — which changes what the sentence denotes.
It now means *until this user has done it*, and that is a permanent state for
every user who opens the settings, sees a technical setup step, and declines.

Zero stops being a temporary placeholder and becomes a claim the app makes about
most of its users' hardware. It is a false one, and 0014 already named what it
costs: a systematic offset corrupts `latencyMs`, the scheduler reads `latencyMs`
as hesitation, so an uncalibrated path drills every user harder and the slowest
hardware worst.

The attempt record has no correction field yet — 0014 decided it should and
nothing has implemented it, because nothing captures audio. So the question is
open rather than entrenched, which is the cheap moment to settle it.

## Decision

**The stored correction is nullable, and `null` is not `0`.** `null` means no
calibration was in force. `0` means a round trip was measured and came back at
zero. They are different facts and a reader that cannot tell them apart will
treat an unmeasured device as a perfect one.

This is the same distinction [0013](0013-knowing-the-answer-narrows-what-judging-has-to-do.md)
drew for a hearing that produced nothing: low confidence means *nothing was
heard*, not *played wrongly*, and recording the first as the second punishes
someone for their room. An uncalibrated correction is a fact about the setup,
not about the playing.

**Calibration is offered, never required.** The app plays before there is a
number. Blocking a musician from their first exercise to run a technical setup
step is a worse first run than slightly-off rhythm scores — but that trade is
only acceptable because of the clause above: the attempts made meanwhile are
*marked*, not silently mis-recorded.

**An uncalibrated attempt is graded, with its timing evidence withheld rather
than guessed.** Pitch is unaffected; rhythm alignment still runs, because a
relative comparison is still informative and the user still wants feedback. What
does not happen is `latencyMs` being recorded as though it meant something.
0013's rule — report only what the response actually tested — covers this
unchanged.

**The number's provenance is stored with it.** A measured round trip and a
user-dragged slider are both legitimate and are not the same evidence. Knowing
which is which is what decides whether the app may offer to measure again, and
whether a later measurement should silently replace an earlier guess.

## Consequences

Because 0014 already requires the correction to travel with the attempt, a
history recorded uncalibrated can be re-judged once a number exists. That is the
whole reason this is affordable: the cost of not calibrating is deferred rather
than permanent.

The scheduler gets a signal it can trust or decline, rather than one it must
trust. A `null` correction is a reason to use correctness without latency, which
is a weaker schedule than the ROADMAP designs and a far better one than a
schedule fed systematic noise.

### What this costs

**Most users will never calibrate, so most timing evidence will be `null`.**
That is the honest consequence and it is uncomfortable: latency-aware scheduling
may simply not function for the majority, and the hesitation signal the ROADMAP
leans on could be a feature that exists for the minority who visited a settings
screen. If that is how it lands, the question is not how to fix the default but
whether to put calibration in the first run after all — which is the horn the
user did not pick, and would want picking again with evidence rather than
reversing quietly.

**A nullable field is a field every reader has to handle.** `coerceAttempt`
throws rather than repairing, so `null` has to be explicitly valid rather than
merely absent, or every uncalibrated attempt becomes an unreadable row. That is
the opposite of the intended behaviour and it is one careless validator away.

**It is schema v3, and the second migration.** The ordering hazard from v1 to v2
applies unchanged: raising the version and teaching the writer are two edits, and
rows written between them are rejected at read. The guard that already exists
for that should cover this before the field lands, not after.

**Provenance may not earn its field.** Two values, used once, to decide whether
to re-offer a measurement. If nothing ever reads it, it is a column carried
forever for a decision nobody makes.

## Revisit when

- **The round-trip measurement exists across real devices.** If the spread turns
  out to be narrow everywhere, a measured median is a better default than `null`
  for an uncalibrated user, and this record's central distinction weakens — it
  would then be a question of how wrong, not whether known.
- **The scheduler is written and finds most corrections `null`.** That is the
  cost above arriving, and the decision is between a first-run calibration step
  and a schedule that does not use latency.
- **A second device-dependent correction appears** — output latency for the
  metronome is the obvious candidate. At that point there are two calibrations
  and the question is whether they are one setup step or two, which is a
  product decision rather than this one.

## Addendum, 4 October 2026 — the first trigger has fired, and blocked the question

The first revisit trigger above reads: "The round-trip measurement exists
across real devices. If the spread turns out to be narrow everywhere, a
measured median is a better default than `null`."

It has fired, on one machine, and it does not answer the question it was
written to answer. Seven runs in a real room on unchanged hardware returned
39, 51, 59, 157, 159, 170 and 171 ms — and each reported its own uncertainty
as between ±1 and ±21 ms.

So the spread across *devices* cannot yet be asked, because the spread across
*runs of one device* is larger than the correction being measured, and the
number the app reports as its confidence does not see it.

**Narrowed the same day:** that device was a directional condenser. On the
same machine's webcam microphone, four successes agreed within 12 ms
(161–173). The question is narrowed rather than blocked, and 0025 carries a
dated correction saying which of its conclusions survive — the mechanism does,
the severity does not.
[0025](0025-agreement-among-trials-that-share-an-error-is-not-confidence.md)
has the evidence and what follows.

**This record's central distinction is strengthened, not weakened.** `null`
was chosen as the honest state for a setup that has not been measured, against
the objection that a measured median might be better. The first real
measurement says this setup cannot presently be measured at all — which is
precisely the state `null` exists to represent, arrived at from the opposite
direction.

The cost named above — "most users will never calibrate, so most timing
evidence will be `null`" — now has a second and worse route to the same place:
most users may calibrate and be refused. The question that follows is no
longer whether to move calibration into the first run, but whether acoustic
round-trip measurement is the right instrument at all.
