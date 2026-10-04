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

### Owed to `process` — a third instance of the stale-reading pattern

No process session is running, so this is parked here rather than sent.

For several exchanges I told the user that the tester, architect and user
worktrees had no sessions in them. All three had been running for forty
minutes. I ran `ListAgents` once, found only the process session, and then
repeated that conclusion four or five times — syncing all three worktrees
and printing `cd … && claude` lines for agents that already existed —
without re-running the one command that answers the question.

It is the announce failure with the subject changed. Liveness is a state;
I checked it once as an event and cached the answer. `CLAUDE.md` already
says `ListAgents` is the liveness check, so the rule was written down and
I had read it.

What distinguishes the cases that went wrong is that I was *acting on* the
liveness claim — syncing for absent agents, telling the user nobody was
there, deciding not to send. A check at the moment of acting on the belief
is the narrow version of a guard; whether that is expressible is process's
call, and a hook that re-runs `ListAgents` constantly is probably worse
than the problem.

All three instances are a *reading* standing in for a *fact that moves*: a
test count for a merge base, a sent message for a fleet told, a
four-hour-old roster for who is working. The third is the only one where
the stale reading was my own from earlier in the same session, which is
the cheapest to re-take and the easiest to forget to.

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
