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

## Addendum, 18 October 2026 — a better reason, which the source found first

This record argues for one context from cleanup: a second produces scheduled
notes `stopSound` cannot reach, with the drift incident as evidence. That is
true and it is the weaker half.

**[0014](0014-one-clock-and-the-latency-nobody-can-measure.md) has the
stronger one.** Its Decision reads: *"**One clock: `AudioContext.currentTime`.**
Every time that is compared with another — scheduled playback, the expected
grid, a captured attack, the moment an item became answerable — is expressed
in it."*

**The step from that to one context is an inference and is this record's, not
0014's.** 0014 says one clock and names which; it does not say "one
`AudioContext`" anywhere. But `currentTime` is a property of a particular
context, and two contexts have two unrelated origins — so a captured attack
and a scheduled note can only be compared if they are timed by the same one.
**Capture therefore cannot mint its own; the only way to share the clock is to
be handed the context.**

That is a correctness argument rather than a tidiness one, and it reaches
further: cleanup explains why a second context is a nuisance, and the clock
explains why a second context makes every judged comparison meaningless.

**Worth saying where it came from.** The reasoning arrived in a source comment
in `audio/output/synth.ts` and not in this record — the usual direction this
week has been a record correcting the source, and here the source had the
better argument and the record did not. Checked against 0014 directly rather
than taken from the comment or from the message reporting it, which is the
only reason it is quoted here rather than paraphrased.

## Correction, 18 October 2026 — there are two contexts, and this record's title is wrong

**The Decision says "One `AudioContext`, constructed in one module". The app
constructs two during a take, on purpose, and has done all along.**

`src/audio/capture/microphone.ts:75` does `new AudioContext()`, with its
reason stated above it and measured: the synth's context exists to play, may
be suspended, and may run at a rate chosen for output, where capture wants
whatever the device gives. Reading the wrong rate puts every pitch out by
147 cents.

**What is true, and what this record did instead.** The guard enforces that
`new Synth()` appears in one place, which makes the **output** context single.
This record read that guard and wrote down a larger claim than it supports —
*one context for the app* rather than *one context behind the synth*. That is
the third cause of mis-citation catalogued last week, committed here against
a guard instead of against a record: **crediting a mechanism with a stronger
claim than it makes.** The title carries the error and ADRs are not rewritten,
so the index row says so.

**The addendum I added this morning is contradicted by the same line.** It
inferred from 0014's one-clock decision that *capture cannot mint its own
context; the only way to share the clock is to be handed it*. Capture does
mint its own, deliberately, for a reason measured on a real device — which is
better evidence than my inference. I reached for 0014 as a stronger argument
and did not read the file it was an argument about.

**`synth.audioContext` has no production reader.** It is documented as *"The
one `AudioContext`, for the capture layer"* and nothing consumes it;
`measureLatency.ts:124` says in terms that it uses `prepare` *rather than*
reading it. So the sharing that comment describes does not happen anywhere.

## What is open, stated rather than resolved

**Whether 0014's one clock is satisfied today.** It is, for the exercises that
exist, and not for a reason anyone chose: a `PlayedNote`'s `startSeconds` is
*seconds from the start of listening*, so capture reports take-relative times
and nothing compares a captured absolute moment with a scheduled one. Two
unrelated `currentTime` origins cost nothing while nothing spans them.

**That changes the day a performance is aligned against a grid.** Rhythm
answered by playing is exactly that comparison, and it is the first thing that
would need the two contexts reconciled — or need the alignment to stay
entirely inside the take. Whoever builds it should decide which, and this
record should not pre-empt it from a position of having just been wrong about
the same subject.

So the honest scope of what is guarded is **one output context**, and the
second context is deliberate, measured, and currently harmless.
