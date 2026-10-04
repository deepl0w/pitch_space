# ADR 0014 — One clock, and the latency nobody can measure

- **Status:** Accepted
- **Date:** 2026-10-04

Fills a gap in [0012](0012-the-judge-consumes-performed-notes-not-audio.md),
which says a performed note carries "a start time in seconds" without saying
seconds measured from what. Written before the capture work starts, for the same
reason 0012 was: the alternative is that the first implementation answers it by
accident, in a way every stored attempt then inherits.

## Context

Three clocks are already in play and nothing relates them.

`schedule()` emits voices whose `start` is an offset from zero — the beginning
of the sequence, not a moment. [`Synth`](../../src/audio/output/synth.ts) maps
those onto `context.currentTime + 0.06`, the **output** clock. React and any UI
timing would use `performance.now()`. And
[`alignRhythm`](../../src/audio/dsp/rhythmAlign.ts) takes `expected` and
`played` as bare numbers "in seconds", with no origin stated for either.

That works while both lists are generated. It stops working the moment one of
them comes from a microphone, because the capture path has a latency the output
clock cannot see. The Web Audio API is asymmetric here: `AudioContext` exposes
`baseLatency` and `outputLatency`, and `getOutputTimestamp()` relates
`contextTime` to `performanceTime` — **but there is no standard input-latency
property.** What a microphone's samples cost between the player's instrument and
the worklet is not reported by anything.

The size of the problem is fixed by a constant already in the repository.
`toleranceFor` returns `min(0.1, 0.25 × beatSeconds)`, so the matching window is
a **100 ms half-width**, and the ceiling binds whenever `0.25 × beat ≥ 0.1` —
that is, at or below **150 bpm**:

| Tempo | Beat | `0.25 × beat` | Window |
| --- | --- | --- | --- |
| 100 bpm | 0.600 s | 150 ms | 100 ms (ceiling) |
| 120 bpm | 0.500 s | 125 ms | 100 ms (ceiling) |
| 150 bpm | 0.400 s | 100 ms | 100 ms (crossover) |
| 200 bpm | 0.300 s | 75 ms | 75 ms |

So the window sits at its widest across the whole of normal practice tempo and
only narrows above 150 bpm. Round-trip audio latency on ordinary hardware is of
the same order as that 100 ms, and over Bluetooth it is routinely larger. An uncorrected offset therefore does not degrade rhythm
judging gracefully — past 100 ms every expected note is `missed` and every
played note is `extra`, and [0009](0009-align-a-performance-by-dynamic-programming.md)'s
alignment reports a performance that answered nothing.

It would not look like a clock bug. It would look like the onset detector
failing, or like the user playing badly.

## Decision

**One clock: `AudioContext.currentTime`.** Every time that is compared with
another — scheduled playback, the expected grid, a captured attack, the moment
an item became answerable — is expressed in it. `performance.now()` is used for
nothing that is judged, and is related to the audio clock only through
`getOutputTimestamp()` when a UI event has to be placed on it at all.

**A performed note's `start` is exercise time**, not context time: seconds from
the exercise's own zero, which is one named moment in context time held by
whatever is running the exercise. This keeps `alignRhythm`'s two lists
comparable, and keeps a stored attempt free of a number that means nothing on
another device or another day.

**Input latency is a single correction applied once, at the capture boundary.**
The capture layer subtracts it when it stamps a note, so that everything
downstream — alignment, `latencyMs`, the scheduler — sees times already in
exercise time. It is not distributed, not applied in the grader, and not
re-applied anywhere else.

**Its value is calibrated, not assumed.** There is no property to read, so the
honest options are a measured round trip (play a click, hear it back, take the
difference) or a user-set offset. Until calibration exists the correction is
zero and that is a known wrong answer, not a neutral default.

**The correction in force is recorded with the attempt.** A stored attempt says
what offset was subtracted when it was judged. Evidence cannot be backfilled —
the principle [0007](0007-an-attempt-records-per-event-item-attribution.md)
already rests on — and without it a history judged at one calibration cannot be
compared with, or re-judged against, a better one.

## Consequences

The rhythm exercise gets a failure mode that can be diagnosed. If attacks are
systematically late by a constant, that is a calibration problem with a name,
rather than an onset detector that appears not to work.

MIDI gets the same treatment for free and mostly needs none of it: a note-on
timestamp is close to exact, so its correction is zero or near it. Both
producers still hand the judge the same shape, which is what
[0012](0012-the-judge-consumes-performed-notes-not-audio.md) is for.

Recording the offset makes a past attempt re-judgeable. That matters more than
it sounds, because the first users will play before calibration is any good.

### What this costs

**A systematic offset corrupts `latencyMs`, and `latencyMs` feeds the
schedule.** [0007](0007-an-attempt-records-per-event-item-attribution.md)
records milliseconds from the moment an item became answerable, and the
ROADMAP's scheduler shortens the review interval for hesitation. An uncorrected
80 ms makes every user look slightly hesitant, so the schedule drills everyone
harder, and it does it worst to whoever has the slowest audio path. That is the
sharpest consequence of getting this wrong and it is silent.

**Calibration is a thing the user has to do, and they will not want to.** A
measured round trip needs the device's speaker and microphone open together,
which is a prompt, a quiet moment and an explanation. Rhythm games ask for it
because they must; a practice app asking for it before the first exercise is a
worse first run. There is no good answer here, only the choice between a
calibration step and systematically wrong timing.

**Zero is a bad default that will look fine.** On a wired headset with a decent
interface the error may be small enough that the exercise behaves, which means
the problem will be discovered on someone else's hardware, after their history
has been recorded at the wrong offset.

**None of this is measured on this codebase.** The 100 ms ceiling and the
0.25-beat fraction are read from the source; the claim that round-trip latency
is of that order is general knowledge, not a number from this app on a real
device. The experiment is small and should come before the rhythm exercise:
play a click through the output path, capture it, and take the difference, on
as many of the target devices as can be reached.

## Revisit when

- **The first round-trip measurement exists.** If it comes back well under the
  window on every device reachable, the calibration step could be deferred
  behind a default — but that is a decision to make with a number, not in
  advance of one.
- **An exercise needs absolute time rather than exercise-relative time** — a
  session replay, or comparing two attempts' tempo drift. Exercise time is a
  deliberate loss of information and that is when it bites.
- **MIDI and audio disagree in the same session.** A user with both connected
  gives two timestamps for one event, which is the cheapest calibration
  measurement the app will ever have access to, and worth taking if it happens.

## Correction, 4 October 2026

**The Context above says "there is no standard input-latency property". There
is one.** [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)
defines `latency` on `MediaTrackSettings`, read through
`track.getSettings().latency`, and specifies it as the time from the start of
processing to the data being available to the next step — the quantity this
record says nothing reports.

The decision stands, and the evidence for it is stronger than the argument
that was made. The property is implemented as something else: on a
[chromium-dev thread](https://groups.google.com/a/chromium.org/g/chromium-dev/c/YCywOaFTSm8)
a Chromium engineer identifies the returned value as a fixed internal buffer
size, and the reporter observes `latency × sampleRate ≈ 128` holding across
sample rates. Measuring rather than reading was the right call for a reason
this record did not give: not that the platform is silent, but that it answers
confidently and wrongly, which is worse.

The distinction matters to anyone revisiting this. "No property exists" invites
a periodic check of whether one has landed; "the property exists and is a
buffer size" says what to check instead — whether implementations have moved,
and the min/max/avg latency statistics now under review in the spec.

Figures, provenance and what they imply for the constants are in
[`docs/research/2026-10-04-round-trip-audio-latency.md`](../research/2026-10-04-round-trip-audio-latency.md).
The same note supplies what the Consequences call for and admit they lack — the
claim that round-trip latency is "of that order" is now backed by published
loopback measurements rather than by general knowledge, and it holds for wired
paths while Bluetooth is considerably worse.
