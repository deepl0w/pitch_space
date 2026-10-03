# ADR 0008 — An onset is a rise in the frame's own spectrum

- **Status:** Accepted
- **Date:** 2026-10-04

Sits under [0001](0001-a-pure-core.md), which is what makes a decision of this
kind checkable at all: the onset detector is arithmetic over a `Float32Array`,
so the measurements below were taken by running it, not by reasoning about it.

## Context

The onset detector picks peaks out of half-wave rectified spectral flux against
an adaptive threshold. Until now that threshold was built out of two terms, and
both of them were made of the flux curve itself: a median over a tenth of a
second either side, and the average flux of the whole signal.

A threshold made entirely of the thing it is thresholding has one blind spot,
and it is not a corner case. When the flux curve is *flat*, its median is no
longer a yardstick for it — it is simply the same number, and whatever ripple
the transform leaves on top of a steady signal stands proportionally far above
it. A 220 Hz sine held for a second reported **eighteen onsets, evenly spaced
about 52 ms apart**, none of which was an event. There is nothing special about
a sine here: a held note on a bowed or wind instrument is the same signal, and
rhythm scoring would have reported attacks inside one that the player never
made.

What kept this hidden is worth recording, because it is a property of the
fixtures rather than of the code. The obvious fixture for "a held tone" is a
tone that starts after some silence — and that one was green throughout, and
still is. Its start is a genuine event with enormous flux, which lifts the
whole-signal average term high enough to bury the ripple behind it. **The
cruder the fixture, the healthier the detector looked.** Only a fixture that
begins partway into a note, with no event anywhere in it, shows the defect.

## Decision

Add a third term to the threshold, and make it the one term that is not
computed from the flux curve:

```
threshold[t] = 1.5 × median(flux, ±0.1 s)      // local
             + 1.0 × mean(flux, whole signal)  // global
             + 0.01 × Σ|X_t[k]|                // the frame's own spectrum
```

The new term compares the flux to the L1 norm of the frame's own magnitude
spectrum — which is precisely the total that flux is a sum of rises out of, so
the ratio reads as *what fraction of this frame's spectrum was not there a hop
ago*. It is dimensionless, and it is exactly invariant under input gain,
because numerator and denominator scale together. That last property is not
optional: the sibling tuner's ADR 0002 records the same tone measured 33 dB
apart across two Android input sources, and a detector with an absolute floor
would be retuned per phone.

### What 0.01 is

Measured, at 44.1 kHz, as the largest flux ÷ spectral-L1 reached at any local
maximum of the flux curve, over the fixtures in `src/audio/testing/signals.ts`:

| Signal | ratio |
| --- | --- |
| 220 Hz sine held, cut dead or faded out over 20 ms | 0.0019 |
| the same sine 30 dB quieter | 0.0019 |
| 196 Hz sawtooth held | 0.0085 |
| a pluck whose attack fell before the first frame | 0.0029 |
| a pluck struck within the capture | 0.88 |
| one struck over a string still ringing | 0.65 |
| a 0.005-amplitude pluck over a −60 dBFS room | 0.44 |

Then swept rather than assumed, by setting the constant and running the suite:
**every value from 0.0007 to 0.08 is green.** Below that the ripple returns;
above it the faint pluck and the bowed attack go missing. The band is two
orders of magnitude wide because this is one term of three and the other two
go on working either side of it. 0.01 is near its geometric centre.

Where in the band it sits was a choice. It is set nearer the ripple than the
midpoint of the raw ratios would suggest, because the two sides of the gap are
not equally well evidenced: the ripple side is bounded by what a held tone can
do, which is a property of the transform, whereas the attack side is four
synthesised plucks and a real instrument's softest attack could sit well below
them. The headroom belongs where the evidence is weakest.

## Consequences

A held tone reports nothing, at any input gain, which is what a held tone is.
Three tests assert it — a sine, a sawtooth, a released tone — and all three
begin partway into the note, so none of them can be masked the way the old
fixture was.

The term is load-bearing and is asserted to be: a test turns the floor off
through `spectralFloor: 0` and requires the detector to misbehave, so if a
later tuning pass makes the steady tone silent for some other reason, that
shows up rather than quietly making this record's argument obsolete.

### What this costs

**An attack falling inside the very first analysis frame is no longer reported
at all.** Spectral flux measures a rise over the previous frame and the first
frame has no previous frame, so this was always the method's blind spot; what
is new is that the detector now admits it. Previously such an attack *was*
reported, at a time that was the first ripple rather than the strike — found by
the defect this record removes, at a ratio of 0.0029, which is indistinguishable
from a held tone's 0.0019 and is below it on some fixtures. No threshold
separates those two, so keeping that case was not available. Three fixtures in
the suite struck their note at t = 0 and now begin after a fifth of a second of
silence instead. Real capture is running before anyone plays, so the case the
detector cannot do is not one the app produces.

**A slow crescendo is still not an onset.** A tone fading in over 300 ms is
found by nothing here, before this change or after it, because a monotonic ramp
has no peak in its flux until the ramp is over. 100 ms is found. Somewhere
between the two is a boundary nobody has located, and a wind player's softest
entry may be the wrong side of it.

**The constant has never met a recording.** Every number above came from
Karplus–Strong and sine fixtures, and the tuner's ADR 0008 is explicit about
what that is worth: every defect its pitch tracking ever had was invisible to
synthetic audio. A corpus of real playing would be the thing that makes this
record trustworthy rather than merely honest.

**It is a fourth interacting mechanism** in a threshold that already had three,
and the tuner's ADR 0002 names that cost exactly: someone changing one of them
will not obviously see what the other three were protecting. Each is commented
with the failure it prevents, and that is the only defence.

## Revisit when

- **A corpus of real playing lands.** This is the first constant to re-measure
  against it, and the sweep above is the method: set the value, run the suite,
  find both edges of the green band rather than confirming one value works.
- **A reported performance scores a note the player did not play**, or misses a
  soft entry. Those are the two edges of this band, and which one it is says
  which way to move before any other constant is touched.
- **The detector is asked to work on a signal that is already sounding when
  capture opens** — a recording trimmed to a phrase, say, rather than a live
  take. The first-frame blind spot above becomes a lost note rather than a
  non-event, and the fix is a lead-in rather than a change to this threshold.
