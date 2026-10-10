# ADR 0048 — One accent, a derived palette, and a floor it knowingly misses

- **Status:** Accepted
- **Date:** 2026-10-11

Two decisions inside a recolouring that are not tuning, and one accessibility
floor that is deliberately not met.

## Context

The palette moved into `src/palette.css` and became **derived**: each theme
names a ground, the two share one accent, and ink, panels, muted text,
hairlines and the verdict colours are all stated in terms of those. A panel is
its ground with the lightness lifted through `oklch(from …)` rather than mixed
towards white, because mixing towards white drops chroma as it lifts and grew
a grey panel on a warm page.

Most of that is tuning. Two things are not.

## Decision 1 — one accent across both themes, and the text on it is the ground

The user asked for one accent in those terms. `--on-accent` and
`--accent-edge` exist so that the text and the boundary move per theme and the
fill does not have to.

`--on-accent` is **the ground itself**. It was a mix towards white, which
bought contrast the ground does not have.

**The dark theme does not meet WCAG 1.4.3, and that is the decision.** Cream
on the accent red is **4.76:1** and clears the 4.5 floor; the dark theme's
brown on the same red is **3.05:1** and does not.

**What was traded is a match across themes against a floor in one of them.**
The accent is the same fill in both, which is what was asked for, and the
price is that one theme's text on it is below the normal-text floor. A record
exists for this so that nobody later reads it as an oversight and "fixes" it
by re-mixing towards white, which would reverse a stated choice. A test
asserts that the on-accent colour *is* the ground, so that fix cannot land
quietly.

**The escape is already named in the file**: the two themes still name the
token separately, and the dark one is free to stop being its ground the moment
that matters more than the match.

## Decision 2 — the palette supplies its own threshold for "too close to tell apart"

Colours that carry a meaning — accent, right, wrong — must sit further apart
in oklab than `--bg` does from `--surface`, which are deliberately nearly the
same.

**This is a different relation from contrast and no contrast check could have
caught what it catches.** Contrast compares a colour with what is painted
*behind* it. This compares two colours with *each other*, neither behind the
other, and asks whether a reader could tell which meaning they are being
shown. In the light theme the accent and the wrong-answer red were **0.024**
apart against a floor of **0.040**.

**The floor is derived rather than chosen**, which is what makes it defensible
and what makes it move correctly: it is this palette's own distance between
two colours it intends to be nearly identical. Change the panel treatment and
the floor changes with it. Nothing is invented and nothing is tuned.

## How the 3.05 was found, which is the part worth keeping

**Not by the suite, although the suite already measured that pair.** The
figure for `--bg` against `--accent` sat among the pinned values and was not
connected to any reader-facing case, so a palette change that dropped it below
the floor stayed green. The mechanism existed, ran, and answered a question
nobody had asked it.

That is the third face of this project's first convention — *a correlate of
the answer is not a substitute for running the mechanism* — and the nastiest,
because here the mechanism **was** run. A measured number with no assertion
attached is a correlate of a check.

The 0.024 was found by the user role looking at the screen, which is the
whole justification for having a role that does.

## What this costs

**A real accessibility cost on a real axis, and it is not hypothetical**: text
on an accent-filled control in the dark theme is below the contrast floor for
normal text, for every reader, permanently, until somebody decides otherwise.
Recording it does not discharge it.

**The first question anyone revisiting should ask has not been asked**: 4.5:1
is WCAG 1.4.3's floor for *normal* text, and large text is 3:1, which 3.05
clears. Whether the text on an accent control qualifies as large is a fact
about its size and weight that nobody here has checked. If it does, the floor
is met and this record's premise narrows considerably. If it does not, the
trade stands as written.

## Revisit when

**The dark theme's match to the light one matters less than its text does**,
which is a judgement rather than an event — or when somebody measures the
control's text and finds the large-text floor applies.
