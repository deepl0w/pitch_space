# Guessing, and how many answers were on offer

How the world outside this repository treats the thing
[ADR 0037](../adr/0037-a-schedule-is-per-presentation-and-the-home-screen-is-not.md)
has carried as an open constraint since 6 October: a correct answer out of
thirteen alternatives and one out of two fold into a streak identically.

**Extends [2026-10-07](2026-10-07-spaced-repetition.md) rather than replacing
it.** That note covers FSRS, the DSR model, mean reversion and ease hell, and
records that this project's ladder has no per-item difficulty at all. This one
asks the narrower question it left alone — what anybody does about the *size
of the answer pool* — and the overlap is deliberate where the two meet. Taking
no decision, as this directory requires; 0037's addendum of the same date
holds what is true of this repository and the options that follow.

## Contents

- [The formalism exists, in assessment rather than scheduling](#the-formalism-exists-in-assessment-rather-than-scheduling)
- [The schedulers in use do not model it](#the-schedulers-in-use-do-not-model-it)
- [Combining the two has been done, without the guessing term](#combining-the-two-has-been-done-without-the-guessing-term)
- [What the testing-effect literature will not support](#what-the-testing-effect-literature-will-not-support)
- [Sources](#sources)

## The formalism exists, in assessment rather than scheduling

Item response theory's three-parameter logistic model carries a
**pseudo-guessing parameter `c`** alongside discrimination and difficulty. It
is the lower asymptote of the probability of a correct response — what
somebody who knows nothing still scores — and it exists precisely because
low-ability examinees answer multiple-choice items correctly by chance.

For a *k*-alternative item `c` sits near `1/k`: reported as **around 0.20 for
five options and 0.25 for four**. A fitted value well above `1/k` is read as a
distractor nobody is choosing, which narrows the effective *k*.

Two qualifications worth carrying rather than rounding off. These are typical
values from fitted test data, not constants — `c` is estimated per item, and
`1/k` is where it tends to sit rather than what it is. And this is the
*assessment* literature: 3PL scores a sitting, it does not schedule a return.

## The schedulers in use do not model it

FSRS takes a self-reported grade — again, hard, good, easy — and fits its
weights by maximum likelihood over review logs. SM-2 takes a 0–5 self-graded
quality. Neither has any notion of how many alternatives were on offer, and
neither needs one: **an Anki-style review is free recall followed by the
learner judging their own answer**, so nothing was ever chosen from a list.

That is the structural difference from this app, which grades automatically
and, for a clicked answer, from a list it drew itself.

## Combining the two has been done, without the guessing term

Work joining item response theory to a memory model exists — DAS3H, and a
model multiplying IRT by a retention function — and reports better calibration
than classical IRT alone. **The IRT half used is 2PL**: discrimination and
difficulty, no guessing parameter.

I did not find a published scheduler that corrects spacing for the number of
alternatives. That is a gap in what was searched, not a demonstration that
none exists, and it is stated that way deliberately.

## What the testing-effect literature will not support

The intuitive move is to count a played answer for more than a clicked one,
on the grounds that production beats recognition. Roediger and Karpicke's own
framing is that tests requiring production produce greater later benefit than
multiple-choice — **and they hedge it in the same breath**, calling the
literature not wholly consistent and the claim a hypothesis for further
investigation. A meta-analysis since has multiple-choice at least as effective
as free and cued recall at producing the effect.

So "playing it is worth more than clicking it" is a reasonable belief about
this app's purpose and **not a finding to cite**. A record that leaned on it
would be borrowing authority the source declines to give, which is the exact
folklore this directory exists to stop.

## Sources

- [The IRT item pseudo-guessing parameter](https://assess.com/irt-item-pseudo-guessing-parameter/)
- [Item response theory — Wikipedia](https://en.wikipedia.org/wiki/Item_response_theory)
- [DAS3H: modeling student learning and forgetting for optimally scheduling distributed practice of skills](https://arxiv.org/pdf/1905.06873)
- [A technical explanation of the FSRS algorithm](https://lr.eu.psf.lt/r/Anki/comments/18tnp22/a_technical_explanation_of_the_fsrs_algorithm) — a mirrored forum explanation by the algorithm's author rather than a paper; the DSR description agrees with [2026-10-07](2026-10-07-spaced-repetition.md)'s independent sources, which is why it is cited at all
- [Roediger & Karpicke, *The power of testing memory* (2006)](https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf)
