# ADR 0043 — An instrument is not part of what a line measures

- **Status:** Accepted
- **Date:** 2026-10-08

Six synthesised voices now exist and a learner picks one. This says what that
choice is allowed to affect, and names the cost of the answer rather than
leaving it to be discovered.

## Context

`src/audio/output/instruments.ts` offers six voices, chosen in Settings and
stored per profile. The question raised on landing it was whether an instrument
id joins item ids under [0011](0011-what-a-catalogue-owes.md)'s second
obligation — stable ids, not editorial, because renaming orphans what a learner
has built.

**It does not, and the reason is worth stating because the obligation looks
like it should apply.** 0011 scopes that duty to ids that *reach the user's
history*: a rhythmic cell becomes `rhythm:dotted_e_s` inside an `ItemId`, which
[0007](0007-an-attempt-records-per-event-item-attribution.md) and
[0010](0010-presentation-is-part-of-what-an-attempt-means.md) make a
compatibility commitment from the first release. An instrument id reaches
`AppearanceSettings`, which lives in localStorage under
[0006](0006-settings-in-localstorage-progress-in-indexeddb.md) and never
travels onto an `Attempt`.

So retiring a voice costs a **preference**, not a measurement. The learner's
chosen sound reverts to the default, they see it immediately, and one tap fixes
it. Repairing at the coercion boundary — which is what the implementation does,
field by field like every other appearance field — is the whole of what is
owed.

## Decision

**An instrument is a property of playback, not of the question.** It is not
part of a line's identity, it is not recorded on an attempt, and two learners
answering the same item on different voices are doing the same exercise.

This follows from [0039](0039-a-line-is-an-exercise-and-the-items-its-settings-make-askable.md)
rather than being a new rule: a setting is part of a line's identity if and
only if it changes `items(settings)`, and the instrument changes nothing about
what can be asked. The same test that keeps clef out keeps timbre out.

## What this costs

**It is not free, and the cost is a real one rather than a theoretical tidiness
point.** Timbre genuinely affects how hard an interval is to hear. A voice with
strong upper partials or noticeable inharmonicity gives away information a pure
one does not, and a learner who has practised entirely on one voice and then
switches has a progress reading that overstates what they can do on the new
one. The history cannot tell the two apart, because nothing records which was
heard.

That is accepted deliberately, for the reason 0039 gives about narrowing a
pool: splitting a line six ways fragments a learner's progress into pieces too
small to schedule against, and a reading computed over a sixth of the attempts
is worse than one that ignores a difference of degree. The app would be more
precise about a distinction nobody asked it to make, and less useful about the
one they did.

**The honest statement of the limitation** is that the progress reading
describes what a learner can do on the voices they have been practising on, and
treats a change of voice as free when it is merely cheap. If that ever stops
being acceptable, the fix is not to key lines on the instrument — it is the
escape clause 0039 already provides: if hearing an interval on a given voice
really is a different skill, it gets a different **item id**, which keeps the
line structure intact and puts the distinction where the evidence is.

## Consequences

`AppearanceSettings` gains no migration step and wants none. A document written
before the field existed has no `instrument` key, reads as unknown through
`coerceAppearance`, and becomes the default — which is what a migration step
would have done, while additionally needing to stay in step with a catalogue
whose entries can be retired. The field-by-field coercion is the simpler
mechanism and it already covers the case.

**This is the first stored id in the appearance settings that names a catalogue
entry**, so it is worth saying what the general rule is rather than deciding
this one case. A settings id that never reaches an attempt owes stability only
to the user's convenience, and the coercion boundary discharges that. A
settings id that reaches an attempt owes 0011's full obligation and is not
editorial. **Which of the two a new id is depends on whether it is written to
IndexedDB or to localStorage**, and under 0006 that is a question with a
one-word answer rather than a judgement.

## Addendum, 8 October 2026 — the gradient is designed, not incidental

The limitation above was written as a reasonable worry. It is larger than that
and it is deliberate, which is a different thing to accept.

**The figures, checked against the declared partials rather than taken on
report.** The flute suppresses its second harmonic by 21.9 dB and its third by
28.0; the strings suppress theirs by 1.9 and 6.0. That is not a nuance between
two timbres — it is close to a sine against a full harmonic stack, and hearing
a tritone through one is a materially different task from hearing it through
the other.

**The two measurements agree and are not independent, which is worth saying
precisely** because [0025](0025-agreement-among-trials-that-share-an-error-is-not-confidence.md)
is about exactly this. The user role read the six through an analyser; this
record read the amplitudes the synthesis is driven *by*. The analyser sits
downstream of the declared data, so agreement confirms that the synthesis
implements what `instruments.ts` says — a real and useful check — and does not
independently corroborate anything about difficulty. Two readings of one
quantity, not two witnesses.

**What actually supports the difficulty claim is the code saying so.** The
flute's own comment states the intent rather than leaving it to be inferred:

> Nearly a sine, which is the point rather than a simplification: an interval
> played on something this plain is the easiest version of the ear-training
> question, and a learner who cannot hear a tritone through a piano's upper
> partials can often hear it here.

**So the honest statement is stronger than the one above.** The app does not
merely tolerate a difficulty difference across voices — it **builds one on
purpose**, offers it as a choice, and then declines to record which was taken.
An easy mode exists, it is good that it exists, and the progress reading cannot
see it. A learner who finds a line hard, switches to the flute, and succeeds
has their success recorded identically to one earned on the piano.

That does not reverse the Decision. Splitting a line six ways is still worse
than ignoring a difference of degree, and the instrument still changes nothing
about `items(settings)`. It raises the limitation from a side-effect to a known
cost of a deliberate design, which is the kind that should be visible on screen
rather than only in a record — a learner choosing the flute could reasonably be
told it is the easier voice, since the code already knows it.

## Revisit when

**A learner's reading moves sharply on changing voice.** The cause is known
before the symptom appears — 21.9 dB against 1.9 — and so is the fix: 0039's
escape clause, giving the item a different id rather than keying the line on
the instrument, exactly as it provides for clef. That is the second time that
clause has turned a hard question into an easy one, which is worth noting about
0039 rather than about instruments.

## Open, and with the user since 10 October

**This record's Decision is the thing in question, and the question has been
live for a day with no home but a message.**

0043 rules that an instrument is a property of playback and not part of what a
line measures, and accepts as a known cost that a learner who practises on one
voice and switches has a reading that overstates them. Two things have since
pressed on that:

- The measured difference is larger than "a nuance". The flute suppresses its
  second harmonic by 21.9 dB where the strings suppress theirs by 1.9, and the
  flute's own comment says the plainness *is the point* — an easier version of
  the ear-training question, offered deliberately.
- The argument for recorded instruments is that **recognition transfers from
  the timbre you have actually played**. That is a claim that timbre changes
  the skill, which is what this record rules it does not.

So the question is whether **instrument choice is cosmetic or part of what is
being trained**, and it is the user's rather than anyone's here: one answer
keeps a learner's progress as one line and knowingly overstates them across
voices, the other acknowledges the voice and fragments progress six ways.
Either has a cost a learner pays.

**Why this section exists at all is the part worth keeping.** The question was
raised with the user on 10 October, in a message, and recorded nowhere. The
architect then reported it as outstanding four times without checking that it
had a home — having, three days earlier, diagnosed exactly this in another
session's work and written that *an answer existing only in a message is why
it kept coming back*. **The same is true of a question**, and a question is
worse: an unanswered one has nobody motivated to look for it.

## Resolved, 12 October 2026 — preference, and the hedge is theirs

The user, asked whether instrument choice is cosmetic or part of what is
trained: *"instrument choice should be by preference for now"*.

So this record's Decision stands. An instrument is a property of playback,
`lineKey` is the exercise, the presentation and the item set, and switching
voices neither splits a line nor resets one — true in code, and verified
rather than assumed.

**"For now" is the user's word and is kept as theirs.** It is not a hedge this
record may promote into permanence, and this document has already been
corrected once for reading a user's *maybe* as more than it was. What it marks
is that the cost named above is accepted rather than dissolved: the flute
really is 20 dB plainer than the strings, the recordings argument really does
say that recognition transfers from the timbre you have played, and a learner
who switches really is overstated. None of that stopped being true; it has
been judged worth less than fragmenting a learner's progress six ways.

The escape clause is unchanged and is where a different answer would land: if
a voice ever makes a materially different question, it gets a different **item
id**, not a different line.
