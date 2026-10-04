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

**The user role does not read this file.** See `CLAUDE.md`.

### `main` — difficulty has left the codebase entirely; landed, not yet reviewed

**Branch:** `main`. Landed across `2a99afe`, `71f6735`, `2592501`, `7b9ee50`
and `7ca12ea`, with [ADR 0027](adr/0027-configure-by-naming-what-an-exercise-contains.md)
recording the decision. Kept here until tester and architect have reviewed
it, because it supersedes one record and changes what another is about.

**What changed.** No exercise has a difficulty setting and no catalogue has
a difficulty ordering. `BaseSettings` keeps only `presentation`.
`maxAccidentals`, `window`, styles and five capability switches replaced
the dials; `minGrade` has left `TEMPLATES` and the harmony pools and
`grade` has left `CELLS`. A spaced-repetition scheduler reads the attempt
log for the first time (`src/state/schedule.ts`), and `ExerciseDefinition`
gained `items(settings)` as its denominator.

**For architect.** ADR 0027 supersedes 0021 and is written; the index is
updated. 0011's third obligation survives with a different query and the
template corpus now has nothing unreachable. The thing worth a second
opinion is 0027's "What this costs": the catalogues no longer carry any
notion of ordering, so if the app ever wants to *suggest* where to start
it has to earn one from the attempt log rather than from a field. I have
asserted that is the right trade; it is the part of the record I am least
able to check myself.

**For tester.** Three sweeps found three real defects in two days, all of
the same shape — a sweep that held a user-facing control at its default.
`V/VII` had no button in minor at sixteen bars; `tupletId` came from a
module-level counter so the same seed did not reproduce; turning
diminished triads off did not turn them off, because a quoted template
and the borrowing pass both supplied them. **A new user-facing control is
a new dimension of every existing sweep.** `bars`, then `styles` and the
five switches, each arrived without the sweeps following. That is the
property worth a guard somewhere, if one can be written.
