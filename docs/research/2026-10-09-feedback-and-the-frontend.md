# Feedback and the frontend

Asked for by the user: research UI and UX design to inform the architecture of
the frontend. What follows is the part that bears on decisions this app has
either open or in flight, rather than general interface advice.

**The headline is that the most valuable finding argues against something
currently being built**, and the second most valuable one says the app already
does the right thing and nobody need do anything.

## Contents

- [Concurrent visual feedback degrades retention; concurrent sound does not](#concurrent-visual-feedback-degrades-retention-concurrent-sound-does-not)
- [A cursor and a colour are not one feature](#a-cursor-and-a-colour-are-not-one-feature)
- [What the colour research says about the open question](#what-the-colour-research-says-about-the-open-question)
- [Notation on a small screen, where nothing is owed](#notation-on-a-small-screen-where-nothing-is-owed)

## Concurrent visual feedback degrades retention; concurrent sound does not

The **guidance hypothesis** in motor learning: feedback given *during* a
movement improves performance while it is there and makes it worse afterwards,
because the learner comes to depend on it instead of building their own
error detection. Schmidt and Wulf titled a 1996 paper on it "Augmented
Concurrent Feedback Degrades Learning". Reviews since report that feedback
after every trial beats reduced-frequency feedback *during practice* and loses
to it *on retention*.

**The mechanism matters more than the effect, because it names the risk
precisely.** On complex tasks the dependency is not merely motivational — the
learner substitutes one task for another. From an open-access review of the
literature, on a bimanual coordination task guided by a live display:

> In this situation, the learner does not actually learn to produce the
> bimanual task; he/she learns how to manipulate the Lissajous display.

That is the sentence worth carrying. A scrolling staff that colours each note
as it is played is a live display, and the failure mode it names is a learner
who gets very good at keeping the notes green.

**The exception is the one that matters for a music app, and it is specific
rather than hopeful.** The same review:

> Experiments using concurrent feedback in the auditory modality have shown
> that speed of acquisition can be enhanced using sound without impairing
> performance on subsequent no-feedback retention tests.

The authors' reason is that "sound and movement are ecologically coupled" —
sound is inherently meaningful to the person moving, where a visual display is
an abstraction they must learn to read.

**Caveats, because this is borrowed evidence and not this app's.** The
literature is largely laboratory motor tasks, and the same review says plainly
that the guidance hypothesis "is not a general principle of feedback as had
previously been assumed". Sight reading is also partly perceptual rather than
purely motor, and none of these studies used notation. What this supports is a
default and a thing to watch, not a prohibition.

## A cursor and a colour are not one feature

The in-flight work pairs a position cursor with per-note colouring. **On this
evidence they have opposite profiles and should be decided separately.**

- **A cursor showing where the music has reached** is a pacing cue, the same
  kind of thing as a metronome. It is not knowledge of results: it says
  nothing about whether what you played was right. The guidance literature is
  about feedback on *performance*, so it does not reach this.
- **Per-note right/wrong colouring as you play** is concurrent visual
  knowledge of results, which is exactly what the literature is about.

So the honest default is: **the cursor live, the marking afterwards.** The
marking is the more valuable of the two for learning and the evidence says its
value is realised at the end of the attempt rather than during it. That also
costs less — a terminal pass over the finished performance needs no
frame-accurate update — which is the rare case where the better-evidenced
option is the cheaper one.

**And where feedback must be immediate, the channel should be sound.** The app
already has an audio output layer and the learner is already listening. A
wrong note answered by a sound is the one form of concurrent feedback this
literature does not warn about.

## What the colour research says about the open question

Two things the app's own rule did not supply, bearing on whether a line's state
is read as red-to-green ([ADR 0040](../adr/0040-completion-replaces-the-score.md),
still the user's to settle).

**Red-to-green is the worst available axis and there is a standard
alternative.** Red-green deficiency is the common one — roughly 8% of men —
and the usual guidance is that blue-orange or blue-yellow survive it. If a
gradient is wanted, choosing a different pair of ends costs nothing at design
time and solves most of the problem.

**The conventional second channel for a progress state is fill, not a word.**
The pattern that recurs is an unshaded, half-shaded and fully shaded shape, so
the state is readable from the amount of ink regardless of hue. That answers
the objection raised in `docs/colour-as-a-reading.md` — that a continuous hue
has no natural word to pair with — without needing to invent vocabulary for
forty steps. WCAG 2.1 SC 1.4.1 is a Level A requirement and the app's own CSS
comment already states it in its own words.

## Notation on a small screen, where nothing is owed

The common failure reported for VexFlow on phones is a renderer that sets
fixed width and height on the SVG and no `viewBox`, so there is no aspect ratio
for CSS to scale against and the staff is cropped or illegible.

**This app does not have that problem and the reason is a deliberate choice
already made.** `Score.tsx` observes its container with a `ResizeObserver` and
re-renders at the measured width — "notation does not reflow like text, so it
is redrawn at the measured width rather than scaled" — which is strictly better
than scaling a fixed drawing, because glyph sizes and spacing stay correct
instead of shrinking together.

Recorded as a null result on purpose. The next person to read a mobile-notation
article and find the `viewBox` advice should know the question was asked and
the answer is that this codebase chose the better of the two options before it
came up.

## Sources

- Schmidt & Wulf, "Augmented Concurrent Feedback Degrades Learning: Implications for Training and Simulation" — <https://journals.sagepub.com/doi/10.1177/154193129604002101>
- Review of augmented visual, auditory, haptic and multimodal feedback in motor learning — <https://link.springer.com/article/10.3758/s13423-012-0333-8>
- Open-access review quoted above, on the guidance hypothesis and auditory sonification — <https://pmc.ncbi.nlm.nih.gov/articles/PMC5486555>
- "Reduced-Frequency Concurrent and Terminal Feedback: A Test of the Guidance Hypothesis" — <https://www.researchgate.net/publication/12347489>
- Progress indicator accessibility, shading as a second channel — <https://gold.designsystemau.org/components/progress-indicator/accessibility>
- Designing for colour blindness, safe axes — <https://ezud.com/color-blindness-design-guide-protanopia/>
- Rendering notation on mobile, the `viewBox` failure — <https://levelup.gitconnected.com/how-to-render-music-notation-in-react-without-breaking-on-mobile-9615f812a3ec>
