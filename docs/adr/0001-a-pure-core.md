# ADR 0001 — A pure core: theory, generate and dsp import nothing above themselves

- **Status:** Accepted
- **Date:** 2026-10-03

## Context

This app has two halves that look alike and behave nothing alike. One half
decides things about music: what the notes of a Db melodic minor scale are
spelled as, which chord a set of sounding pitches could be, where a phrase
should cadence. The other half talks to a device: a microphone, an
`AudioContext`, a canvas, a React tree.

The first half is where every interesting claim lives, and nearly every one of
them is checkable without a browser. `spellScale` either produces Gb or it
produces F#; `qualityOf` either calls C–F# an augmented fourth or it is wrong.
Those are assertions against music theory, not against a rendered pixel or a
captured buffer.

The same is true on the analysis side. Pitch detection, chroma and onset
detection are arithmetic over a `Float32Array`. Nothing about YIN needs a
microphone — it needs samples, and a test can supply those from a file. The
sibling tuner established exactly this and it is why its detector carries tests
over real recordings
(its ADR 0008, "Verify pitch tracking off-device, against real recordings",
in the sibling `tuner` repository).

What makes this a decision rather than an observation is that the boundary is
only cheap while it holds. The first time a generator reaches for `window` to
decide something, or a detector takes an `AnalyserNode` instead of an array, the
whole subtree beneath it stops being runnable under vitest. Nothing fails loudly
at that moment; the tests that already exist keep passing. The cost arrives
later, as the tests that never got written.

## Decision

**`src/theory/`, `src/generate/` and `src/audio/dsp/` import nothing from the
layers above them and nothing from the platform.** No DOM, no `AudioContext`,
no `navigator`, no React, no persistence. They take plain data and return plain
data.

Dependencies within the core run one way: `theory/` is the foundation and
imports only from itself; `generate/` may import `theory/`; `audio/dsp/` imports
neither. A cycle between them is the same defect as a platform import.

When a generator or a detector genuinely needs something only the browser has,
the need is inverted rather than imported: the caller obtains it and passes it
in. Where that will not work — a real microphone, a real audio clock, a real
canvas — the code belongs in `capture/`, `output/` or a component, which is
where the platform is allowed to exist.

## Consequences

The whole music engine and the whole analysis chain run under vitest on a
laptop, in milliseconds, with no DOM shim and no fake audio graph. That is what
makes property tests over ten thousand seeds affordable, and property tests are
how a generator gets held to a standard at all
([0002](0002-generation-is-reproducible-from-its-seed.md)).

It also keeps the Android build honest. The core compiles and runs identically
whether it is inside a PWA or inside a Capacitor WebView, because it never asks
which one it is in.

Today the rule holds completely. `src/theory/` is six files and contains no
reference to `document`, `window`, `AudioContext`, `navigator` or
`localStorage`, and no import that climbs out of the directory:

```bash
grep -rn 'document\.\|window\.\|AudioContext\|navigator\.\|localStorage' src/theory | wc -l   # 0
grep -rn "^import .* from '\.\./" src/theory                                                  # no output
```

Those commands are written against the repository rather than against a file
list, so they keep answering after `generate/` and `audio/dsp/` exist. Extend
the paths as those directories land.

### What this costs

**The rule is unenforced.** `CLAUDE.md` says "a test enforces it". No such test
exists — `npm test` currently reports no test files at all. The boundary is
holding on authorship, which is the weakest thing a boundary can hold on, and
the first violation will arrive in a branch whose own tests are green. Writing
that test is the first piece of work this record implies, and it is cheap: it is
the greps above, run over `git ls-files`, asserted to be empty.

**Inversion is real work when it bites.** A generator that wants to weight its
choices by what the player has historically got wrong cannot read the store; the
caller has to gather that and hand it over, which means a wider function
signature and a shape to agree on. The temptation at that moment is to import
one small thing. It is the only moment this record exists for.

**Some duplication at the seam.** `capture/` and `output/` will each need small
adapters that exist only to convert a browser object into the plain arrays and
numbers the core accepts. That code is dull and untested-by-the-core, and it is
the price of the core being testable at all.

## Revisit when

A real need appears that inversion cannot serve — the usual candidate is
something needing a time source inside a generator, which should be a parameter
and will be argued as a special case. Check whether the thing being asked for is
a *decision* (keep it out) or a *resource* (pass it in).

Or when `audio/dsp/` grows a path that is only reachable from a worklet. At that
point the dsp/capture split is being drawn in the wrong place, and the test that
enforces this will say so before a human notices.
