# Colour as a reading

What colour is allowed to mean in this app, and what a red-to-green progress
reading would have to satisfy before it could be built.

Written because the hues are about to be asked to carry more than one meaning,
and no single change is positioned to see that. **One use exists, one is
proposed, and one is planned** — an earlier draft of this sentence said three
had arrived, which was the summary being more decisive than the sections under
it, and is the sixth convention in the ADR index catching this document rather
than something else. Nothing here decides the open question in
[ADR 0040](adr/0040-completion-replaces-the-score.md); it says what the answer
has to clear.

## What the two hues already mean

`src/index.css` defines `--right: #2f7d4f` and `--wrong: #b4442e`, and they
carry one meaning throughout: **a verdict on a single answer.** `.choice.right`
marks the option you picked and `.verdict.wrong` says the calibration failed.
The meaning is per-event and binary — this one, just now, was correct.

The file also states the rule that governs them, and states it as a reason
rather than a preference:

> Right and wrong are carried by a word as well as a colour: a verdict that is
> only a hue is no verdict at all to a colour-blind user.

**That rule is kept everywhere it applies and enforced nowhere.** It is a
comment, which the ADR index's fourth convention names as the fragile kind — a
comment stating a constraint is a test that cannot fail. Every current use pairs
the hue with a word, so the rule has never been tested by a case that wanted to
break it. The red-to-green reading is that case.

## Why a gradient is a harder problem than a verdict

A binary verdict pairs with a word trivially: "right", "wrong". **A continuous
hue has no natural word**, and that is the whole difficulty rather than an
implementation detail.

Red to green is also the worst axis to choose for it. Red-green deficiency is
the common one, and a two-state red/green pairing survives it because the word
carries the meaning; a forty-step gradient does not, because there is no word
to carry. A reader who cannot separate the hues sees a progress reading with no
information in it at all — not a degraded reading, an absent one.

So if the gradient is adopted it needs a second channel that varies the same
way the hue does. The usual ones are lightness, which survives most colour
deficiency and photocopies; a shape or fill that grows; or a short phrase at
coarse steps — *new*, *shaky*, *solid* — which restores the word that a binary
verdict gets for free. The app's existing rule does not say which; it says
there must be one.

## The collision worth naming

**Green already means "you got that right just now".** The proposed green means
"you reliably remember this". Those are different claims about different time
spans, and a learner meets both in one session: a green choice button the
instant they answer, a green line on the progress screen that reflects weeks.

The two are not merely distinguishable in principle. They can disagree in front
of the user, and that is the test. A line that has decayed towards red because
nobody practised it for a month will show red beside a freshly green verdict on
a correct answer to one of its items. Both are honest. Together they teach that
the colour means nothing in particular.

The resolution is not more shades. Either the retention reading uses a
different visual channel from the verdict — the plainest option, since a
verdict is text-on-control and a retention state is a per-line indicator — or
the verdict gives up the hues it currently owns, which is the more disruptive
of the two and harder to justify, since a per-answer verdict is the older and
more frequent use.

## Where the third use lands

`ScoreNote.colour` has existed since the renderer was written and **no exercise
has ever set it.** The cursor and per-note marking for rhythm are in flight and
will set it for the first time; nothing on a stave is coloured today.

**When it lands it will not add a meaning** — marking a played note against the
score is a per-event verdict, the same claim `.choice.right` makes, moved onto
the stave. It belongs with the first meaning and should use the same tokens
rather than new ones. It is listed here because it is the use that will make
the first meaning visually prominent for the first time, which is what would
turn the collision above from a latent clash into one a learner actually sees.

The accessibility rule reaches it too, and less comfortably: a coloured
notehead has no room for a word beside it. Position already carries whether a
note was early or late, so the information is not only in the hue — but that is
an argument to check rather than one this document can settle from the outside.

## What this asks for

**If the red-to-green reading is adopted**, it needs a second channel varying
with the hue, and it needs to be visually distinct from the per-answer verdict
rather than merely a different shade of it.

**And the rule should stop being a comment.** The app has kept it by habit
across every use so far, and the first case that strains it is the one being
proposed. A check that no semantic colour token is the sole carrier of a state
is awkward to write against CSS; a cheaper version is a test that each state a
component can be in renders text that differs, which is what the rule actually
protects.
