# ADR 0049 — One AudioContext, owned by one module

- **Status:** Accepted
- **Date:** 2026-10-12

Records a constraint the app has held since early on, has a guard for, and
has never had a record for — which is why source has been citing a record
that says something else.

## Context

There is one `AudioContext` for the whole app. **A second is not a duplicate**;
it is a second set of scheduled notes that `stopSound` cannot reach.

That is not hypothetical. `src/ui/sound.ts` carried the invariant as a
comment — *"one AudioContext for the whole app; creating a second is how you
get drift"* — and the practice screen, fourteen files away, constructed one
anyway. An interval kept playing over the home screen after the learner
navigated back. The guard that now exists records the lesson in one sentence:
**the comment was the invariant and nothing enforced it, which is the only
reason it could be broken by someone who had read it.**

## Decision

**One `AudioContext`, constructed in one module, and `new Synth()` appears in
exactly one place.** `src/architecture.test.ts` enforces the second, which is
how the first is reached: the context lives behind the synth and the synth has
one owner.

**This record adds no enforcement and is not meant to.** The test is stronger
than a record and came first. What was missing is something true for source
and documents to cite, which is a real absence rather than a tidiness
complaint — see below.

## Why this was never recorded, which is the part worth keeping

`src/audio/output/synth.ts` says *"ADR 0005 says there is one context"*.
**[0005](0005-seeds-are-minted-outside-the-core.md) is *Seeds are minted
outside the core* and contains the string `AudioContext` zero times.** No
record in `docs/adr/` made the one-context claim at all until this one;
checked by grep rather than by recollection.

**This is not a citation written from memory**, which matters because the
obvious remedy does not reach it. A planning document proposed an ADR 0005 —
*one AudioContext, scheduled output, suppression windows instead of echo
cancellation* — and when records came to be written that number went to the
seeds decision instead. The citation is **inherited from a plan that was
authoritative when it was written and stopped being so**, and reading the
number back from that plan would have confirmed it.

So a reader following the most load-bearing audio citation in the source
arrived at entropy and `randomSeed()`. The mis-citation survived because
0005 exists, is in range, and is adjacent in subject — the same property that
makes a wrong-but-real reference pass every check a dangling one fails.

## Consequences

**The source citation is now true where it points here**, and the ones that
should point at enforcement rather than at a record point at
`architecture.test.ts`. `synth.ts` has not been changed by this record's
author; a source edit to someone else's comment is not a documentation task
and the line is older than this exchange.

**A proposed-numbering document outlives the numbering.** The plan that
assigned 0005 to the audio decision is not in the tracked tree — searched for
and not found, so this record does not say where it is or what else it
assigns. If it exists in a checkout, its numbers mean nothing now, and
anything citing it is citing a map of a repository that was never built.

## Revisit when

**A second context becomes necessary** — an `OfflineAudioContext` for
rendering, for instance, which is a legitimate second context and not a
second output. The guard counts `new Synth()` rather than contexts, so that
case would pass it; this record is where the distinction should be argued if
anyone needs one.

## Correction, 12 October 2026 — this record quotes a document nobody can open

The section above asserts a cause: *a planning document proposed an ADR 0005
— one AudioContext, scheduled output, suppression windows instead of echo
cancellation — and when records came to be written that number went to the
seeds decision instead.* It gives that in quotation marks and states it
flatly.

**It is reported, not verified, and two sessions have now failed to find the
document.** It came from main, in good faith and plausibly; this record's
author searched the tracked tree for the quoted title and for ADR numbers
across the repository, and a process session searched its own checkout
including the git-ignored directories. Three hits between us, all ordinary
citations. The quotation above is a quotation of a message, not of a plan.

**What is verified and stands unchanged**: 0005 is *Seeds are minted outside
the core* and contains `AudioContext` zero times; no record made the
one-context claim before this one; `synth.ts` cites 0005 for it; and the
constraint is real and guarded. None of that depends on why the number went
wrong.

**What is not**: that a planning document is the reason, what it said, and
whether it still exists anywhere. If it is found, the Consequences section
above can be settled; if it is not, the honest position is that the cause is
unknown and the inherited-numbering story is the best available account
rather than the established one.

**The irony is the point and is cheaper to state than to leave for a reader
to notice.** A record about a citation that resolves to the wrong real thing
contains, two paragraphs later, a quotation sourced from a document nobody
can open — written by the session that had spent the day cataloguing exactly
that. The remedy this document arrived at was *verify a citation against what
it points at, not against where you got it*, and the author applied it to
0005 and not to the sentence explaining 0005.
