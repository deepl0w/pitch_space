# ADR 0007 — An attempt records per-event item attribution

- **Status:** Accepted
- **Date:** 2026-10-04

What goes into the record [0006](0006-settings-in-localstorage-progress-in-indexeddb.md)
decided where to keep. The scheduler that will read it does not exist yet, and
that is the reason to settle this now: evidence cannot be backfilled.

## Context

Spaced repetition is the feature the practice side of this app is for, and
`docs/ROADMAP.md` sets out why the textbook version does not fit.

The schedule tracks **items** — practisable atoms with ids like
`interval:m3:up`, `chord:dom7:inv2`, `read:treble:ledger_above:A5`. An exercise
is not an item; it is a *rendering* of several at once. One sight-reading bar
in E♭ exercises a key signature, half a dozen intervals, several rhythmic cells
and a clef range, and the user plays it once.

Flashcard scheduling assumes one item per review and one graded outcome. Here
the attribution is many-to-many, and both ways of collapsing it are wrong in a
way the user feels:

- **Credit every item in the bar for a clean read**, and the user coasts. The
  one hard interval in the bar is carried by the six easy ones around it, its
  interval stretches, and it is never the reason the bar was played.
- **Blame every item for one wrong note**, and the schedule punishes six things
  because of one. The five the user knows come back tomorrow, practice fills up
  with material that did not need it, and the app becomes the thing people stop
  opening.

There is a third collapse that looks harmless and is not: **crediting items the
exercise merely contained.** A key signature in a bar with no accidentals was
never tested. Counting it as known teaches the schedule something nobody
demonstrated, and the item then disappears from rotation on the strength of
evidence that does not exist.

What makes the honest answer affordable is that the app can see *where* the
error was. Grading works in the same tick space the exercise was generated in,
so a wrong pitch or a late attack localises to a specific note — and from the
note back to the items that produced it. The generator already emits a `role`
per note for a related reason. Attribution per event is therefore available;
it only has to be recorded.

One more signal belongs here, and it is easy to lose. **Latency matters more in
music than in flashcards.** A musician who plays the right note after two
seconds of thought has not learned it. Correctness alone cannot say that, and a
timestamp pair on the exercise as a whole cannot either once an exercise tests
more than one thing.

## Decision

**An attempt records, per item, what that item's worth of the response was
worth — and records nothing a scheduler would own.**

[`Attempt`](../../src/state/schema.ts) carries three different things about
items, and the difference between the first two is the whole record:

- `items` — every item the rendering **contained**, tested or not. The
  generator knows what it put in the bar.
- `outcomes` — an [`ItemOutcome`](../../src/exercises/types.ts) for each item
  the response **tested**, carrying `correct` and an optional `latencyMs`.
  Only the grader knows which of the bar the user was actually asked about.
- `correct` — the verdict on the exercise as a whole, recorded rather than
  folded, because it is not derivable from the outcomes: a bar can be failed
  overall while most of its notes were right.

Keeping `items` as well as `outcomes` is what lets the schedule tell **never
shown** from **shown and not tested**, which are different facts about an item
and want different responses.

**Items the exercise contained but did not test get nothing.** Not a credit,
not a blame. An outcome is a claim that the user was asked, and the record may
not make a claim the exercise cannot support.

**Latency is per outcome and measured from the moment the item became
answerable**, not from when the exercise was generated. In the interval
exercise that is the first time the notes were heard, and deliberately not the
last: a user who needed three listens has not answered quickly, and restarting
the clock on each replay would record that they had. It is optional, because
not every exercise can say when that moment was, and it is **omitted rather
than zero** when unknown — zero is the strongest possible evidence of the
opposite of what is being recorded.

**No scheduler state is stored.** No ease, no interval, no due date, no lapse
count. Those are derived, they belong to whatever algorithm is in use, and
`docs/ROADMAP.md` already expects SM-2 to be replaced by FSRS once there is a
corpus to tune against. What is stored is the evidence both algorithms read,
which is the part that cannot be recomputed later.

**Item ids are a compatibility commitment from the first release**, because
they key a user's history and renaming one orphans everything learned about it.
Their arity varies by kind on purpose — `chord:m7b5` against `chord:dom7:inv2`,
and `interval:unison` against `interval:m3:up` — so nothing may parse an id by
splitting it into a fixed number of parts. The interval exercise also names its
items by sound rather than by spelling: an augmented fourth and a diminished
fifth are one item, `interval:tritone:…`, because nobody can hear which was
written and a schedule that tracked them separately would be tracking something
the user was never asked.

## Consequences

The record is consumable per item today, and
[`tallyItems`](../../src/state/progressStore.ts) is the proof rather than the
feature: it folds a history into seen, correct and last-seen counts per item,
reading `outcomes` and never `items`, and the practice screen shows it. A fold
is not a schedule — it has no opinion about when anything is due — but it
establishes that the shape the scheduler needs is the shape being written.

Every exercise type's `grade` now has a job beyond saying yes or no: it has to
say what it tested. For interval identification that is one item and the
mapping is trivial, which is exactly why it is worth fixing the contract now.
The first exercise where it is not trivial is sight reading, and by then the
shape it has to produce will not be up for negotiation.

The record is also a bug report. An attempt carries its seed and the settings
it was generated from, so a complaint reproduces exactly
([0002](0002-generation-is-reproducible-from-its-seed.md),
[0005](0005-seeds-are-minted-outside-the-core.md)) — and it carries the
outcomes alongside, so "the grader marked me wrong" is answerable from the same
row.

### What this costs

**Attribution is work in every grader, and the shortcut is always available.**
Returning one outcome for the exercise as a whole compiles, passes a grading
test, and is wrong in precisely the way this record exists to prevent. Nothing
in the type system distinguishes a grader that attributes from one that gestures
at attribution; only a reader does.

**"Failed and unattributable" and "skipped" are stored alike.** An exercise
that cannot localise its error reports no outcomes, which is the same empty
list a skipped exercise produces. The schedule learns nothing from either,
which is the correct outcome in both cases, but the two are not distinguishable
afterwards and a later analysis that wants to tell them apart will need
something this record does not have.

**Rows are larger than a flashcard review.** An attempt carries its settings
and two item lists rather than a card id and a grade. That is the reason the
history needs IndexedDB rather than `localStorage`
([0006](0006-settings-in-localstorage-progress-in-indexeddb.md)), so the cost
has already been paid once.

**Optional latency means every reader has to cope with its absence**, and the
tempting repair — defaulting it to something — reintroduces the fabricated
evidence the omission exists to avoid.

**An item appearing several times in one exercise is currently one outcome or
several equal ones**, with no notion of weight. A bar in which the same awkward
interval occurs four times is not four times the evidence, but it is also not
the same as one occurrence, and this record takes no position.

## Revisit when

- **The first exercise arrives whose grading cannot localise an error.** A
  chord played wrong on a real instrument may be judgeable only as a whole. The
  question to answer then is whether it reports no outcomes or one outcome per
  item at reduced confidence — and confidence is a field this record does not
  have, so adding it is a migration and a decision rather than a patch.
- **The scheduler is written and SM-2 is tuned.** If a signal turns out to be
  missing from the evidence, it is missing from everything already recorded,
  and this is the record to amend rather than work around.
- **An item wants a weight within one exercise.** That is the repetition case
  above, and it is a change to `ItemOutcome` rather than to the scheduler, so
  it is worth deciding before two graders invent different conventions.
