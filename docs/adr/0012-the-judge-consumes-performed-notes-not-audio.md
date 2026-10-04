# ADR 0012 — The judge consumes performed notes, not audio

- **Status:** Accepted
- **Date:** 2026-10-04

Written before the capture layer exists, which is unusual here and deliberate:
this decides the shape of a seam that work about to start would otherwise fix
by accident. It extends [0001](0001-a-pure-core.md) to the input side and
settles where [0009](0009-align-a-performance-by-dynamic-programming.md)'s
alignment sits relative to whatever produced the attacks.

## Context

The premise of the app is that exercises are answered on a real instrument.
Nothing captures anything yet: `audio/dsp/` is complete and unused, and the two
built exercises are answered by tapping buttons.

The obvious reading is that capture means a microphone, and that the question is
how good the pitch detection is. Both halves of that are wrong.

**There are two input sources, not one, and that is forced rather than chosen.**
The Web MIDI API is unsupported in Safari and on iOS, in every version. A MIDI
keyboard is by far the better signal where it is available — the instrument
reports exactly which key went down, when, and how hard, with no room noise, no
octave errors and no onset ambiguity — but an iOS user of an installable PWA
cannot have it. Audio capture is the only path that works everywhere, and MIDI
is the only path that is reliable. Neither can be the sole input.

Checked rather than remembered, on 4 October 2026, against
[caniuse](https://caniuse.com/midi): no Safari version on any platform
supports it, desktop or iOS, including Technology Preview. It is not a gap
waiting to close — WebKit declined to implement it in 2020 on fingerprinting
grounds, and Apple requires every iOS browser to use WebKit, so Chrome, Edge
and Firefox on iOS inherit the same answer. This whole record rests on that
one fact, which is why it is dated and sourced here: if it ever changes, the
argument above is the first thing to re-read.

**And the problem is not transcription.** General-purpose polyphonic
transcription is hard and a different algorithm class from the monophonic YIN
already ported. But this app never has to transcribe: it generated the exercise,
so it already holds the symbolic answer. That turns the question from "what did
they play" into "did what they played match this" — which is the field called
*score following*, whose standard approach is online dynamic programming against
a known score. The usual obstacle there is obtaining the symbolic reference at
all; here it is free, as a by-product of generation.

Some of this is already true by instinct rather than by decision.
[`alignRhythm`](../../src/audio/dsp/rhythmAlign.ts) takes `expected: number[]`
and `played: number[]` — attack times in seconds — and knows nothing about where
the played ones came from. A MIDI note-on timestamp satisfies it exactly as well
as a detected onset does. The rhythm half of judging is already source-agnostic.

The pitch half is not.
[`PitchEstimate`](../../src/audio/dsp/pitchDetector.ts) carries `frequencyHz`,
`clarity` and `levelDbfs`: a frame of audio's worth of evidence, with two fields
that have no MIDI equivalent. Anything written against that shape is written
against the microphone.

## Decision

**Judging consumes a stream of performed notes. Neither the exercise layer nor
the grader ever sees audio, and neither knows which source produced the notes.**

The seam is a small structure — a sounding pitch as a MIDI number, a start time
in seconds, optionally an end, and a confidence — and two producers implement
it:

- the **audio chain**, where the note is assembled from an onset and the pitch
  estimates that follow it, and confidence carries the detector's clarity;
- the **MIDI chain**, where a note-on gives all of it directly and confidence is
  simply 1.

`grade` keeps the signature [0007](0007-an-attempt-records-per-event-item-attribution.md)
gave it — a pure function of `(exercise, response)` — with a performance now
being one possible response. It stays property-testable from a literal array of
notes, with no microphone, no MIDI device and no `AudioContext`, which is the
same property [0001](0001-a-pure-core.md) buys everywhere else.

**Confidence crosses the seam; the audio-only fields do not.** `clarity` and
`levelDbfs` are how the audio chain decides whether it heard a note. Once it has
decided, they are evidence about the detector rather than about the performance,
and a judge that branched on them would be judging iOS users by a different rule
from everyone else.

**Comparison is by pitch class and spelled degree where the exercise allows it.**
A chord answered an octave up or in a different inversion is the same answer;
insisting on the written voicing would fail a correct response. What counts as
equivalent is the exercise's business, which is why it lives in `grade` and not
in the capture layer.

## Consequences

The same judging code serves both inputs, so the MIDI path is not a second
implementation of grading but a second producer feeding the first. That matters
more than it sounds: two grading paths would drift, and the drift would show up
as the app marking a correct answer wrong on one platform.

Polyphonic transcription is not required for chord exercises. Deciding whether
a given set of expected pitch classes is present is a far weaker question than
asking what was played, and it is answerable from the chroma the DSP layer
already computes.

It also makes the input testable before any device exists. A performance is an
array of notes, so every exercise's grading can be written and property-tested
now, and the capture layer becomes a separate problem about producing that array
accurately.

### What this costs

**MIDI is strictly better and the seam hides it.** Velocity, exact release
times, pedal state and guaranteed note identity are all available over MIDI and
all absent or approximated over audio. A seam narrow enough for both to satisfy
is a seam that discards what MIDI knows. That is the right trade for judging —
the questions this app asks are answerable without velocity — but the first
exercise that wants dynamics or articulation will have to widen it, and should
widen it as optional fields rather than by letting MIDI in through a side door.

**It asserts an equivalence that is not quite true.** A MIDI note-on is a fact;
an assembled audio note is an inference with a confidence attached. Treating
them as the same type means a grader can ignore the difference, and sometimes it
should not — a low-confidence note is not evidence that the user played
*wrongly*, it is evidence that nothing was heard, and a schedule fed the former
when it should have had the latter will punish someone for their room. The
confidence field is carried for this reason and will be easy to forget.

**It is written ahead of the code**, so it is a prediction about what the
capture layer will need rather than a description of what it does. The usual
failure of such a record — specifying a carve-out for something that turns out
not to be needed — is the mistake 0005 corrected on 0002, and it applies here.
The mitigation is that the decision is small: it names what crosses a boundary,
not how either side works.

## Revisit when

- **The first capture path is built.** Check that the audio producer can
  actually fill the structure — in particular that a note's *end* is available,
  since offsets are much harder to detect than onsets and the field may have to
  become optional in practice rather than in principle.
- **An exercise wants dynamics or articulation.** That is the point at which the
  seam is too narrow, and the question is whether to widen it for everyone or to
  let such exercises declare that they need MIDI and be unavailable on iOS.
- **Latency becomes the complaint.** Polyphonic analysis needs a longer window
  than monophonic, so a chord exercise may feel slower to respond than a melodic
  one on the audio path and identical on the MIDI path. If that is what users
  notice, the problem is the window and not this seam.
