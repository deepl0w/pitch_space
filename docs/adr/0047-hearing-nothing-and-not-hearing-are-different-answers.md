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
