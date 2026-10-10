# When a finding is a fact about the instrument

A catalogue of findings this project got wrong in one particular way: the
measurement was true and the conclusion drawn from it was about the
measuring rather than about the thing measured — and the reverse, a true
finding nearly killed, which turns out to be the costlier direction and the one
a catalogue of surviving errors is least likely to collect.

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
- [A check can be sound and still have no coordinate for the failure](#a-check-can-be-sound-and-still-have-no-coordinate-for-the-failure)
- [One that is still lying, and stays open](#one-that-is-still-lying-and-stays-open)
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

Six instances, two of them in records on this list:

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

- [0043](adr/0043-an-instrument-is-not-part-of-what-a-line-measures.md) is the
  fifth and the only one caught before it was published. Six synthesised voices
  were read through an analyser, and the reading agreed with the partial
  amplitudes declared in `instruments.ts` — but the analyser sits *downstream*
  of that file, measuring audio the declared data produced. The agreement
  confirms the synthesis implements the catalogue and says nothing about
  whether the catalogue is right. Two readings of one quantity, not two
  witnesses.

- **The sixth is the purest and it reached a true conclusion it could not
  support.** The gitignored packs were found by patching
  `AudioScheduledSourceNode.prototype.start` and noticing that no
  `AudioBufferSourceNode` ever ran. The conclusion was right. But
  `AudioBufferSourceNode` defines its own `start` — it takes an offset and a
  duration the base class does not — so a patch on the base prototype sees
  every oscillator and **no buffer source, ever, whether or not packs work**.
  The observation would have been identical on a perfectly healthy app. The
  instrument could not have produced any other reading, and `packs.test.ts`
  records it as the discovery method without saying so. Reported by main after
  the same patch produced a *false* silence a day later, reproduced against an
  instrument that was not running at all; the differing `start` signatures are
  the spec's. **Since confirmed in the page** — `AudioBufferSourceNode.
  prototype.hasOwnProperty('start')` is `true` and `OscillatorNode`'s is
  `false` — and independently in the IDL the repository ships, where
  `lib.dom.d.ts` declares `start()` on both interfaces. Three establishments,
  none needing the others.

  **And the entry would be unfair if it stopped there, which is the more
  useful half.** The person running that patch ran four checks, not one: a
  200 with `text/html` and the app's own shell as the body, no `packs/` in a
  plain build, and a 404 on the deployed site. Three of the four observed the
  absence without depending on which node type was scheduled. **The inference
  was right by luck; the sweep was not.** What saved the conclusion was that
  the dud instrument was outnumbered, and `packs.test.ts` now credits the
  three that carried it.

**The sixth instance also supplies the remedy this document has been short
of, and it is not the one the rest of it implies.** Everything above says
*name your instrument* — state what you measured through, scope the guard,
check the claim against the code. That works when you know which instrument
you are holding. **It does nothing when the blindness is the thing you do not
know about**, which is every case here by definition: nobody patched that
prototype believing it could not see buffer sources.

What works then is **more than one kind of observation**, because blindnesses
do not coincide. Three ways of seeing an absent pack — a response body, a
build directory, a deployed 404 — fail independently, so a dud among them is
outnumbered rather than believed. The same shape settled the instrument's own
behaviour afterwards: measured in the page, read from the shipped IDL, and
argued from the spec, three establishments none of which needs the others.

So the practical rule is not *distrust yourself*. It is **take observations of
different kinds, and prefer three cheap ones over one authoritative one** —
with the emphasis on *kinds*, for a reason the next paragraph had to be added
to supply,
which is also the only version of this advice that can be followed by somebody
who does not yet know what they are about to get wrong.

**And there is a stronger form of it that is not the same thing, which several
of this week's corrections demonstrate.** Every misattribution recorded here
was caught by *somebody else* — a wrong cause for the ignored packs and a wrong
cause for the stale dev server both by the user role, a wrong file name in a
convention by the tester, a wrong hypothesis about service-worker atomicity by
this document's author, and an approving note on a layout constant overturned
by a sweep nobody asked for. In both directions, repeatedly, and never by the
person who made it.

**The reason is not that the others were more careful.** It is that more
observations by the person who has just misattributed are *selected by the
judgement that failed*. Having decided the cause was pruned filenames, the next
thing you check is a filename. Self-redundancy is correlated with your own
error; a second person's instrument is not chosen by your reasoning at all.

That makes **redundancy of observer strictly stronger than redundancy of
instrument**, and it is the better argument for this project keeping its roles
apart than the one usually given. `CLAUDE.md` justifies the user role by what
it *finds* — things invisible from inside the code. True, and this is a second
property: its errors are uncorrelated with the tester's, which is a different
kind of usefulness and survives both roles being equally diligent. Whether that
belongs in `CLAUDE.md` is a process session's call, not this document's.

**And it is cheaper than it sounds, which is the usual objection.** The
clearest instance ran in both directions inside one exchange: a tester fixed a
guard of its own that could not fail and predicted the fix would catch drift
elsewhere; it did not, because the fix sat inside a gate that skips when
recordings are present. The other session ran the mutation the tester could not
run — its `fixtures/` is git-ignored and empty — and the check was moved
outside both gates. **Neither message was wrong and neither gap was findable by
reading the other.** It cost one `cp` and two test runs each way: the cheap
thing was running, not reviewing.

**The count is the trap, and this document's own wording set it.** "Three
cheap ones" reads as a number, and a number is satisfiable by repetition.
Trying to address the fleet's main session, two sessions independently sent
to `main`, then `main [ref]`, then `main [another ref]` — three failures,
refused identically — and both concluded the channel was impossible. **Three
attempts of one kind read as thoroughness and were one experiment repeated.**
The working route was the socket address from the `from=` attribute of main's
own messages, which the tool's documentation names first, and which neither
session tried because each had already satisfied its sense of having checked.

So: **when several attempts of one kind fail, the next observation must be of
a different kind, and the cheapest different kind is almost always to read the
thing's own description** rather than to try a fourth variation of the thing
that failed. Both sessions had that documentation available throughout.

It is worth recording that this document's author made the error and then
wrote the general form of it about somebody else — telling a third session
that *three sessions confirming through the same tool is reproducibility, not
corroboration*, while their own three attempts had the identical shape one
level down. The rule was applied to the fleet and not to the hand holding it.

**The caveat is what makes it fail quietly.** It works only while the second
observer really is holding a different instrument. Two sessions reading the
same file, or one agent asked to check another's reasoning on the evidence that
agent supplied, are one observer wearing two names — and they will agree,
confidently, for the same reason the trials in
[0025](adr/0025-agreement-among-trials-that-share-an-error-is-not-confidence.md)
agreed.

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
routes differ in what was misread — a record's silence filled in, a guard's
trip over-read, a harness's output taken at face value — and the last travels
furthest, for the reason the top of this file gives.

**And there is a third selector, weaker-sounding than flattery and worse,
because it needs nothing of you: the instrument agreed with what you already
expected.** A settings sweep reported "every control is stale" across all
seven exercises. It had examined **three chips out of a hundred and eight** —
the first off-chip in each panel is a navigation link, clicking it switched
the exercise, every later lookup found nothing, and the loop ran out silently.

The conclusion was correct. It was plausible, it matched every piece of
evidence from that day, and it was the answer the operator already held. A
finding that flatters you at least requires you to want something; one that
merely confirms you requires nothing at all, and **nothing in the output is
ever going to look wrong, because the output is what you were going to write
anyway.**

What caught it is the most concrete thing in this document. Not doubt about
the conclusion — that was never going to look wrong — but **one number
disagreeing with another number**: an off-chip count of 2 against 13, measured
an hour earlier for something else. That is the question at the top of this
file arriving as a near-miss rather than as advice, and it is why the question
is about what *else* changed rather than about being careful.

Three corrections followed the guard case, each one layer beneath the last: the
claim, then the guard's condition, then its scope. **Every version passed its
own tests and read as careful.**


The later cases here were all found while the project was looking at this
convention, by people who had just read one another's accounts — which is the
selection effect the accounts describe, operating on the evidence for
themselves. 0025 is the one that owes it nothing.

**And the practice this document argues for predates the document, which only
a null result could show.** Someone went looking for the general form of the
three-chips error — sweeps whose population is derived at runtime and never
counted — expecting a crop. Thirty-two candidates, the riskiest checked, and
**twenty-three were already guarded**, usually by an explicitly named sibling:
*"so the scan is not looking at nothing"*, *"or the sweep below is idle"*. One
was guarded by a sibling rather than by itself; a control was added, three
other cases were found to already catch the mutation, and it was reverted.

Counted independently: thirty such guards across the suite, in files first
written on 3 and 4 October, with the phrasing in commits well before today.

So this is not a document teaching the project a practice. **It is naming one
the suite already had, which four people lapsed from on a day of unusual
load** — which is a smaller claim and a more useful one, because the remedy is
not to learn something but to notice when you have stopped doing it.

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

**The worst case in this document is here, and it is a true finding nearly
killed by four people agreeing.** An earlier version of this section recorded
the clef case as a counter-example — a question left open rather than closed,
with no true finding lost. That was written while the finding was still
believed false. **The defect is real:**

```
after Start with Bass          chip=Bass    drawn=bass
clicked Treble mid-question    chip=Treble  drawn=bass
clicked Tenor  mid-question    chip=Tenor   drawn=bass
after Skip to the next         chip=Tenor   drawn=C clef
```

Changing a setting while a question is on screen updates the control and not
the rendered exercise. **The disconfirming measurement was the faulty one.**
The clean-room check clicked the clef and *then* Start, every time — the one
ordering that always regenerates — so it was measuring "settings applied before
generation" and the defect lives entirely outside that. Four correct clefs,
reported as the control working.

That is worse than an instrument whose range is known and unstated, which is
what the rest of this document is about. **Here the range was not known to
exist.** Nobody could have named this limit, because naming it requires
suspecting the ordering that produced it.

It nearly cost the finding twice. The author offered a retraction and it was
nearly taken. Then an unrelated lapse in their report — a characterisation
written where an attribute value belonged — was used to discount a *saved
screenshot of a rendered glyph*. Different evidence, different reliability,
collapsed into one judgement because the tidier conclusion required nothing
further from anyone. The author declined to let it stand, and declined equally
to let the lapse be redemption for the screenshot.

**What saved it was the artefact.** The profile was gone and the account partly
reconstructed; the PNG was still on disk and still showed a bass clef under a
lit Treble chip. Everything inferential pointed at closure, and the one thing
that could not be reasoned with was right. That is the whole argument for
keeping a rendering rather than a description of one.

The elimination done alongside it still stands and is still the right instinct:
settings are at v3, both migration steps only add a key, and `exercises` passes
through untouched, so no stored document can deliver a corrupted clef. It was
sound, and it was not enough — eliminating what an instrument cannot reach does
not help when you do not know which direction it cannot reach in.

**A counter-example, from a different attempt on the same question.** A bounded replay of the
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

## A check can be sound and still have no coordinate for the failure

Offered by the tester as a consolidation and taken as half of one, because
**two of the four cases it proposed are this document's existing subject rather
than a new one.** The catalogue above is made of measurements taken *through*
something uncharacterised, and a witness standing downstream of what it
witnesses is that exact fault — which is why 0043 is a fifth bullet up there
and not a section down here. A sweep whose population never builds the failing
case is the closing section below, already written.

What is left is genuinely different and worth its own name. In the catalogue's
cases the instrument is pointed at the wrong thing. Here it is pointed at the
right thing, works correctly, and **the defect lives in a direction the
measurement does not have an axis for.** No amount of care with the instrument
helps, because nothing is wrong with it.

- **A relative assertion cannot see a translation.** The tester's line, from a
  case comparing a piano's envelope against an organ's: a change that moved
  *both* curves left the distance between them unchanged, so a test measuring
  only that distance was silent. Reading one curve against its own decay level
  catches what comparing two curves cannot. The defect was in the null space of
  the comparison.

  **The shipped instance of this is better than the test one.** Four of the
  six instrument packs went out an octave sharp, because a file called `C4`
  means middle C under one octave convention and not under the other, and a
  filename carries no indication of which. Every note moved together, so each
  pack stayed internally consistent, the resampling arithmetic stayed right,
  and nothing downstream had anything to compare against. **A translation is
  invisible to every relative check by construction** — and this one shows a
  second property the envelope pair did not: it arrives with a ready
  misattribution. An instrument sounding an octave high reads as a bright or
  odd recording, not as a wrong manifest, so the one perceptual symptom has a
  plausible innocent explanation waiting for it. The fix is the only kind
  available: measure the recording's own pitch and refuse a set that disagrees
  with its labels, which is an absolute reading rather than a relative one.
- **A medium that cannot represent the defect.** `askable: undefined` survives
  a JSON round trip by vanishing — `JSON.stringify` drops the key — and is real
  under `structuredClone`, which is what IndexedDB actually stores. A test
  asserting through the first medium cannot express the state the second one
  keeps. `src/state/attempt.test.ts` now checks through `structuredClone` for
  this reason.
- **A quantity whose rightness is not structural.** A diff review's claim is
  that the code does what it says: the types line up, the branch is reachable,
  the name means what it does. Two defects in `src/audio/output/instruments.ts`
  — an envelope curve and a loudness ratio — passed that and were plain the
  moment anything played. A partial amplitude of `0.4` is not wrong-*looking*.
  There is nothing in the text to be suspicious of.

- **A reader, whose resolution is coarser than the defect.** Comparing a
  comment against the code it describes is the check this project reaches for
  most, and it has a precision below which it reports agreement. Three cases in
  two days: a stiffness term documented as applying to *upper* partials and
  applied to the fundamental as well, putting every note 0.7 cents sharp; an
  envelope documented as decaying throughout and holding every voice at its
  decay level; and a comment promising a wished unison's direction to the seed
  over code that took the first match. **Not one is a comment that lied.** All
  three are code that rounded, and each is individually plausible — an
  implementation that is *nearly* the sentence is what a reasonable
  implementation of a prose sentence looks like.

- **A double whose incompleteness is invisible at the call site.**
  `src/testing/audioContext.ts` implemented only the surface `Synth` used. When
  sampled playback arrived it needed `createBufferSource`, which the fake did
  not answer, so **the sampled branch could not run at all** — and
  `withinReach` passing its own unit tests read as coverage of a path nothing
  had executed.

  **The property that makes this worse than a wrong fixture is the one worth
  carrying: a wrong fixture *value* shows up as a wrong assertion; a missing
  fixture *capability* shows up as a path never taken.** There is nothing in
  the test file to read. You cannot grep for a method that is not called. A
  wrong literal at least sits in the source where somebody can doubt it.

  The remedy is derived rather than listed. `audioContext.test.ts` now
  compares the fake against every `context.<method>(` the shipped code calls,
  read out of the source, so a method added tomorrow is compared tomorrow —
  and it immediately found a live one: `createMediaStreamSource` is absent, so
  the microphone path is as untestable today as the sampled path was.
  Recorded as **a named exception with its reason rather than a stub**,
  because adding a method nothing exercises would declare the gap closed while
  leaving it open, with a further case that fails if the excuse goes stale.
  The guard also asserts its own population, its author having applied the
  eighth convention to the thing they had just written.

  Not in this family, though it was offered alongside: a sweep whose case came
  up or did not because a draw decided. There is no double in that one — it is
  the coin, and the closing section below already has it.

- **Half a predicate, where each half is plausible alone.** `assemble` in
  `audio/capture/listen.ts` joins two attacks when they agree about pitch
  **and** did not get louder — `MERGE_CENTS` at line 354, `NEW_NOTE_RISE` at
  388, combined thirty-four lines later in one function. Two instances of the
  same fault followed:

  A comment cited `MERGE_CENTS` where it meant `NEW_NOTE_RISE`. **A dangling
  name fails on sight; this one passes**, because the constant it names is
  real, nearby, and part of the very predicate under discussion.

  And `steadyNotes` in `exercises/played.ts` first reimplemented the pitch
  half without the loudness half — *"the obvious tolerance to add"*, and it
  destroys the unison, which a learner answers by striking one pitch twice.
  Pitch alone cannot tell a re-attack from a wobble inside one note; loudness
  is the half that discriminates, and it was the half dropped.

  **What defeats inspection is that each half is independently sensible.**
  "Merge notes at the same pitch" reads as a complete rule. A reader checking
  it has nothing to be suspicious of, because nothing is missing from the
  sentence — only from the predicate. The remedy is to keep the halves where
  one cannot be taken for the whole: adjacent, or behind a single name, so
  that half of it is visibly half. The comment now says where the real rule
  lives and that a more generous merge belongs there rather than copied.

The third is the one with a standing rule attached, and `instruments.ts` names
the gap itself:

> They are measurements of *this* synthesis and have to be re-measured if a
> voice's partials or envelope change; the suite cannot check them, because
> loudness is the one thing it has no instrument for.

**A constant whose rightness is a matter of how it sounds or feels gets changed
by measuring it again, never by reviewing the line that sets it.** That was
already the rule for the pitch-detection constants inherited from the tuner;
this is a second instance that arrived independently, which is better evidence
for a rule than a restatement of it would be.

**The fourth is the inverse of the ADR index's fourth convention and wants
saying as such.** That convention says a comment stating a constraint is a test
that cannot fail, and its remedy is to check the claim against the code. Here
the claim *is* checked and the check *passes*: both artefacts are right to the
precision anyone reads them at, and they part company below it. All three cases
were found by mutation or by measurement, and none by comparing the two
documents — which is the remedy being applied correctly and returning the wrong
answer.

So **the remedy is not more careful reading.** It is a mutant aimed at the gap
between the sentence and the implementation — does the fundamental move if the
stiffness term is removed from it, does a long note's level change — which is a
different habit from checking that a comment is still true, and catches a
different thing. Two of the three now carry their own history in the code
(`synth.ts`, at the stiffness term and at the sustain), which is the cheapest
form of the habit: the next reader is told what the sentence previously failed
to constrain.

**Why this is a separate question from the three selectors** above — interesting,
flattering, expected. Those describe what happens to a finding once it exists.
This one asks whether the check could have produced the finding at all, which
is a question asked earlier and answered before any of them apply.

## One that is still lying, and stays open

**Every entry above is a diagnosis, and that is a selection effect rather than
a fact about instruments.** The cases that got explained are the cases that got
written down. A catalogue made only of solved ones quietly implies that a
misread instrument always yields a cause if you look hard enough, which is
itself a claim nothing here supports.

So one open case, recorded as open. A long-running dev server served stale
packs; killing and restarting it fixed the symptom twice with nothing else
changed. The obvious explanation — that the filenames had been pruned and the
index pointed at files no longer on disk — **was offered and was wrong**: the
user role established the filenames were current and present, and a file added
to `public/` while a server runs was separately measured to be served.
`docs/RUNNING-THE-APP.md` carries the practical rule — rebuild, restart,
hard-reload before measuring packs — and says plainly that the cause is
unidentified.

**The discipline worth copying is what did not happen next.** Having had one
mechanism disproved, the author did not reach for a second. That restraint is
the opposite of the reflex, and the reflex is what produced the first wrong
answer — an explanation offered immediately after one has failed is being
selected for fitting the symptom rather than for being true, which is this
document's subject pointed at the diagnosis instead of the measurement.

**A procedure that works is not owed a mechanism.** Rebuild, restart,
hard-reload is a real rule that someone can follow tomorrow, and it loses
nothing by having no story attached. The project already accepts this
elsewhere: the pitch-detection constants are measurements rather than
explanations, and changing one means re-running the corpus rather than arguing
from a model. An unexplained workaround is honest in the same way, and it stops
being honest the moment someone writes a plausible cause beside it.

**What would close this** is a reproduction that distinguishes mechanisms
rather than one that merely recurs — the symptom recurring tells you it is
real, which was never in doubt, and nothing about why.

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

**What the pair gives, and it is the useful part.** The first statement of it
was about assertions: an assertion of *difference* is the dangerous one,
because difference is the default — two things are unequal until something
forces them equal, so `not.toBe` passes by accident where `toBe` fails by
accident. True, and it met its own inverse within a day, when the merge
decided by [0038](adr/0038-preserve-unknown-settings-at-the-store-not-at-the-coercer.md)
was pinned by asserting a clef was still `bass` after the write — and the
stored blob said `bass` too, so both sides of the merge agreed, which one won
was untestable, and reversing the spread passed. An assertion of *sameness*,
true for the wrong reason.

So the rule is not about the assertion, and the author of both says it better
as a rule about what you assert over:

> A fixture whose two sides agree makes the operator under test invisible.

That covers both: a difference claim over two things that differ for an
unrelated reason, and a sameness claim over two inputs that were already the
same. **The inputs have to differ in the dimension the operator acts on**, or
the operator is not under test whatever the assertion says. Stale-wins is the
live hazard it catches — the user changes a setting, the panel writes it, the
old value comes straight back — and only a value that differs can show a merge
has a direction.

And the general form, which is why it belongs here rather than in a testing
note: **a broken instrument reads as absence, and absence is
indistinguishable from a negative result.** That is 0025 again — agreement
among trials sharing an error is not confidence — with the trials being one's
own and the error in the reading.

**Both were caught by the mutant surviving, and neither by review.** Nobody was
suspicious of the test; the question was whether the production code was wrong,
and the test's silence is what gave it away.

### And the instrument this document ends on has a range too

Mutation is the check used throughout here, and it was never stated what it
measures. **A failing mutant says an assertion is load-bearing. It says
nothing about whether the assertion is true.**

Measured, on this document's own closing recommendation. A sweep asserted that
a grading's verdict always equals "every outcome correct", across 1,240
gradings, and the `correct: true` mutant failed — which was read as confirming
the claim. The claim was false: rhythm's outcomes are per written cell, an
extra tap belongs to no written cell, and the two genuinely differ there. The
sweep's response shapes — a perfect performance, a late one, silence — could
not construct the disagreeing case, so **it reported the absence of a case it
could not build as agreement**, and the mutant confirmed the wiring of a
statement nobody had checked.

So mutation tests the connection between a test and the code. Truth needs the
disagreeing case, and constructing one needs to know what the thing under test
is *for* — which is domain knowledge and not discipline, and is the one thing
none of the day's machinery supplies.

That is worth the last word. Every instrument this project built in a day —
the commit gate, the push gate, the mutation habit — was green on a test
asserting something false. The catalogue above is a list of instruments read
too widely; **this is the instrument the catalogue itself was read through.**
