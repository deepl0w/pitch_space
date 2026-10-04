# ADR 0026 — A measurement signal does not inherit a listening level

- **Status:** Accepted
- **Date:** 2026-10-04

Blocks the conclusion [0025](0025-agreement-among-trials-that-share-an-error-is-not-confidence.md)'s
last clause was heading towards. The calibration clicks are roughly 24 dB below
full scale, by inheritance rather than by choice, so no evidence gathered so far
can tell us whether clicks are the wrong stimulus.

## Context

0025 recorded that on a good microphone calibration succeeded **0 times in 11
at the app's normal volume** and 4 of 10 at 120%, and concluded that the
clicks-and-onsets instrument needs the user past comfortable before it works.
That figure is real. The inference from it is not available yet, because of
what the app is actually emitting.

[`measureLatency.ts`](../../src/audio/capture/measureLatency.ts) plays its
clicks through the app's synth and passes no `gain`. Following the chain in
[`synth.ts`](../../src/audio/output/synth.ts):

| Stage | Value |
| --- | --- |
| `peak = (voice.gain ?? 1) / PARTIALS.length` | 1 / 7 = 0.143 |
| Sum of `PARTIALS` amplitudes | 2.11 |
| `MASTER_GAIN` | 0.22 |
| **Peak, partials in phase** | **0.066 — −23.6 dBFS** |
| Fundamental alone | 0.031 — **−30.1 dBFS** |

The in-phase figure is the optimistic one; the partials are deliberately
inharmonic ("real strings are slightly sharp in their upper partials") so they
do not align and the true peak is lower.

**The comparison that makes this concrete is already in the evidence.** The
user role verified the acoustic path with a *full-scale* two-second tone and
saw the microphone's RMS go from about 5 to about 177. The calibration click is
somewhere between 24 and 30 dB below that signal and lasts 80 ms rather than
two seconds. The conclusion "this detector cannot resolve these clicks at
listening volume" was drawn about a stimulus attenuated by a factor of fifteen
to thirty.

`CLICK_MIDI = 93` compounds it: 1760 Hz, with the seventh partial at 12.3 kHz.
Much of that 2.11 is in a band where small speakers and a webcam microphone
both roll off, so the fraction that couples is smaller again.

### Why it is this way, and why nobody saw it

`measureLatency.ts` reuses the synth deliberately, and the comment says why:
"The app's one synth, so the clicks and the clock are the same ones." That is
correct and load-bearing — [0014](0014-one-clock-and-the-latency-nobody-can-measure.md)
turns on there being one clock, and a second audio path would reintroduce the
problem the whole record exists to avoid.

What the comment does not say is that sharing the synth also shares its
**loudness policy**. `MASTER_GAIN = 0.22` is a comfortable level for listening
to a generated melody, and the division by `PARTIALS.length` is a normalisation
so that a seven-partial note is not seven times louder than a sine. Both are
right for music. Neither has anything to do with a signal whose only job is to
be detected, and a reader checking the clock reasoning would find it sound and
stop.

## Decision

**A signal emitted to be measured sets its own level, and does not inherit the
playback gain or the partial normalisation.** Sharing the synth for the clock
is right; sharing its loudness is an accident of that sharing and should be
undone explicitly — by passing a `gain` that targets a stated level, or by
routing the measurement past `master`.

**The target is stated as a level, not as a multiplier.** "As loud as it can be
without clipping" is a property of the output chain; `gain: 7` is a number that
means nothing to the next reader and breaks silently if `PARTIALS` changes
length. Whatever is written down should say what dBFS it is aiming at and why.

**0025's stimulus clause is suspended, not withdrawn.** Cross-correlating a
spread signal remains the published practice and remains a candidate. It is no
longer supported by the 0-of-11 figure, because that figure was measured 24 dB
down, and **the clicks must be tried at a sensible level before anyone
concludes they are the wrong instrument.** Redesigning a stimulus to fix an
attenuation is the expensive way to discover a one-line cause.

## Consequences

The cheapest remaining explanation for the calibration failures is tested
first, and it is a gain, which is the kind of thing that would be embarrassing
to discover after building a correlator.

The synth's one-way street gets named: anything reusing it for a non-musical
purpose inherits decisions made for music, and the next such caller — a
metronome calibration, a test tone — now has a record saying so.

### What this costs

**A loud click in a settings screen is unpleasant and may be alarming.** The
current level is comfortable; the proposed one is as loud as the device can
manage. That wants a warning on the screen before it plays, which is UI work
this record creates and does not design, and it is a worse first experience
than the quiet version that does not work.

**Full scale risks clipping, which would make the timing worse rather than
better.** A clipped attack is a smeared attack, and the onset detector's
precision depends on the attack being sharp. There is a level above which this
trade reverses and nobody has found it; "as loud as possible" is the wrong
target if it lands past that point.

**Every measurement so far becomes historical.** The seven Snowball runs and
the eleven webcam runs were made at the old level, so none of them constrains
the new behaviour and the room work has to be redone. That is a real cost
imposed on the user role, who has already run this twice.

**It may not fix it.** If the detector's threshold or its frame resolution is
the binding constraint rather than the signal level, this changes nothing and
0025's stimulus question returns unchanged — with a day spent and a louder
settings screen to show for it.

## Revisit when

- **The clicks have been tried at a stated level in a real room.** That is the
  gate on 0025's last clause and on whether a stimulus redesign is needed at
  all. It is also the point at which the suspended clause is either withdrawn
  or restored with evidence.
- **Clipping is observed, or the measured latency gets worse as level rises.**
  That is the trade above reversing, and it sets the ceiling empirically rather
  than by argument.
- **A second non-musical caller of the synth appears.** Two means the gain
  question is structural rather than one caller's oversight, and the synth
  should probably offer a measurement path rather than each caller remembering.
