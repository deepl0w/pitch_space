# ADR 0021 — A catalogue's top grade must be reachable, and cell ids are not frozen yet

- **Status:** Accepted
- **Date:** 2026-10-04

Applies [0011](0011-what-a-catalogue-owes.md)'s third obligation to the second
of its three catalogues, which 0011 named and did not measure. It also corrects
one of 0011's claims about the first obligation, in the direction that creates
an opportunity rather than a problem.

## Context

0011 says every entry must be selectable by a query the app actually makes, and
measured `templates.ts`: three of thirty-three unreachable on the default path.
`cells.ts` was left unmeasured. It has thirty-seven entries.

Measured through `chooseCells`, the real selector, rather than against a model
of it — every time signature, every grade 1–10, four hundred seeds each:

| Query | Cells reached |
| --- | --- |
| All meters, grades 1–10 | **37 of 37** |
| All meters, grades 2, 4, 5, 7, 9 | **35 of 37** |

The catalogue is not dead. Every cell is selectable by *some* query, which is
more than 0011 could say for templates.

The second row is the finding. Those five grades are not arbitrary: they are
the entire difficulty-to-grade mapping the codebase contains, `SHAPE_AT` in
[`progressions.ts`](../../src/exercises/progression-id/progressions.ts),
which runs difficulty 1–5 onto grades 2, 4, 5, 7 and 9. **It stops at 9. The
catalogue goes to 10.** The two cells at grade 10 are `quintuplet_s` and
`septuplet_s` — the irrational subdivisions, the hardest material in the
library.

So the pattern 0011 found repeats exactly, including its sting. There, the
stranded template was "the one written specifically to teach a vii°6 figure";
here it is the two cells that teach five and seven against four. **A corpus
wider than the question strands its best material first**, because the top of a
catalogue is where the deliberate, effortful entries live.

Two things keep this latent rather than live. There is no rhythm exercise —
`generateRhythm` has no production callers at all, the same vacuum 0011 found
around the harmony generator — and `SHAPE_AT` belongs to progression
identification, which uses no cells. So nothing is broken today. The claim is
about the first rhythm exercise, which will reach for the only difficulty
mapping that exists.

### The compatibility window is open, and 0011 says it is shut

0011's second obligation states: "A catalogue id reaches the user's history — a
rhythmic cell becomes `rhythm:dotted_e_s` in an `ItemId`, which
[0007](0007-an-attempt-records-per-event-item-attribution.md) and
[0010](0010-presentation-is-part-of-what-an-attempt-means.md) make a
compatibility commitment from the first release."

No such id is constructed anywhere:

```bash
grep -rn 'rhythm:' src/ | grep -v '\.test\.'    # nothing
```

Nor could it be. `RhythmEvent` carries `startTick`, `durationTicks`, `value`,
rest and tie flags, tuplet and beam grouping — and no cell identity. The
generator discards which cell produced a span as soon as it has produced it, so
there is nothing for an `ItemId` to be built from.

0011 wrote a future in the present tense, and the consequence runs the
favourable way. **Cell ids are editorial today and stop being editorial the
moment a rhythm exercise records its first attempt.** That is a window, and it
is the only chance this catalogue gets.

## Decision

**A catalogue's top grade must be reachable by some exercise's hardest
setting.** A grade that no difficulty maps onto is not a hard tier; it is a
tier that does not exist, and writing entries into it is writing them into a
drawer. Whichever is easier at the time — extending the mapping to reach 10 or
re-grading the top entries to 9 — the invariant is that the two ranges meet.

**This is checked where the mapping lives, not where the catalogue does.** The
catalogue cannot know what will query it; an exercise's difficulty table can
know the range of every catalogue it draws from. A test belongs with
`SHAPE_AT`, and with whatever table the rhythm exercise brings.

**Cell identity must survive generation before the first rhythm exercise
ships.** `RhythmEvent` needs to carry the id of the cell that produced it, or
0011's second obligation cannot be paid at all and per-cell progress is
impossible — a learner could never be told they are weak on dotted figures,
because nothing would know which figures they had played.

**Any id worth changing should be changed now.** The window closes on the first
recorded attempt, and after that a rename silently orphans what somebody
learned. This record does not claim any id is wrong; it claims that the review
is free this week and expensive thereafter, which is not a sentence that will
be true again.

## Consequences

The rhythm exercise arrives with its reachability already measured, which is
the opposite of how the harmony corpus arrived. The measurement above is
repeatable — it uses only exported functions — so it can become the test rather
than staying a paragraph.

0011's third obligation now has two worked examples with the same shape, which
is what turns an obligation into a thing people expect to be asked.

### What this costs

**Two of the four decisions here are about an exercise nobody has written.**
That is the same bet 0012 made, deliberately, and it can go the same way or
worse: if the rhythm exercise turns out to want its own grade vocabulary rather
than `SHAPE_AT`'s, the first decision is solving a problem that never arrives,
and the test it asks for guards a coupling that was never made.

**"Re-grade to 9 or extend to 10" leaves the actual choice open**, which is a
decision deferred wearing the clothes of a decision made. The honest reason is
that it depends on whether a difficulty-5 rhythm exercise should contain
septuplets at all, and that is a question for whoever designs the exercise, not
for this record. Someone will have to decide it, and this only guarantees they
will notice.

**Adding a cell id to `RhythmEvent` widens the one structure the renderer and
the judge both read.** It is a field that exists purely for attribution, which
means it will look like dead weight to anyone reading the rendering path, and
the comment explaining it will have to live where it is least relevant.

**The id-review window is an argument that produces no action by itself.** It
says "look now", and if nobody looks, the record will have accurately predicted
a cost without preventing it. A record that depends on someone feeling urgency
is a weak instrument, and naming that here is more honest than pretending the
deadline enforces itself.

## Revisit when

- **The first rhythm exercise is specified.** Both the grade mapping and the
  cell-id question become live on the same day, and the id review has to happen
  before its first release rather than during.
- **A third catalogue is measured, or `patterns.ts` acquires a consumer.** 0011
  notes `patterns.ts` is referenced by no test at all; it is the remaining
  unmeasured corpus, and a third instance of this shape would argue for a
  shared reachability check rather than one per catalogue.
- **`SHAPE_AT` changes, or a second difficulty table appears.** The invariant
  above is stated against the only mapping that exists; two mappings mean the
  question becomes which catalogues each one must cover.
