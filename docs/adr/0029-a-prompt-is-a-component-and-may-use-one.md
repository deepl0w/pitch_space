# ADR 0029 — A prompt is a component, and may use one

- **Status:** Accepted
- **Date:** 2026-10-05

Settles a contradiction `promptDrawsScores` opened between the exercise
contract's own comment and what the code now does, and records why the
engraver reports its layout rather than letting the UI measure the drawing.

## Context

Rhythm identification needs its stave to move: a cursor following the audio
clock, and the written notes coloured by how they were played. That wants the
stave inside the component holding the clock and the taps, so
[`types.ts`](../../src/exercises/types.ts) grew `promptDrawsScores`, and the
screen hands both specs down instead of drawing them.

Two fields above it, the same file says why that was not supposed to happen:

> Here rather than in the prompt for the same reason `answerScore` is: a
> prompt that rendered `Score` itself would have `exercises/` importing
> `ui/` importing `exercises/render/`, and ADR 0003's containment is easiest
> to keep while that arrow points one way.

That is now exactly the shape of the code:

```bash
grep -rn "from '\.\./\.\./ui" src/exercises/   # RhythmPrompt.tsx: import { Score } …
grep -n  "^import" src/ui/notation/Score.tsx   # … from '../../exercises/render/toVexflow'
```

`exercises/rhythm-id` → `ui/notation` → `exercises/render`. The comment
describes a rule, the code breaks it, and **nothing checks either**:
[`architecture.test.ts`](../../src/architecture.test.ts) guards
[0001](0001-a-pure-core.md), [0002](0002-generation-is-reproducible-from-its-seed.md),
[0003](0003-one-importer-for-the-notation-library.md), the single audio graph,
the npm scripts and the index's own conventions. No rule mentions `exercises/`
reaching into `ui/` at all. A comment stating a constraint is a test that
cannot fail, which is the fourth convention on [the index](README.md), and this
is its most load-bearing instance so far.

**What is not broken is the thing the rule was protecting.** 0003 holds:
`toVexflow.ts` is still the only file importing vexflow, and its guard
confirms it. The lazy-loading split described in
[`ARCHITECTURE.md`](../ARCHITECTURE.md) holds too, because the single runtime
edge to `drawScore` is still `Score.tsx` — `RhythmPrompt` imports `Score`, a
React component, not the notation library.

So the stated rule and the thing it was for have come apart. One of them has
to give.

## Decision

**The rule is narrower than the comment, and the narrow version is the real
one: an exercise's non-component code must not import `ui/`.** `generate`,
`grade`, the settings schema and `items` stay free of the UI, which is what
keeps them property-testable with no DOM. **A `Prompt` is a component, and may
use a shared component.**

The one-way arrow was never the goal. It was a proxy for vexflow containment,
and [0003](0003-one-importer-for-the-notation-library.md) guards that
directly, by a test, independently of which direction any other import points.
Where a proxy costs something real — here, a rhythm exercise that cannot show
a cursor — and the thing it stands for is separately enforced, the proxy gives
way. Keeping both would mean refusing a feature to protect a rule whose own
purpose is already covered.

**The narrow rule gets a guard, because neither version has one now.** That is
the whole reason this contradiction survived into the tree: the constraint
lived in prose, so breaking it looked like ordinary work.

**The engraver reports its layout; the UI does not measure the drawing.**
`drawScore` returns a `ScoreLayout` of note placements, and `Score` passes it
up. The alternative — querying the SVG for noteheads and trusting document
order to match the spec — is rejected for the reason given at the site: a rest,
a tuplet bracket or a beam adds elements that are not notes, and the match goes
quietly off by one.

It is worth a record and not only a comment because of how it would fail.
Measuring the SVG puts **VexFlow-shaped knowledge** in `ui/` — what a notehead
is, what order they come in — while importing nothing. **0003's guard counts
importers, so it would still pass while the containment it exists for eroded.**
The renderer would stop being replaceable without a single test going red. A
comment is not enough for a failure the guard cannot see.

## Consequences

The rhythm exercise keeps its cursor, and the next prompt that needs one
inherits a seam rather than an argument.

The contract's claim that `Prompt` is "the only per-exercise component"
acquires its real meaning: it is the only part of an exercise that may know
about the UI at all, which is a sharper statement than the file currently
makes.

### What this costs

**Narrowing a rule because it was breached is the shape of a rationalisation**,
and it should be read with that in mind. The defence is that the breach is in a
component, that the rule's stated purpose is independently guarded by a passing
test, and that the alternative implementation — passing `Score` down as a prop
or as `children` — buys nothing except the arrow pointing the other way. If
that defence is wrong, the fix is the prop, and it is cheap.

**Guarding "non-component code" needs a definition of component, and the
obvious one is crude.** A rule of "`.tsx` under `exercises/` may import `ui/`,
`.ts` may not" is easy to write and wrong the first time a `.ts` helper returns
JSX or a `.tsx` file holds pure logic. The guard should be written knowing it
is approximating, and say so, rather than being trusted as a definition.

**`promptDrawsScores` is a boolean that changes which component renders**, and
a second flag of that kind would mean the contract has two shapes rather than
one with an option. It is tolerable at one; it is the sort of thing that is
only ever added.

**A layout returned is a layout that can go stale.** `ScoreLayout` describes a
drawing that has already happened, and nothing ties the two together — a caller
holding a layout from the previous render and a cursor from this one gets a
plausible wrong answer rather than an error. That is latent at one caller.

## Revisit when

- **A second exercise sets `promptDrawsScores`.** Two is the point at which
  "the screen draws the staves" has stopped being the rule and the contract
  should say what it actually is.
- **A prompt wants something from `ui/` that is not notation.** The decision
  above permits it and this record has only weighed the notation case; a prompt
  reaching for a layout primitive or a store is a different question.
- **`ScoreLayout` grows beyond note placements** — system breaks, bar
  positions, a real height. At that point it is an interface between two layers
  rather than a convenience return, and the staleness above stops being latent.
