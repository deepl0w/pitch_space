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

## Addendum, 11 October 2026 — the other end of the same rule, and why `AudioIn` is required

### Too many notes is the same fault inverted

`intervalPlayed` filters to readable notes and destructures the first two,
discarding the rest. So a learner who plays the first note, hesitates, strikes
it again, then plays the second has produced three attacks and is **graded a
unison** — a confident wrong answer to a question they were halfway through
answering correctly, and it costs the streak.

The correction above says the test is *enough to grade* rather than *heard*.
**It needs its complement: unambiguous enough to grade.** Three attacks are
more than enough notes and do not say which two were the answer.

**The difference from the silence case matters, and it is the harder half.**
There, no bit could separate a silent room from an unreadable one — the
microphone genuinely cannot tell, so declining is the only honest move. Here
the information is present: the count is right there and the code discards it.
**That is a choice made silently rather than a limit of the world**, which
means whoever settles it has a real option and not a forced hand.

At least three resolutions are defensible — ignore repeated attacks on the
same pitch, refuse to grade an ambiguous take, take the first and the last —
and they differ in what a learner is told, which makes it a product question
rather than an implementation one. **Unresolved here deliberately**, and
pinned in the suite with the question named, so answering it turns cases red
rather than landing green.

### `AudioIn` is required on every prompt, and the obvious precedent is the wrong one

Seven prompts take it; one uses it. Recorded because the question has been
asked three times and its answer has only ever existed in messages.

**It is not [0029](0029-a-prompt-is-a-component-and-may-use-one.md).** That
record is about import direction — an exercise's non-component code must not
import `ui/` — and says nothing about whether a prop is optional. Reaching for
it here is an over-extension, and the real argument is better.

**Optionality would manufacture a branch in seven prompts that no user can
reach.** The screen always supplies the adapter, so every `if (!audioIn)` is
dead, untestable except by constructing a state the app cannot produce, and
permanently green. That is the index's eighth convention — a guard whose
population cannot contain a case — bought voluntarily and seven times over.

And the positive form: **which exercises can be answered by playing is a fact
about the exercise, not about the plumbing.** A prompt that ignores `audioIn`
is saying something about itself; it should not also have to ask whether
listening was available at all.

## Resolved, 11 October 2026 — refusal, and what actually decided it

The addendum above left the ambiguous take open and named three defensible
resolutions. It is settled: **`intervalPlayed` takes exactly two readable
notes and refuses otherwise**, and the prompt says *which* way a take was
unreadable rather than giving one message for every failure.

**What settled it came from the black-box role, and it is the kind of evidence
neither the record nor the suite could produce.** The ambiguity never reaches
the player: what comes back from a hesitation is identical in wording, tally
and tone to a confident clean miss. A learner who played the right interval
with a re-struck first note is told, in the app's ordinary voice, that they
were wrong — and given nothing to tell that apart from being wrong.

**Being exact about what that evidence establishes, because it is narrower
than the decision it was used for.** It kills *taking the first two* — the
behaviour that shipped — completely. It does not distinguish between the
remaining options: **ignoring repeated attacks on one pitch would also have
removed the reported symptom**, and would have graded the learner correctly
rather than refusing them, which is the friendlier outcome and was passed over.

Refusal is still the right call and this record does not reopen it. The
argument for it is the one this record's correction already made: guessing
which two notes somebody meant is the app claiming to know better than its own
input, and a wrong guess is indistinguishable to the learner from a wrong
answer. **An honest refusal is legible; a confident misreading is not.** That
reasoning stands on its own and did not need the symptom to support it.

**And the message was itself a false claim before this landed.** "I did not
hear two notes" was told to people who had played three. A refusal that
misdescribes the refusal is a smaller version of the fault the whole record is
about, which is why the prompt now distinguishes too few from too many.

## Addendum, 11 October 2026 — what the exactly-two rule rests on

The rule above has a dependency nobody saw when it was written, including
this record's author.

**A played unison is two attacks on one pitch**, which is precisely what
[0035](0035-an-onset-is-an-attack-a-note-is-a-decision-about-attacks.md)
accepts its merge rule may swallow: *"The same pitch struck twice quickly is
exactly what the cluster looks like."* If that hazard fired, a unison would
arrive as one readable note, `intervalPlayed` would refuse, and **the one
answer most exposed to the merge would become the one answer a learner cannot
give.** Refusing is the safe failure for an ambiguous take and the wrong
failure for a correct one.

**It does not fire, by a very large margin, and that margin is deliberately
not recorded here as a bound.** Mutation puts the merge threshold several
hundred times below where a re-pluck would collapse. But it was measured
against one synthesised pluck, and a margin obtained from a single source is
not a margin — 0035's own revisit list already names *a second instrument is
recorded* as its trigger, and that is exactly the moment this figure would
need taking again. Publishing it would invite a reader to treat it as a
property of real playing, which nothing has established.

**The dependency is what belongs in a record; the number belongs in the test
that holds it.** The person most likely to move that constant is working in
`audio/dsp/` on a detector question and has no reason to know that an interval
exercise's grading rests on it — `audio/dsp/` imports nothing above itself,
which is the constraint that makes the dependency invisible from the side that
could break it. The test fails if the constant moves far enough; this
paragraph is the pointer from the side that depends, and 0035 is deliberately
left alone, since a record about onsets should not have to know what exercises
exist.
