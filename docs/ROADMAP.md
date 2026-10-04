# Roadmap

What is planned but not built. Decisions that turn out to be expensive to
reverse graduate from here into `docs/adr/`; everything else stays here until
it ships or is dropped.

## Spaced repetition

The app currently generates exercises from a difficulty setting and a set of
constraints. Both are things the user chooses. Neither knows what the user is
actually bad at, so practice is spread evenly over material that does not need
it evenly — which is the usual reason a practice app stops being used.

Spaced repetition replaces the uniform sample with a schedule: each practisable
atom carries its own review history, and the generator is steered towards the
ones that are due.

### What an item is

The unit the schedule tracks. These are not exercises — an exercise is a
*rendering* of several items at once.

| Kind | Example ids |
| --- | --- |
| Interval | `interval:m3:up`, `interval:tritone:down` |
| Chord quality | `chord:m7b5`, `chord:dom7:inv2` |
| Key signature | `key:Eb_major`, `key:C#_minor` |
| Scale | `scale:harmonic_minor` |
| Rhythmic cell | `rhythm:dotted_e_s`, `rhythm:e_q_e` |
| Progression | `harmony:ii-V-I`, `harmony:deceptive` |
| Note reading | `read:treble:ledger_above:A5` |

Ids must be stable across releases, because they key a user's history. That
makes them the same kind of commitment as the preset ids in the sibling tuner,
and probably the thing in this feature most worth an ADR.

### The problem that is not in the textbooks

Flashcard scheduling assumes one item per review with one graded outcome. Music
practice does not work that way: a single sight-reading bar in E♭ exercises a
key signature, half a dozen intervals, several rhythmic cells and a clef range
simultaneously, and the user plays it once. Attribution is many-to-many.

Getting this wrong in either direction is bad. Credit every item in the bar for
a clean read and a user coasts on easy material carried by one hard note;
blame every item for one wrong note and the schedule punishes six things
because of one.

The way out is that the app can see *where* in the bar the error was. Grading
already works in the same tick space the exercise was generated in, so a wrong
pitch or a late attack localises to a specific note — and from the note back to
the items that produced it. Attribution should therefore be per-event rather
than per-exercise, with items the user demonstrably got right credited even
when the exercise as a whole was failed. Items an exercise merely *contained*
without testing — a key signature in a bar with no accidentals — should get
nothing.

**It is not in the flashcard textbooks, but it is in the literature.** SM-2 and
FSRS do both assume one item per review, so the framing above is right about
them. The field that does address many-to-many attribution is knowledge
tracing, where an exercise is an *item* tagged with several *knowledge
components* and a single graded response updates all of them — the Additive
Factors Model and Performance Factors Analysis lineage, and most directly
[DAS3H](https://arxiv.org/abs/1905.06873), which added memory decay to
multi-skill tagging and allows the learning and forgetting curves to differ
from one skill to another.

Two things follow, neither of which changes the plan. The design arrived at
above — per-event attribution, per-item state, credit only for what was
actually tested — is the same shape that literature converged on, which is
reassurance rather than a reason to adopt a model that needs a large review
corpus nobody has yet. And per-skill curves are the evidence for
[ADR 0010](adr/0010-presentation-is-part-of-what-an-attempt-means.md): if
forgetting rates differ by skill, then reading a third and hearing one are two
skills with two curves, not one skill seen twice.

Starting with SM-2 remains right. The note is here so that whoever revisits the
algorithm knows the prior art exists and does not re-derive it.

### The algorithm

Start with **SM-2**: about fifty lines, thoroughly understood, and its failure
modes are documented everywhere. FSRS is better and the migration path is
real — both store per-item state and differ in what they keep — but tuning FSRS
needs a review corpus that does not exist yet. Revisit once there is one.

Scheduler state is per item: ease, interval, due date, lapse count, plus a
short rolling history for the latency signal below.

**Latency matters more here than in flashcards.** A musician who plays the
right note after two seconds of thought has not learned it. Grade on
correctness *and* time-to-attack relative to the tempo, so hesitation shortens
the next interval even when nothing was wrong.

### How it meets the generator

This is the part the current architecture already supports, and the reason to
write it down before the generator hardens.

Constraints prune candidate pools before any random draw. A scheduler adds a
third input alongside difficulty and constraints: a **weighting** over the
pools, raising the probability of due items without ever making an excluded one
reachable. So the order is constraints first (hard filter), then scheduling
weights (soft preference), then the seeded draw.

Two consequences worth stating now:

- The generator must be able to report **which items an exercise actually
  exercised**, which means emitting item ids alongside the notes. It already
  emits a `role` per note for the same kind of reason.
- A due item may be unreachable under the user's constraints — a `m7b5` that is
  due when the settings allow triads only. The schedule should say so rather
  than silently never showing it, the same way an empty pool surfaces as a
  typed error rather than an infinite loop.

### Storage and honesty

Review history is user data, lives in IndexedDB, and needs a versioned
migration from the first release. It is also the first thing in the app whose
loss would actually matter to someone, which makes export worth having early.

A "due today" count on the home screen is the whole visible surface of this
feature, and it should be honest: no streaks, no manufactured urgency. If
nothing is due, say so and offer free practice.

## Following the music on the staff

While something plays, the note sounding should be lit and a cursor should
travel the stave. It is the difference between a reference that shows you a
scale and one that teaches you to read it — the eye learns where it is by
being shown, repeatedly, where it is.

The same machinery serves the thing that matters more: **marking a
performance against the score.** Grading already works in the integer tick
space the exercise was generated in, so a wrong pitch or a late attack
localises to one note; colouring that note is the honest way to say so, and
it is the same "find the note at tick *t* and change how it looks" operation
as the cursor.

### How it has to work

- **Time comes from the AudioContext clock**, never from counting animation
  frames. The scheduler already runs against it and a cursor driven by
  anything else drifts away from the sound it is meant to be following —
  which is worse than no cursor, because it teaches the wrong thing.
- **`toVexflow` has to return a tick-to-position map.** VexFlow knows each
  note's bounding box only after it has laid the stave out, so the adapter is
  the only place that can report it. That is a real extension to its return
  type, which currently returns nothing at all.
- **Do not redraw to highlight.** Re-engraving a stave per frame is far too
  slow; the drawn SVG already has a group per note, so highlighting is a
  class on a group and the cursor is one line moved by a transform. That also
  keeps the per-frame work out of React entirely.
- **A tuplet and a tie make "the note at tick t" ambiguous**, and a repeat
  makes it ambiguous twice over. The map should be from a note's identity to
  its position rather than from a tick, with the caller holding the sequence.

Worth building with the first exercise that grades a performance rather than
an answer — sight reading or rhythm — because that is when the colouring half
stops being decoration.

## Importing sheet music

Exercises are generated. The obvious thing they cannot do is use the piece
you are actually learning, and a learner practising a Bach prelude wants
sight-reading drilled on *that*, not on a plausible imitation of it.

**MusicXML, not `.mscz`.** MuseScore's own format is a zipped container whose
internals follow its releases; MusicXML is the interchange format it and
every other notation program export, it is documented, and a parser written
against it keeps working. Accept `.musicxml` and compressed `.mxl`, and say
plainly in the UI that MuseScore exports both.

### What a score is for, once it is in

Not a new exercise type — a *source* the existing ones draw on. The engine
already speaks in spelled pitches, integer ticks, keys and roman numerals,
which is exactly what a score parses into. So:

- **Sight reading** takes bars from the piece instead of from the generator.
  The grading path does not change at all.
- **Rhythm** takes a bar's rhythm and drops its pitches.
- **Key and chord identification** can take real cadences out of real music,
  which is more convincing than anything synthesised.
- **The spaced-repetition items are the same items.** A B♭ major scale
  passage in bar 12 of a sonata exercises `key:Bb_major` like any other.

### The parts that will actually be hard

- **MusicXML is enormous and most of it does not matter here.** Parse a small
  subset deliberately — notes, rests, ties, time and key signatures, repeats —
  and *report* what was ignored rather than failing or pretending. A file
  with four staves of orchestral cues should import the flute line and say so.
- **Real music modulates.** The key signature at the top is not the key of
  bar 40. Key-identification exercises drawn from a score need either an
  analysis pass or a user saying which bars are in which key; the honest first
  version asks.
- **A score is copyrighted.** Imports stay on the device, are never uploaded,
  and nothing is shared between users. That is a privacy and a legal
  constraint at once and it should be stated in the UI, not just honoured.
- **Pickup bars, repeats, first and second endings, and voices** all break the
  assumption that bar *n* of the file is bar *n* of the music. The tick model
  can represent all of it; the importer has to be the thing that knows.

Worth doing after the six generated exercise types work, because every one of
them is the consumer, and a source with nothing to feed is not useful.

## Also planned, not yet designed

- **Guitar tablature** via VexFlow's `TabStave`, for fretted instruments.
- **A theme toggle**, which needs `Score` to watch the `data-theme` attribute
  as well as the media query (there is a `todo` pinning this in
  `Score.test.tsx`).
- **Sampled instruments** as an optional download behind the `InstrumentPack`
  seam, with the synthesised one staying the default.
- **Multi-system scores**, which is when `drawScore` gets a real measured
  height to return rather than the caller's guess echoed back.
- **More named rhythm patterns**, and patterns for the metres that have one or
  none — 2/2, 3/8, 9/8, 5/8. The catalogue in `src/generate/patterns.ts` is
  the musical asset there, the way the progression templates are for harmony,
  and twenty correct ones are worth more than any cleverness.
- **Rhythm figures the generator cannot yet place**: a figure that spans a
  whole bar rather than one or two beats, and ties across the barline, which
  `cells.ts` can represent and `rhythm.ts` does not yet choose.
