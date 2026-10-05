# ADR 0031 — A control may not resolve a contradiction it is still displaying

- **Status:** Accepted
- **Date:** 2026-10-06

Generalises [0017](0017-a-setting-that-excludes-is-not-a-corpus-you-cannot-reach.md)
from one setting to the settings layer, after the same fault was fixed twice
and came back the second time wearing the fix.

## Context

Within four accidentals, A♭ exists as a major key and not as a minor one. So
a tonic list beside a mode switch can be asked for a combination that cannot
be built, and the app has to do something. It did two things, in order, and
both were wrong in the same way.

**First it widened.** `keysIn` returned the whole pool when the chosen tonics
selected nothing, so ticking one tonic handed the learner every key — not a
weaker version of what was asked but its opposite, which is the fault
[0017](0017-a-setting-that-excludes-is-not-a-corpus-you-cannot-reach.md)
already named when two generator flags promised exclusion and delivered
non-addition.

**Then it overrode.** The tonic won and the mode gave way, so A♭ with minor
selected gave A♭ major. Better — one key rather than twelve, and the result
is recognisably adjacent to what was asked. Still wrong, and the user role
said why in one sentence: *"Minor stays visually selected the whole time with
nothing indicating the override."* The app had decided, correctly, and then
displayed the opposite of its own decision.

That is the shape worth recording. A silent resolution is not a bug in the
resolution; **it is a disagreement between the screen and the behaviour**, and
every improvement to the resolution leaves it intact. The second fix was
better than the first and the lie was the same size.

## Decision

**If two controls can contradict each other, the pair is not offered.** A
control's state must be true of what the next question will be. Where one
control constrains another's choices, the constrained choices are a function
of the settings and the impossible ones are absent — not present-and-ignored,
not present-and-overridden.

[`SettingField`](../../src/exercises/types.ts) carries this as
`options: readonly SettingOption[] | ((settings: S) => readonly SettingOption[])`.
A static list is still a list, so a field with no such coupling is unaffected.

**Three mechanisms now answer one question**, and the question is what a
control owes the user about what it will do:

| Mechanism | When the control cannot affect the question |
| --- | --- |
| `relevant?: FieldRelevance<S>` | the whole field is inert — hide the field |
| `options: (settings) => …` | one choice within it is impossible — hide the choice |
| [0017](0017-a-setting-that-excludes-is-not-a-corpus-you-cannot-reach.md) | the switch is live but only half-acting — make it exclude |

**Hiding is preferred to erroring.** An empty state saying "no keys match" is
honest and leaves the learner in a dead end they did not ask for and cannot
read their way out of. A chip that is absent cannot be chosen and cannot
mislead, and the cost is that it went without explanation — which the costs
below take seriously.

## Consequences

The settings panel's invariant becomes statable and therefore testable: what
is on screen is true of what will be asked. The inert-control findings, the
tonic widening and the tonic override all become instances of one rule rather
than three unrelated fixes, which is the difference between a convention and
a thing a reviewer can check.

### What this costs

**The app stops teaching the thing it is hiding.** A♭ minor is seven flats and
beyond this exercise's range — that is a fact about music, in a music
education app, and the decision above removes the chip rather than saying it.
Hiding is the right default because an unexplained absence is cheaper than an
unexplained override, but "absent with no reason given" is a worse answer than
"present, refused, and explained" would be if anyone built the explaining
version. This record does not.

**Chips that appear and vanish are their own confusion.** A learner who
switches to minor and watches three tonics disappear has been told something
by the interface, and it is not obvious they will read it as "those are
impossible here" rather than as a glitch. A control changing shape when you
touch a different one is disorienting even when it is correct.

**Options-as-a-function makes a cycle expressible, and nothing forbids one.**
A field whose options depend on a second field whose options depend on the
first is now a thing the type permits. It would not diverge — each is
evaluated once per render against the current settings — but the result is
order-dependent and would be very hard to reason about. Nothing checks for it.

**It pushes work into every future field.** The author of the next coupled
control has to notice the coupling. The rule is in the type and the comment,
which is better than prose alone, but `options` being a union means the easy
path is still a static array, and the easy path is the one that was wrong both
times here.

## Revisit when

- **A third field needs settings-dependent options.** Two is a pair; three is
  the point at which the coupling wants declaring — which field constrains
  which — rather than each function knowing on its own.
- **Someone proposes explaining instead of hiding.** The costs above say the
  explaining version is better if it exists. That is a real design job and a
  reversal of the default, and it should be argued with a screen rather than
  in the abstract.
- **A cycle appears, or a field's options depend on a field that is itself
  hidden by `relevant`.** Either is the mechanism meeting itself, and neither
  has a defined answer today.
