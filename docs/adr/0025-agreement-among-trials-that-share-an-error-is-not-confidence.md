# ADR 0025 — Agreement among trials that share an error is not confidence

- **Status:** Accepted
- **Date:** 2026-10-04

The measurement [0018](0018-uncalibrated-is-not-zero.md) asked for exists. It
does not answer 0018's question; it invalidates the instrument that was going
to answer it. This narrows [0014](0014-one-clock-and-the-latency-nobody-can-measure.md)
on its central argument and makes [0019](0019-the-click-gap-stays-the-callers-and-the-margin-stops-being-a-comment.md)'s
warning a measured fact rather than a reasoned one.

## Context

The user role ran calibration in a real room: real Chrome, a USB microphone as
default input, analog speakers as default output. Evidence in
[`docs/findings/2026-10-04.md`](../findings/2026-10-04.md).

**At a volume anyone would listen at, it never finishes.** Not an error — the
screen sits on "Listening…". The acoustic path was verified independently: a
2-second full-scale tone moved the microphone's RMS from a baseline of about 5
to about 177 through the same sink and source. The room and the hardware are
fine. Six 80 ms clicks at ordinary volume are not enough for this detector to
resolve, which is a choice in
[`measureLatency.ts`](../../src/audio/capture/measureLatency.ts) and not a fact
about rooms.

**Raised to 150%, roughly +10 dB, it finishes — and then this happens.** Seven
runs, unchanged hardware, same room, minutes apart:

| Run | Reported | Its own ± | Heard |
| --- | --- | --- | --- |
| 1 | 51 ms | ±19 | 6/6 |
| 2 | 170 ms | ±2 | 6/6 |
| 3 | 39 ms | ±13 | 6/6 |
| 4 | 59 ms | ±21 | 5/6 |
| 5 | 171 ms | ±1 | 6/6 |
| 6 | 157 ms | ±1 | 6/6 |
| 7 | 159 ms | ±8 | 6/6 |

The number ranges over four times its own smallest value on hardware that did
not change. **Every run reports a confident, narrow error bar, and two of them
claim ±1 ms.**

### The two spreads are different quantities and we report the wrong one

`spreadSeconds` is half the interquartile range of the six deltas *within one
run*. The error that matters is how far the answer moves *between* runs. These
measure different things, and nothing in the estimator can see the second.

The reason is structural rather than a tuning problem. **Every failure mode
that actually occurs here shifts all six trials by the same amount**, and an
IQR over six equally-shifted numbers is unchanged. A systematic error is
exactly the kind of error a dispersion statistic cannot report.

[0019](0019-the-click-gap-stays-the-callers-and-the-margin-stops-being-a-comment.md)
reached this by argument, for a different cause: "the spread check cannot catch
the failure, because mis-attributed deltas agree with each other… `MAX_SPREAD_SECONDS`
is looking for disagreement, and a cascade produces consensus." This is the
second instance and the first one measured. The shape is general and it is the
finding: **agreement among trials that share an error is not evidence that the
error is absent.**

### What the clustering suggests, offered as a hypothesis and not a result

The results are bimodal rather than scattered — three around 39–59 ms (mean 50)
and four around 157–171 ms (mean 164), a gap of about 115 ms. A reflection does
not explain it: 115 ms of extra path is about 39 metres of air.

A quantised offset does. `measureLatency.ts` takes `startedAt = context.currentTime`
*before* connecting the recorder, and treats it as the recording's first sample.
The first `onaudioprocess` does not necessarily fire at that instant, and the
processor's buffer is 4096 frames — **92.9 ms at 44.1 kHz, 85.3 ms at 48 kHz.**
A zero that is sometimes one buffer late would shift every delta in that run
equally and produce two clusters rather than a continuum. The order of
magnitude matches; the arithmetic is not exact, so this is a lead and not a
conclusion.

**`calibration.ts` predicted this precisely and nothing checked it.** Its
comment on `emittedAtSeconds` reads: "The caller owes this correspondence; it
is the one thing the estimator cannot check. Getting it wrong shifts every
trial by the same amount, which looks like a plausible latency rather than like
an error." That is the observed behaviour, written down before it was observed,
in the file it happened to. It is the fourth convention in
[the index](README.md) — a comment stating a constraint is a test that cannot
fail — arriving on its most expensive instance.

### The argument of 0014 has been relocated, not met

0014 decided to measure rather than read the platform's property, and the
research behind it sharpened the reason: the property is not silent, it
"answers confidently and wrongly, which is worse". **Our measurement also
answers confidently and wrongly.** An app that trusted `spreadSeconds` would
not discover the error, for the same reason an app trusting
`MediaTrackSettings.latency` would not. Measuring was still right; what was
wrong was assuming that a number we produced ourselves came with trustworthy
uncertainty attached.

## Decision

**`spreadSeconds` is not a confidence interval and must not be shown to a user
as one.** It describes agreement among six trials that share every systematic
error in the chain. Either the app reports a quantity that includes between-run
variation, or it reports no error bar at all. A "give or take 1 ms" that is
wrong by 120 ms is not a loose estimate; it is the specific failure
[0013](0013-knowing-the-answer-narrows-what-judging-has-to-do.md) forbids,
turned around and pointed at the app's own output.

**A calibration is several complete runs, and disagreement between them is a
refusal.** Not an average — averaging two clusters produces a number belonging
to neither. The reported figure is the agreement across runs, and where runs
disagree by more than the correction is worth, the honest answer is that this
room and this hardware did not yield one.

**Refusal is an expected outcome here, not an error path.** On this evidence it
may be the common one. That does not weaken 0018; it is 0018's central
distinction being vindicated by the first real data — `null` is the correct
state for a setup that cannot be measured, and this is such a setup.

**The stimulus is wrong for the detector it feeds, and that is separable.**
Six 80 ms clicks are inaudible to the onset detector at listening volume while
a 2-second tone is plainly audible to the same microphone. The published tools
surveyed in [`docs/research/2026-10-04-round-trip-audio-latency.md`](../research/2026-10-04-round-trip-audio-latency.md)
do not use click onsets: they emit a maximum-length sequence and cross-correlate,
which recovers timing from a signal spread over time and far below the
threshold any single transient would need. That is a different instrument for
the same measurement and it is the one the field uses. This record does not
adopt it — that is a design job with its own ADR — but it names it, because
"make the clicks louder" is the remedy that suggests itself and is the wrong
one.

## Consequences

Calibration stops being a feature that quietly produces a number and becomes
one that frequently declines to. That is a worse-feeling screen and a truer
one, and the whole of 0018 was written to make the truthful version
affordable.

The correspondence hazard gets a reason to be tested rather than commented. If
the recording's zero is the cause, it is also the cheapest thing on this list
to fix and would be invisible to every test the suite can run without a device.

### What this costs

**The app may end up with no working calibration at all.** Repeat-and-refuse
makes the output honest without making it available, and if acoustic
round-trip measurement does not work in ordinary rooms with ordinary speakers,
then latency-aware scheduling is a feature for the minority who have an
interface and a quiet room. 0018 named that as a possibility and this record is
it becoming likely. The remaining instrument is the one 0014 already named —
MIDI and audio disagreeing in the same session, "the cheapest calibration
measurement the app will ever have access to" — and it needs a MIDI device,
which iOS cannot have.

**Several runs multiplies a wait that is already long.** One run is
0.35 + 6 × 0.7 + 0.8 ≈ 5.35 seconds; three is sixteen, plus whatever the user
does between them. A setup step that takes half a minute and then says it could
not manage is a thing people abandon, and this record makes that outcome more
likely rather than less.

**The hypothesis above may be wrong, and the decision does not depend on it.**
That is deliberate, and it is also a risk: if the buffer-offset lead is wrong
and the true cause is something that *does* vary within a run, then between-run
agreement might have been achievable by tightening what already exists, and
this record will have reached for the heavier remedy first.

**No number has been measured that 0018 can use.** The seven runs do not give a
latency for this machine; they give a range. 0018's revisit trigger asked
whether the spread across devices is narrow enough to justify a default, and
the answer is that we cannot yet measure one device reliably enough to ask.
That question is now blocked rather than answered.

## Revisit when

- **The recording-zero correspondence is tested.** Feed the estimator a
  recording whose first sample is known to be late by one buffer and confirm
  the whole result shifts. That settles the hypothesis either way and is a
  pure-function test needing no device.
- **A second room and a second machine are measured.** One room cannot
  distinguish "this instrument does not work" from "this room does not work",
  and the difference decides whether the remedy is a better stimulus or a
  different instrument.
- **Cross-correlation against a spread signal is proposed.** That is the
  instrument change this record names and declines to make, and it wants its
  own record with the stimulus design in it.
- **A MIDI device is connected while audio capture is running.** 0014's third
  trigger, which this evidence promotes from opportunistic to the most
  promising path left.

## Correction, 4 October 2026 — one microphone, and what it was

The evidence above was gathered on a single input device, and the device was
not what anyone thought. Its ALSA card name reads "Trust USB microphone";
PipeWire's own description says Blue Snowball — a directional condenser,
pointed however it happened to be pointed. A loudspeaker-to-microphone timing
measurement in a room with hard surfaces is close to a worst case for a narrow
pickup pattern, and nothing rules out that the seven runs were exactly that.

Re-run on the same machine with the webcam microphone as default input:

| | Snowball | Webcam |
| --- | --- | --- |
| At 85%, the app's normal volume | never resolved in 40 s | **11 runs, all resolved inside 10 s** |
| Volume needed for any success | 150% | 120% |
| Successes, and their agreement | 39–171 ms | **161–173 ms, a 12 ms span** |

### What stands, and it is the part that matters

**The mechanism argument does not depend on the magnitude and never did.** An
interquartile range over six trials that are all shifted by the same amount is
unchanged, so the statistic cannot see the error that dominates. That is true
of a Snowball wrong by 120 ms and of a webcam wrong by 3 ms, and it was true
before any measurement existed. The title stands, the Decision's first clause
stands, and [0019](0019-the-click-gap-stays-the-callers-and-the-margin-stops-being-a-comment.md)
still predicted the shape.

"Relocated, not met" stands and reads more sharply after the narrowing: we
produce a confidence that cannot see its dominant error whatever the
microphone, which is the thing 0014 objected to in the platform.

**The ScriptProcessor lead gets more interesting, not less.** If a sometimes-late
recording zero explains the Snowball's 115 ms clustering, the same fault on a
good microphone is small, uniform, and reported as tight — invisible exactly
where everything else looks healthy. It remains testable with no device, and
it is now the first thing to do rather than the cheapest.

### What was too strong, and should not be built on

- **"No number has been measured that 0018 can use" and "0018's question is
  blocked."** Both wrong. Four runs agreeing within 12 ms is the beginning of
  an answer for this machine, and 0018's question is narrowed, not blocked.
- **"Refusal is an expected outcome and may be the common one."** On the
  webcam, every run resolved within ten seconds and each non-success named its
  reason. Repeat-and-refuse is therefore a cheap safeguard rather than a
  feature-killer: on hardware that works, runs agree and it will pass.
- **"At a volume anyone would listen at, it never finishes."** That is a
  Snowball sentence. The feature finishes promptly on a reasonable microphone.

### What the new evidence adds in the estimator's favour

The `inconsistent` refusal fired, repeatedly, in plain words — "the clicks came
back at different delays, so there is no one number to use". The within-run
guard works for the thing it is for, and this record under-credited it by
treating a statistic that cannot catch *uniform* error as though it caught
nothing. The screen also omits the error bar rather than printing "give or take
0" when all six clicks agree exactly, which is the right instinct in the place
this record is most critical of.

### What the narrowing does not rescue

The stimulus is still marginal at the volume the app ships at. On the good
microphone, **no run succeeded at 85% and four of ten succeeded at 120%**. That
is not a fact about the Snowball. The clicks-and-onsets instrument needs the
user to turn their speakers past comfortable before it works at all, and the
surveyed tools cross-correlate a spread signal precisely to avoid that. The
Decision's last clause stands.

### The fault in how this record was reached

This record carried a revisit trigger reading "one room cannot distinguish
'this instrument does not work' from 'this room does not work'" — and then its
Consequences were written as though it could. **Naming a caveat in one section
and arguing past it in another is worse than not having noticed**, because the
document looks careful while reaching an unsupported conclusion, and the
trigger made the limitation available to the author at the time of writing.

The device name is the other half. "Trust USB microphone" was taken at face
value in a report about measurement error; the name was an artefact describing
the thing, mistaken for the thing. That is the fourth convention in
[the index](README.md) once more, and this record is now an instance of it as
well as a user of it.
