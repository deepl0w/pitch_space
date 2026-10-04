# ADR 0019 — The click gap stays the caller's, and the margin stops being a comment

- **Status:** Accepted
- **Date:** 2026-10-04

Narrows nothing and reverses nothing in the record. It settles a coupling
[0014](0014-one-clock-and-the-latency-nobody-can-measure.md) created and
[0018](0018-uncalibrated-is-not-zero.md) did not examine, between the pure
estimator and the capture routine that feeds it. What the latency *is* stays
where 0018 left it: unmeasured, needing a real room, and the user role's.

## Context

Calibration is two files. [`estimateInputLatency()`](../../src/audio/dsp/calibration.ts)
is pure and decides everything; [`measureInputLatency()`](../../src/audio/capture/measureLatency.ts)
owns the device and decides only the protocol — how many clicks, how far
apart. [0001](0001-a-pure-core.md) requires that split and the split is right.

Three constants form an ordered chain across it, and only two are in the same
file:

| Constant | File | Value |
| --- | --- | --- |
| `MAX_PLAUSIBLE_SECONDS` | `dsp/calibration.ts` | 0.5 |
| `MATCH_WINDOW_SECONDS` | `dsp/calibration.ts` | 0.6 |
| `GAP_SECONDS` | `capture/measureLatency.ts` | 0.7 |

`MAX_PLAUSIBLE < MATCH_WINDOW` keeps the `implausible` refusal reachable: a
delta wider than the match window is never matched at all, so reversing the
order would report `nothing-heard` and offer the user the wrong remedy. The
file already documents one guard that could not fire — `MIN_PLAUSIBLE_SECONDS = 0`,
dead because `matchDeltas` drops negative deltas — so this shape has bitten
here once already.

`MATCH_WINDOW < GAP` is the one with no home. `matchDeltas` pairs each click
with the first unclaimed onset after it, so a click whose own echo went
undetected can reach forward to the next click's. The requirement is stated
only in a comment on `MATCH_WINDOW_SECONDS` — "narrower than the gap the
caller leaves between clicks" — and the gap it refers to is not visible from
that file:

```bash
grep -rn 'GAP_SECONDS' src/          # 3 hits, all in capture/measureLatency.ts
```

### What the chain actually does when you push on it

This record was drafted claiming a shortened gap would produce a confident
wrong answer. Measurement said otherwise, and the draft was wrong in the
codebase's favour. Recordings of six clicks at a true latency of 0.08 s, with
the first click's echo absent, through the real estimator:

| Gap | Outcome |
| --- | --- |
| 0.70 s (today) | `ok`, 0.0775 s, heard 5 of 6 |
| 0.60 s | `ok`, 0.0783 s, heard 5 of 6 |
| 0.55 s | `ok`, 0.0766 s, heard 5 of 6 |
| 0.50 s | `inconsistent`, heard 6 of 6 |
| 0.45 s and below | `inconsistent`, heard 6 of 6 |

Clean recordings — nothing missing — return the right answer at every gap
down to 0.25 s. **The mis-attribution needs a dropped echo to start, and when
it starts the estimator refuses.** No construction produced a confident wrong
number.

Two things follow that the comments do not say.

**The operative invariant is `MATCH_WINDOW < GAP + latency`, not
`MATCH_WINDOW < GAP`.** The breakpoint sits between 0.55 and 0.50, which is
where `gap + 0.08` crosses the 0.6 window. The comment's form is the
conservative one — if it holds, the real one holds — so the code is correct
and the stated rule is merely not the governing one. That matters because the
margin grows with the latency being measured, so the *worst* case is the
fastest hardware, which is the opposite of where one would look.

**The failure is a misleading message, not a wrong number.** `inconsistent`
tells the user "the clicks came back at different delays… Something else may
be making noise nearby", which blames their room for a constant someone
changed. Alongside it, `heard` reports 6 of 6 when only five echoes were ever
played, because it counts matched deltas rather than distinct clicks heard —
the synthesised recording yields about two onsets per click, so there are
enough onsets to go round.

## Decision

**The click gap stays in the capture layer and does not join `CalibrationInput`.**
The drafted alternative was to pass it down, following the precedent of
`sampleRate` ("Measured, not assumed: whatever the capture layer reports"), so
the estimator could validate the protocol it was judging. The measurement does
not support the cost: the interface has one caller, tests can already construct
any gap they like through `trials`, and the fault it would catch is a refusal
rather than a corruption. An interface widened against a hazard that turns out
to degrade safely is ceremony, and 0016's rule — only when it pays on its own —
applies to interfaces as much as to queries.

**The invariant is written in its operative form, on the constant that depends
on it.** `MATCH_WINDOW_SECONDS` should say that it must stay under the caller's
gap *plus the smallest latency worth measuring*, that the conservative form is
what is actually maintained, and that the current caller leaves 0.7 s. A
comment naming a number in another file is weaker than a check and stronger
than what is there now.

**The margin is pinned by a test at the gap the app sends.** The suite's
`recording()` helper defaults to a 1-second gap and the one test that sets a
gap explicitly uses 2; the 0.7 s the app actually sends is exercised nowhere,
so the 100 ms of headroom that makes the system correct has never been the
margin under test. The test worth having is the dropped-echo case at 0.7 s,
asserting the graceful outcome — a correct median and `heard` short of `sent` —
because that is the behaviour a future change to either constant would break.

This record decides; it does not implement. The comment is a source edit and
the test is the tester's, and both are smaller than the restructuring they
replace.

## Consequences

The next person to shorten the calibration run — the obvious complaint to act
on, since it costs the user 0.35 + 6 × 0.7 + 0.8 ≈ 5.35 seconds — finds a test
that fails and a comment that says why, instead of a settings screen that
starts blaming people's rooms.

The chain stays a convention rather than becoming a mechanism, which is a
smaller claim than the draft made and the one the evidence supports.

### What this costs

**Nothing checks the inequality, and that is now a decision rather than an
oversight.** A comment is only as good as the reader, and the reader who
breaks this one will be editing a different file in a different layer for a
reason that has nothing to do with signal processing. If it breaks anyway, the
honest conclusion is that this record chose wrong and the interface should
have been widened.

**The test pins one latency, and the margin depends on latency.** 0.08 s is
near the worst case, since the margin widens as latency grows, so the choice
is defensible — but a device fast enough to come in under it would sit outside
what the test covers, and the test will not say so.

**`heard` stays misleading in the broken configuration.** Reporting 6 of 6 when
five clicks were played is a small dishonesty in a refusal path, left alone
because fixing it means deciding what `heard` counts, and that question is
worth more than this record is spending on it.

**Declining the interface change leaves the obligation unwritten for a second
caller.** 0018 names output-latency calibration as a likely one. If it arrives
and reuses this estimator, it inherits a requirement stated in a comment on a
constant, and the argument this record rejected gets materially stronger.

## Revisit when

- **The click gap changes, for any reason.** The check is the dropped-echo case
  at the new gap: a correct median and `heard` below `sent`, not `inconsistent`.
  Shortening the run is the change to expect.
- **A second caller of `estimateInputLatency` appears.** One caller was half the
  argument for leaving the gap where it is; two means the requirement is being
  inherited rather than kept, and the interface should be widened then.
- **A real device reports a latency near the 0.5 s ceiling.** The chain's
  headroom is stated against ordinary hardware; a Bluetooth path crowding
  `MAX_PLAUSIBLE_SECONDS` moves the ceiling, and both inequalities need
  re-checking against the new value rather than against today's.
