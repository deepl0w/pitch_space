# ADR 0034 — Test data that cannot be committed is fetched, and its absence is announced

- **Status:** Accepted
- **Date:** 2026-10-06

Records how the capture layer's three test tiers are supplied, which
[0008](0008-an-onset-is-a-rise-in-the-frames-own-spectrum.md) implies and does
not decide — before a second instance arrives and the pattern is set by
copying rather than by choosing.

## Context

Capture landed on a `CaptureSource` seam: frames of mono audio and a rate,
with nothing downstream knowing the origin. That makes 0008's argument
operational rather than aspirational. 0008 says "the constant has never met a
recording" and names a corpus as the first thing that would re-measure it; a
recorded source running through the real analysis path is that corpus
arriving, and it is a stronger claim than any synthesised signal can make,
because a browser's fake input is a beep and host audio never reaches an
emulator.

Three tiers now exist:

| Tier | Supplied by | Runs |
| --- | --- | --- |
| Synthesised | committed, `audio/testing/signals.ts` | always |
| Recorded | fetched, `tools/fetch-test-audio.sh` | only after a fetch |
| Browser | not automated | plumbing only |

The middle one is the strongest and it is off by default:

```bash
npx vitest run src/audio/capture/recorded.test.ts
#  ↓ 3 skipped   ✓ 1 passed — "is absent, and says how to get it"
grep -rn 'fetch-test-audio' test.sh .github/     # nothing
```

So a fresh clone, and CI, run the weaker suite. **"Green" means one thing on a
machine that has fetched and a different thing everywhere else**, and nothing
in the pipeline closes the gap.

The skip is not silent, which is the part worth keeping. A complementary case
runs *because* the tier is missing and prints the remedial command — "a tier
nobody knows is missing is a tier that stays missing". That is the difference
between a check that is absent and one that is absent and says so.

## Decision

**Test data that is too large or too encumbered to commit is fetched by a
script, not vendored and not synthesised away.** `fixtures/` is gitignored and
`tools/fetch-test-audio.sh` fills it.

**Its absence is announced by a case that runs, never by a silent skip.** A
skipped block is invisible in a green summary; an inverted case that passes
only when the data is missing puts the gap in the output of every run that
lacks it. Any future fetched tier owes the same pair.

**The difference between the tiers is stated rather than hidden.** A suite that
is green without the recordings has proven less than the same suite with them,
and that is a fact about the claim being made, not a defect to paper over.

**CI stays on the weaker tier for now, deliberately.** Fetching third-party
audio on every run is a network dependency in the one place that must not
flake, and it would make an outage at someone else's host look like a broken
build. The cost is below and it is real.

## Consequences

The analysis chain acquires the kind of evidence 0008 asked for without the
repository acquiring a corpus it would have to carry, relicense and keep.
0008's first revisit trigger — "a corpus of real playing lands" — is now
partly met: the recordings exist and are reachable, and the constants it names
have still not been re-measured against them.

The pattern is set deliberately before the second instance, which is the
sample pack for playback, arrives and sets it by imitation.

### What this costs

**The strongest claim the project makes is the one least often run.** A real
recording through the real path is the evidence that matters, and it is
exercised only by whoever remembered to fetch. That is the opposite of the
usual arrangement, where the weak tests are the optional ones.

**CI cannot catch a regression in the recorded tier at all.** It is not that
CI might miss one; it structurally cannot see it, because those cases never
execute there. The announcement case keeps the gap visible and does not close
it, and nothing fails when somebody ignores it — which is the index's second
convention arriving by design rather than by accident.

**The corpus is unpinned.** `fetch-test-audio.sh` fetches by URL with no
checksum, so the bytes a test ran against last week are not provably the bytes
it runs against today. For a tolerance test that is mostly harmless and it
means a failure cannot be cleanly attributed between the code and the data.

**A fetched tier is a second definition of "the suite passes".** Two agents can
honestly report green and have run different things, which the fleet does
routinely. The announcement is the only signal that distinguishes them, and it
appears in output nobody quotes.

## Revisit when

- **The sample pack lands.** Second instance, and the moment to check whether
  one script and one `fixtures/` convention serve both or whether playback
  assets want their own.
- **CI is asked to run the recorded tier.** The trade above is a judgement
  about flakiness, not a principle; a cached or vendored-by-hash corpus changes
  it.
- **A recorded test fails and the data is suspected.** That is the unpinned
  cost arriving, and the answer is a checksum in the script rather than an
  argument about which version was fetched.
- **0008's constants are re-measured against real recordings.** The trigger
  that record is waiting on, now that the corpus it wanted is reachable.
