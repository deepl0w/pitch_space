# ADR 0047 — Hearing nothing and not hearing are different answers

- **Status:** Accepted
- **Date:** 2026-10-10

Settled before the first exercise depends on it, which is the only cheap time.

## Context

`AudioIn.listen(seconds)` resolves with `{ notes }`, and an empty list is what
arrives when a learner plays nothing. It is also what arrives when the
microphone was refused, when the device has none, and when capture failed part
way through. The seam was built this way deliberately, on
[0046](0046-a-sampled-pack-is-fetched-on-use-not-precached.md)'s model — a
graceful floor rather than a rejection — and the author flagged the risk
himself before anything consumed it.

**This is the tenth convention's shape and it is worse here than where that
convention was found.** An absent instrument pack degrades *presentation*: the
learner hears a synthesised piano instead of a recorded one, which is a worse
timbre and a correct exercise. A microphone that was never listening degrades
*measurement*.

[0007](0007-an-attempt-records-per-event-item-attribution.md), through
[0041](0041-practice-that-counts-towards-nothing.md), already says what an
outcome means: "an outcome is a claim that the user was asked **and that the
answer counts**". A learner whose microphone was refused was asked and their
answer was never heard. Recording it as wrong is a false claim of exactly that
kind, and it does not stop at one screen: a false outcome feeds `tallyItems`,
which resets `streak`, which lowers the item on the ladder, which drags the
figure the home card now shows. **A refused microphone across one session
would quietly undo a fortnight of a line's progress, and nothing on screen
would connect the two.**

## Decision

**`AudioIn` must be able to say that it was not listening, and an exercise
must not record an outcome when it says so.**

The seam carries the distinction, not the explanation. Which of the several
ways capture can fail, and what to tell the learner about it, stay where the
author put them: the screen is better placed to explain a refused microphone
than every prompt is, and nothing here moves that.

What the seam owes is one bit the exercise layer cannot otherwise obtain —
whether the silence is an answer. A result that is *either* the notes heard
*or* a statement that nothing was heard from, with the second not spelled as
an empty list. The field names are the implementer's; the constraint is that
**no value may mean both**.

**And the consequence is about recording rather than rendering.** A prompt that
cannot hear has not been answered. Under 0041's machinery the attempt may still
be written — "you practised for twenty minutes and the app has no idea" is the
worse answer — but it carries no outcomes, which is the shape 0041 already
built for practice that counts towards nothing. The difference is that there
the exercise *declares* it in advance and here it is discovered at the moment
of listening.

## Why this is not over-engineering a case that will rarely fire

Because the rare case is the expensive one, and because the project has done
this correctly once already and knows what it bought.

`ProgressStatus` is `'loading' | 'ready' | 'unavailable'` rather than a
nullable value, and [0006](0006-settings-in-localstorage-progress-in-indexeddb.md)
named the reason before it could happen: with two states a blocked store looks
exactly like a new profile, and the learner is told confidently that they have
practised nothing. That third state has cost almost nothing to carry and
removes a whole class of silent lie. This is the same purchase at the other end
of the same pipeline.

## What this costs

**Every prompt gains a case it would rather not have**, and most of them will
want to do the same thing with it. That is a real cost and the mitigation is
structural rather than disciplinary: the screen already grades the response and
writes the attempt, so it is the one place that can refuse to record, and a
prompt that forgets should be unable to produce an outcome rather than
producing a wrong one.

**It also removes the convenience the floor was built for.** A prompt can no
longer treat listening as a function that always returns something usable. That
convenience is precisely what
[0046](0046-a-sampled-pack-is-fetched-on-use-not-precached.md)'s addendum
describes as a place for faults to hide, so losing it here is the point rather
than a side effect.

## Revisit when

**Capture can report *why* it failed.** Nothing above needs a reason code, and
adding one later is additive — a richer failure value where a bare one stood.
The thing that would be expensive to add later, and is therefore settled now,
is the distinction itself.

## Correction, 11 October 2026 — the bit this record asked for is necessary and not sufficient

The implementation and this record disagree, and **the implementation is
right.**

A take that was heard but held fewer than two readable notes leaves the
question open rather than grading it. This record implies otherwise: it asks
the seam for "one bit the exercise layer cannot otherwise obtain — whether the
silence is an answer", and treats everything on the *heard* side of that bit as
an answer.

**There are three states, not two, and the third is indistinguishable from the
one this record wanted graded.** Fewer than two readable notes is produced both
by a learner who played nothing and by a learner whose playing could not be
read — too quiet, too noisy, notes overlapping, a detector that declined. The
first is an answer and the second is a failed measurement, and **no bit the
seam could carry would separate them, because the microphone genuinely cannot
tell.**

So `heard: true` is necessary before an outcome may be recorded and it is not
sufficient. The rule this record should have stated is about **evidence rather
than hearing**: an outcome may be written only when the take yields enough to
grade. Leaving the question open otherwise is what the implementation does and
it is correct.

**The consequence is worth naming rather than discovering.** Silence cannot be
marked wrong through capture — not as a policy choice but because the signal
does not exist. If "you did not play" should ever count as an attempt, it needs
a different source: a deadline the learner can see, decided above the seam. It
cannot be recovered from the audio.

**This is the tenth convention arriving on the record that was written to apply
it**, which is worth more than the fix. That convention is about a *type* that
cannot state a distinction; here the type is fine — `Heard` carries its bit
honestly — and the **world** cannot supply the distinction the record assumed.
I checked that the seam could say whether it heard, and never asked whether
hearing was the thing that mattered. The remedy is the same one: ask what two
different situations would look like. A silent room and an unreadable one look
identical, and no amount of interface design changes that.
