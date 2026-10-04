# ADR 0027 — Configure an exercise by naming what it contains, not by a difficulty ordinal

- **Status:** Accepted
- **Date:** 2026-10-04

Supersedes [0021](0021-a-catalogues-top-grade-must-be-reachable.md) and removes
the subject of [0011](0011-what-a-catalogue-owes.md)'s third obligation as it
applied to grades. Both records are about a grade ordering that no longer
exists; what they were measuring was, in substantial part, the ordering itself.

## Context

The brief for this app says the exercises are to be highly configurable and
that hardcoded difficulty has no place in it. The code disagreed in two
layers, and only the top one looked like a settings problem.

**The settings layer.** Every exercise took a shared `Difficulty` of 1 to 5 and
spent it as an index into a private table. Removing it exposed what each table
had been hiding: `maxAccidentals` for key identification, a semitone `window`
for intervals, nothing at all for scale degrees — that one duplicated a control
the exercise already had. For chord progressions it exposed a `grade`, and a
grade is not a quantity anybody asks for, so this was renamed rather than
removed. That is the error this record is mostly about.

**What the grade bundled.** Measured against the code rather than the
intention, one number gated six unrelated decisions:

| Gate | What it decided |
| --- | --- |
| `t.minGrade > query.grade` | which templates were quotable |
| `entry.minGrade <= ctx.grade` | iii, ii7, V7, ii°, iiø7, vii° in the harmony pools |
| `grade >= 4` | a seventh on a cadential dominant |
| `grade >= 5` | the Picardy third |
| `grade >= 6` | a seventh on an applied dominant |
| `grade >= 8` | the Neapolitan sixth |

None of these implies another. A learner wanting to drill a twelve-bar blues
had to accept half-diminished predominants, because the blues templates and
the half-diminished ii happened to sit near each other in somebody's ordering.
A learner wanting sevenths had to accept whatever else grade 4 included.

**And the numbers were describing the entries.** This is the part that makes
the ordering removable rather than merely movable. The pool chords at grade 4
are exactly the sevenths; the ones at 5 and 6 are exactly the diminished. The
rhythm layer's `syncopationBudget` mapped grade to 0, 1 or 3 syncopated cells
a bar, so the dial was spelling a quantity it could have named — and two was
unaskable. `iii` sat at grade 4 because 4 was where the list had got to.

A grade, in other words, was a sorted index over properties the entries
already carried, offered as the only way in.

## Decision

**An exercise is configured by naming what it may contain.** No ordinal, in
the settings or in the catalogue data.

The progression exercise takes a set of styles — classical, baroque, folk,
pop, rock, jazz, blues, flamenco, which are the tags the corpus already
carried — and one switch each for sevenths, diminished triads, the Picardy
third and the Neapolitan, beside the applied dominants and borrowed chords
that were already switches.

`minGrade` is removed from `TEMPLATES` and from the harmony pools, and `grade`
from `CELLS`. Pool entries declare `needs: 'sevenths' | 'diminished'` or
nothing. Templates are selected by style. Rhythm cells are selected by their
tags and by `syncopationsPerBar`, a number rather than a tier.

**A switch excludes; it does not merely decline to add.** This is
[0017](0017-a-setting-that-excludes-is-not-a-corpus-you-cannot-reach.md)'s rule, restated
because this change needed it twice. `CARRIES_DIMINISHED` joins the applied
and borrowed sets, keyed by mode — a bare second degree is a minor triad in
major and a diminished one in minor, so a template that simply writes `ii`
carries a diminished chord in one mode and not the other.

## Consequences

The exercise can now be asked for things it could not express. Plain blues
without jazz chords. Sevenths at grade-1 simplicity. Every length at every
vocabulary, where `SHAPE_AT` paired four bars with two grades and eight with
three and made four-bar phrases above grade 4 impossible.

**0021's finding dissolves rather than being fixed.** It recorded two rhythm
cells, the irrational subdivisions, as unreachable because the only
difficulty-to-grade mapping stopped at 9 against a catalogue graded to 10.
That was true of the mapping. It was never a fact about the catalogue, and it
was not even a fact about the *cells* — the grades it measured through were
the progression exercise's, and that exercise does not generate rhythm.
Nothing outside `generate/` calls `chooseCells` at all, which
`catalogues.test.ts` now asserts directly so that it fails the day a rhythm
exercise ships and the measurement is owed for real.

**0011's third obligation survives, with a different query.** "Every entry
selectable by a query the app actually makes" still binds; the query is now a
product of switches rather than a point on a line. Measured that way, the
template corpus went from five unreachable entries to none.

### What this costs

The catalogue loses its only built-in notion of ordering, and the loss is
real. A newcomer opening the progression exercise gets eight styles ticked and
every device off, which is a sensible place to start but is not a path. There
is no longer anything in the data that says a ii–V–I is a later thing to learn
than a I–V, and if the app ever wants to *suggest* an order it will have to
earn one — from the attempt log, which is the honest source, rather than from
a field somebody filled in.

The rhythm selector also loses a weighting that favoured the newest material
at a grade. With the library selected by what it is, there is no "newest" to
favour, and inventing one would be the ordering coming back under another
name.

Seven controls on the progression panel is more than three. That is the
trade: the panel is longer, and everything on it does one thing.

## Revisit when

- **A suggested starting point is wanted.** Derive it from the attempt log,
  not from a reinstated grade column. If the only available source turns out
  to be a judgement about the entries, that judgement belongs in a separate
  advisory table that nothing filters on, and this record should say why the
  distinction held.
- **A rhythm exercise ships.** It will need its own controls over the cell
  tags, and 0011's obligation on `cells.ts` becomes measurable against a real
  query for the first time. The guard in `catalogues.test.ts` fires then.
- **The switches stop being independent.** If two of them are only ever used
  together, that is evidence the split was too fine and a combined control is
  honest. One ordinal over six was too coarse; six over six may not be the
  last word.

## Addendum, 5 October 2026 — a second opinion on the ordering, asked for and given

Architect's review of the "What this costs" section, which asked for one.

**The trade is right, and the reason given understates it in its own favour.**
The costs say the catalogue "loses its only built-in notion of ordering, and
the loss is real". Most of it was not a loss, because the ordering was two
different things wearing one number, and only one of them has gone.

The pool entries say so themselves: "These carried a `minGrade` — ii7 and V7
at 4, ii° at 5, iiø7 and vii° at 6 — and the numbers were describing the
chord's quality in every case." **A grade column conflated a judgement with a
structure.** "How hard is a Neapolitan" is unfalsifiable and had no business in
data this repository tests for constraints and never aesthetics. "A chord that
is a seventh needs sevenths switched on" is a fact about the chord, checkable
against the chord. The first is gone; the second survives as `needs:`, read off
the entry rather than assigned to it.

So the honest statement of the trade is not "we dropped the ordering and will
earn one back". It is **the falsifiable half was kept and moved to where it
could be checked, and the unfalsifiable half was dropped.** That is a stronger
position than the record claims, and worth having written down before someone
reinstates a grade column believing they are restoring something that worked.

### The cost that is understated, and it lands on the scheduler

"A suggested starting point… will have to be earned from the attempt log" is
right for *review* order and empty for *introduction* order, and spaced
repetition needs both. A new user has no log. On their first session the log
is the one source the record names and the one source that does not exist yet,
which is exactly when an order matters most — the first ten minutes are where
a practice app is abandoned.

These are two jobs and the Revisit trigger assigns both to the log:

- **Review order** — what to ask again and when. The log is the right and only
  source, and `schedule.ts` is already built on it.
- **Introduction order** — what to show someone who has never answered
  anything. The log cannot answer this. Containment can: the switches already
  declare that a seventh needs sevenths and a borrowed chord needs borrowing,
  which is a dependency graph in all but name, and "introduce what depends on
  nothing first" is derivable from data already present and already checked.

Deriving introduction order from `needs:` is not the grade column coming back
under another name, and the difference is the test this record already
applies: a grade is an opinion about a chord, a dependency is a property of
it. The distinction is worth protecting in advance, because the first person
to hit the cold-start problem will reach for a grade column and this record's
Revisit trigger currently points them at a log that is empty.

Nothing here changes the Decision. It sharpens one defence and names one cost
the record carries without having priced.
