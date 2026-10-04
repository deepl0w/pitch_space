# Round-trip audio latency, from outside this repository

**4 October 2026.** Gathered to put numbers behind
[0014](../adr/0014-one-clock-and-the-latency-nobody-can-measure.md), which
says plainly that it has none, and to give
[0018](../adr/0018-uncalibrated-is-not-zero.md)'s open question something to
start from. Nothing here is a measurement of this app.

## Contents

- [The platform property does exist, and it lies](#the-platform-property-does-exist-and-it-lies)
- [Browser round trip, measured by loopback](#browser-round-trip-measured-by-loopback)
- [Android, native path](#android-native-path)
- [Bluetooth is the fat tail](#bluetooth-is-the-fat-tail)
- [What this does and does not settle](#what-this-does-and-does-not-settle)

## The platform property does exist, and it lies

0014 says "there is no standard input-latency property at all". That is wrong
on the letter. [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/)
defines `latency` on `MediaTrackSettings`, reachable through
`track.getSettings().latency`, and specifies it as the time from the start of
processing to the data being available to the next step — which is the
quantity 0014 wants.

It is not implemented as that quantity. On a
[chromium-dev thread](https://groups.google.com/a/chromium.org/g/chromium-dev/c/YCywOaFTSm8)
a Chromium engineer identifies the returned value as the size of a single
internal buffer, fixed in source; the reporter observes `latency × sampleRate ≈ 128`
holding across sample rates on macOS, which is a buffer count and not a
hardware path. Independently, [Jeff Kaufman](https://www.jefftk.com/p/browser-audio-latency)
reports Chrome returning a constant 10 ms "regardless of actual microphone
latency", and Firefox's `AudioContext.outputLatency` returning implausibly low
values. Safari implements `baseLatency` and does not expose `outputLatency` at
all.

So the property is worse than absent: it is present, specified to mean the
right thing, and returns a number that looks plausible. **0014's decision to
measure survives its premise being loose, and is better supported than when it
was written** — an app that trusted the property would not discover the error.

A PR adding min/max/avg latency statistics to the spec is under review, which
is the thing to watch rather than the current field.

## Browser round trip, measured by loopback

Beep out, listen on the microphone, difference the times — the same method
[`measureInputLatency()`](../../src/audio/capture/measureLatency.ts) uses.
Jeff Kaufman, on one machine, a 2016 15" MacBook running OSX 11.1:

| Browser | Default settings | `latencyHint: 0`, all three processors off |
| --- | --- | --- |
| Chrome | ~67 ms | ~19 ms |
| Firefox | ~55 ms | ~14 ms |

One laptop, one OS, so the absolute values carry little, but the *ratio* is
the finding and it is large: **the two changes together are worth roughly
48 ms in Chrome**, about half the 100 ms matching window.

The source moves both variables at once and does not report the split, so how
much belongs to each is unknown. That matters here, because the app takes one
of the two and not the other. It already sets all three processors to `false`
in `CONSTRAINTS`, for a different and also correct reason — echo cancellation
would remove the signal being measured — so this is a second, independent
argument against anyone relaxing them later. It does not set `latencyHint`
at all:

```bash
grep -rn 'latencyHint' src/        # nothing; synth.ts does `new AudioContext()`
```

Whether that is leaving 5 ms or 40 ms on the table is exactly what this source
cannot say. It is a cheap thing to measure once the app can measure anything,
and a cheap thing to try regardless.

## Android, native path

Google's [Oboe device list](https://chromium.googlesource.com/external/github.com/google/oboe/+/devicelist/docs/Devices.md),
by loopback adapter, averaged over six runs per device: **13.52 ms (Pixel XL)
to 20.95 ms (Galaxy S9)**, about seven devices, most clustered at 15–20 ms.
Android's `android.hardware.audio.pro` feature flag means ≤20 ms round trip.

Two qualifications that matter and are easy to drop. The page carries a
"DRAFT — ALL INFORMATION SHOULD BE CONSIDERED INACCURATE" banner. And these
are *native* AAudio measurements through a loopback cable: they are the floor
the hardware imposes, not what a browser on that hardware will show. The
desktop numbers above suggest the browser adds its own layer on top.

## Bluetooth is the fat tail

Commonly quoted as a minimum of +100 ms. A 2024 benchmark across 27 headset
models puts the range at **42 ms (Razer Barracuda Pro) to 89 ms (Bose
QuietComfort Ultra)**, with aptX Adaptive reaching about 40 ms when both ends
support it. [SoundGuys](https://www.soundguys.com/android-bluetooth-latency-22732/)
has the longer argument about why Android's figures are what they are.

This is additive to everything above, and it is the case the app cannot see:
nothing in the browser says whether the output path is Bluetooth.

## What this does and does not settle

**Against `MAX_PLAUSIBLE_SECONDS = 0.5`:** comfortable. Stacking the worst of
each row — a slow browser path plus an 89 ms headset — does not approach
500 ms, so the ceiling is roughly double the worst realistic case. It is doing
its stated job of catching the detector finding a cough rather than trimming
real devices.

**Towards [0018](../adr/0018-uncalibrated-is-not-zero.md)'s open question**,
whose trigger is "if the spread turns out to be narrow everywhere, a measured
median is a better default than `null`": across *wired* paths the spread
really is narrow — roughly 14–21 ms on the two datasets here, which is a fifth
of the matching window and would hurt nobody as a default. The tail is
entirely Bluetooth, where the error would be 40–90 ms and lands inside the
window where it does the damage 0014 describes.

So the shape of the question changes. It is not "is the spread narrow" but
**"can the app tell a wired path from a wireless one"** — because if it can,
a default serves the majority and `null` is reserved for the case that
actually needs it. That is worth establishing before the majority-will-never-
calibrate cost in 0018 is accepted as inevitable.

**Against `MAX_SPREAD_SECONDS = 0.025`: nothing here is relevant.** Every
source above reports one figure per device. The quantity that constant governs
is *trial-to-trial variance within one device in one room*, which none of them
measure. It remains unmeasured, and the user role's sweep is still the only
thing that will settle it.

## Sources

- [Browser Audio Latency — Jeff Kaufman](https://www.jefftk.com/p/browser-audio-latency)
- [Is the audio latency value in MediaStream API according to spec? — chromium-dev](https://groups.google.com/a/chromium.org/g/chromium-dev/c/YCywOaFTSm8)
- [Media Capture and Streams — W3C](https://www.w3.org/TR/mediacapture-streams/)
- [Android Device Latency — Google Oboe](https://chromium.googlesource.com/external/github.com/google/oboe/+/devicelist/docs/Devices.md)
- [Audio latency — Android NDK guide](https://developer.android.com/ndk/guides/audio/audio-latency)
- [Android's Bluetooth latency needs a serious overhaul — SoundGuys](https://www.soundguys.com/android-bluetooth-latency-22732/)
- [Web Browser Audio Latency Measurement — Superpowered](https://github.com/superpoweredSDK/WebBrowserAudioLatencyMeasurement)
