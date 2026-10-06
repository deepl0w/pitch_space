# ADR 0038 — Preserve unknown settings at the store, not at the coercer

- **Status:** Accepted
- **Date:** 2026-10-06

Settles an asymmetry nobody had decided out loud: the settings document
promises to keep what it does not recognise, and each exercise's `coerce`
destroys it one level down. Found and traced by the tester.

## Context

[`schema.ts`](../../src/state/schema.ts) says why unknown *exercises* survive:

> Unknown keys under `exercises` are kept: they belong to an exercise type this
> build does not have, and dropping them would wipe a user's settings every
> time they ran an older release.

That reasoning applies unchanged to an unknown *field*, and the opposite
happens. Traced through the real store, for a document written by a release
that had one extra field on interval identification:

```
after hydrate  interval-id: {"clef":"bass","octaveRange":[3,6]}
coerced        interval-id: octaveRange DROPPED, clef kept
persisted      interval-id: {"window":9,…,"clef":"bass"}   <- octaveRange gone
persisted      unknown ex : {"whatever":1}                 <- intact
```

From the user's side both cases are one event — they ran an older build — and
the app protects one and not the other. A whole exercise added by a newer
release is safe; a field added by one is lost the first time the panel writes
anything for that exercise.

**The two-way trade is real and it is not the choice.** Keeping unknown keys
inside `coerce` would make every exercise's settings type wider than itself,
and a closed valid shape is what `coerce` exists to produce — the document can
afford to be a bag of blobs because nothing reads inside them, and an exercise
cannot. That argument is sound. It is also answering a question that does not
have to be asked, because **the loss does not happen in `coerce`**.

`doc.exercises[id]` holds the raw stored blob; `coerce` runs on read, in the
screen. The field survives hydration intact and dies at the write:

```ts
setExerciseSettings(exerciseId, settings) {
  commit({ ...doc, exercises: { ...doc.exercises, [exerciseId]: settings } });
}
```

The coerced value *replaces* the stored one. Nothing asked the coercer to drop
anything; the store threw away what it had.

## Decision

**Unknown fields are preserved by the store, which has them, rather than by the
coercer, which should not.** The write merges the coerced settings over the
stored blob instead of replacing it:

```ts
[exerciseId]: { ...doc.exercises[exerciseId], ...settings }
```

A field this build knows is overwritten by the coerced value. A field it does
not know survives. `coerce` is untouched, stays total from `unknown`, and keeps
returning exactly its own type.

**The promise's granularity becomes uniform**, which is what makes it a
promise rather than a behaviour: running an older release does not lose
settings, whether the newer one added an exercise or a field.

**The layering is the point and is worth stating generally.** A component that
validates into a closed shape must not also be the thing responsible for
remembering what it rejected — those are opposite jobs, and giving both to
`coerce` is what made this look like a trade. The store is where the two can
coexist, because it is the only layer holding both the stored form and the
understood one.

## Consequences

The tester's two existing cases keep working and keep meaning what they say:
every exercise's `coerce` still drops what it does not know, and the
document-level trip still fails if an unknown exercise is lost. Neither has to
change, which is a sign the decision sits at the right layer.

### What this costs

**Stored documents accumulate fields nothing will ever read.** A setting
retired deliberately now survives forever, inert, because the store cannot tell
"from a newer release" from "removed on purpose". That is the same cost the
document-level promise already pays for a retired exercise, so it is not a new
kind of debt — it is an existing one, made per-field and therefore larger.

**The stored blob stops being something any single build would write**, and
becomes a union across releases. Nothing reads it without coercing, so nothing
breaks; but a person reading storage to debug will see fields no version of the
app has together, and nothing in the document says why.

**It is one line, which is the problem with it.** A one-line merge is easy to
revert during a tidy-up by someone who sees a spread that looks redundant —
the coerced value appears to contain everything already. It wants the reason at
the site, not only here.

**No migration recovers what has already been dropped.** Every user who has run
an older build and then touched a settings panel has already lost those fields
permanently. This stops it continuing; it does not undo it.

## Revisit when

- **An exercise's settings need a field removed for correctness**, not merely
  retired — a stored value that is actively harmful rather than ignored. The
  store cannot distinguish that case and would preserve it; that is the point
  at which "preserve everything unknown" needs an exception with a name.
- **Storage size is measured and the accumulation matters.** It is bytes today
  and the roadmap's export feature is the first thing that would carry them.
- **A second component acquires both jobs** — validating into a closed shape
  and remembering what it rejected. The general statement above is made on one
  instance, and the second is when it should become a rule rather than an
  observation.
