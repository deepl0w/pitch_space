# Pitch Space

Ear training and sight reading for musicians, generated on the spot.

**[Open it →](https://deepl0w.github.io/pitch_space/)** — it runs in a
browser and installs as an app.

Every question is made when you ask for it rather than drawn from a bank,
and the point of the whole design is the qualifier: **generated from real
patterns, not from random notes.** A generator that picks uniformly from a
scale produces unsingable nonsense and teaches bad habits, so the music
engine — not the interface — is where most of the work is.

## Contents

- [What you can practise](#what-you-can-practise)
- [Everything is configurable, and nothing is a difficulty](#everything-is-configurable-and-nothing-is-a-difficulty)
- [How the music is generated](#how-the-music-is-generated)
- [What is not built yet](#what-is-not-built-yet)
- [Running it yourself](#running-it-yourself)

## What you can practise

Six kinds of practice, each asked by ear or off the staff.

| | What it asks |
| --- | --- |
| **Note identification** | Name an interval, or name what a note is *doing* in a key. Two different skills, and a learner is routinely fluent at one and lost at the other. |
| **Chord identification** | Name a chord's quality, from twenty-four, on any root — and its bass note if you want the harder question. |
| **Scale identification** | Name a scale, from twenty types, in any key. |
| **Chord progressions** | Hear a key established, then a progression; name what each chord is doing as a roman numeral. |
| **Key identification** | Read a signature, or a line of notes, and name the key. |
| **Rhythm** | Read or hear a rhythm, then play it back in time. The one answer that is a performance rather than a choice. |

There are also reference screens — the circle of fifths, every scale in
every key, the rhythm figures the generator builds from — for looking
things up rather than being tested on them.

**What is asked moves, so the skill transfers.** Scales, chords and
degrees are asked in every key, and the answer never names the root: a
learner who only ever hears the modes from C has learned the white notes.

## Everything is configurable, and nothing is a difficulty

There is no easy/medium/hard anywhere, and that is a decision rather than
an omission ([ADR 0027](docs/adr/0027-configure-by-naming-what-an-exercise-contains.md)).

Every exercise used to take a 1-to-5 ordinal and spend it as an index into
a private table, so "level 3" meant four accidentals in one exercise, a
twelve-semitone register in another and a harmonic grade in a third.
Someone who wanted three accidentals could not ask for three accidentals.

Each setting now names the thing it sets — which intervals, how far round
the circle, which scale types, how many bars, how many syncopated figures
a bar may carry, whether sevenths are in play. The ordering left the
catalogues too, which had a real consequence: five of the thirty-five
progression templates had been unreachable from the app — including the
whole blues section, because the preset table only ever asked for four
bars or eight.

## How the music is generated

Everything below is pure and deterministic given a seed. An exercise you
report by its seed reproduces exactly, which is also what lets the entire
engine be tested without a browser.

**Pitches are spelled, never MIDI numbers.** A pitch is a letter, an
alteration and an octave, so a C blues scale prints G♭ and G rather than
F♯ and G — the same staff step twice is unreadable, and no amount of
"close enough" in the audio makes the page right.

**Time is integer ticks**, 1680 to a quarter note, chosen so every
subdivision the app needs is exact: 64ths, triplets, quintuplets,
septuplets, a 6/8 bar. Floats accumulate drift and make "this bar sums to
the meter" untestable.

**Harmony** is planned before any chord exists: the phrase structure
first — antecedent and consequent, or a sentence — then each phrase filled
from a corpus of thirty-five real progression templates (twelve-bar blues
and its variants, doo-wop, ii–V–I, rhythm changes, Pachelbel, Andalusian,
descending fifths), falling back to a two-level functional state machine
where no template fits. Cadences are then *written*, not hoped for, so
"every progression cadences" is true by construction rather than
statistically likely.

**Rhythm** is built from thirty-seven beat-sized figures that players
already have in their hands, placed with a join rule — a figure that starts
off the beat may only follow one that ends sustained or on a rest.
Otherwise two bare consecutive attacks read as noise rather than as
syncopation. Eleven metres, including the additive ones.

**Melody** is a beam search, because the constraints that matter are
global — a single clear high point, a line that arrives where the cadence
needs it — and a note-by-note random walk cannot see far enough to honour
either. On every strong beat the pitch must be a chord tone or a prepared
suspension.

**And every note records what it is doing** — chord tone, passing,
neighbour, suspension, appoggiatura, escape, anticipation. The search
computes that to enforce its own constraints, so emitting it costs
nothing, and it is what makes the engine falsifiable: the tests take the
role the generator asserted and check that the notes either side of it
actually support it. A mislabelled note fails a test. "Sounds a bit off"
is not something a test can see.

## What is not built yet

Stated plainly, because the brief promises some of it.

- **The microphone, for five of the six.** Intervals can be answered by
  playing them: the capture chain runs from a real device through the
  detectors to the grader. The other five still take a click, and rhythm
  is answered by tapping, which is a real way to practise rhythm and is
  not the same thing.
- **Sight reading**, which wants the melody generator to develop a motif
  rather than only obey constraints. Legal and characterless is the
  failure mode here, not illegal.
- **Spaced repetition.** Attempts are recorded per item and per sense, and
  the schedule that would read them is written and tested — but nothing
  calls it yet. A first attempt to surface it on the home screen was
  removed the same hour: the arithmetic was right and the sentence it told
  the user was wrong.
- **Export and import** of your history, and **custom scales, chords and
  progressions**. See [`docs/ROADMAP.md`](docs/ROADMAP.md).
- **The Android build.** `./build.sh --android` exists and refuses with a
  reason: Capacitor is not set up, so this ships as a web app today.

## Running it yourself

Node 20.19+ or 22.12+.

```bash
npm install
npm run dev          # http://localhost:5173
./test.sh --all      # what CI runs: tests, types, lint, offline precache
./build.sh           # production build
make help            # the same things, wrapped
```

Several checkouts cannot all have port 5173; `tools/app.sh` picks a free
one and prints it.

[`CLAUDE.md`](CLAUDE.md) is about working on this,
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) about how it is put
together, and [`docs/adr/`](docs/adr/) records the twenty-eight decisions
that would be expensive to reverse — including several that were wrong
and say so.

MIT licensed.
