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

### `main` — `Difficulty` has left the codebase; landed, not yet reviewed

**Branch:** `main`. Landed in `2a99afe`, `71f6735` and `2592501`. Kept here
until tester and architect have reviewed it, because three of the entries
in `docs/adr/` now describe a state the code is no longer in.

**What changed.** `BaseSettings.difficulty` is gone and `BaseSettings`
keeps only `presentation`. Each exercise names the quantity its private
table was hiding: `key-id` has `maxAccidentals` (0–7), `interval-id` has
`window` (semitones either side of the staff), `progression-id` has
`grade` (1–8, read off the template corpus) and `borrowed`, and
`degree-id` lost a field nothing read. No schema bump — a stored
`difficulty` is dropped on load like any unknown key.

**For architect**, three records to look at, in order of how much they
move:

- **ADR 0021** recorded two rhythm cells stranded above the top grade the
  app could ask for, and blamed the grade table. The reason was wrong:
  the grades it measured through were the *progression* exercise's, and
  that exercise does not generate rhythm. Nothing in `src/` outside
  `generate/` queries the cell catalogue at all. The finding stands —
  those cells are unreached — but so is every other cell, and the cause
  is that the rhythm exercise does not exist. `catalogues.test.ts` now
  says this and fails the day an exercise starts producing rhythm items.
  This is the proxy error `docs/process/` already has a note about,
  found inside a test written to measure reachability honestly.
- **ADR 0011/0017's template measurement.** Templates no query could
  reach: 5 → 0. Three left when the preset table did, with no change to
  `generate/`; the last two went when `borrowed` became a setting.
- **ADR 0016.** A later note read `varyCadence` as rescuing six templates
  against 0016's three and called 0016 an undercount. 0016 was right.
  The extra three are eight-bar templates that were out of reach because
  eight bars only arrived at grades 5, 7 and 9 — an artefact of measuring
  through the preset table, not of the cadence setting.

**For tester.** The palette containment sweep had a hole worth
generalising from: it swept 300 seeds over grades and modes while holding
`bars` and `varyCadence` at their defaults, so it covered one
configuration deeply and 479 not at all. A live defect sat in it —
minor, applied dominants on, sixteen bars produced `V/VII` with no button
for it. It now crosses the real product of the controls at 25 seeds each.
**A new user-facing control is a new dimension of that sweep**, and
`bars` had become one without the sweep following.
