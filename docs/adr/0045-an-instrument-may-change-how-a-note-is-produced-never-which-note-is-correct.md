# ADR 0045 — An instrument may change how a note is produced, never which note is correct

- **Status:** Accepted
- **Date:** 2026-10-09

The user asked that every instrument's characteristics shape how its notes are
played, not only how they sound. This says how far that may go before it stops
being presentation and starts being the question.

## Context

`Instrument` describes a sound: partials, inharmonicity, and an envelope. The
user's request, prompted by the guitar but explicitly about all six:

> the guitar is the thing i noticed but should have in mind the
> characteristics of all the different instruments and adapt how the sound is
> adapted for each when playing the notes

**One field already works this way and shows the shape of the request.**
`holds` is not a level; its own comment says it "is what separates struck from
blown, and it is a fact about the instrument rather than a level". An organ
holds while the key is down and a piano cannot. That is idiom, not timbre, and
it is already in the catalogue.

What the six actually differ in goes well past that. A guitar is six strings
with fretboard shapes, strummed rather than struck together, open strings
ringing and notes doubled at the octave. Bowed strings swell and slur between
notes. **A flute is monophonic and cannot play a chord at all** — and the app
currently renders chords on it as a stack of simultaneous flute tones, which is
a sound no flute has ever made.

## Decision

**An instrument may change how a note is produced. It may not change which
notes are correct.**

Three tiers, and the line falls between the second and the third:

1. **Timbre** — partials, inharmonicity, envelope. Free, and what the
   catalogue does today.
2. **Articulation and onset** — a strum spreading voices by 15–30 ms from the
   lowest string, a bow's slow swell, legato between notes, an organ's
   simultaneous attack. **Also free**, because it lives entirely in
   `audio/output/`, below the platform edge, where nothing above can observe
   it. No exercise's answer can change as a result, and no test above that
   layer needs to know.
3. **Note selection** — a fretboard shape choosing different notes from the
   ones the chord asked for, or monophony forcing a chord to be arpeggiated.
   **Not free.** This reaches what the learner is being asked and graded on.

**Where an instrument cannot produce what the exercise needs, that is an
incompatibility to declare, not a rendering to approximate.** A flute and a
four-note chord is the clear case: arpeggiating it silently turns "identify
this chord" into "identify this arpeggio", which is a different skill with a
different answer, chosen by nobody. The exercise should say the instrument
cannot play this, and offer one that can.

## Why this line and not another

It is the one that keeps [0043](0043-an-instrument-is-not-part-of-what-a-line-measures.md)
true rather than quietly undermining it. That record ruled an instrument is a
property of playback and not part of a line's identity, which is right exactly
while the instrument changes only how things sound. Tier 3 changes which notes
sound, so it reaches `items(settings)` and 0043 stops covering it — not because
0043 was wrong, but because its premise would no longer hold.

**So tier 3 is where 0039's escape clause applies**, and the test is concrete
rather than a judgement. Item ids already encode the things that must not drift:
`chord:dom7:inv2` names an inversion. If a fretboard shape puts a different note
in the bass, the item has changed and the id must change with it — or the shape
must be constrained to preserve the inversion the exercise asked for. Either is
defensible; doing neither is how a learner's history silently stops meaning one
thing.

## What this costs

**It forbids the most attractive version of the feature.** The appealing thing
to build is a guitar that voices chords the way a guitarist would, on every
exercise, because that is what a guitar sounds like. This says that cannot be
done for graded chord work without deciding the item question first, which will
feel like bureaucracy at the moment someone has a working fretboard catalogue
and a clearly better sound.

**And it adds a failure mode the app does not have**: an exercise and an
instrument that do not go together. That is a message to write, a state to
design, and a settings interaction to get right, in exchange for not lying
about what a flute can do. The alternative is cheaper and dishonest, and this
project's whole standard for an exercise is that what it asks is what it
measures.

Tier 2 is unaffected and remains cheap, which is the practical consequence
worth holding on to: **almost everything that makes an instrument recognisable
as itself is articulation, and all of it is free.** A strummed guitar with
piano voicings is most of the way to sounding like a guitar, and it is the half
that no record needs to govern.

## Revisit when

**An instrument is proposed whose idiom cannot be expressed in tiers 1 and 2.**
The fretboard catalogue is the known case and it is tier 3 by construction.
Monophonic instruments are the other: the decision above declares an
incompatibility, and if that proves unusable in practice the alternative is an
explicit arpeggiated *presentation* with its own item ids under
[0010](0010-presentation-is-part-of-what-an-attempt-means.md), never a silent
substitution.
