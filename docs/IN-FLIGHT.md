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

### Owed to `process` — main cannot establish that the fleet was told

**Written here because process is not reachable to be told, which is the
subject.** The user has now raised this four times and asked directly that
process be informed.

**Measured, not inferred — which took four tries.** `ListAgents` reads
`$XDG_RUNTIME_DIR/cc-socks`, so an absent row means no socket, which is not
the same as no session. The process table tells them apart, and
`tools/sessions.sh` now runs that check so nobody has to reconstruct the
pipeline again. At the time of writing: tester running and addressable;
architect, process and user **not running at all** — no process, not merely
unlisted; and two processes alive in directories that no longer exist
(`.claude/worktrees/architect (deleted)` and `reverent-turing-c9f745
(deleted)`), which is the write-pin hazard seen from outside and is worth
a look on its own.

Main had been asserting the opposite in both directions within one hour —
first that unlisted roles had no sessions, then, on the user's correction,
that every role was present and unreachability was always main's error.
Neither was checked. The second went into `CLAUDE.md` and has been removed:
a protocol rule that the machine contradicts is worse than the mistake it
was written to correct, because the next session reads it and concludes its
own tooling is broken.

The consequence either way is the same and is the thing worth fixing:
**"the fleet has been told" is not a property main can establish.**
`announce --done` records that main tried, which is a different claim, and
the gap between the two is where every one of the following sits.

**Four shapes of the same mistake, in order.**

Main told the user to start sessions that were already running — three
times, because it read an absent `ListAgents` row as a session not
existing. Then it built `tools/relay.sh` and handed the user blocks of
text to paste into each session, which the user rejected outright: *"that's
your job to communicate and you should know that."* Then it messaged the
one role that happened to be awake and recorded the announcement as done.
Throughout, its messages were long enough that process asked for three
lines and a pointer instead.

The first two treat the user as the fleet's plumbing. The third is worse
and quieter: it satisfies the guard while leaving three roles uninformed,
and nothing in the protocol can tell that apart from a real delivery.

`CLAUDE.md` now says main never asks the user to relay, and `relay.sh` is
deleted. That removes the wrong fallback and does not supply a right one.

**What is actually missing, and why the repository is the answer.** The
fleet already has a channel that does not care who is awake: a commit.
`fleet.sh sync` carries it to every worktree and `fleet.sh brief` prints
what landed at every session start. That is how this entry will reach
process. What does not exist is anything that makes *an announcement* use
that channel — `announce` writes a sha into an untracked file in the main
checkout, which no other worktree can read.

The shape worth considering, for process to accept or replace: a committed
file that `announce` appends to — what landed and what main wants looked
at — which `brief` prints and each role clears its own line from. Then
"told" is a property of the repository rather than of who was addressable
at the moment main looked, `SendMessage` becomes the fast path instead of
the only one, and the thing the guard checks is the thing that matters.

**The narrower question that belongs with it:** `announce --done` should
probably not be satisfiable while a role remains unreached. Today it is
one command with no argument and no notion of per-role delivery, so main
can honestly run it having reached one of four.

**Unrelated and also owed:** main committed twice with a failing check,
having run `./test.sh --all` and read the tail of its output rather than
its result. The tester did the same within the hour. Running the check and
reading the check are different acts, and the convention naming that is
already on the ADR index — which suggests the fix is mechanical rather
than more care.

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
