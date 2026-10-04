# ADR 0017 — A setting that excludes is not a corpus you cannot reach

- **Status:** Accepted
- **Date:** 2026-10-05

Decides the mirror case [0016](0016-widen-the-query-not-the-corpus.md) named and
left open, and in doing so narrows what
[0011](0011-what-a-catalogue-owes.md)'s reachability obligation covers.

## Context

`allowAppliedDominants` and `allowBorrowed` are each read in one place,
[`harmony.ts`](../../src/generate/harmony.ts), where they gate the transformation
passes that *add* those chords. Neither excludes a template whose own data
carries one, and some do. The names promise exclusion and deliver non-addition.

0016 flagged the fix as a decision rather than a defect, because making the
flags filter the corpus is a *narrowing* of the query — the mirror of what 0016
had just done — and warned it would make templates unreachable at low grades,
"which is 0011's problem precisely". That warning was reasonable and it is
wrong, which a measurement settles rather than an argument.

Templates carrying an applied dominant or a borrowed chord in their data, by the
grade at which they become available, against the difficulty that reaches that
grade:

| Difficulty | Grade | Templates available | With applied | With borrowed |
| --- | --- | --- | --- | --- |
| 1 | 2 | 17 | 0 | 0 |
| 2 | 4 | 25 | 0 | 0 |
| 3 | 5 | 31 | 0 | 0 |
| 4 | 7 | 34 | 2 | 0 |
| 5 | 9 | 35 | 3 | 1 |

Three templates in the whole corpus carry an applied dominant — `rhythm-a`,
`rhythm-b`, `blues-jazz` — and one of those also carries the only borrowed
chord. **Filtering costs nothing below difficulty 4**, because there is nothing
to filter, and costs three of thirty-five at the top, where thirty-two remain.

That also confirms the diagnosis the label change was made on: the old toggle
was honest at difficulties 1 to 3 and dishonest at 4 and 5, exactly.

## Decision

**The flags exclude. A template whose data carries an applied dominant is not
offered when applied dominants are off, and likewise for borrowed chords.**

The renaming alternative — `addAppliedDominants`, saying what the gate does — is
honest and cheap and was rejected for the reason the measurement exposes. It
would leave the exercise unable to offer, deliberately, the thing its lowest
difficulty already offers by accident: a progression with no applied chords in
it at all. A promise the app keeps at difficulty 1 and cannot express at
difficulty 5 is not a promise, and renaming the flag would make that permanent
rather than fixing it.

**And 0011's obligation does not bite here**, for a reason worth stating
generally rather than as an exemption. 0011 requires every catalogue entry to be
selectable by a query the app actually makes. A template excluded *when a
setting is off* is still selectable — by the same query with the setting on,
which is the default at the grades where those templates live. The obligation is
about entries **no** legitimate query can reach, not about entries **some**
query excludes. Excluding is what a setting is *for*; a corpus wider than every
query the app can make is the defect 0011 names.

Without that distinction every exclusion setting would read as a reachability
violation, and the obligation would argue against the feature it exists to
protect.

## Consequences

The flags mean what they say, so a difficulty that promises no applied dominants
delivers none — and the attempt log stops recording a `V/IV` the user was never
told to expect as a `V/IV` they got wrong, which is the user-visible half of
this and the reason it should not have sat.

0011 gains a boundary it did not have. "Reachable by some query the app makes"
now explicitly includes queries that a setting has to be switched on to produce,
which is the reading 0016 was already relying on without saying so.

### What this costs

**Three templates lose a context.** `rhythm-a`, `rhythm-b` and `blues-jazz` are
the corpus's rhythm-changes and jazz-blues material, and they are unavailable
with the flag off at the one difficulty that would otherwise reach them. The
measurement says thirty-two remain, which is why this is affordable — but the
three that go are not interchangeable with the thirty-two, and someone
practising at difficulty 5 with applied dominants off gets a blander corpus than
the count suggests.

**The filter is a second place that must know what a template contains.** The
constructor already validates a template's arithmetic; now selection has to
inspect its data for chord qualities. That is a per-entry property computed at
selection time rather than declared, and a template whose data changes silently
changes which queries reach it. Declaring it on the entry would be the
catalogue-shaped answer and is not what this record requires, only what it
suggests if a third such property appears.

**It narrows what the exercise can show without saying so to the user.** The
toggle now removes material as well as declining to add it, and a learner who
turns applied dominants off to concentrate will get a smaller pool of
progressions than they would expect from the label. That is the right behaviour
and it is still a surprise.

## Correction, 5 October 2026

**The borrowed column of the table above is undercounted, and the mechanism it
was computed from is wrong.** It counted a borrowed chord as a non-zero
`chromaticAlter`, which is how `blues-jazz` spells its `#ivo7` and is not how
`rhythm-a` spells its `IV–iv`: that one is `{ degree: 4, typeId: 'min' }`,
borrowed by *quality* with the degree unaltered. A filter built on the table's
definition let a borrowed chord through whenever a template spelled it the other
way, which is what happened — the first implementation inherited this error and
the progression exercise's containment test caught it.

The corrected counts come from
[`isBorrowedIn`](../../src/generate/templates.ts), the shipped predicate, which
compares a step's triad against the mode's and is per-mode because borrowing is
relative to the mode borrowed into.

**The decision is unaffected and so is the argument for it.** The carriers are
the same three templates — `rhythm-a`, `rhythm-b`, `blues-jazz` — all at grade 6
or above, so filtering still costs nothing below difficulty 4. The applied
column reproduces exactly. Only the borrowed mechanism was wrong, and it was
wrong in a way that made the corpus look cleaner than it is.

Worth naming what it cost, since it is the second measurement in this record's
lineage to be taken on an assumption: a filter was built on it and shipped
before a test found the gap. A number that is checked is not the same as a
definition that is checked, and this table had the first without the second.

## Revisit when

- **A third property has to be filtered this way.** Two is a pair; three means
  selection is repeatedly interrogating template data, and the property belongs
  declared on the entry where the constructor can check it.
- **Someone proposes a setting whose only justification is excluding data.**
  0016's independence test applies in this direction too: a filter that exists
  to make a corpus look tidier rather than to answer a learner's need is the
  same mistake with the sign flipped.
