# ADR 0028 — A question only absolute pitch can answer is not a hard question

- **Status:** Accepted
- **Date:** 2026-10-05

Removes key identification's listening mode, and supersedes
[0020](0020-by-ear-the-unit-is-the-sounding-key.md) and
[0022](0022-an-outcome-for-evidence-that-was-never-shown.md), which
are both about marking that mode fairly.

## Context

Key identification by ear played a I–IV–V–I cadence and asked which key it was
in. No reference pitch, before or during.

A listener with relative pitch hears the same thing in every key. That is what
relative pitch *is*: the intervals are identical, the cadence is identical, and
the only thing distinguishing C major from E♭ major is the absolute frequency
of the tonic. So the exercise had exactly one right answer and no evidence a
relatively-pitched listener could use to find it. It was not a hard question.
It was a question about whether the user has absolute pitch — a faculty
roughly one musician in ten thousand has, which adults essentially cannot
acquire, and which this app has no other interest in.

What the user saw was a run of wrong answers in a mode that looked like every
other mode in the app, with nothing to distinguish "I am failing at something
I could learn" from "this cannot be done".

**Two decisions were already spent inside the mistake**, which is the part
worth recording.

[0020](0020-by-ear-the-unit-is-the-sounding-key.md) found that the heard mode
offered all fifteen spellings and marked G♭ wrong when the user answered F♯,
though the two sound identical. It collapsed the heard pool to one key per
sounding tonic. Correct, and it made the marking fair.

[0022](0022-an-outcome-for-evidence-that-was-never-shown.md) found
that a heard attempt recorded a `signature:` outcome although no signature had
been on screen, and for the six enharmonic pairs the signature is precisely
what the ear cannot recover. It stopped crediting it. Also correct.

Both asked "is this being marked fairly?" and answered it well. Neither asked
"can this be answered at all?" — and the second question is not reachable from
the first, because every answer to the first makes the exercise *look* more
defensible. The fairer the marking got, the less the underlying problem showed.

A third finding, from the user role, had already noted that the heard mode
played nothing at all: the exercise declared the presentation, `generate`
filled `pitches` with a cadence, and the prompt was silent. That was fixed by
making the cadence audible — the right fix for the bug reported, and it put a
working stimulus behind an unanswerable question.

## Decision

**Key identification offers reading only.** `presentations: ['read']`, the
mode control is gone, `coerce` forces `presentation: 'read'` so a document
written by a release that had the ear mode loads as a reading one, and the
`passage` member of `KeySource` no longer exists.

**An exercise must be answerable by the faculty it claims to train.** Before
adding a listening mode, say what evidence the listener has and what they are
expected to do with it. "They hear a cadence and name the key" does not
survive that sentence being written down.

This is not a claim that key identification can never be heard. Sounding a
*named* reference first — "this is C", then the cadence — makes it answerable
by relative pitch. It also makes it a transposition exercise, which is a
different thing to practise and should be chosen deliberately rather than
arrived at by adding a presentation back to a list.

## Consequences

The exercise keeps the role it has always been best at, and is now the only
one with nothing to listen to — which is what stops the registry quietly
assuming every exercise sounds.

A third of `keys.test.ts` went with the code it described: the enharmonic
collapse, the sounding pool, the both-spellings button label, and the
no-signature-by-ear outcome rule. What replaced it is a case that fails if the
mode returns, and says in its own comment what would have to change first.

`soundingPool`, `soundingKeyName`, `canonicalFor`, `twinOf` and `countOf` are
deleted. The enharmonic reasoning in `theory/circle.ts` stays, because the
circle-of-fifths screen needs it for exactly the reason 0020 described —
D♭ and C♯ share a wedge and do not share a signature.

### What this costs

0020's finding is not wrong, and deleting the code does not make it wrong; it
makes it unreachable from this app. If an ear-based key exercise is ever built
on a reference pitch, the sounding-pool logic has to come back, and it will
have to be rewritten from the record rather than recovered from the tree. That
is the right trade — carrying code for an exercise that does not exist is how
`cells.ts` ended up graded for a rhythm exercise nobody has written — but it
is a cost and the record is where it is paid.

The app also loses its only exercise where the heard and read forms asked
genuinely different questions about the same material, which was a useful
thing for the contract tests to have. `presentation.test.ts`'s sweep over
conditional fields was demonstrated on this exercise and had to be
generalised, which it should have been anyway.

## Revisit when

- **A reference pitch is on the table.** Then this is answerable, and the
  question becomes whether it is key identification or transposition practice.
  Decide which before building it; they want different settings and different
  item ids.
- **Any exercise gains a presentation.** The check this record exists for is
  one sentence: what does the user perceive, and what can they do with it?
  Note that the same question asked of the *other* exercises passes — an
  interval, a scale, a chord quality and a progression are all relative
  structures, which is why they transpose and this one could not.
