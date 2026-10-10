# ADR 0040 — Completion replaces the score

- **Status:** Accepted
- **Date:** 2026-10-07

Records the user's ruling that a line reports how far it has been completed
rather than how many answers were right, and what that retires.

## Context

> Score is not important; what is important is spaced repetition.

The user wants a grade expressing how far a **line**
([0039](0039-a-line-is-an-exercise-and-the-items-its-settings-make-askable.md))
has been completed: failed questions recur, correct ones get rarer, and the
figure says how much of the line is done rather than how much of it was right.

The code has the other model. `ItemTally` carries `seen` and `correct`, the
readout prints "2 of 4 right", and the practice screen shows a session count
beside a lifetime count. Those are tallies of answers, and a tally of answers
is exactly what the user says is not the point.

## Decision

**A line's grade is a function of how far its items have advanced, not of how
many answers were right.** Completion is read from the schedule's own state —
how long each item's interval has grown — because that is the thing spaced
repetition is actually moving, and it already exists in `dueAt`'s ladder.

**A right answer is not progress on its own.** It lengthens an interval; the
interval is the progress. That is what makes a correct answer out of one choice
worth nothing on its own — it advances an item in a line that contains one item,
which is true and visibly small, rather than inflating a count that looks the
same as any other.

**`seen` and `correct` stop being what a learner is shown.** They stay in the
tally, because the schedule needs to tell a lapse from a first attempt and
`streak` is computed from the sequence. What changes is that no screen reports
them as a score.

**The session and lifetime counts are retired by this rather than relabelled.**
They read as two unlabelled clocks and
[0037](0037-a-schedule-is-per-presentation-and-the-home-screen-is-not.md)'s rule
would have made them name their scopes. Under this decision they do not get a
scope word; they get replaced, because a count of answers is not the quantity
anyone was asking for. `roadmap-readiness.md`'s G4 consolidation was right that
the three surfaces are one decision, and this is that decision rather than a
fourth site.

## Consequences

The home screen's figure becomes a completion rather than a count, which is
what the roadmap asked for when it said a due count should be honest with no
streaks and no manufactured urgency. A completion cannot be inflated by
answering easy things repeatedly, because the interval ladder is what moves.

### What this costs

**Completion is a number about a schedule, and the schedule is not wired.**
Everything here describes a figure read from state that no production code
produces yet. The decision is cheap now for that reason and is also, for the
same reason, untested against any real session.

**A learner loses the one number they currently get.** "7 of 9 this session" is
legible and immediate, and a completion grade on a line is neither until the
line has history. The first session shows nothing moving, which is the honest
state and a worse opening than a tally.

**It makes completion depend on the interval ladder**, which
[0037](0037-a-schedule-is-per-presentation-and-the-home-screen-is-not.md)
already notes is a fixed `INTERVALS_MS` rather than SM-2's ease. Tuning the
ladder now changes everyone's displayed grade, not just their due dates — a
coupling that did not exist when nothing read it.

**"Done" needs a definition and this record does not give one.** Whether a line
is complete at the top of the ladder, or at some interval short of it, or never,
is a product question. The constraint is only that the answer is about
intervals rather than about counts.

## Revisit when

- **The first completion figure is drawn.** The definition of done is owed then
  and is the user's, not this record's.
- **The ladder is tuned or replaced.** It now has two readers, and a change that
  was a scheduling adjustment becomes a visible re-grading of everybody.
- **A learner asks what their score is.** If the answer has to be a count after
  all, this decision was wrong and should be superseded rather than softened.

## Addendum, 7 October 2026 — there is no done

The Decision above says what a line's grade is read from and leaves "done"
open, as the user's. They have answered it, and the answer removes the question
rather than settling it:

> There is no done, exercises will always come — but if there are no wrong
> answers consistently then there is a high cap. Maybe some colouring from red
> to green.

**A line has no terminal state.** It is not a progress bar with an end, and
nothing is ever finished. An item answered correctly for long enough earns a
long interval, not an exit — which the schedule already has as
`MAX_INTERVAL_MS`, the top of the `INTERVALS_MS` ladder, reached rather than
passed.

**So the figure is a state, not a fraction**, and that is why a colour is the
right form for it. A percentage implies a denominator and an end; a hue from
red to green says how well a thing is currently known and says nothing about
arriving anywhere. It is also the form least able to be mistaken for a score,
which is the whole of this record's subject.

**This firms up what the colour should be a function of.** The research note
for today identifies *retrievability* — the continuous probability of recall
now, decaying between reviews — as the quantity FSRS uses and the one this
record was reaching for. It maps onto a red-to-green scale directly, with no
threshold to choose and no definition of done required, which is what the
user's ruling asks for. A line's own colour is then the aggregate of its
items', with the same property: it drifts back towards red while nobody
practises, because that is true.

**What this costs is that nothing is ever achieved.** A learner who wants to
finish something will not find anything to finish, and "it goes green and stays
green while you keep turning up" is a harder thing to feel good about than a
bar reaching the end. That is the honest model of memory and it is a worse
motivational design, which the user has chosen deliberately and should be
reminded they chose if it ever feels like a defect.

## Correction, 7 October 2026 — the addendum above is stronger than its source

Main asked where the ruling came from, having not seen it. The answer is that
the user sent it to the architect session directly, on 6 October, and this is
it verbatim, punctuation and spelling as typed:

> there is no done, exercises will always come but if there are no wrong
> answers consistently then there is a high cap (maybe some coloring from red
> to green)

**Set beside what the addendum quotes, the quotation is the first error.** A
parenthetical aside — `(maybe some coloring from red to green)` — was rendered
as a standalone sentence, *Maybe some colouring from red to green.*, and
anglicised. Neither change was meant and together they promote the weakest
clause in the message to the same footing as the rest. A quotation in a record
is evidence; tidying it is editing the evidence.

**So the colour is a suggestion and this record treated it as a decision.**
"Maybe" is the user's own hedge. What the addendum goes on to build — that a
hue is the right form because a percentage implies an end, that retrievability
is what it should be a function of, that a line's colour is the aggregate of
its items' — is sound reasoning and remains worth having, but it is *this
record's argument for the user's suggestion*, not a thing they settled. ADR
0042 inherits the overstatement where it says "the reading is a colour".

**"A high cap" was ambiguous and the addendum picked a reading silently.** It
can mean a cap on the review interval, which is what `MAX_INTERVAL_MS` already
is and what the addendum assumed; or a high ceiling on the reading itself, so
that sustained correctness approaches a maximum it never quite reaches. Those
differ in what is being bounded and the message does not choose between them.
It needs asking rather than inferring.

**What is unambiguous and does stand as a ruling** is the first clause: there
is no done, and exercises keep coming. That is what closed this record's open
question, and nothing above weakens it.

**The general fault is worth naming because it is not the one anyone was
watching for.** The index's conventions all point at claims about the code, and
this project has got good at checking those. A claim about what the *user*
wants has no equivalent — it cannot be grepped, no test turns red, and the only
person positioned to contradict it is the one being quoted. On a day with four
corrections of exactly this shape, a claim travelling one step further than its
evidence, it travelled furthest in the one place nothing was looking.

## Addendum, 8 October 2026 — what the colour would have to clear

Not an answer to the open question above, which is still the user's. While it
was open, three uses of the same two hues turned up within two days, and
[`docs/colour-as-a-reading.md`](../colour-as-a-reading.md) collects what they
imply.

The short version, because it bears on whether the suggestion is cheap: `--right`
and `--wrong` already exist and already mean *this answer, just now, was
correct*. A retention reading in the same hues makes a second claim over a
different time span, and the two can disagree in front of the learner — a line
decayed to red beside a green verdict on a correct answer to one of its items.
Both honest, and together they teach that the colour means nothing in
particular.

The app also has a rule about this, written as a CSS comment and kept
everywhere by habit: a verdict that is only a hue is no verdict at all to a
colour-blind user. A binary verdict pairs with a word for free. **A continuous
gradient has no natural word**, which makes the proposed reading the first case
that strains the rule rather than following it.

None of that argues against the suggestion. It says the suggestion needs a
second visual channel and a separation from the verdict, and that the rule it
strains should stop being a comment.

## Correction, 11 October 2026 — "a high cap" bounds the reading, not the interval

The addendum of 7 October read the user's "high cap" as a cap on the review
interval and said so: *"An item answered correctly for long enough earns a long
interval, not an exit — which the schedule already has as `MAX_INTERVAL_MS`."*
The correction beneath it flagged that the phrase had two readings and that
this record had picked one without saying it was picking.

**It picked the wrong one.** Asked directly which of the two it bounded, the
user answered: *"high cap is colour ceiling"*.

So the cap is on **the reading itself** — a ceiling the state approaches and
never reaches. `MAX_INTERVAL_MS` is a separate mechanism, untouched by this and
still the top of the `INTERVALS_MS` ladder; it simply is not what the user was
describing.

**This is what makes "there is no done" coherent rather than merely stated.** A
hue that can arrive at full green is an end by another name: a learner would
reach it, see nothing further to gain, and have been given the completion this
record exists to refuse. A ceiling short of the top is how a state says *as
well known as this gets* without saying *finished*.

**It also strengthens the colour, without settling it.** The question put was
which of two things the cap bounded; the answer names a colour ceiling, which
presupposes the colour rather than ruling on it. That is better evidence than
the original "maybe" and it is still not a decision, and this record has
already been corrected once for treating the user's hedge as more than it was.

## How this was nearly lost, which is worth as much as the ruling

The user gave this on 7 October to a session that had already ended. Main wrote
it into `docs/IN-FLIGHT.md` rather than holding it, naming the architect to
fold it in — the right move, and the protocol working exactly as intended.

**It then sat for four days while the architect reported the question as still
open to the user.** The entry was titled for the architect, synced into the
architect's worktree every session, and read past: an audit of that same file
three sessions later checked four other entries and not this one. A message
would have been delivered to a session that no longer existed; the repository
held it and the only thing missing was somebody reading their own name.

That is the standing argument for writing a ruling down rather than carrying
it, and the standing argument against assuming a synced file has been read.

## Clarification, 11 October 2026 — which reading the ceiling is about, and one the record has not reconciled

The correction above says the cap is "on the reading itself". **There are now
two readings and it does not say which**, which is the fault it was written to
correct, committed again one paragraph later.

**The ruling is about the colour, which does not exist yet.** The user's words
name one — *"high cap is colour ceiling"* — and a colour is not a quantity this
app currently computes. So nothing in `completion` is contradicted by it and no
test pinning `completion` is wrong.

**`completion` is a different thing and should be described as one**: the
fraction of the ladder its items have climbed. It reaches exactly 1 when every
item sits at the top rung, deliberately, and `schedule.test.ts` pins that. A
fraction that tops out is the right shape for *how far up the ladder this line
is*; it is not the shape the user described for a colour.

## The gap this exposes, which is not the tester's and not the colour's

**`completion` reaches 1 and stays there, and nothing in it decays.** It takes
no clock. `streak` increments on a correct answer and resets only on a wrong
one, never with elapsed time. So a line whose items all reach the top rung
reads 1 permanently, and a learner who stops for a year still reads 1.

**That is a completion state, and the addendum of 7 October says there is
none.** The two halves of this record have not been reconciled in code: the
Decision — a grade read from how far items have advanced — is implemented
faithfully, and the addendum that followed it is not. `completion` predates the
ruling and nobody has gone back.

It is also the second time this record's own reasoning has gone unimplemented.
The addendum argues that a line's reading should "drift back towards red while
nobody practises, because that is true". Nothing drifts. That property belongs
to retrievability, which the research note identifies and which this app does
not compute.

**This record does not resolve it, deliberately.** What a learner is shown when
they have done everything right and then stopped is a product question, and the
one open question that remains here — whether the colour is a decision or still
a maybe — is the same question wearing different clothes. Changing `completion`
on an architect's reading of an addendum would be inventing the answer. What is
owed now is only that the record stops describing behaviour the code does not
have.

## Resolved, 12 October 2026 — both halves, and my drift argument was wrong

The user, verbatim: *"time off shouldn't change the scores (if you lost the
skills it will show in your answers and reduce the scores), colors from red -
bad to green -good, no completion"*.

### The colour is settled and is no longer a maybe

Red for bad, green for good, and **no completion**. Taken with the ruling of
7 October that the cap is a ceiling on the reading, the scale stops short of
pure green — because pure green is where an eye stops reading *better* and
starts reading *finished*, which is the thing this record exists to refuse. A
percentage is worse still: it has a hundred in it.

This record carried the colour as a *maybe* for five days, correctly, having
been corrected once for treating the user's hedge as a decision. It is a
decision now and the earlier caution was not wasted — it is why the question
was still open to be answered rather than assumed into the code.

### Time off does not move the reading, and the reason overturns mine

The addendum of 7 October argued that a line's reading should "drift back
towards red while nobody practises, **because that is true**". **That was
wrong, and the user's reason is better than my argument.**

If the skill has gone, it shows in the answers and the reading falls on its
own. Decaying a figure by elapsed time is the app **inferring** a loss it has
not observed — and this project already has that principle, from the other end
of the same feature: [0047](0047-hearing-nothing-and-not-hearing-are-different-answers.md)
refuses to guess which two notes a learner meant, on the grounds that guessing
is the app claiming to know better than its own input. A clock-driven decay is
the same claim about a learner's ability. **Measure it; do not predict it.**

So `completion` reading only the answer history and never the clock is correct
and always was. The two halves this record was recorded as having left
unreconciled are reconciled from the user's side, and the half that needed
changing was the prose rather than the code: **sticky at the top is right,
and what was wrong was a reading that could arrive at all.**

**The tester's pin turns out to have been pinning the right behaviour**, which
is worth saying because it was written explicitly as *the behaviour that
exists, not the one that should*. Holding an unendorsed behaviour until
somebody with standing settles it is the move that let this be answered rather
than quietly changed — had the drift argument been built on my say-so, the
user would have been shown a reading that lied about them.
