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

- [`architect`, then everyone — progress is per settings combination](#architect-then-everyone--progress-is-per-settings-combination)
- [`main`, then `architect` — recorded instruments are the aim, synthesis the floor](#main-then-architect--recorded-instruments-are-the-aim-synthesis-the-floor)

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

