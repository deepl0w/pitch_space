# ADR 0050 — A sounded event finds its stave note by distance, not by order

- **Status:** Accepted
- **Date:** 2026-11-08

Settles how [`eventsOnStave`](../../src/ui/notation/follow.ts) maps a playing
passage onto the notes drawn for it, after the rule changed twice in two days
at the hands of two people — which is this project's own threshold for writing
something down rather than fixing it again.

## Context

A reference page or the practice screen plays a passage and lights the note
sounding. The drawing is a list of stave notes; the sound is a list of events,
each a set of pitches starting together. Something has to say which note each
event is.

**It is not an index walk, and that is the whole difficulty.** The two lists
do not correspond one to one. An arpeggio is three events on one chord. A
scale drawn ascending and played descending visits the stave backwards. A
progression replays its establishing cadence first, which is not drawn at all.
So the mapping is a search, and a search needs a rule for when several notes
match.

Two residues in two days made the rule visible. A tie between two equally near
places fell backwards, so `I IV I` lit the first chord while the third
sounded — live on roughly one progression in six, measured across 400 seeds
rather than assumed latent. Then a melodic unison, two drawn notes of one
pitch, left the light on the first while the second sounded.

## Decision

**An event takes the stave note nearest the one the last event landed on,
among those whose pitches contain all of its own; a tie resolves forward.
A repeat of the event just played instead advances one note, when that note
holds it. If any event matches nothing, the whole mapping is refused.**

The refusal is the part the rest rests on and is older than this record: a
cursor on the wrong note teaches the wrong thing, where no cursor teaches
nothing. A passage not wholly on the stave — a wrong answer's replay, a
degree's establishing cadence — is played and followed by nothing.

**Distance is the primary criterion and order is not.** The alternative
considered was *take the earliest match after the last index, falling back to
nearest when there is none* — a tidier statement, proposed by this record's
author, and **wrong**. It ignores distance, so it jumps forward past an
obviously nearer return:

```
stave  C D E F G C      played  C D C
by distance  [0, 1, 0]   — the third C is the first one, returned to
by order     [0, 1, 5]   — lights the end of the phrase, two notes in
```

A learner playing the figure again is at the second note; the rule that reads
"forward" as a principle puts the cursor on the last note of the line. So the
general form is not a generalisation of the built one, it is a different and
worse rule, and the narrow repeat clause is narrow because the case it fixes
is the only one where distance is provably misleading — the same sound twice,
where standing still is never right.

## Consequences

The rule is three predicates and no state beyond the last index, so it is
testable without a DOM and is. Its failure mode is visible rather than silent:
a passage it cannot map lights nothing, which a reader notices, instead of
lighting something plausible.

**It is greedy, and this project has already ruled against greedy sequence
matching once.** [0009](0009-align-a-performance-by-dynamic-programming.md)
aligns a performance by dynamic programming rather than nearest-neighbour, for
exactly the failure shape here: one bad local pick mismatches everything after
it, so a dropped note should not make every later onset wrong. `eventsOnStave`
is nearest-neighbour over a sequence, and nobody noticed the kinship —
including the author of the architecture section describing it.

That is not a reason to reach for dynamic programming now. The sequences are a
handful of events, the match is usually unique, and 0009's own argument is
about *judging* a performance, where a mismatch costs a learner credit; here a
mismatch costs a cursor. **It is a reason to name the fallback in advance:**
at the next residue this rule cannot absorb, align properly rather than add a
fourth special case. Two special cases is a rule; four is a rule nobody can
state.

What this does not cover, deliberately: a passage partly on the stave, which
is refused whole. Playing the cadence and lighting the stave from its first
note is a real improvement and is in [`ROADMAP.md`](../ROADMAP.md), not here.

## Revisit when

- **A third special case is proposed.** That is the signal to replace the rule
  with an alignment rather than extend it, per the Consequences above. The
  condition is checkable:

  ```bash
  grep -c 'best = ' src/ui/notation/follow.ts   # one search, one override today
  ```

- **A passage is followed partly rather than refused whole.** The refusal is
  what makes a greedy rule safe; relaxing it puts weight on the mapping that
  this rule was not argued for.
- **Something other than a replay wants following** — a live performance, most
  likely. Then the events are not the app's own output, the pitches are
  approximate, and nothing above survives contact with that.
