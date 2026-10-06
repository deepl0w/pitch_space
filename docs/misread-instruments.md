# When a finding is a fact about the instrument

A catalogue of findings this project got wrong in one particular way: the
measurement was true and the conclusion drawn from it was about the
measuring rather than about the thing measured — and, in the last section, the
reverse: a true finding killed by a check that could not fail.

The rule is the fifth convention in
[`docs/adr/README.md`](adr/README.md); this is the evidence for it and the
accounts of how it felt from inside. It is kept here because the catalogue has
grown four times in a day and the rule has not, and a reader wanting the rule
should not have to read the cases to find it.

**The question to ask, which is the useful form of all of this: _what else
changed when I changed the thing I was testing?_** It is a question with an
answer rather than a disposition to be more careful, and it came from the role
that got this wrong twice in one day from the harness side.

## Contents

- [The clearest case, and it owes the convention nothing](#the-clearest-case-and-it-owes-the-convention-nothing)
- [The catalogue](#the-catalogue)
- [Three accounts of how it felt](#three-accounts-of-how-it-felt)
- [A reproduction attempt is an instrument too](#a-reproduction-attempt-is-an-instrument-too)
- [The other direction: a true finding killed](#the-other-direction-a-true-finding-killed)

## The clearest case, and it owes the convention nothing

[0025](adr/0025-agreement-among-trials-that-share-an-error-is-not-confidence.md)
is the purest instance and the most useful, because **nobody constructed it to
make this point**. It was found before the convention existed and predates
every other case here.

Calibration reported a latency with an error bar of **±1 ms**. The figure was
wrong by about 120 ms. The error bar was not a bad estimate of the uncertainty;
it was a measurement of something else entirely — the agreement among six
trials that all shared the same systematic shift — and **it was persuasive
precisely because it was precise.**

A harness answers in numbers, and a number reads as a measurement whatever
produced it. That is why the harness cases travel furthest, and why this one is
at the top rather than at the end.

## The catalogue

Four instances, two of them in records on this list:

- [0021](adr/0021-a-catalogues-top-grade-must-be-reachable.md) measured the cell
  catalogue through `SHAPE_AT`, a progression exercise's difficulty table. The
  table stopped at grade 9, so two grade-10 cells read as stranded. They were
  not: the table never reached rhythm generation at all, and
  [0027](adr/0027-configure-by-naming-what-an-exercise-contains.md) found that the
  measurement had no referent until a rhythm exercise shipped.
- [0017](adr/0017-a-setting-that-excludes-is-not-a-corpus-you-cannot-reach.md)
  tabulated templates against "the difficulty that reaches that grade", which
  is the same instrument and has since been removed from the app.
- [0025](adr/0025-agreement-among-trials-that-share-an-error-is-not-confidence.md)
  measured calibration through one microphone, which turned out to be a
  directional condenser, and wrote the microphone's behaviour into the
  Consequences as the feature's — while its own Revisit list said one room
  cannot tell the instrument from the room.
- [0026](adr/0026-a-measurement-signal-does-not-inherit-a-listening-level.md) is
  the same fault one layer down: the stimulus was measured through a gain
  stage nobody had characterised, 24 dB below full scale, and the attenuation
  read as the stimulus being wrong.

[0011](adr/0011-what-a-catalogue-owes.md) is the counter-example and shows the
cost of getting it right is one sentence. It named its instrument — "the
phrase planner chooses the closing cadence before a template is picked, and
its default vocabulary is two values" — and its finding has survived every
change since, because a reader can see which half to re-check when the planner
changes.


## Three accounts of how it felt

**The one-line version, from the person it happened to: _you read the trip as
evidence about the world rather than about the guard._** A guard on the home
screen's claim fired, and the conclusion drawn was that an exercise had been
wired to capture — when what had actually happened was that the guard matched
an import of a pure arithmetic helper that lives in `audio/capture/`. In their
words, with the part that explains why it travelled:

> The trip was not a failure — the guard did exactly what it was built to do,
> and the fault was entirely in what I concluded from it. A red test is
> evidence about the instrument first and the world second, and I inverted
> that in the direction that produced news worth sending.

That last clause is the mechanism rather than the moral. An instrument read as
the world produces a *finding*, and a finding is the kind of thing you pass on,
so this error does not sit still and get noticed — it propagates at the speed
of the most interesting thing you have to say. Which inverts the comfortable
intuition: **the more interesting a wrong conclusion is, the further it
travels**, so the errors that get furthest are selected for being worth
repeating rather than for being true.

A third account, from the role that made the same mistake twice in one day and
asked to be quoted in these terms rather than the kinder ones first offered:

> An instrument read as the world produces a finding rather than an error, and
> a finding is the kind of thing you pass on. It travels fastest towards
> whoever it flatters — I took a claim about my own work on trust within
> minutes of receiving it, and hours later produced one of my own by going
> looking for a trap and letting the harness hand me one.

**Flattery is the second selector and it compounds the first**: a finding is
passed on for being interesting, and checked least by whoever it suits. The
three routes into it differ in what was misread — a record's silence filled in,
a guard's trip over-read, a harness's output taken at face value — and the
last is the most dangerous of the three, because **a harness answers in
numbers and a number reads as a measurement whatever produced it.**
[0025](adr/0025-agreement-among-trials-that-share-an-error-is-not-confidence.md) is
that in its purest form: a ±1 ms error bar, wrong by 120, persuasive precisely
because it was precise. That is not a fourth kind of fault but a property of
the instrument that predicts how far the fault will get. Three corrections followed, each
one layer beneath the last: the claim, then the guard's condition, then its
scope. **Every version passed its own tests and read as careful.**


The later cases here were all found while the project was looking at this
convention, by people who had just read one another's accounts — which is the
selection effect the accounts describe, operating on the evidence for
themselves. 0025 is the one that owes it nothing.

## A reproduction attempt is an instrument too

Every case above is a finding *produced*. The same rule applies to failing to
produce one, and that site is easier to miss because a non-reproduction does
not feel like a measurement at all.

**A clean-room reproduction has a range, and it is "bugs that do not depend on
history".** Reporting "cannot reproduce" without that caveat claims "does not
happen", which is wider than what was measured — the same shape as the ±1 ms
above. Worse, the clean start is *guaranteed* to miss the one class it cannot
reach, so two agreeing clean-profile readings are weaker evidence than their
agreement feels, and both readers are looking from the only angle that cannot
see it.

**The entry here is a counter-example rather than a failure**, which this
document is otherwise short of. A clef finding was reported from a profile with
hours of accumulated settings and could not be reproduced on a fresh one, by
two people independently. Rather than closing it, the second reader named what
their instrument could not reach and eliminated it by a different route:
settings are at v3, both migration steps only add a key — `audio` at 1→2,
`appearance` at 2→3 — and `exercises` passes through untouched with unknown
keys deliberately preserved, so no stored document can arrive carrying a
corrupted clef. What remained was transient in-session state, the profile was
gone, and the question was left open rather than closed.

The author withdrew the finding on their own re-measurement, so **no true
finding was lost here**. The point is the step that was taken before the
agreement was trusted: the range was stated, and what fell outside it was
checked another way.

**A second instance, and it is the stronger one.** A bounded replay of the
accumulated churn also failed to reproduce the clef observation — and the
person who ran it volunteered, unprompted, that one step had silently not
executed: a lookup bug meant the theme clicks never landed. So the honest
verdict is narrower than the headline. *That churn, minus the theme changes,*
does not reproduce it.

Naming your instrument's limit before trusting an agreement is cheap when you
are already suspicious. Naming a flaw in your own replay is not, because **a
negative result is the one nobody audits** — it confirms the absence of a
problem, it says what everyone expected, and a step that silently skipped
inside it is the least likely flaw in the project to be found. Nothing would
have exposed it. They gave up the clean headline to keep the range honest.

That matters beyond this case, because a non-reproduction is one of the ways a
true finding dies, and it dies quietly — nobody chases a thing that went away.
A catalogue assembled from faults that left a trace is systematically short of
those, and cannot know by how much.

Two eliminations now stand against that observation — migration cannot deliver
a corrupted clef, and that churn does not reproduce it — with the original
state unrecoverable. It is left open rather than closed, which is the honest
end for a question whose evidence is gone.

## The other direction: a true finding killed

Everything above is a false claim surviving. This is the opposite, in the
words of the role it happened to, who committed the second instance the same
day it was written down.

> The shape: a true finding nearly killed by a check that could not fail.
> Every case in that document so far is a false claim surviving. This is the
> other direction, and it is less watched because nothing goes wrong loudly —
> the finding simply evaporates and you conclude you were mistaken.

**First instance.** A perfectly played rhythm is graded wrong at 160 bpm —
true, and the case written to defend it against the objection that the
synthesised signal was unrealistic reported no loss at any signal shape, which
would have retracted it. The cause was `filter(e => gradeOf(e))` without
`.correct`: `gradeOf` returns a `Result`, every object is truthy, and the
filter kept everything. Caught by the control beside it, asserting that *some*
bar must fail or the invariance claim is about nothing.

**Second instance, and worse.** Testing that alto and tenor are drawn
differently — the pair sharing one SMuFL glyph — two rendered SVGs were
compared with `not.toBe`. It passed. It also passed with the renderer mutated
to draw tenor *as* alto, because VexFlow ids its elements from a static
counter that never resets:

```js
return `auto${Element.ID++}`;   // vexflow/build/esm/src/element.js
```

So two renders of the **same** clef are not byte-identical either, and the
comparison was true for any pair of anything. An earlier version had stacked a
second emptiness on the first: it compared staves carrying a note, and C4 sits
at a different height per clef, so the drawings differed for the note's sake
and the clef was never under test.

**What the pair gives, and it is the useful part:**

> An assertion of *difference* is the dangerous one, because difference is the
> default: two things are unequal until something forces them equal, so
> `not.toBe` passes by accident where `toBe` fails by accident. The control
> for a difference claim is the sameness claim next to it — here, that one
> clef drawn twice comes back the same, without which a difference is evidence
> of nothing.

And the general form, which is why it belongs here rather than in a testing
note: **a broken instrument reads as absence, and absence is
indistinguishable from a negative result.** That is 0025 again — agreement
among trials sharing an error is not confidence — with the trials being one's
own and the error in the reading.

**Both were caught by the mutant surviving, and neither by review.** Nobody was
suspicious of the test; the question was whether the production code was wrong,
and the test's silence is what gave it away.

