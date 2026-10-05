# Roadmap

What is planned but not built. Decisions that turn out to be expensive to
reverse graduate from here into `docs/adr/`; everything else stays here until
it ships or is dropped.

## Contents

- [Spaced repetition](#spaced-repetition)
  - [What an item is](#what-an-item-is)
  - [The problem that is not in the textbooks](#the-problem-that-is-not-in-the-textbooks)
  - [The algorithm](#the-algorithm)
  - [How it meets the generator](#how-it-meets-the-generator)
  - [Storage and honesty](#storage-and-honesty)
- [Following the music on the staff](#following-the-music-on-the-staff)
  - [How it has to work](#how-it-has-to-work)
- [Importing sheet music](#importing-sheet-music)
  - [What a score is for, once it is in](#what-a-score-is-for-once-it-is-in)
  - [The parts that will actually be hard](#the-parts-that-will-actually-be-hard)
- [Learning the catalogues from real music](#learning-the-catalogues-from-real-music)
  - [A workbench for the corpus, once there is one](#a-workbench-for-the-corpus-once-there-is-one)
  - [Recordings to go with them](#recordings-to-go-with-them)
- [A settings screen](#a-settings-screen)
- [Taking your progress with you](#taking-your-progress-with-you)
- [Bringing your own material](#bringing-your-own-material)
- [Also planned, not yet designed](#also-planned-not-yet-designed)

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

## A practice count that is believable

The home screen briefly carried a per-card count of what was waiting —
"16 to practise" — and it was removed within the hour. Two sweeps found
it misleading in three independent ways, and all three have the same
shape: **the arithmetic was right and the sentence was wrong.**

- **It could not say "I do not know".** With storage blocked, the
  numbers came back byte-identical to a brand-new profile, because with
  no readable history every item is unseen and unseen is due. A user
  could not tell "we cannot read your history" from "you have not
  started", and the first of those is the one worth saying.
- **It moved with the settings, not only with practice.** Re-including
  two intervals that had never been practised put the count back to its
  fresh-profile figure, which reads as having lost the work already
  done — the per-item tally underneath still had it, correctly.
- **It summed a family.** The note-identification card adds intervals
  and scale degrees together, so a learner who narrowed to one interval
  and answered it correctly twelve times running watched the count go
  from five to four. The remaining four were scale-degree items that no
  amount of interval practice can clear, and nothing on the card said so.

What a believable version needs, from those three:

- **A figure that cannot read as going backwards.** "Due" falls when you
  practise and rises when you widen the pool, and the second is
  indistinguishable from losing progress. Something cumulative — how
  much you have met, out of how much is in scope — only ever rises with
  effort, and widening adds to the denominator without touching the
  numerator.
- **An explicit unreadable state**, not silence that looks like zero.
  [ADR 0006](adr/0006-settings-in-localstorage-progress-in-indexeddb.md)
  already requires deciding what the first frame shows while the log
  loads; this is the same decision for a log that will never load.
- **A number scoped to what the card opens.** A family card that sums
  two exercises is promising work the user cannot do from that card
  without first changing which exercise is running.

Until then `src/state/schedule.ts` has no production caller, which is
the honest state and recorded in `docs/IN-FLIGHT.md` rather than hidden
behind a surface that said the wrong thing.

## Learning the catalogues from real music

The templates in `src/generate/templates.ts` and the cells in `cells.ts` are
hand-written, and `CLAUDE.md` calls the template catalogue the actual musical
asset. The question is whether a corpus of real repertoire could be analysed
to derive or check them. The corpora have been surveyed and the licences read
at source rather than inferred, because this repository is public and MIT.

**The usable set covers classical, baroque, pop, rock and rhythm, and does
not cover folk, jazz, blues or flamenco.** That is worse than expected and
it is not a copyright problem: the Essen Folksong Collection, the obvious
folk source, ships the CCARH MuseData agreement, which says in terms that
the data may not "be embedded or included in teaching materials for
commercial or non-commercial distribution". This app is teaching material
distributed free, so that is fatal independently of everything else. The
Humdrum bulk download pulls the same repository and inherits it. Jazz is
non-commercial (the Jazz Harmony Treebank is CC BY-NC-SA, widely miscited as
CC BY) or ODbL (Weimar); flamenco's COFLA/TONAS forbids redistribution; for
blues there is no annotated corpus at all. Those four tags stay hand-written.

What is clean, in the order worth taking:

| Corpus | Licence of the files downloaded | Gives |
| --- | --- | --- |
| [Rock Corpus RS200](http://rockcorpus.midside.com/) | CC BY 4.0, commercial use stated outright | 200 songs as roman numerals, with timings |
| [McGill Billboard](https://ddmal.ca/research/The_McGill_Billboard_Project_(Chord_Analysis_Dataset)/) | CC0 | 740 songs: chords, key, metre, sections, phrases |
| OpenScore Lieder and String Quartets | CC0-1.0 | 1,300 songs and 100+ quartets, scores |
| [Groove MIDI](https://magenta.tensorflow.org/datasets/groove) | CC BY 4.0 | 22,000 measures of played rhythm |
| [haydn_op20_harm](https://github.com/napulen/haydn_op20_harm) | Apache-2.0 | six quartets with functional analysis |

**The DCML corpora are the best fit and their licence contradicts itself.**
They are the only source carrying roman numerals, key, phrase *and* cadence
labels together, which is exactly the shape of `PhrasePlan` — and the
aggregate Zenodo deposit says CC BY 4.0 while the component deposits and the
GitHub repositories say CC BY-NC-SA 4.0. The conservative reading is NC,
which rules them out of anything shipped. It is also cheap to resolve by
asking them, and worth asking, because annotated cadences and phrases are
worth more here than anything else on offer.

**Share-alike is a separate problem from non-commercial and survives a
favourable answer on everything else.** A `templates.ts` derived from a
CC BY-SA corpus would arguably have to carry CC BY-SA inside an MIT
repository. The way round it is to derive from the CC0 OpenScore encodings
rather than reuse CC BY-SA analyses of the same works.

**The question the whole plan turns on is whether a derived template is a
derivative work at all.** A chord progression as such is generally treated as
an unprotectable building block and a specific melody is not, so `I–vi–IV–V`
with a style tag is probably not something a licence can attach to. That is a
position and not a certainty, and nothing here is legal advice.

**And one argument against the premise, which is the most useful thing in the
survey.** The templates earn their place by being recognisable whole forms —
the twelve-bar blues, rhythm changes, the axis, La Folía. A frequency count
over a corpus does not produce those; it produces common two- and three-chord
joins, which is the Markov chain `templates.ts` already argues against at
length and for the right reason. Finding whole-phrase forms needs
repeated-sequence mining at phrase length, which is harder than parsing the
corpora.

So the first phase is **measuring the hand-written catalogue rather than
replacing it**: is the royal road really a thing in 1960s pop, does the axis
dominate rock the way the comment asserts, and which templates are flat
weights that the corpus would weight differently. That ships nothing derived
from the corpus at all, which sidesteps most of the licensing above. The
rhythm cells are the exception where counting genuinely produces the right
object, because a beat-sized figure *is* a frequent short pattern — Groove
MIDI is the source, and the caveat is that it is overwhelmingly 4/4, so it
does nothing for the additive metres this file already names as thin.

### A workbench for the corpus, once there is one

Wanted as soon as material is imported rather than after: **a tool for
looking at the database and the relations in it** — which excerpts, scores
and recordings exist, what has been extracted from each, and, the part that
is actually hard to get any other way, **where each part is used**. A
template derived from bar 9 of a quartet should be traceable back to it, and
the quartet should be able to say which templates, cells and audio excerpts
came out of it.

And **editing by hand**: labelling and relabelling. Any analysis of real
music is partly wrong — MusicNet's own authors estimate a 4% labelling error
rate, a derived cadence type is an inference, and a style tag is a judgement
rather than a measurement. A corpus that can only be regenerated is one
where every correction has to be expressed as a better algorithm. Being able
to say "this is a half cadence, not an imperfect authentic one" and have it
stick is what makes a corpus improve instead of merely change.

Two things follow that are worth deciding before any of it is built. A hand
correction has to survive re-importing the source, so corrections live apart
from the extraction rather than being written back into it. And a derived
entry should carry its provenance — which file, which bars, which extraction
run — because that is the same field the usage view reads and the same one
that makes a licence question answerable later rather than archaeological.

Not a user-facing screen. This is a maintainer's tool over the build-time
corpus, in the same family as `tools/report-facts.sh`.

### Recordings to go with them

Separate from the sampled instruments above, and with a trap one layer worse:
a public-domain *work* says nothing about a *recording* of it, because the
performance and the master are their own rights. Bach dying in 1750 does not
free a 1998 recording of him.

- **Short real examples** — a cadence, a rhythm — want
  [MusicNet](https://zenodo.org/records/5120004), CC BY 4.0, 330 classical
  recordings with over a million note labels giving every onset, instrument
  and metrical position. Those labels are what make it possible to cut bar 12
  of a quartet and know exactly where it begins. 11.1 GB, a build-time input;
  a two-second excerpt is about 8 KB as mono Opus, so forty of them is the
  same order as the piano pack and precaches the same way. The authors
  estimate 4% labelling error, so a cut phrase wants listening to.
- **Whole performances against a score** want the **Open Goldberg
  Variations** and the **Open Well-Tempered Clavier** (Kimiko Ishizaka), which
  are the rare case of **CC0 on the recording and CC0 on the score** — the
  combination that defeats the trap. No note alignment shipped, but the onset
  and pitch detectors already exist and DTW against a CC0 score is known work.
- **Aligned but non-commercial, so build-time at best:** ASAP/MAESTRO
  (CC BY-NC-SA 4.0, widely miscited as CC BY), PHENICX-Anechoic. URMP states
  no licence anywhere, which is a finding rather than a gap.

Prefer **CC0 for anything that ships**, since it carries no notice into the
bundle, and CC BY for anything that stays at build time.

## A settings screen

Everything that is about the app rather than about an exercise, in one
place: the theme, and the audio calibration that currently has a card on
the home screen of its own.

Calibration is the reason this is worth doing rather than a tidy-up.
It sits in `SETUP_MENU`, a list invented for it because it is "not an
exercise and not a reference" — a comment that is already describing a
settings screen without having one. Measuring your microphone's delay is
something you do once and forget, which is exactly what belongs behind a
settings door and exactly what should not be a card next to the six kinds
of practice.

The theme toggle is listed below as well, and the two should land
together: a toggle with nowhere to live is most of why it has not.

## Taking your progress with you

Export and import of the attempt log, so a learner's history survives a
device.

**After spaced repetition is doing real work, not before.** Until the
schedule reads the log for something a user can feel, an export is a
backup of a scoreboard — and the shape of what is worth exporting is
decided by what the schedule turns out to need. Exporting the wrong
record and then having to migrate it is more work than waiting.

[ADR 0006](adr/0006-settings-in-localstorage-progress-in-indexeddb.md)
already names this as one of its revisit conditions, and says why it is
the hard one: export and import read the whole log and write it back,
which is the first operation large enough for the record-at-a-time
migration to be the wrong granularity, and the first where a partial
failure has to mean something.

## Bringing your own material

Scales, chords and progressions a user adds, for the niche material no
catalogue will cover.

The catalogues are already the right shape for this and that is not an
accident — a `ScaleType` is a list of semitones with the staff steps that
spell it, a `ChordType` the same, and a `Template` a list of degrees with
a cadence and some tags. None of them references anything outside itself,
so a user-supplied entry is data of the same kind rather than a plugin.

Three things will be the work, and none of them is the parsing:

- **Spelling.** The staff-step array is what makes a C blues print G♭ and
  not F♯, and it is the part a user will not want to type. It has to be
  derivable from something they would write, or inferred and shown back
  for correction.
- **Ids.** An item id keys a user's history for good
  ([ADR 0007](adr/0007-an-attempt-records-per-event-item-attribution.md)), so a custom entry
  needs an id that cannot collide with a built-in one this release has
  never heard of.
- **Validation at the boundary.** `template()` and `cell()` already throw
  on a corpus that does not add up, which is right for data written by a
  contributor and wrong for data arriving from a file. An import needs to
  refuse an entry and say why, not take the app down.

## Also planned, not yet designed

- **Guitar tablature** via VexFlow's `TabStave`, for fretted instruments.
- **A theme toggle**, which needs `Score` to watch the `data-theme` attribute
  as well as the media query (there is a `todo` pinning this in
  `Score.test.tsx`). It belongs on the settings screen above.
- **Sampled instruments** as an optional download behind the `InstrumentPack`
  seam, with the synthesised one staying the default. The candidates have
  been researched and the licences read at source rather than inferred from
  a page calling something free, which matters because this repository is
  public and MIT.

  The recommendation is **FreePats Upright Piano KW (small)**, CC0 by a
  dedication shipped inside the archive, 26 FLAC samples at 2.24 MiB that
  transcode to roughly 400 KB of Opus — small enough to precache beside the
  existing 1.3 MB shell rather than becoming a download. Its SFZ maps onto
  Web Audio directly: `pitch_keycenter` becomes a `playbackRate`, the loop
  points become `loopStart`/`loopEnd`, and the mapping is a build-time JSON
  manifest and about forty lines rather than an SFZ parser. The same project's
  Spanish Classical Guitar is CC0 too, one sample per semitone.

  The honest cost: one velocity layer and four to six semitones of stretch
  per sample, so dynamics are gain-only and the hammer noise shifts pitch
  with the note. The alternative that removes stretch entirely is
  **FluidR3_GM**'s per-note packs — MIT in Frank Wen's own words, a sample on
  every semitone, no mapping code at all, but 2 MB an instrument and it
  sounds like the 2002 General MIDI soundfont it is. Settling that is an hour
  of A/B listening, not an argument.

  For a *choice* of instrument once one works, **MuseScore_General.sf3** is
  MIT with its acknowledgements spelled out, 38 MB whole — the opt-in download
  this entry already describes, or trimmed to a few presets at build time.

  Excluded, with the reason, because each is easy to reach for: Philharmonia
  forbids redistribution "as is", which is exactly shipping it as a pack;
  WebAudioFont is GPL-3.0; MusyngKite and FatBoy are CC-BY-SA; FreePats' own
  General MIDI set is GPL. Two are worse than excluded — GeneralUser GS says
  in its own licence that its author "cannot be 100% sure where all of the
  samples originated", and the Splendid Grand Piano's public-domain claim
  rests on a secondhand assertion about Akai with no primary source. An
  unverifiable licence is a finding, not a gap.

  Two obligations if this is taken: a `THIRD-PARTY.md` carrying Frank Wen's
  MIT notice and the MuseScore acknowledgements if either is used (CC0 needs
  nothing), and an audio extension added to the workbox `globPatterns` in
  `vite.config.ts` — the line that turns a sampled instrument from a download
  into something the offline app actually has.

  The larger cost is not the loader. `src/testing/audioContext.ts` implements
  only the surface `Synth` uses and would need `createBufferSource`,
  `decodeAudioData` and the buffer properties before any of this is testable,
  and a sampler adds a second cold path — samples still loading when `play()`
  is called — on top of the cold-context wake that `play()`'s generation
  ticket already guards. That ticket is the model for it, and it wants a test
  before the code.
- **Real recordings as pitch-detector fixtures**, which is a different need
  from playback and wants a different source. `src/audio/testing/signals.ts`
  already names what it lacks — "there is no room, no body resonance and no
  second note" — and a playback sample is normalised, close-miked and dry,
  which is the opposite of a hard test. **VCSL** is CC0 and already stored as
  individual notes named by pitch, velocity and round robin, so a dozen
  trimmed to two seconds are committable at 50–100 KB each with no
  attribution obligation at all. **TinySOL** (CC-BY 4.0, 2,913 isolated notes
  from Ircam, 1.0 GB) is the better corpus for a downloaded run outside the
  unit suite. The Iowa MIS recordings say they may be used "without
  restrictions" on a web page, which is a statement and not a licence
  instrument; usable, but record it as that.
- **Multi-system scores**, which is when `drawScore` gets a real measured
  height to return rather than the caller's guess echoed back.
- **More named rhythm patterns**, and patterns for the metres that have one or
  none — 2/2, 3/8, 9/8, 5/8. The catalogue in `src/generate/patterns.ts` is
  the musical asset there, the way the progression templates are for harmony,
  and twenty correct ones are worth more than any cleverness.
- **Rhythm figures the generator cannot yet place**: a figure that spans a
  whole bar rather than one or two beats, and ties across the barline, which
  `cells.ts` can represent and `rhythm.ts` does not yet choose.
