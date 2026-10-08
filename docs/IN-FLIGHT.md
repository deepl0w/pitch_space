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

**A stated block has to be stated as removed, not just quietly stop
applying.** Found on the first real use: once the open question was
settled, the entry had to be edited a second time to say so — without
that edit it would read exactly as it did while still blocking, and a
role that had agreed not to start would have no signal the reason expired.
The block and the unblock are two edits, not one.

**The user role does not read this file.** See `CLAUDE.md`.

## Contents

- [`main` — the score reports where it drew things, so a cursor can follow](#main--the-score-reports-where-it-drew-things-so-a-cursor-can-follow)
- [`main` — `prefer` has landed, and the three-way split was wrong](#main--prefer-has-landed-and-the-three-way-split-was-wrong)
- [`main` — a passage: the generator's three layers joined](#main--a-passage-the-generators-three-layers-joined)
- [`main` — capture, fed by recordings rather than by a microphone](#main--capture-fed-by-recordings-rather-than-by-a-microphone)
- [`main` — four exercises, a scheduler, and the practice screen rebuilt](#main--four-exercises-a-scheduler-and-the-practice-screen-rebuilt)
- [`architect`, then everyone — progress is per settings combination](#architect-then-everyone--progress-is-per-settings-combination)
- [`main`, then `architect` — recorded instruments are the aim, synthesis the floor](#main-then-architect--recorded-instruments-are-the-aim-synthesis-the-floor)
- [`main` — a caption that was a control, and the test that was at the wrong altitude](#main--a-caption-that-was-a-control-and-the-test-that-was-at-the-wrong-altitude)

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

**For tester — both halves now closed, 8 October, and the entry stays only
to say what they found.** A wish the settings exclude is asserted:
`ignores a wish the current settings exclude`. And aiming distorting
*what else* is asked is checked per field, with which fields may freeze
*derived* rather than listed — a field the wish decides is already
constant within an item group, so grouping the unaimed exercises by the
item they produced separates what the wish fixes from what aiming merely
flattened. No list to go stale.

Writing the second found the defect it was written to look for. **Aiming
at a unison froze the direction**: both directions produce a unison, the
first matching pair was taken, so every wished unison came out whichever
way the settings happened to list — while the comment two lines above
said the direction was left to the seed. Fixed by picking among the
matches.

**One known gap, measured rather than assumed**: the spelling mutant
still survives, because `pitches` varies by register alone when the
spelling is pinned, so a field several things feed into cannot show one
of them freezing. Catching it needs the register projected out, which is
a claim about interval spelling rather than about aiming and belongs
where the spelling rules live.

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

**Built and merged, 6 October — nothing below is waiting on it.**
`src/state/line.ts` carries the identity; `Attempt` carries the askable
set it was drawn from, frozen on the round at generation; `tallyKey` is
`${lineKey}::${item}`; `schedule` and `dueCount` take the line whole; an
attempt with no set folds to nothing at all. Reviewed by tester, who
found the case that mattered — pre-line history folding into the empty
line and reading as progress against nothing.

**What is left of this entry** is the completion grade
([0040](adr/0040-completion-replaces-the-score.md)), the curated rhythm
library, the untracked-practice declaration no exercise makes yet
([0041](adr/0041-practice-that-counts-towards-nothing.md)), and export.

**Settled, build against it:** a line is (exercise, settings combination);
everything is per line including due dates; the score becomes a completion
grade; rhythm's pool becomes curated with generation surviving as untracked
practice; export is defined by this shape.

**No longer blocking — settled by
[0039](adr/0039-a-line-is-an-exercise-and-the-items-its-settings-make-askable.md):**
a line is `(exercise, the item set its settings make askable, presentation)`,
and a setting is part of the identity **if and only if it changes
`items(settings)`**. `tallyKey` is open to work on. Clef, range, tonic and
tempo do not change the set and so do not split a line; the interval pool
does, which is the case the user argued from.

**Still open, and named rather than assumed:** what "done" means for a
completion grade ([0040](adr/0040-completion-replaces-the-score.md)), where
the rhythm library's entries come from, and whether untracked attempts
([0041](adr/0041-practice-that-counts-towards-nothing.md)) travel in an
export. None of these block the key.

**Ruled 7 October — "a high cap" is the colour ceiling.** Asked which of
two things it bounded, the user answered: *"high cap is colour ceiling"*.
So it is not the review interval — `MAX_INTERVAL_MS` is a separate
mechanism and stays what it is — but a ceiling on the reading itself,
approached and never reached. That is consistent with 0040's "there is no
done": a hue that can arrive at full green is an end by another name.
Architect to fold into [0040](adr/0040-completion-replaces-the-score.md);
their session had ended when this was given, so it is recorded here first
rather than lost.

**Still open with the user**, not blocking: whether 200 ms covers a real
device opening (`DEVICE_OPEN_SECONDS`), which nothing off-device can
settle and which only shows as the first note of a page going missing;
and the two below.

**Two things sent to the user for comment rather than decided:** narrowing a
pool also lands on a different line, which follows by symmetry but was not
what they were asked; and widening loses *visible* progress while the old
line keeps its data, so a screen showing only the new line reads as a reset.
The second is a presentational obligation 0039 creates and does not
discharge.

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

- The identity question above is the blocking one. Presentation is
  already part of it by
  [0010](adr/0010-presentation-is-part-of-what-an-attempt-means.md);
  whether clef or range are is not obvious, and taken literally *every*
  setting is, which makes the space enormous and orphans a line whenever
  a learner changes something incidental. The architect proposes with the
  consequences priced and the user rules.
- Export and import are defined by this shape rather than bolted to it
  afterwards; the user named them together.
- `ItemTally`, `tallyKey`, `schedule` and `dueAt` all read the old model.
  Nothing in production calls `schedule`, so the cost of changing it is
  tests and records rather than behaviour.

### `main`, then `architect` — recorded instruments are the aim, synthesis the floor

**Branch:** `main`, starting now. **Settled:** the direction, the
measurement below, and — as of `83e5d19` — how a pack reaches the device.

[ADR 0046](adr/0046-a-sampled-pack-is-fetched-on-use-not-precached.md)
answers it. Synthesis is precached and is the offline guarantee; a pack
is runtime-cached on first use, immutable and versioned in its URL, and
never enters `globPatterns`. Choosing an instrument whose pack is absent
is not an error — synthesis plays, the download runs behind it, later
notes are sampled — so there is nothing to block on and no spinner to
design. Two consequences for whoever builds this: **the pack builder
writes the credits index**, which ships in the bundle so the surface
works offline and before any download, and **CC0 packs may ship before
that screen exists while CC-BY packs may not**.

**Why.** The user's words: *"i want accurate sounds, the exercises work
better when you listen to instruments you are familiar with. artificial
sounds don't work as well"*, and then, when it looked like this might be
read as a replacement, *"synthetic is fine to have but not the ultimate
aim"*. The argument is pedagogical rather than aesthetic, which is what
makes it binding: an exercise answered by ear is training recognition,
and recognition transfers from the timbre you have actually played. A
convincing synthetic piano is still not the instrument the learner sits
at. That is a claim about what the app is *for*, so it outranks the
convenience that chose synthesis.

**The cost estimate that justified synthesis-only was wrong.** The
settings screen told readers a recorded set would be "tens of megabytes".
Nothing had measured it. Encoding this repository's own CC0 piano
fixtures (`tools/fetch-test-audio.sh`, VCSL) to three seconds of mono
AAC at 64 kbps gives **22 KiB a note**; VCSL samples every third
semitone, so five octaves is 21 notes and **about 460 KiB an
instrument** — six of them is a couple of megabytes, and one of them is
smaller than the notation font already in the bundle. The figure that
made recordings look impossible was out by nearly two orders of
magnitude. Recorded as a caution as much as a number: it is the second
unmeasured cost this feature has stated to users as fact.

**What changes.** `Synth` stops being the only way a note is produced.
A sampled voice plays an `AudioBufferSourceNode` resampled from the
nearest recorded semitone, behind the same call the synthesised voice
answers now, so no caller learns which one it got. Synthesis keeps its
job rather than losing it: it is what sounds on the first load, while a
pack downloads, and when a pack is unavailable at all.

**Every recording must be free to use, and that is a filter, not a
preference.** The user's constraint, and it decides the source before any
quality judgement does. The bar, in their words: attribution and carrying
a licence file are fine, *"just don't want anything commercial or that has
some other implications"*, and **the app is MIT and stays MIT**.

So, concretely — **in**: public domain and CC0, CC-BY, and samples under a
permissive software licence. **Out**: any non-commercial clause, any
share-alike or copyleft term, and any custom end-user agreement that
restricts redistribution. The test is whether a licence reaches past the
audio file and makes a claim on the application around it; MIT must
survive the addition unchanged.

**CC-BY is allowed and is not free of obligation.** Attribution that the
app does not display is attribution the app has failed to make, so taking
a CC-BY library means building somewhere to credit it — a surface that
does not exist yet. The cheapest honest version is a credits list in
settings naming each pack's source and licence, read from the manifest
rather than typed, so a pack cannot be added without its credit appearing.
Worth knowing before choosing a library, because it is the difference
between a decision and a dependency: CC0 needs nothing, CC-BY needs that
screen first.

**The existing licence note does not cover this and must not be reused as
if it did.** `tools/fetch-test-audio.sh` argues VCSL is safe partly
because *"these files are never shipped: they are a build-time input to a
test and the bundle does not contain them"*. A pack ships. The conclusion
survives — a public-domain dedication permits redistribution, so nothing
here is blocked — but it survives on a different premise, and inheriting
the old sentence would leave the repository asserting a licence analysis
for a use it explicitly excluded. The pack builder carries the licence and
the source URL per instrument in the manifest, and refuses to build one
that names neither.

**The format is specified before the builder**, in
[`instrument-pack-format.md`](instrument-pack-format.md): the index, the
in-pack manifest, SPDX licence identifiers the builder can enforce
mechanically, and content-hashed filenames that make 0046's immutable URL
structural rather than a discipline. Read it rather than this entry for
field names.

The one thing in it a test could be written against, and the reason it is
worth a line here as well: **a pack's `trim` is measured per pack and may
not be inherited from the synthesised voice of the same name.** Those
figures are measurements of that synthesis and say so. Copying one across
would reintroduce the defect they were taken to remove, and do it between
the two halves of one instrument — so a pack landing mid-exercise would
change the volume as it swapped in.

**For tester.** Three claims, and none of them is about timbre — the
suite has no standing on whether a recording sounds like a piano.

- **The fallback is transparent.** The same request produces a sounding
  note whether or not a pack is loaded. A sampler that throws, or is
  silent, when its pack has not arrived is the whole risk of this
  change, and it is the one a user meets on a cold start.
- **Resampling lands on the right pitch.** A note played from a
  neighbouring sample at an adjusted rate must come out within a cent or
  two of the frequency `pitch.ts` says it is. This is arithmetic on the
  playback rate and wants no browser.
- **Coverage spans what the exercises ask for.** A pack whose lowest
  sample is above the lowest note a generated line can contain fails
  silently, by transposing something far out of range. Assert the
  manifest against the generators' range, not against a hardcoded list.

**For architect.** [ADR 0045](adr/0045-an-instrument-may-change-how-a-note-is-produced-never-which-note-is-correct.md)
stops being theoretical and starts being the constraint this is built
against: a sampled instrument may change how a note is produced and must
not change which note is correct, or what grading accepts. Worth a record
of its own is the reversal — synthesis was chosen as the destination and
is now the floor — together with the rule the measurement earns, that
user-facing copy may not state a cost nothing measured.

### `main` — a caption that was a control, and the test that was at the wrong altitude

**Branch:** `main`, landed at `0b15f55`. Kept here until tester has
reviewed, because the interesting part is a claim about where a test
belongs rather than the fix itself.

**What it was.** `Field` renders `<label class="field">`, and a `<label>`
forwards activation to its labelled control — the first labelable element
inside it. The Theme and Instrument rows each wrapped six `<button>`
chips, so the caption was a remote control for the first chip: pressing
any option also depressed the first, and clicking the word "Instrument"
selected Piano with nothing on screen to say the word did anything.
Reported by the user, who saw the first chip's text twitch when they
clicked a different one.

**Why it survived.** `Field` grew a `group` prop for this exact defect
some time ago, and `src/ui/controls.test.tsx` pins it with a comment
describing the failure almost word for word. The component was correct
the whole time. Two call sites in `Settings.tsx` never passed the flag,
and nothing asked whether they had — so the suite was testing that the
component *can* be used correctly while the mistake was being made at the
call site. Every other `OneOf` in the app passes `group`; these two were
the only ones that did not, which is exactly the distribution a
component-level test cannot see.

**The mechanism is confirmed from first principles, not just asserted
here.** Worth stating in the repository because the check itself lives in
`docs/findings/`, which is gitignored and never leaves the worktree that
wrote it. The user role built a bare static page — a `<label>` round two
buttons and `button:active { transform: translateY(1px) }`, no app code —
pressed the second button and sampled while the mouse was genuinely held:
both buttons carried `matrix(1, 0, 0, 1, 0, 1)` and both matched
`:active`, and neither did before or after. So the rule below rests on
how `<label>` behaves in HTML, not on how this codebase happens to be
written, which is why it is worth carrying to other screens.

Two earlier attempts at that confirmation are worth knowing about,
because both are easy to repeat. A before-and-after pixel diff finds
nothing: the transform exists only while the button is held, so comparing
two idle states compares two correct screens. And reading this
repository's own commit message and test comments is reading the author's
account of the author's measurement — it would have agreed just as
readily had the mechanism been wrong.

**For tester.** The generalisable claim, now in
`src/ui/screens/Settings.test.tsx`: **no `<label>` may contain more than
one interactive control**, asserted against a rendered screen rather than
a hand-built fixture. Two things about it are worth copying rather than
the fix.

First, it found a third field on its first run — the volume slider, which
pairs an `<input type="range">` with an `<output>`. That one is benign,
because `<output>` is labelable but inert, so the rule was narrowed to
interactive elements and the reason written into the test. A rule that
fires where there is no defect gets switched off rather than obeyed.

Second, the test is worth extending to the screens this one does not
cover — `SettingsPanel`, `PracticeScreen`, `Calibration` — and that is
the part left undone deliberately, because deciding whether it wants to
be one shared helper or one case per screen is a tester's call and not
main's. The three screens currently pass by inspection, which is not the
same as being checked.
