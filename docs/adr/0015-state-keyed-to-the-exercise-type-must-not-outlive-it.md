# ADR 0015 — State keyed to the exercise type must not outlive it

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

[`registry.ts`](../../src/exercises/registry.ts) says adding an exercise type is
"one import and one array entry, and nothing else in the app changes". That is
true of the registry and false of the screen, and the gap is the subject of this
record.

Genericity is what the seam bought: one `PracticeScreen` serves every type
because it knows `ExerciseDefinition` and nothing about intervals. The cost
nobody priced is that a generic screen holds state belonging to *a particular
type* while the type itself can change underneath it.

Three pieces of such state exist in
[`PracticeScreen`](../../src/ui/screens/PracticeScreen.tsx), and only one has
its lifetime tied to anything:

- **`round`** — the live question, `useState<Round | null>`. `definition` is a
  `useMemo` over the dropdown, so it changes at once; `round` does not. The
  `questionScore` and `answerScore` memos then run the *incoming* definition's
  functions against the *outgoing* definition's exercise, and `Prompt` renders
  with an exercise of the wrong type. It throws.
- **`session`** — `{ asked, right }`. No reset path either, so a tally carries
  across a type change and "7 of 9 this session" silently blends two different
  exercises. **This one does not throw, and nothing found it.**
- **the prompt's own internal state** — keyed `key={round.id}`, deliberately,
  with a comment explaining that remounting clears it without a reset path that
  has to be kept in step. That is the right instinct, applied to one of the
  three.

So the loud defect and the silent one have the same cause, which is why this is
a rule rather than a fix. The next type will bring its own instances: anything
the screen comes to hold about the current exercise is a candidate, and whoever
adds it will be following a registry comment that promises nothing else changes.

Separately, there is **no error boundary anywhere in `src/`**. A throw inside one
exercise's prompt takes the whole page, including the menu that would let the
user leave.

## Decision

**State keyed to the exercise type is discarded when the type changes, and the
mechanism is remount rather than reset.** The type's identity belongs in what
React keys on, so that changing type produces a fresh component with fresh
state. A reset path — an effect that nulls `round`, zeroes `session`, and
whatever the next field turns out to be — is a list that must be kept in step
with the state it clears, and the evidence above is that such lists are not kept
in step. The existing `key={round.id}` is the same technique applied one level
too deep; it should also be applied at the type.

Session counters are per type, because that is what the number means. A tally
spanning two exercises answers no question anyone asked.

**A failure in one exercise is contained, and what it shows is a bug report.**
An error boundary sits around the exercise — inside the chrome, not outside it,
so the menu and the type selector survive a prompt that throws and the user can
leave without reloading. What it renders includes **the seed**, because
generation is reproducible from `(seed, settings)`
([0002](0002-generation-is-reproducible-from-its-seed.md),
[0005](0005-seeds-are-minted-outside-the-core.md)) and a crash that names its
seed is a defect someone can reproduce exactly rather than a story about a blank
page.

## Consequences

The sixth exercise type cannot reintroduce the loud form of this, because the
screen will no longer carry a previous type's question into a new type's code.
It can still introduce the silent form if it adds per-type state outside the
remount, which is why the rule is stated as "keyed to the type" rather than as
"`round` and `session`".

Containment changes what a defect costs. Today a wrong assumption in one
exercise's `questionScore` blanks the app; afterwards it marks one exercise
broken and leaves the rest usable, which is also the difference between a user
who reports a bug and a user who closes the tab.

The registry's claim becomes true rather than nearly true. That is worth more
than it sounds: the claim is the reason the architecture is shaped this way, and
a seam that is cheap to extend but unsafe to switch between is not the seam it
advertises.

### What this costs

**Remounting throws away work that was not wrong.** Switching type mid-question
discards an unanswered exercise. That is correct — the question belonged to the
other type — but a user who switches by accident loses their place, and the
remount makes that unrecoverable rather than merely awkward.

**An error boundary makes a class of bug quieter.** A prompt that throws on
every render currently stops the app, which is the loudest possible signal and
guarantees it is found. Contained, it becomes one broken card among five working
ones, and a defect that only breaks the exercise nobody has opened this week
can survive a release. The boundary should therefore report, not only display —
and nothing in the app reports anything today, so "report" means the seed on
screen and the console, not telemetry.

**It is a rule about a screen, enforced by nothing.** Unlike the layering
boundaries in [0001](0001-a-pure-core.md), there is no test that can ask "is
this state keyed to the type". The regression test over ordered pairs of
exercise transitions covers the instances that exist; the rule for the ones that
do not is a convention, with the same failure mode every convention here has.

## Revisit when

- **The screen holds something per-type that legitimately should survive a
  switch** — a draft the user would be annoyed to lose, or a cross-exercise
  session total someone actually wants. That is the point at which "discard
  everything on remount" is too blunt and the state needs splitting rather than
  the rule bending.
- **A second error boundary is wanted.** One around the exercise is the obvious
  place; a second around the whole app changes what a failure in the chrome
  looks like, and that is a different decision about what a user sees.
- **Anything reports errors anywhere.** The boundary is written to show a seed
  because there is nowhere to send one. If that changes, what it collects should
  be decided deliberately rather than inherited from a placeholder.
