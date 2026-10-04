# ADR 0011 — What a catalogue owes

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

Three files in [`src/generate/`](../../src/generate) are now catalogues of
musical data rather than code that computes anything:
[`cells.ts`](../../src/generate/cells.ts) (rhythmic figures a bar is built
from), [`templates.ts`](../../src/generate/templates.ts) (33 progressions), and
[`patterns.ts`](../../src/generate/patterns.ts) (26 named whole-bar rhythms).
More are coming — the note-reading items in [`ROADMAP.md`](../ROADMAP.md) are
another, and so is any scale or chord list a reference screen grows.

They already share a shape without anyone having decided it: a module-level
frozen array, a small constructor function that validates and throws, and an
id-keyed lookup. `templates.ts` calls itself "the project's real musical asset:
twenty correct templates are worth more than any cleverness in the generator
that reads them", and that is true of all three. The catalogue is the product;
the generator is plumbing.

What they do not share is what holds them correct. The differences are not
deliberate, they are the order the three were written in.

## Decision

A catalogue owes four things. The first is already paid everywhere; the rest
are not.

**1. Well-formedness, checked at construction, throwing at import.** Each entry
goes through a constructor that asserts its internal arithmetic — `cell()` that
the ticks sum to the declared beats, `template()` that the steps fill the
declared bars and that a progression has at least two chords, `pattern()` that
the durations fill the bar of the metre named. All three already do this, and
throwing at module load is right: a malformed catalogue is a programming error,
and failing at import beats failing on somebody's thousandth seed.

**2. Stable ids.** A catalogue id reaches the user's history — a rhythmic cell
becomes `rhythm:dotted_e_s` in an `ItemId`, which
[0007](0007-an-attempt-records-per-event-item-attribution.md) and
[0010](0010-presentation-is-part-of-what-an-attempt-means.md) make a
compatibility commitment from the first release. Renaming an entry silently
orphans what the user has learned about it. Ids are therefore not editorial.

**3. Reachability: every entry must be selectable by a query the app actually
makes.** This is the one nobody is paying, and it is the reason this record
exists rather than a paragraph in ARCHITECTURE.md.

`templates.ts` declares a closing cadence per entry, and template selection
filters on it. Grouping the corpus by that field:

| Closing cadence | Templates |
| --- | --- |
| `HC` | 14 |
| `PAC` | 11 |
| `null` (matches any) | 7 |
| `IAC` | 1 — `leading-tone-close` |
| `DC` | 1 — `axis-iv` |
| `PC` | 1 — `plagal` |

The phrase planner chooses the closing cadence before a template is picked, and
its default vocabulary is two values: `PAC`, or `HC` for blues. `IAC`, `DC` and
`PC` arrive only when a caller passes `cadences.final` explicitly. Nothing in
`src/` does — there are no production callers of the harmony generator at all
yet. So on the default path, three of thirty-three templates can never be
shown, including the one written specifically to teach a vii°6 figure.

They are not dead: the API reaches them, and
[`harmony.test.ts`](../../src/generate/harmony.test.ts) sweeps all five cadence
types, which is exactly why this has gone unnoticed. The corpus is simply wider
than the question the app asks of it, and nothing compares the two.

**4. Its musical claims asserted, or acknowledged as unassertable.**
`templates.ts` has a test file that checks what the entries *mean* — that every
minor-key dominant raises its leading tone, that no dominant moves to a
predominant outside blues, that chords spell back through `identifyChord` as
the quality asked for. `cells.ts` is exercised only through `rhythm.test.ts`,
its consumer. `patterns.ts` is referenced by no test at all.

## Consequences

The shape is now a decision rather than an accident, so the fourth catalogue
costs a checklist instead of an argument.

Reachability is a cheap test and a useful one: comparing the set of values a
catalogue's selector field takes against the set the app's default path can
produce is a few lines, and it is the kind of drift that is invisible in review
because both halves look correct on their own.

### What this costs

**Three catalogues do not meet this today**, and saying so is most of the point:

- `patterns.ts` has no test. I checked its 26 entries by hand — ids unique,
  every metre resolves, every duration notatable through `valueOfTicks` or
  `tiedValues` — so it is correct, and nothing holds it there. A tuplet member
  added later would be caught by none of the existing checks, which is the same
  latent shape that `meter.ts`'s tick table carried.
- `cells.ts` is tested only through its consumer, so a cell the generator never
  happens to pick is unverified.
- `templates.ts` is the model for claim-testing and the counter-example for
  reachability.

**Reachability cannot be fully automated.** A selector field can be compared
against a planner's defaults mechanically, but "could a user ever get here"
depends on settings, difficulty grades and exercise design. The test catches the
flat cases; it will not catch an entry gated behind a difficulty grade no
exercise offers.

**It may be the wrong answer to widen the planner.** Three unreachable
templates could equally be fixed by deleting them, or by leaving them for an
exercise that will pass the cadence deliberately. This record does not decide
which — it says the mismatch must be *visible*, not that the corpus wins.

## Revisit when

- **A progression exercise is built.** That is the first production caller of
  the harmony generator, and the moment the reachability gap stops being
  theoretical. Decide then whether the exercise varies the closing cadence or
  whether those three templates go.
- **A catalogue's entries start carrying per-entry behaviour** rather than data
  — a predicate, a callback, anything the constructor cannot check by
  arithmetic. At that point it is a registry rather than a catalogue, and
  [`registry.ts`](../../src/exercises/registry.ts) is the model to follow
  instead of this one.
