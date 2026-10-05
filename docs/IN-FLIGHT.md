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

### `main` — `prefer`: the schedule asks, the generator answers honestly

**Branch:** `main`, not started. Written here first because the tester
is writing the contract test against this shape before it exists, which
is what this file is for.

**The problem.** `schedule.ts` decides which item should come next and
nothing can act on it: `generate(spec)` takes a seed and settings and
picks from the pool itself. The obvious seam is a `focus(settings,
item)` returning settings narrowed so that item is what gets asked.

**Why that seam is wrong**, which the tester established and I accept.
The exercises divide three ways on whether `items(settings)` is
invertible:

| | Exercises | Why |
| --- | --- | --- |
| **Invertible** | `interval-id`, `scale-id`, `chord-id` | the askable set is a projection of one setting, so narrowing to a single item is exact |
| **Lossy** | `key-id`, `degree-id` | narrowing gets close and cannot isolate — `maxAccidentals` narrows the circle but never to one key, and `degree-id`'s `key:` item is drawn from any key within four accidentals with no setting over it |
| **Not an input** | `progression-id`, `rhythm-id` | a numeral is an outcome of harmony generation and a cell an outcome of the filler; there is no setting meaning "ask me a `viio`" and there could not be one without the generator becoming a search |

A `focus` every definition implements would make four of them promise
something they cannot do — and it would not fail loudly. A progression
exercise asked to aim at `viio` would return settings making it *more
likely*, the schedule would record that it aimed, and nothing could
detect the difference. That is a palette listing a chord it cannot
produce, one layer up.

**The shape instead.** `generate(spec, { prefer?: ItemId })`. A
generator that can aim does; one that cannot ignores the hint. The
schedule reconciles against `exercise.items`, which already exists and
is already trusted, rather than assuming it got what it asked for.

**The cost, named rather than discovered later:** the schedule cannot
promise progress on a specific item. It cannot promise that for
progressions and rhythm under any design, so this makes an existing
limit visible rather than creating one.

**For tester.** The claim to pin: *a hint that aims at an item must
produce that item, for any exercise that claims it can aim.* Two things
that come out of the measurement already done:

- The seed budget is load-bearing and per-exercise. Four unreachable
  chords at 400 seeds were all luck; at 1500 there are none.
  `chord-id` has ninety-nine askable items and `interval-id` twelve.
- A generator that ignores the hint must pass. The test cannot assert
  "the preferred item appeared" — it has to assert "if it claims to
  aim, it hit", with a guard that at least one exercise claims it or
  the whole thing passes vacuously.

### Owed to `process` — announcing is not holding, and the guard is not catching it

**This is the user's instruction, not main's suggestion.** Their words after
the second time it happened today: "too many slips, something wrong. the
process agent should fix this."

**What keeps happening.** Main commits five to eight times, the fleet is not
told, and the thing that notices is the user rather than any mechanism. Twice
today. The second time the gap ran from `63ec50a` to `8d92eca` — six commits
including two exercises losing a mode — and the user asked before anything
else did.

**Why the existing guard does not catch it, which is the part worth fixing
rather than my promising to try harder.** The Stop hook checks announce state
at the *end of a turn*. Main's turns are long and hold many commits, and when
the user sends a message mid-turn the turn does not end — so the hook does
not fire. The two mechanisms are keyed to different things: commits accrue
per edit, the check runs per turn, and a turn can hold any number of commits.
The longer and more productive the turn, the longer the fleet stays
uninformed, which is exactly backwards.

Note that `fleet.sh announce` itself is not at fault. It reports the state
correctly every time it is run. What is missing is anything that makes it run
near the commit.

**Three shapes a fix could take, for process to choose between rather than a
request for a particular one.** A `post-commit` hook in the main checkout
that records the owed state, or prints it, so the prompt lands when the
commit does. Or `fleet.sh commit` as the committing path for main, with the
announce check inside it — the same move as `adr-claim`, which exists because
reserving a number by message did not work either. Or leaving the Stop hook
where it is and making it *block* rather than advise, which is the cheapest
and is probably wrong, because the delivery it asks for is a `SendMessage` a
hook cannot make.

**The constraint that makes this awkward, and which process should weigh:**
the delivery is not scriptable. `announce` can tell you who is owed; only the
agent can send. So the fix cannot be "automate it" — it can only be "put the
prompt where the agent cannot miss it", and the current prompt is in the one
place a long turn never reaches.

**Worth recording alongside:** this is the same shape as the three instances
already in `docs/process/2026-10-04-a-proxy-is-not-the-mechanism.md`. A check
that runs at the wrong moment is a reading standing in for a fact that moves,
and "the hook did not complain" became the proxy for "the fleet knows".

**A second, worse half, which the user has now had to say three times.**
Main has repeatedly told them to launch sessions that already exist. They do
not need launching: they are persistent sessions in the user's desktop app
and are part of this project's standing configuration.

What main did wrong is a familiar shape. `ListAgents` lists the sessions
*this session can address*. Main read an absence from that list as the
session not existing, which is a different claim, and then acted on it —
printing `cd … && claude` lines for agents that were already running. That
is the fourth instance of the pattern the proxy note describes, and the
second time this exact reading has caused it.

Tested rather than assumed, which is how it should have been settled the
first time: `SendMessage` to `hardcore-rosalind-8055fa` returns **"No agent
named 'hardcore-rosalind-8055fa' is reachable."** So the sessions exist and
main cannot reach them. Both halves are true at once, and the protocol as
written only admits one of them.

`CLAUDE.md` already has the correct fallback — "or, where that fails, the
user relaying it" — and main did not use it, because it had concluded there
was nobody to relay to.

**The thing process should actually decide.** Delivery by message is not
reliable here, and the fleet's only reliable channel is the repository
itself: `fleet.sh sync` carries committed files to every worktree whether or
not anyone was reachable. `docs/IN-FLIGHT.md` already exploits that for what
is coming. The same move is available for what came — an announcements file,
committed to main, that every session reads on sync, with `SendMessage` as
the fast path rather than the only one. That would make "the fleet was told"
a property of the repository rather than of who happened to be addressable,
which is the difference between a mechanism and a correlate.

Until that exists, main's correct behaviour when a send fails is to ask the
user to relay — not to tell them to start what is already running.

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
