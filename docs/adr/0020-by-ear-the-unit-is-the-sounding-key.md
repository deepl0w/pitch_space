# ADR 0020 — By ear, the unit is the sounding key

- **Status:** Superseded by [0028](0028-a-question-only-absolute-pitch-can-answer.md)
- **Date:** 2026-10-04

Applies [0007](0007-an-attempt-records-per-event-item-attribution.md)'s rule
about what an outcome claims to a case it did not anticipate, and follows
`interval-id`'s handling of the same problem without copying it, because the
two exercises differ in a way that matters.

## Context

Reported by the tester and verified independently: with **Asked = By ear** and
the circle set to all fifteen, key identification asks a I–IV–V–I cadence,
offers two spellings of the same sound as separate choices, and marks one of
them wrong.

Both the original report and the first verification put the count at five
pairs. It is six. Grouping every key in `ALL_KEYS` by the pitch classes of
`cadencePitches(key)`:

| | |
| --- | --- |
| Cb major (−7) | B major (+5) |
| Gb major (−6) | F# major (+6) |
| Db major (−5) | C# major (+7) |
| Ab minor (−7) | G# minor (+5) |
| Eb minor (−6) | D# minor (+6) |
| Bb minor (−5) | A# minor (+7) |

**Cb/B escapes a probe that groups by absolute MIDI**, which is what both
earlier attempts did, because `Cb4` sounds at MIDI 59 and `B4` at 71 — the
same key an octave apart. The pair is real, the ambiguity is real, and the
octave is a separate oddity worth knowing about: by ear the two are the same
key, and the app currently sounds one of them an octave below the other.
Anyone implementing this by collapsing keys whose cadences produce identical
MIDI will reproduce the same miss.

The reading paths are unaffected and must stay that way. Six flats and six
sharps are different signatures, spelled accidentals separate enharmonics, and
telling them apart is a real skill. The ambiguity exists only where the
evidence is sound.

### Why this is worse than a wrong mark

[`keys.ts`](../../src/exercises/key-id/keys.ts) opens by naming this exact
failure as the thing the exercise exists not to commit: "An exercise that
showed two sharps and accepted only 'D major' would be marking a correct
answer wrong." The principle was stated and then applied only to the
signature-to-mode ambiguity.

But the cost is not only the mark. [0007](0007-an-attempt-records-per-event-item-attribution.md)
says **"an outcome is a claim that the user was asked"**, and
[`gradeKey`](../../src/exercises/key-id/keys.ts) currently writes
`{ item: 'key:Gb_major', correct: false }` for a listener who heard a G♭
cadence and answered "F♯ major". That record claims the user was asked to
distinguish G♭ from F♯ by ear. **Nobody can be asked that.** The log acquires
a false statement about what was tested, and a scheduler reading it will drill
a discrimination that does not exist.

## Decision

**When the evidence is sound, the askable unit is the sounding key, not the
spelling.**

Concretely, for `source: 'passage'` only:

- **The pool is one key per sounding tonic.** Twelve per mode instead of
  fifteen. The three collapsed pairs in each mode are duplicates, not
  difficulty — **no sounding tonic leaves the pool**, so difficulty 5 by ear
  still contains every key a musician would call hard. This was the cost
  feared when the choice was framed as "narrow the pool", and on inspection it
  is not paid.
- **The choice is labelled for both spellings** — "F♯ / G♭ major" — so a
  listener who names the sound the other way finds their answer on the screen
  rather than concluding the app disagrees with them. This is what
  `interval-id` does with `tritone`: name the answer after the thing that was
  actually heard.
- **The item recorded is the canonical spelling**, so the two spellings' by-ear
  histories merge into the one skill they are. `(item, presentation)` already
  carries the distinction from the reading item — `PracticeScreen`'s
  `tallyKey` composes exactly that pair, and
  [0010](0010-presentation-is-part-of-what-an-attempt-means.md) decided that
  presentation is part of what an attempt means. Nothing new is needed to keep
  "heard the sound of G♭" apart from "read six flats".
- **The feedback names the spelling that sounded**, and says what the other one
  would have been. `interval-id` keeps the spelled name in its feedback for
  this reason — seeing that the tritone you heard was written A4 is the bridge
  from the ear to the page, and seeing that the key you heard is written with
  six flats rather than six sharps is the same bridge.

**The two spellings are not both accepted against one item.** That was the
other candidate and it is rejected: making `grade` many-to-one for one mode
leaves the log saying a user was asked a question with two right answers,
which is a more complicated lie than the one being fixed. Collapsing the
question is honest; widening the answer is not.

### Why `interval-id` guides but does not decide

`interval-id` collapses the tritone for **every** presentation, reading
included, and it is right to: an augmented fourth on the page is still a
tritone, and the exercise never claims otherwise. Key identification cannot
follow that, because reading six flats and reading six sharps really are
different, and a collapse that reached the reading path would destroy a
distinction the exercise is for.

So the rule generalises one step further than either exercise: **the answer
set is a function of what the question can distinguish.** `interval-id`'s
question cannot distinguish spellings in any presentation; `key-id`'s cannot
only when the evidence is sound. Both follow from the same place.

## Consequences

The exercise stops contradicting its own opening comment, and the attempt log
stops recording a discrimination that was never put to anyone.

A learner who answers "F♯ major" to a G♭ cadence is credited with having
learned that sound, which is what they demonstrated. That is the question
0007's per-item progress makes unavoidable, and this is the answer: the credit
attaches to the sound, because the sound is what was asked.

### What this costs

**Item ids for by-ear key questions change meaning, and item ids are a
compatibility commitment.** `intervals.ts` says so in as many words — the slugs
are "a compatibility commitment from the first release". Any history already
recorded against `key:F#_major` from a by-ear attempt is now filed under a
spelling the by-ear path will never generate again. There is no migration that
recovers the intent, because the old rows recorded a question that should not
have been asked; orphaning them is the honest option and it should be a
deliberate line in the migration rather than a silence.

**One item id now means two things, disambiguated only by a sibling field.**
`key:Gb_major` is "the spelling G♭" when read and "the sound of G♭/F♯" when
heard. 0010 and `tallyKey` make that legible, but it is a composition a reader
has to know about, and a query written against `items` alone will blend them.
The alternative — a second namespace for sounding keys — was rejected as a
larger change to the item vocabulary for a distinction two existing mechanisms
already carry, but if a third such case appears the namespace is probably
right.

**Dual labels are longer, and the longest is "D♯ / E♭ minor".** On a narrow
screen the by-ear choice list is twelve of those. That is a layout problem this
record creates and does not solve, and it is the kind of thing that gets
discovered by a user rather than by a test.

**The Cb/B octave discrepancy is left alone.** Cb major's cadence sounds an
octave below B major's, and canonicalising the pool hides that rather than
fixing it — whichever spelling survives, only one octave will ever be heard.
Whether `cadencePitches` should normalise its register is a separate question
about `generate/tonicize.ts` and is not settled here.

## Revisit when

- **A fourth exercise meets the same ambiguity.** Chord identification is the
  obvious candidate — an augmented triad has three spellings and one sound. At
  that point "the answer set is a function of what the question can
  distinguish" wants to be a shared helper rather than a rule three files
  implement separately, and the second item-id namespace should be
  reconsidered with it.
- **A scheduler reads `items` without `presentation`.** That is the moment the
  composition above stops being sufficient, and the blended item id becomes a
  real defect rather than a documented subtlety.
- **Someone proposes collapsing the reading paths too**, for symmetry. The
  answer is no, and the reason is in the Context: spelled accidentals separate
  enharmonics and that is a skill the exercise exists to teach.

## Addendum, 4 October 2026

Found by reading this record in sequence with
[0012](0012-the-judge-consumes-performed-notes-not-audio.md),
[0013](0013-knowing-the-answer-narrows-what-judging-has-to-do.md) and
[0018](0018-uncalibrated-is-not-zero.md), which the decision above did not do.
Nothing here changes it; it adds a trigger the Revisit list should have had.

**This record's mechanism depends on the answer being a choice from a list, and
the app is heading away from that.** 0012 decides that exercises are answered by
playing, with `grade` consuming a stream of performed notes. There is no pool to
collapse when the answer is a performance: the user plays a cadence and the
grader must accept the sounding tonic however it is spelled, which is
one-to-many in `grade` — exactly what the Decision above rejects for the
clicking case.

The two are not in conflict, and the reason is a distinction neither record
states: **equivalence belongs in `grade` when the input space is open, and in
the answer set when the input space is yours.** 0012's chord-voicing case is the
first; this record's button list is the second. Both will exist in the app at
once.

So: **revisit when key identification can be answered by playing.** Expect a
record that narrows this one rather than superseding it, and expect the
enharmonic set to be the same six pairs — the ambiguity is in the ear, not in
the input device.

The longer reading is in [`docs/judging-chain.md`](../judging-chain.md).
