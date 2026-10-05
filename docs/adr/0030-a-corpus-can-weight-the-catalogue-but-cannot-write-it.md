# ADR 0030 — A corpus can weight the catalogue, but cannot write it

- **Status:** Accepted
- **Date:** 2026-10-05

Decides what corpus work on `templates.ts` may do, before anyone starts it.
Extends [0011](0011-what-a-catalogue-owes.md), which says what a catalogue
owes, with what one *is*.

## Context

`docs/ROADMAP.md` surveys deriving the catalogues from real repertoire —
corpora, licences, encodings. Buried in it is an argument against its own
premise, and it is the part that decides the shape of the work.

The templates earn their place by being **whole recognisable forms**: the
twelve-bar blues, rhythm changes, the axis loop, La Folía. A frequency count
over a corpus does not produce those. It produces common two- and three-chord
joins — which is exactly the Markov chain
[`templates.ts`](../../src/generate/templates.ts) already rejects in its
opening lines:

> Real harmony is not a Markov chain over chords. A chain produces joins that
> are locally plausible and a whole that means nothing, because the things
> that make a progression recognisable … are patterns of a whole phrase and
> cannot be recovered from any chord-to-chord process. So they are written
> down.

So a corpus-derived catalogue would not be a better version of this one. It
would be the thing this one was written to avoid, arrived at from the other
direction and wearing the authority of a measurement. Recovering whole forms
needs repeated-sequence mining at phrase length, which is a harder problem
than parsing the corpora and is not what "derive the catalogue from real
music" sounds like when it is proposed.

## Decision

**The hand-written catalogue is the asset. A corpus measures it; it does not
generate it.**

Three things follow, and the first is the phase order.

**Measuring comes first and may be all of it.** Is the royal road really a
thing in 1960s pop? Does the axis dominate rock the way the comment asserts?
Which templates carry flat weights the corpus would weight differently? Those
are answerable, they improve the catalogue where it is guessing, and they ship
nothing derived — which sidesteps the whole licensing survey rather than
resolving it.

**Frequency may set weights; it may not add or remove entries.** A weight is a
tuning parameter with no ground truth, which is why no test pins one
(`CLAUDE.md`, and the index's convention on aesthetics). Replacing a guess
with a count is a strict improvement to exactly the kind of number that should
not have been a guess. An *entry* is a claim that a form is recognisable, which
is a judgement about music and not a fact about a corpus.

**Rhythm cells are the exception, and the exception proves the rule.** A
beat-sized figure *is* a frequent short pattern, so counting produces the right
object there — the mismatch is between the method and whole-phrase forms, not
between counting and catalogues. Groove MIDI is the candidate source and is
overwhelmingly 4/4, so it does nothing for the additive metres the roadmap
already names as thin.

## Consequences

The licensing survey stops being the gate. Measuring an existing catalogue
against a corpus produces numbers about our own entries, and a weight informed
by a count is not a derivative work in the way a transcribed progression might
be. The hard questions — share-alike reaching into an MIT repository, whether
a derived template is a derivative work at all — are deferred rather than
answered, and are only reached if the decision above is ever revisited.

[0011](0011-what-a-catalogue-owes.md)'s obligations are unaffected and one of
them gets easier: stable ids are a compatibility commitment, and a catalogue
nobody regenerates keeps them by construction.

### What this costs

**It forecloses the most interesting version of the idea on an argument rather
than a trial.** Nobody has run phrase-length sequence mining over a corpus to
see whether whole forms do fall out. The reasoning that they will not is
sound and it is reasoning; a negative result from an actual attempt would be
worth more, and this record makes that attempt less likely to happen by
settling the question in advance.

**"Weights only" is a line that will be awkward in practice.** A count that
says a template is vanishingly rare is evidence about whether it belongs, and
the decision above says to set its weight low and keep it. Someone will
reasonably ask what a weight of nearly zero is for, and the honest answer —
that reachability is [0011](0011-what-a-catalogue-owes.md)'s third obligation
and a rare form is still a form a learner should meet — is a thinner argument
than it looks.

**The catalogue's judgements stay unfalsifiable where the corpus could have
tested them.** "This is a recognisable form" is the claim every entry makes,
and this record keeps it a matter of authorship. That is deliberate — it is
what `templates.ts` is for — but it means the corpus can confirm the
catalogue's weights and never its membership, which is the half a sceptic
would most want checked.

## Revisit when

- **Phrase-length sequence mining is actually tried.** The argument above is
  a prediction. A corpus that yields the twelve-bar form from mining alone
  falsifies it, and this record should be superseded rather than quietly
  stretched.
- **A measurement contradicts an entry rather than its weight** — a template
  the corpus cannot find at all. That is the awkward line above arriving, and
  it wants deciding with the number in hand.
- **A catalogue is proposed that has no hand-written version to measure.** The
  reasoning here assumes an existing asset to check. Starting a new corpus from
  a corpus is a different decision and this record does not make it.
