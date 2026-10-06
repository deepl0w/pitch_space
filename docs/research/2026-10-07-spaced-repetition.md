# Spaced repetition, from outside this repository

**7 October 2026.** Gathered after the user ruled on what progress means, to
put evidence behind decisions now taken —
[0039](../adr/0039-a-line-is-an-exercise-and-the-items-its-settings-make-askable.md),
[0040](../adr/0040-completion-replaces-the-score.md) — and behind the questions
they left open. Nothing here is a measurement of this app.

## Contents

- [FSRS, and the quantity 0040 was looking for](#fsrs-and-the-quantity-0040-was-looking-for)
- [What a completion figure looks like elsewhere](#what-a-completion-figure-looks-like-elsewhere)
- [The evidence for spacing is not uniform across this app](#the-evidence-for-spacing-is-not-uniform-across-this-app)
- [Interleaving, which nothing here has considered](#interleaving-which-nothing-here-has-considered)

## FSRS, and the quantity 0040 was looking for

The current state of the art is **FSRS**, built on a DSR model — difficulty,
stability, retrievability — against SM-2's single ease factor.

- **Stability** is how long until recall probability falls to 90%.
- **Retrievability** is the probability of recall *right now*, decaying
  continuously on a power law between reviews.
- **Difficulty** is per item, 1–10, and uses **mean reversion**: repeated
  correct answers pull it back toward baseline rather than leaving it
  permanently marked.

Benchmarked across 500 million-plus Anki reviews, FSRS reaches the same
retention in 20–30% fewer reviews than SM-2.

**Retrievability is the quantity [0040](../adr/0040-completion-replaces-the-score.md)
asked for and did not name.** That record says a line's grade should be read
from how far its items have advanced rather than from counts, and left "done"
undefined. Retrievability is exactly that: a per-item probability, continuous,
comparable across items, and averageable over a line. A completion figure is
then mean retrievability, and it falls on its own between sessions — which is
what "failed questions recur, correct ones get rarer" looks like as a number.

**The mean-reversion point is a warning about the alternative.** SM-2's known
failure is *ease hell*: after about six lapses the ease factor hits its floor,
intervals stop growing, and a card that should appear monthly appears every few
days. 0037 records that this project uses neither — a fixed `INTERVALS_MS`
ladder indexed by streak — which has no ease to ruin and also no per-item
difficulty at all. Two items in one line advance identically however differently
they are known.

## What a completion figure looks like elsewhere

Systems that show progress rather than a score converge on **two phases, not one
number**:

1. **Coverage** — what fraction of the deck has been seen at least once.
2. **Mastery** — once coverage is complete, a retention figure takes over.

**The user has since ruled that there is no completion**, so the second phase is
not a destination here: a line never finishes, and a well-known item gets a long
interval rather than an exit. What survives of this is the first half and it is
the useful half — early in a line, coverage is the honest figure and a retention
statistic is computed over almost nothing.

The rest is worth copying for a reason specific to the user's model. Under
[0039](../adr/0039-a-line-is-an-exercise-and-the-items-its-settings-make-askable.md)
a widened pool starts a **new line**, so a learner meets an empty line often and
by design. At the start of a line, coverage is the honest figure and mean
retrievability is a statistic over almost nothing. One number cannot be both,
and a single figure sitting near zero for the first few sessions is the
discouraging version of a true statement.

Other systems weight a mastery score from review count, ease and error rate.
That is a count in disguise and is the thing 0040 ruled out; it is recorded
here as the road not to take.

## The evidence for spacing is not uniform across this app

The general effect is about as well-supported as findings get: distributed
practice beat massed practice in **259 of 271 comparisons** in the standard
meta-analysis, across materials, ages and retention intervals, with optimal gaps
growing as the desired retention interval grows.

**For psychomotor skill it is thinner, and one piano study found nothing.**
[Lack of spacing effects during piano learning](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0182986)
tested a 17-note sequence and melody memorisation and reports "no condition
showed a spacing effect during acquisition or retention, even though a
substantial degree of learning occurred."

**That headline does not bear on this app, and saying it did would be the
mistake this project keeps cataloguing.** The lags compared were 0, 1, 5, 10 and
15 minutes, with a five-minute retention interval. The authors name the
limitation themselves: "Because our lags were all 15 min or less, and retention
interval was 5 min, there was little opportunity to forget." It is a null result
at minute scale; this app schedules across days.

What survives is a real distinction, and it falls along a line this project has
already drawn. **Recognition items** — name the interval, the chord quality, the
key — are declarative, and the spacing evidence covers them squarely.
**Performed items** — tapping a rhythm, and everything "answered by playing" —
are psychomotor, where the evidence is thin rather than negative. That is the
same split [0032](../adr/0032-the-generator-is-a-draw-not-a-search.md) draws
between exercises answered by choosing and the one answered by performing, and
[0041](../adr/0041-practice-that-counts-towards-nothing.md) between tracked and
untracked practice.

So the honest position is that the app's premise is well-evidenced for most of
what it currently asks, and an open question for the part it is being built
towards.

## Interleaving, which nothing here has considered

A separate and better-attested finding for music specifically: **interleaved
practice impedes performance during training and improves long-term learning**,
against blocked practice on one thing at a time.

Nothing in this project has decided whether a session draws from one line or
several, and it is a scheduler question rather than a presentational one. The
finding says the version that feels worse in the session is the one that works,
which is the same shape as the roadmap's refusal of streaks and manufactured
urgency — and is the kind of thing that gets tuned away by whoever watches a
learner look frustrated.

## Sources

- [FSRS: the next generation spaced repetition algorithm](https://fluentcards.org/blog/fsrs-spaced-repetition-algorithm/)
- [What is FSRS? The modern spaced repetition algorithm explained](https://simplequizmaker.com/blog/what-is-fsrs)
- [Spaced repetition systems have gotten way better](https://domenic.me/fsrs/)
- [Anki — Wikipedia](https://en.wikipedia.org/wiki/Anki_(software))
- [Lack of spacing effects during piano learning — PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0182986)
- [Optimizing music learning: blocked and interleaved practice schedules](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4989027/)
- [Spacing practice sessions across days benefits the learning of motor skills](https://www.researchgate.net/publication/222524262_Spacing_practice_sessions_across_days_benefits_the_learning_of_motor_skills)
