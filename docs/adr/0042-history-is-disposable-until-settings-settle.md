# ADR 0042 — History is disposable until settings settle

- **Status:** Accepted
- **Date:** 2026-10-07

A licence with a term. Attempts recorded before a schema change are allowed to
lose their place in a progression, and the obligation to stop allowing that is
written down with the condition that triggers it.

## Context

[0039](0039-a-line-is-an-exercise-and-the-items-its-settings-make-askable.md)
gave a line its identity: the exercise, the set of items its settings make
askable, and the presentation. It also said the identity must be
reconstructible from the exercise and the set *without reading a settings
blob*, because settings outlive the release that wrote them.

Implementing that is a schema bump. An `Attempt` has to carry the askable set,
because the set cannot be recovered afterwards: the attempt records the items
it *contained*, which is a subset of what its settings could have asked, and a
subset does not determine the set it came from.

**So the migration from a stored attempt that predates the field has no honest
source for it.** The only way to compute one is to call today's
`items(settings)` on yesterday's settings — the precise dependency 0039
forbids, performed at the one moment it is guaranteed to be wrong, since a
release that changed what an exercise can ask is the release whose migration
would run.

## Decision

**No migration. An attempt written before the field exists joins no line.**

It stays in the log, it stays exportable, it contributes to no progression, and
nothing invents a line for it. The user's ruling:

> for now history is highly changeable and no need to keep it consistent
> between releases. when the project is matured and settings have less chance
> to change there should be a system of porting history and versioning

**The term is the content of this record, not the licence.** The condition is
observable and it is not a date or a release number: *the settings schemas stop
changing shape.* 0039 tied a line's identity to `items(settings)`, so the thing
that has to settle is the input to that function. When it has, a porting and
versioning system is owed.

## Why the term is the right one, rather than merely a promise to revisit

Because the problem above dissolves exactly when the condition holds, rather
than merely becoming more affordable.

The migration is unwritable *because* `items()` is moving. Once it has stopped,
today's function is yesterday's function, calling it on an old settings blob
reconstructs the set that blob really described, and 0039's prohibition stops
biting — it forbids depending on a function that moves, and this one no longer
does. The user's trigger is not a guess at when someone will have time. It is
the condition under which the obstacle is gone.

## Correction of a claim this record was handed

**"The migration cannot be written" is too strong, and left standing it would
harden into "this app cannot migrate history".** That is the same failure mode
as the licence hardening into a policy, and it is worth closing now while the
counter-example is one file away.

The technique already exists in this repository. The v1 → v2 attempt step in
`src/state/schema.ts` faced the same shape — a field that did not exist when
the data was written — and did not call live code to fill it:

> Attempts written before the field existed were all heard — reading was not an
> option any exercise offered — so 'listen' is what happened rather than a
> guess.

**It froze a fact about the release that wrote the rows, inside the step.** The
same move gives the askable set: a migration step may carry the `items()`
implementation *as it stood when those rows were written*, copied in rather
than imported, and reconstruct what each attempt's settings really could ask.
Duplicated code, deliberately, because the point is that it must not track the
live definition.

**What is genuinely unavailable is doing that in retrospect.** The freeze has
to be taken at the moment `items()` changes, by whoever changes it; afterwards
the old implementation is in git history but an attempt carries a schema
version rather than a release, so there is nothing to match it against. So the
honest statement is not that the migration cannot be written — it is that it
can only be written *forwards*, and nobody is writing it today.

That is consistent with the decision rather than an argument against it. Under
this licence the histories written while settings are moving are disposable by
ruling, so no freeze is owed for them. The work only becomes necessary from the
point settings settle — which is the same point it becomes easy.

## Consequences

Everyone practising today loses their progression at the next schema bump, and
should be told so on screen rather than discovering it. The cost is nil now,
because the only histories in existence belong to this fleet's own testing, and
it would not be nil in a month — which is why this is a record rather than a
commit message.

The machinery is not what is missing. [0006](0006-settings-in-localstorage-progress-in-indexeddb.md)
versions storage, `src/state/migrate.ts` has the step table, and attempts are
already versioned per record rather than per database for exactly this reason.
What this record adds is the obligation and its trigger.

**The attempt log keeps everything regardless**, which is what makes the
deferral recoverable rather than merely cheap.
[0007](0007-an-attempt-records-per-event-item-attribution.md) already requires
per-event attribution, so a v2 attempt that joins no line still holds its
items, its outcomes and its settings blob. A porting system written later has
the raw material; it is the derived progression that is being discarded, not
the history.

Nothing here is softened by [0040](0040-completion-replaces-the-score.md)'s
ruling that a line has no completion, but it is made less painful by it. There
is no finished state to be robbed of — a reset line reads red and climbs back
at the speed of someone who already knows the answers, which is the same
behaviour as returning from a long absence. The app has no concept of lost
progress to violate, only an out-of-date estimate of what a learner remembers.

## Revisit when

**`items(settings)` stops changing for every exercise across a release.** That
is checkable rather than felt: pin each exercise's askable set at its defaults
in a test, and the release where none of them move is the release where this
licence expires and the porting system is owed.
