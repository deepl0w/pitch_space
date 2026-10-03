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

## Also planned, not yet designed

- **Guitar tablature** via VexFlow's `TabStave`, for fretted instruments.
- **A theme toggle**, which needs `Score` to watch the `data-theme` attribute
  as well as the media query (there is a `todo` pinning this in
  `Score.test.tsx`).
- **Sampled instruments** as an optional download behind the `InstrumentPack`
  seam, with the synthesised one staying the default.
- **Multi-system scores**, which is when `drawScore` gets a real measured
  height to return rather than the caller's guess echoed back.
