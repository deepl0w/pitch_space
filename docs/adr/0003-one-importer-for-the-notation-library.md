# ADR 0003 — One importer for the notation library

- **Status:** Accepted
- **Date:** 2026-10-03

A companion to [0001](0001-a-pure-core.md). That record keeps the platform out
of the core; this one keeps the notation renderer out of everything except the
file that renders.

## Context

VexFlow draws staves. It is a large library with opinions: its own note and
accidental classes, its own key-string format, its own layout and formatting
model, and a rendering context that wants a canvas or an SVG element.

A notation library is unusually good at spreading. The convenient move, over and
over, is to hold a `StaveNote` rather than the project's own `Pitch`, because
the `StaveNote` is what the next function wants. Do that a few times and the
exercise model is made of the renderer's types — at which point the renderer is
no longer replaceable, exercises can no longer be constructed in a test without
it, and the pure-core boundary has been breached from a direction
[0001](0001-a-pure-core.md) does not watch, because none of it is a *platform*
import.

## Decision

**`src/exercises/render/toVexflow.ts` is the only file in the repository that
may import `vexflow`.** It takes the project's own exercise and pitch types and
returns something drawable. Nothing
upstream of it — not `theory/`, not `generate/`, not the exercise models, not a
component — names a VexFlow type.

```bash
git ls-files 'src/*' | xargs grep -l "from 'vexflow'"
```

That should print exactly one path, ending `render/toVexflow.ts`. It prints
nothing today: `vexflow` is a declared dependency but the render layer does not
exist yet, so this record is written before the rule has anything to hold.

### The pressure is already visible

Two functions in the core are shaped by VexFlow without importing it:

- [`vexKey()`](../../src/theory/pitch.ts) returns `"c#/4"` — VexFlow's key-string
  format, named after it.
- [`vexKeySignature()`](../../src/theory/key.ts) returns the signature's major-key
  name, with a comment explaining that this is how VexFlow names a signature
  even for a minor piece.

Neither breaks the rule as stated. Both are string-returning pure functions and
the grep above stays clean. But both encode the renderer's conventions one layer
below where the renderer is supposed to exist, and `vexKeySignature` in
particular is a fact about VexFlow rather than a fact about music — a minor key
has its own name, and only the renderer needs it reduced to a relative major.

This record does not move them. They are two small functions, the containment
rule they strain is about imports and still holds, and relocating them before
`exercises/render/` exists would be speculative. It names them so that the next
reader knows the drift was seen rather than missed, and so that whoever builds
the render layer has the question in front of them at the moment it is cheap to
answer.

## Consequences

The exercise model stays expressible in the project's own types, which is what
lets an exercise be generated and asserted about in a vitest run with no
renderer present. That is the same property [0001](0001-a-pure-core.md) buys for
the music engine, extended across the one boundary a notation library would
otherwise erase.

It also keeps the renderer replaceable in principle. VexFlow 5 is a reasonable
choice and there is no plan to leave it; the point is that the cost of being
wrong stays bounded to one file.

### What this costs

**A translation layer that will not be trivial.** Beaming, ties, tuplets,
multi-voice bars and accidental placement all live in VexFlow's model, and
`toVexflow.ts` has to express each of them from the project's own types. That
file will be the largest in `exercises/`, and some of what it contains will look
like duplication of concepts VexFlow already has.

**A visible escape hatch.** Anything VexFlow can draw that the project's types
cannot describe has to be added to those types first. The shortest path will
sometimes be to import one class somewhere else and move on, and because the
rule is a convention plus a grep rather than a module boundary the compiler will
not object.

**One file, one importer, one bottleneck.** If two agents are building exercise
types at once they will both be editing `toVexflow.ts`, and that is a merge
conflict by construction. Splitting it into several files under `render/` is the
obvious answer and is compatible with this record, provided the grep is widened
to the directory rather than the file.

## Revisit when

`exercises/render/` first needs a second file that imports `vexflow` — widen the
rule to the directory deliberately, and update the grep, rather than letting the
count quietly become two.

Or when a feature needs VexFlow's layout output *before* drawing, such as
measuring a bar's width to lay out a page. That is the first genuine reason for
the renderer's knowledge to flow backwards, and it should be answered with a
measurement type of the project's own rather than by passing a `Stave` upstream.
