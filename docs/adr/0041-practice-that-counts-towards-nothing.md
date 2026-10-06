# ADR 0041 — Practice that counts towards nothing

- **Status:** Accepted
- **Date:** 2026-10-07

Records a distinction the app does not have: between practice that advances a
line and practice that does not. Required by the user's ruling on rhythm, and
general once stated.

## Context

The user does not trust generated rhythms as a body of knowledge to be measured
against, and wants rhythm's pool to become a large hand-built library of common
and less common patterns. **Generation stays, as a standalone exercise that
counts towards no progression.**

The rhythm generator keeps its other job unchanged — it supplies the rhythm of a
generated line for melody and sight reading, which is not a thing anyone is
tested on.

Today every attempt is recorded the same way and every recorded attempt feeds
the fold. There is no way for an exercise to say that what it just produced was
practice rather than assessment.

## Decision

**An exercise declares whether its attempts join a line.** Untracked practice is
a first-class mode, not an absence of recording.

**An untracked attempt is still recorded, and carries no outcomes.** That is
[0007](0007-an-attempt-records-per-event-item-attribution.md)'s existing
machinery rather than a new shape: `items` says what the rendering contained,
`outcomes` says what the response tested, and an outcome is a claim that the
user was asked *and that the answer counts*. Untracked practice is asked and
does not count, so it records what it contained and credits nothing.

The alternative — not recording it at all — was rejected because "you practised
for twenty minutes and the app has no idea" is a worse answer than a row that
advances nothing, and because an attempt is also how a defect gets reported by
its seed.

**This is why the user's ruling needs a mechanism rather than a setting.** Under
[0039](0039-a-line-is-an-exercise-and-the-items-its-settings-make-askable.md) a
settings combination is a line, so generated rhythm configured differently would
simply be *another line* — which is exactly what the user does not want. The
distinction is not which line it belongs to; it is that it belongs to none.

**The curated library and the generator are therefore two things with one
renderer**, and only the library has items. That is the same split
[0030](0030-a-corpus-can-weight-the-catalogue-but-cannot-write-it.md) drew for
templates: the hand-written catalogue is the asset, and generation is a
different activity rather than a cheaper source of the same thing.

## Consequences

The app gains a shape it will need again. Free practice, warm-ups, a tuner, and
anything a learner does to explore rather than to be measured all want "this
happened and nothing is being claimed about it", and none of them had a way to
say so.

Rhythm's library becomes a catalogue under [0011](0011-what-a-catalogue-owes.md)
— well-formed at construction, stable ids, reachability, and its musical claims
asserted — which is a known obligation rather than a new one.

### What this costs

**Two rhythm exercises where there was one**, with one renderer, one grader and
two different relationships to progress. That is a genuine increase in surface,
and the menu has to make the difference legible without a paragraph: a learner
who practises the untracked one for a week and finds nothing recorded has been
failed by the naming rather than by the design.

**An untracked attempt is a row that will accumulate and that nothing reads.**
Storage grows with practice that no figure will ever reflect, and the first
person to write export has to decide whether it travels.

**The curated library is a large hand-built artefact nobody has started**, and
the user's reason for wanting it — not trusting generated rhythms as a body of
knowledge — applies with equal force to whoever hand-builds it. 0030's rule
says a corpus may weight a catalogue and not write it; nothing yet says where
this library's entries come from or what makes one correct.

**It is decided before the thing exists.** No untracked exercise has been built,
so the mechanism is specified against one use case and a second may want
something else — per-attempt rather than per-exercise, say, for a learner
toggling practice mode on an exercise that is otherwise tracked.

## Revisit when

- **A second untracked mode appears.** If it wants to be a mode of a tracked
  exercise rather than a separate one, the declaration belongs on the attempt
  and not on the definition, and this record chose the wrong level.
- **Export is specified.** Whether untracked attempts travel is a question this
  record raises and leaves.
- **The rhythm library is started.** 0011's four obligations apply from the
  first entry, and the question of where entries come from is open.
