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
