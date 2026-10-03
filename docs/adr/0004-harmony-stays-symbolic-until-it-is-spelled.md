# ADR 0004 — Harmony stays symbolic until it is spelled

- **Status:** Accepted
- **Date:** 2026-10-03

Records a decision already taken in
[`src/theory/roman.ts`](../../src/theory/roman.ts), and names the costs it
carries. Depends on [0001](0001-a-pure-core.md): a representation this central
is only cheap to get right because the whole harmony layer is testable without
a browser.

## Context

A chord progression has to be stored as something. The obvious candidate is the
sounding result — pitch classes, or MIDI numbers, or spelled pitches fixed at
the moment the progression is chosen. That is what the audio layer wants and
what a naive generator would reach for.

It cannot work here, and the reason is spelling. `theory/` goes to considerable
trouble to distinguish G# from Ab
([`Pitch`](../../src/theory/pitch.ts) carries a letter and an alteration rather
than a semitone), because notation and ear training both depend on it. That
investment is wasted if harmony is chosen in pitch classes and spelled
afterwards, because by then the information needed to spell it is gone.

The example that settles it is the applied dominant. V/V in C major is D–F#–A.
A generator holding `{2, 6, 9}` has no way to recover whether the middle note
was meant as F# or as Gb — both are pitch class 6, and only one of them is a
major third above D. The letter is not a rendering detail that can be decided
later; it is fixed by the degree, upstream of any accidental.

The same is true of the Neapolitan, of every borrowed chord, and of any
progression that needs to be transposed. Spelling is a function of harmonic
meaning, and harmonic meaning is exactly what a pitch-class representation
throws away.

## Decision

**Harmony is represented as roman numerals and realised into spelled pitches as
late as possible.** [`RomanNumeral`](../../src/theory/roman.ts) holds a scale
degree, a chromatic alteration of that degree, a chord type, an inversion, an
optional applied target and a harmonic function. It holds no pitches.

[`realizeNumeral`](../../src/theory/roman.ts) is the one place the conversion
happens. It takes a key, and the root's *letter* comes from that key's own
scale, so a chromatic alteration can only ever move the accidental — never the
staff step. The spelling falls out correctly by construction rather than being
repaired afterwards.

**An applied chord is realised against its target, not against the home key.**
V/ii is built a fifth above the root of ii, borrowing the target's major scale
whatever the target's own quality, because that is what makes the leading tone
lead. Building it from the home key's degrees instead gives the same answer in
C and diverges the moment the target is itself altered — which is the case
worth getting right.

The harmony generator therefore moves between *functions* — tonic,
predominant, dominant — and never between pitches. Pitches are what the layer
below produces on request.

## Consequences

Spelling is correct by construction across all thirty keys, and the suite
checks it rather than assuming it: every diatonic triad is fed back through
[`identifyChord`](../../src/theory/chord.ts) and has to return the quality it
was asked for, no diatonic chord in any key needs a triple accidental, and
every applied dominant is asserted to have a real leading tone to its target
([`roman.test.ts`](../../src/theory/roman.test.ts)).

Transposition becomes free. The same numerals realised in a different key give
a correctly spelled progression, which is what lets a sight-reading exercise
offer "this progression, in all fifteen major keys" without a transposition
routine that has to re-decide every accidental.

Display is free too. [`numeralText`](../../src/theory/roman.ts) prints the
numeral directly from the symbolic form — case for quality, figured bass for
inversion, a slash for an applied target — so the analysis shown to the user is
the same object the generator reasoned about, and cannot drift from it.

### What this costs

**Two representations that must stay in step.** `RomanNumeral` and `Chord` both
describe a chord, and a change to `CHORD_TYPES` can silently change what a
numeral realises to. The cross-check through `identifyChord` is what keeps this
visible, and it is load-bearing rather than decorative.

**Realisation is one-way.** Pitches cannot be turned back into the numeral that
produced them — `identifyChord` deliberately returns every reading that fits,
because a diminished seventh genuinely has four roots. Anything needing to go
backwards, such as judging a chord the user played against the numeral that was
asked for, has to compare at the pitch level or carry the numeral alongside.

**The harmonic function is baked in at construction.** `numeral()` defaults `fn`
from the degree alone: iii and vi are tonic, ii and IV predominant, V and vii
dominant. That is a defensible textbook grouping and it is still a claim about
something contextual. A vi following V is a deceptive resolution; a vi leading
to ii is behaving as a predominant. The field can be overridden, but the default
encodes an opinion at the point where it is least visible, and a generator that
trusts it will write progressions that are correct by its own lights and
occasionally wrong by ear.

**`APPLIED_SEMITONES` always borrows the major scale of the target.** That is
right for applied dominants, which is what it is for. It is not right for every
chord that could be applied — an applied vii°7 to a minor target is a different
calculation — so the constant will want revisiting rather than extending the
first time something other than V/x is generated.

## Revisit when

The generator first wants a chord that is not expressible as degree plus
alteration plus type. Augmented sixths are the likely trigger: an Italian sixth
is not a stack of thirds on a degree, and the honest answer may be a separate
variant on `RomanNumeral` rather than a chord type that nearly fits.

Or when judging needs to go backwards — comparing what the user played against
the numeral asked for. Check whether comparing spelled pitches is enough, or
whether the exercise needs to carry the numeral through to the judge, before
anyone is tempted to make `identifyChord` return a single answer.
