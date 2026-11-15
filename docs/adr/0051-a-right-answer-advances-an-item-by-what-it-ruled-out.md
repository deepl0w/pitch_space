# ADR 0051 — A right answer advances an item by what it ruled out

- **Status:** Accepted
- **Date:** 2026-11-15

Settles the constraint [0037](0037-a-schedule-is-per-presentation-and-the-home-screen-is-not.md)
has carried since 6 October: a streak could not tell a correct answer out of
thirteen alternatives from one out of two, so narrowing a pool made a streak
cheap. Built in `d268562`.

## Context

The ladder advanced a streak by one for every right answer, whatever the
answer cost. Two consequences, the second of them sharp.

**A narrow pool bought spacing on evidence that barely supported it.** An item
answered correctly out of two alternatives sat on the same rung as one
answered out of twelve, and the schedule then rested it for the same fortnight.

**A pool of one reached the top by clicking.** 0037's own addendum put it
plainly: the sole button is the answer, a learner can press it repeatedly, and
the mechanism cannot tell. That is not weak evidence; it is none, recorded as
mastery.

**What the outside offers, and what it does not.** Item response theory's
three-parameter model carries exactly this quantity — a pseudo-guessing
parameter sitting near `1/k` for a *k*-alternative item — but it lives in
assessment rather than scheduling, and the schedulers in use do not model it at
all, because an Anki-style review is free recall followed by a self-grade and
nothing is ever chosen from a list. Published work joining IRT to a memory
model uses the two-parameter form, which has no guessing term.
[`2026-11-06-guessing-and-the-answer-pool.md`](../research/2026-11-06-guessing-and-the-answer-pool.md)
has the sources, and the useful negative: the testing-effect literature does
**not** support counting a played answer for more than a clicked one, which
was the other intuition available.

**The user ruled on 15 November**: advance less when guessing was easy. What a
score means is theirs by [0036](0036-one-question-two-windows.md)'s precedent,
and this record implements rather than decides it.

## Decision

**An outcome carries `chance`, the probability that a guess would have landed,
and a right answer advances the streak by `1 - chance`.** A miss still resets
to zero. `guessChance(offered, right)` is `right / offered`, clamped, and
reads as certain for an empty list so nothing divides by zero.

**The chance comes from the answer space, never from the askable set.** This
is the one trap in the change and it was named before the work began: twelve
intervals asked in both directions are twenty-four askable items and twelve
buttons, and the buttons are what a guesser faces. Taking `askable.length`
would have understated how cheap a guess was by the number of directions, and
`askable` is the number the scheduler has to hand.

| exercise | offered | right |
| --- | --- | --- |
| interval, key, degree | the buttons | one |
| scale | the buttons | every button naming the same sound |
| chord | qualities × inversions, when the bass is asked too | one |
| progression | the palette, per slot | one |
| rhythm | — | tapped, not picked, so no `chance` at all |

Scale is the one that needs its own rule: a falling melodic minor is the
natural minor's notes, so two buttons are right and a guess is twice as likely
to land.

**A rung is earned only when the evidence for it is whole.** `restFor` takes
`Math.floor(streak)`, so a fractional streak rests at the rung below until it
completes. `completion` uses the fraction directly, because a reading is a
proportion rather than a rung.

## Consequences

Measured, rather than reasoned, from `guessChance`:

| pool | advance per right answer | right answers to the top rung |
| --- | --- | --- |
| one button | 0 | never |
| two | 0.5 | 14 |
| twelve | 0.917 | 8 |
| twelve, two of them right | 0.833 | 9 |

**The pool of one is closed by arithmetic rather than by a special case.**
`1 - guessChance(1)` is zero, so the sole button builds nothing, and no rule
anywhere names that situation. That is 0037's constraint resolved rather than
mitigated.

**Narrowing a pool now costs roughly what it saves.** Practising two intervals
instead of twelve still makes each question easier, and it now takes nearly
twice as many right answers to earn the same rest — which is the user's ruling
expressed as a ratio rather than as a preference.

**Old rows count in full, and the schema did not have to move.** `chance` is
optional on the outcome, so `AttemptV5` is structurally `AttemptV4` and the
migration is a no-op. An answer recorded before anyone asked how many buttons
there were is credited as it always was, which is the honest reading: nothing
is known about its pool, and inventing one would be worse than crediting it.

**What this does not do, and the reason is sharper than the decision.** It
does not weight a played answer above a clicked one — that was available, the
user declined it, and the testing-effect literature does not support it. But
the record first said a played answer "has no `chance` at all", and that is
**false**: an interval or a scale answered on the instrument goes through the
same `onRespond` and the same grader as a tap, and `gradeInterval` sets
`chance` from `choices.length` either way. Played and clicked answers are
credited *identically*.

**The grader cannot tell them apart, which is what actually enforces the
decline.** `IntervalResponse` is `{ semitones, latencyMs? }` and
`ScaleResponse` is `{ typeId, latencyMs? }`; neither carries where the answer
came from, and the prompt's own comment says a played take is "graded and
recorded exactly as a tap would be". So weighting is not declined at grading
time — it is unavailable there, by the shape of the seam.

Rhythm is the only exercise with no `chance`, and not because it is played:
it is *tapped against a written figure*, with no list of alternatives for a
guess to land in.

Caught by main, who read the graders while reviewing this record. The
paragraph was the one claim here reasoned from the design rather than read off
it — a played answer has no list, therefore no chance — and the reasoning was
sound about the world and wrong about the code.

## Revisit when

- **An exercise is answered from a list whose size the grader cannot see.**
  Every `chance` here is computed where the buttons are known. A future prompt
  that offers choices without telling the grader how many would silently
  advance in full:

  ```bash
  grep -rln 'guessChance(' src/exercises | sort
  ```

- **A pool's size stops being the whole of its difficulty.** Twelve
  near-identical alternatives and twelve obvious ones give the same `chance`
  and are not the same question. 3PL estimates its guessing parameter per item
  from response data for exactly that reason, and this app computes it from
  the list instead — cheaper, exact about the arithmetic, and blind to the
  distractors.
- **Anyone proposes weighting played answers.** The Consequences above decline
  it on the evidence; that is a judgement about this app's purpose and the
  user may take it, but it should be taken knowingly rather than argued from
  the testing effect. **It is also not a one-line change**: the response
  carries no source, so the first step is making a grader able to tell a
  played answer from a tapped one at all.

  ```bash
  grep -n 'interface IntervalResponse' -A5 src/exercises/interval-id/intervals.ts
  ```
