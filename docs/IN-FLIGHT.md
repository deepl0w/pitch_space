# In flight

What is being worked on right now, and what it is expected to change for
whoever is not the one building it — mainly **tester**, whose standing job
after a sync now includes this file as well as what just landed
(`CLAUDE.md`, "Several agents work here at once"). This is not `ROADMAP.md`:
that is what is planned but not yet started, architect's to keep; this is
what is already underway, and an entry leaves the moment its change has
merged and been reviewed.

**Main is the only writer.** A role that wants an entry says so to main
rather than adding one, the same reason `.claude/scripts/fleet.sh` and the
fleet skill have a single writer — two roles editing a shared forward plan
in the same week is the merge conflict waiting to happen, and main already
integrates everything else this file would need to stay correct about.

**An entry spanning several roles says which parts are settled and which
are not, separately.** Everything so far has been one role's independent
change; "implies" was enough, because nobody downstream could start before
the change existed to react to. A multi-role entry is different — a role
can start building from the entry itself, before anything merges — so an
open question left as an aside reads as a detail to the role deciding
whether it is safe to begin. If a piece cannot start until something else
is settled, say that plainly rather than trusting "is the architect's to
propose" to carry it.

**The user role does not read this file.** See `CLAUDE.md`.

### `main` — the score reports where it drew things, so a cursor can follow

**Branch:** `main`, starting now. Written here first because it adds to
`toVexflow`'s exported interface, which is the file the tester has the most
tests against.

**Why now.** Rhythm lost its listening mode, so the staff is the whole
question — and the exercise whose answer is a performance had no way to
show you your performance against it. A text verdict saying "you were
behind the beat" is not something you can learn from. The cursor and
per-note colouring were in the original plan as "live feedback on the
staff is the real payoff" and were never built; rhythm is the exercise
that cannot do without them.

**What changes.** `drawScore` returns a `ScoreLayout` instead of `void` —
where each note was laid out on the x axis, and the stave's own geometry.
Additive: nothing that ignores the return value behaves differently.

Per-note colour needs nothing new. `ScoreNote.colour` has existed since
the renderer was written and no exercise has ever set it, which is worth
saying plainly because it means the marking half of this was already
paid for and simply unused.

**For tester.** The claim worth pinning is a relation, not a pixel:
**note placements come back in the same order and count as the notes
handed in, strictly increasing in x, and inside the stave.** A golden x
value is a VexFlow-version snapshot and will break on upgrade; the
ordering will not. The second claim worth having is that a cursor
driven by a time between two onsets lands between their two x positions
— that is the whole correctness of following the music, and it is
checkable without a browser.

### `main` — `prefer` has landed, and the three-way split was wrong

**Branch:** `main`, landed. Kept here until tester and architect have
reviewed, because it corrects a prediction this file made.

`generate(spec, { prefer })` exists, `aims` is on every definition, and
`src/exercises/aiming.test.ts` is armed — the `.todo` guard is gone, which
was the one-word change the file said belonged in this commit.

**What this entry got wrong.** It predicted a three-way split: invertible,
lossy, and not-an-input, with key identification and degree identification
in the middle. **There is no middle.** Five exercises aim exactly and two
cannot aim at all.

The reasoning for `lossy` was that `maxAccidentals` narrows the circle and
never to one key, and that degree identification cannot aim the key it also
reports. Both were true *of the seam that was rejected*. `focus(settings,
item)` could only express a wish by tightening a setting, and no setting
names one key — so under that design the middle was real. `prefer` does not
go through the settings: generation picks a key from a pool, so it can pick
the one it was asked for.

Degree identification needs a sharper statement than the one this entry
first gave, which said it "does not report the key at all". **It does.**
`generateDegree` puts `key:<id>` in the exercise's `items`, so an attempt
is credited against it. What is true is narrower: `degreeItems(settings)`
lists `degree:<n>:<mode>` and nothing else, so the key is in what gets
*recorded* and not in what the schedule can *ask for*. Aiming is exact
with respect to the denominator, which is what `aims` promises.

That gap is a real finding rather than a wrinkle, and the tester hit it by
asserting every produced item was askable: an item accrues history that
nothing will ever schedule against. It is ADR 0007's contained-versus-
tested with the sides reversed — usually the worry is a denominator
listing what cannot be asked, and here it is a numerator recording what
was never counted.

The lesson is narrower than "we were wrong". **The limitation was a
property of a design, and it was recorded as a property of the exercises.**
It then survived into a contract test, which specified three kinds of
promise, and the third turned out to have no members.

`lossy` stays in the type and in the test. Nothing declares it, and the
alternative — removing it and adding it back when something needs it — is
worse: the next exercise that genuinely narrows without closing would
otherwise be pushed to claim `exact` because that is the only word for
"aims", which is the silent failure this seam exists to avoid.

**For tester.** `aiming.test.ts` passes. Two things it does not cover. The
`exact` cases are checked at the widest settings only, so a wish for an
item the settings exclude — reachable, since the schedule reads history
rather than current settings — is handled (ignored, not obeyed) and
unasserted. And nothing yet checks that aiming does not distort *what else*
is asked: a generator that honoured every wish by always picking the same
root would pass the contract and be a worse exercise.

### `main` — a passage: the generator's three layers joined

**Branch:** `main`, starting now.

**Why.** `harmony.ts`, `motif.ts` and `melody.ts` all work and **nothing
calls two of them together.** The tester flagged it: `planMotifs` has no
production caller, so its melody harness builds the plan-to-slots-to-melody
path by hand, and that hand-built path is the only place the three have
ever met. A layer nothing composes is a layer whose interface has not been
tested by use.

**What it is.** `generatePassage(rng, options)` in `src/generate/passage.ts`
— a key, a metre, a phrase plan, bars of rhythm built from motifs, and a
melody over them, as one value. Pure and seeded like everything else in
`generate/`; it decides nothing an exercise should decide.

**For tester.** Two claims worth having that none of the three can make
alone. **Every melody note lands on a written attack** — the melody's
times must be exactly the rhythm's onsets, in order, with none invented
and none dropped, which is the join that hand-wiring gets right by
accident. And **a restated bar is still a restatement after the melody
has been fitted to it**: the motif plan promises the rhythm repeats, and
nothing currently checks that survives the melody search, which is free
to fail a bar and relax.

When this lands, `melody.test.ts`'s hand-built path should probably call
it instead, so there is one way the layers join rather than two.

### `main` — capture, fed by recordings rather than by a microphone

**Branch:** `main`, starting now. Here first because it adds the seam every
later answer-by-playing feature goes through, and because the tester can
write against it before a microphone exists.

**What the user asked for.** Implement capture, but drive it with real
recorded sound — "free online resources like sound files of piano playing"
— instead of a live microphone. That is not a compromise: ADR 0008's
argument is that a browser's fake device is a 440 Hz beep and proves
nothing about accuracy, so a recording is the *better* input for everything
except the plumbing.

**The seam.** `CaptureSource` yields frames of mono `Float32Array` at a
stated sample rate, and nothing downstream knows where they came from.
Two implementations: a microphone one, which needs a browser and cannot be
unit tested, and a file one, which reads a WAV and emits it frame by frame
at the same rate a device would. The analysis path takes a source and is
the same code either way.

That is the whole point of writing it this way round. The thing that is
hard to get right — onsets, pitch, deciding a note has started — is then
testable off-device, and the part that is untestable is reduced to
`getUserMedia` plus a worklet.

**Where the sound comes from.** CC0 piano notes, so nothing is owed and
nothing need be attributed in the bundle; `docs/ROADMAP.md` records which
sources were checked and why most are unusable. Fetched by a script rather
than committed, with the tests skipping and naming the command when the
files are absent — the pattern the original plan specified for exactly
this. A recording corpus in git is a repository nobody can clone cheaply.

**For tester.** The claim worth pinning is not "it detects the right
pitch", which is the detector's own test and already exists. It is that
**the frames a source emits reconstruct the signal it was given** — same
samples, same order, no gap and no overlap at the frame boundaries — and
that a note's onset is reported once rather than per frame it spans.
Boundary behaviour is where a frame-based pipeline goes wrong, and it is
invisible in a detector test that is handed one tidy buffer.

The second is that the file source and a microphone source are
interchangeable: anything asserted about one should be asserted through
the interface, not through the file one's conveniences.

### `main` — four exercises, a scheduler, and the practice screen rebuilt

**Branch:** `main`, landed. Nine commits since the last announcement,
`7b9ee50` to `3815301`. Kept here until tester and architect have
reviewed, because it supersedes two records and changes what a third is
about.

**What landed, in the order it matters to a reviewer.**

**Difficulty is gone from the app and from the catalogues.** No exercise
has a difficulty setting and no catalogue carries an ordering.
`minGrade` has left `TEMPLATES` and the harmony pools, `grade` has left
`CELLS`; `maxAccidentals`, `window`, styles and five capability switches
replaced the dials. [ADR 0027](adr/0027-configure-by-naming-what-an-exercise-contains.md)
records it and supersedes 0021.

**Key identification by ear is removed.** It played a cadence with no
reference pitch and asked for the absolute key, which is absolute pitch
and nothing else. ADRs 0020 and 0022 were both spent marking that
exercise fairly; neither could reach the fact that it should not have
been set. An ADR for this is **not yet written and is the first thing
owed** — see below.

**Two new exercises**, scale identification and chord identification,
both transposing so the answer is the shape rather than the root. Chord
inversions are a separate opt-in question with their own item ids.

**A spaced-repetition scheduler** in `src/state/schedule.ts`, pure, clock
injected, with `items(settings)` on `ExerciseDefinition` as its
denominator. Not yet wired to the UI.

**The practice screen is a shell** — full-height sidebar, question
beside it, neither scrolling the page — and every control in it is a
chip rather than a dropdown or a checkbox.

**For architect, three things in order of how much they move.**

1. **ADR 0028 is owed and I have not written it.** The code and its
   comments already reference it by number for the key-identification
   removal. I claimed 0027 and wrote it; 0028 is referenced in
   `keys.ts`, `KeyPrompt.tsx`, `keys.test.ts` and `index.ts` and does
   not exist. That is the worst kind of dangling reference — a record
   that reads as decided and is not. Either write it or tell me to.
2. **0020 and 0022 are now about an exercise that does not exist.**
   Both should be marked superseded by 0028 when it lands. I have not
   touched their status, because changing a record's status without the
   record that supersedes it is worse than leaving it.
3. **ADR 0027's "What this costs" wants a second opinion.** The
   catalogues no longer carry any notion of ordering, so a suggested
   starting point has to be earned from the attempt log rather than
   read off a field. I asserted that is the right trade.

**For tester.** Three real defects surfaced in two days, all the same
shape — a sweep that held a user-facing control at its default:

- `V/VII` had no button in minor at sixteen bars, so a correct answer
  was marked wrong.
- `tupletId` came from a module-level counter that never reset, so the
  same seed did not reproduce. An ADR 0005 violation, invisible because
  the determinism test's settings never reached a tuplet.
- Turning diminished triads off did not turn them off: a quoted
  template and the borrowing pass both supplied them.

**A new user-facing control is a new dimension of every existing
sweep.** `bars`, then `styles` and five switches, then `types` on two
new exercises — each arrived without the sweeps following, and each had
to be noticed afterwards. If that can be made a guard rather than a
habit, it is worth more than any single test here.

The scheduler is also untested against a real session: `schedule.ts` has
its own suite, and nothing has yet run it over a log a person made.

### `architect`, then everyone — progress is per settings combination

The user has ruled on what progress means, and it replaces the model the
code currently has. Recorded here before anything is built, because it
changes `tallyKey`, the shape of what is stored, and therefore what an
export contains.

**A progression line is a (exercise, settings combination) pair, and
everything is per line.** Practising minor 2nds and major 2nds is one
line; adding minor 3rds is a different one, and it inherits nothing — not
the completion grade and **not the per-question due dates**. The user was
asked directly and chose the strict reading: a correct answer out of two
choices is not evidence about the same question out of three, so widening
a pool starts again.

This arrives at the same place as the hazard already recorded in
[0037](adr/0037-a-schedule-is-per-presentation-and-the-home-screen-is-not.md)'s
addendum — a streak that does not record how many alternatives it was
built against — from the other direction, and settles it more firmly than
weighting would have.

**The score stops being a number.** What the user wants is a grade
expressing how far a line has been completed, not a tally of right
answers. "Score is not important; what is important is spaced
repetition." Failed questions recur, correct ones get rarer. The
session and lifetime counts that read as two unlabelled clocks are
downstream of this, not a separate decision.

**Rhythm's pool becomes a curated library.** The user does not trust
generated rhythms as a body of knowledge to be measured against, and
wants a large hand-built library of common and less common patterns
instead. **Generation stays as a standalone exercise that counts towards
no progression** — which introduces a distinction the app does not
currently have, between practice that is tracked and practice that is
not. The rhythm generator keeps its other job unchanged: it supplies the
rhythm of a generated line for melody and sight reading, which is not a
thing anyone is tested on.

**What this implies for whoever picks a piece up.**

- The identity of a settings combination has to be canonical, stable
  across releases, and decided deliberately — *which* settings are part
  of it is the open question, not a detail. Presentation already is, by
  [0010](adr/0010-presentation-is-part-of-what-an-attempt-means.md).
  Whether clef or range are is not obvious and is the architect's to
  propose.
- It is a compatibility commitment the moment a history exists, the same
  as item ids under [0011](adr/0011-what-a-catalogue-owes.md).
- Export and import are defined by this shape rather than bolted to it
  afterwards; the user named them together.
- `ItemTally`, `tallyKey`, `schedule` and `dueAt` all read the old model.
  Nothing in production calls `schedule`, so the cost of changing it is
  tests and records rather than behaviour.
