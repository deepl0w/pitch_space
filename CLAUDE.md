# Pitch Space — notes for agents

A practice app for musicians: sight reading, note identification, rhythm, chord,
chord-progression and scale exercises, generated on the spot and answered by
playing them on a real instrument. One TypeScript codebase ships as an
installable PWA and as an Android APK. `README.md` describes what it does and how
the generation works; this file is about working on it.

## Contents

- [Several agents work here at once](#several-agents-work-here-at-once)
- [Building and testing](#building-and-testing)
- [The code](#the-code)
- [Conventions](#conventions)

## Several agents work here at once

The protocol is generic and lives in your user config: `~/.claude/skills/fleet/SKILL.md`
for the rules, `~/.claude/scripts/fleet.sh` for the plumbing, and `/role`,
`/sync`, `/wrap-up` and `/integrate` as commands. `.claude/scripts/fleet.sh`
here is a shim onto it, so every reference keeps working. What is particular
to this repository is `.claude/fleet.conf` — the roles, the test and check
commands, and how a fresh worktree installs itself — and the rest of this
section.

Read the skill for the four rules and the review cycle. In short: one **main**
agent works in this checkout, owns `main`, and is the only one that may push;
everyone else works in a worktree under `.claude/worktrees/` on `claude/<name>`,
syncs before starting, commits before going idle, and never pushes.

**The branch carries the role; the directory name is cosmetic.** An agent
in the `tester` role works on `claude/tester`, whatever its folder is called,
and two agents in one role take `claude/feature-melody` and
`claude/feature-capture`. `fleet.sh status`, `integrate` and every merge work
in branches, so that is where the role has to be legible.

Directories get generated names like `intelligent-hypatia-c5ce53` and **that
is expected, not a mistake to report.** The host's worktree option is
`claude --worktree` with no name and there is no field to supply one, so a
random folder is simply what a new session gets. Do not ask for it to be
renamed and do not rename it yourself: **a session is pinned for writes to
the directory it was launched in**, separately from where its shell stands,
so moving it mid-session gives an agent that reads, runs tests and uses git
while every save is refused — looking fine right up to the first save. Three
sessions were lost that way on 4 October. Main renames folders between
sessions, never during.

So a new session's first act is to take its role branch, which is free to
rename at any time and costs nothing:

```bash
git switch claude/<role>          # if the branch already exists
git branch -m $(git branch --show-current) claude/<role>   # if it does not
.claude/scripts/fleet.sh role <role>
```

**The roles this project runs**, and what each may change:

| Role | Changes |
| --- | --- |
| **tester** | tests, and the fixes those tests pin down |
| **architect** | `docs/`, chiefly `docs/adr/`; source only by exception |
| **feature** | whatever the feature needs, with tests |
| **user** | `docs/findings/`, and end-to-end tests of what it found |
| **process** | `CLAUDE.md`, `.claude/`, `docs/process/`, and the protocol's own files |

**The user role is not a second tester, and the distinction is the whole
point of having it.** A tester reads the code and writes tests against what
it says; a **user** never opens the code and reports what the app does to
someone who only has the app. They find different things. Most of what has
gone wrong here was invisible from one side or the other: the clef control
the app advertised and could not open, the circle of fifths printing one
signature for two spellings, the exercise switch that blanked the page —
all three are obvious to anyone clicking and none of them failed a test.
Going the other way, the session tally that silently blended two exercises
and the guards that could not fail were invisible from the outside.

So a **user** works from the built app and the brief, and nothing else:

- **Does not read `src/` to form a finding, nor `docs/IN-FLIGHT.md` below.**
  Reading `src/` to write a test afterwards is fine; reading it, or the plan
  of what is about to change in it, to decide what is wrong is how the role
  collapses into the tester's. If a finding cannot be stated in terms of
  what the app did, it is not this role's finding.
- **Does not modify or revert `src/` to test a hypothesis either.** Not
  reading it to diagnose was never only about reading; a worktree checked
  back to an older build to compare behaviour is acting on the code, which
  is further into the tester's role than reading it ever was. A static page
  with no app code, built fresh to isolate the one mechanism in question,
  reproduces the same thing without touching the tree — found, not assumed,
  the day this needed saying.
- **Reports what happened, not what to change.** "The home card says I can
  read intervals off the staff and I cannot find how" is a finding; "add a
  presentation field to the settings schema" is someone else's job and is
  usually wrong on the first guess.
- **Says what it expected.** A finding without an expectation is a
  preference, and the brief is the standard — six kinds of practice,
  configurable, generated from real patterns, answered by playing.
- **Writes findings down** in `docs/findings/`, one file per sweep, so they
  outlive the session that found them. A verbal finding is forgotten; this
  project has already lost one that way.

A **process** session works on how the fleet works rather than on what it
builds, and touches no source. It owns the three places the protocol is
written — this section, `.claude/fleet.conf`, and the generic protocol in
`~/.claude/` — for one reason that matters more than tidiness:

From time to time, rather than only reacting to what went wrong here, it
checks the protocol against outside practice — published research on
multi-agent coordination and code review, not just this fleet's own
incidents — and writes down what's confirmed, what's new, and what's still
only a hypothesis this fleet hasn't tested. The fleet skill's "The review
cycle" carries the last pass; say which is which rather than presenting
borrowed evidence as this project's own.

**`~/.claude/skills/fleet/SKILL.md` and `~/.claude/scripts/fleet.sh` are
shared across every project on this machine, and outside *this* repository's
git — not outside git entirely any more.** `~/.claude` got its own local
repository on 9 October (no remote, no push), specifically because two
agents editing these files at once used to silently keep whichever wrote
last with no history, no diff and no way back. The skill changed under a
process session mid-edit on 4 October, which is how that came to be
written down in the first place. A local repo gives a record and a
revert; it does not give real-time conflict detection between two
sessions editing at once, which is still the single-writer rule's job —
**only a process session edits the protocol's own files**, and anyone else
who wants them changed says so and leaves them alone. If you find yourself
about to improve the fleet skill from a tester worktree, that is the
moment the rule is for. Commit there after editing, the same discipline
as this repository, so the record is actually kept rather than merely
possible. `docs/process/` carries the reasoning that is specific to this
project; `~/.claude`'s own log carries the rest.

**This reaches the fleet's own coordination files, named above, and nothing
else in `~/.claude/` by the same hazard alone.** `test-engineer` and every
other skill there are unversioned too, and shared across every project on
this machine, not just this one — which is exactly why this fleet has no
standing to claim one. A project's protocol can own how its own agents
coordinate; it cannot extend that to a skill other projects' sessions also
write to, sight unseen. Asked and settled 6 October rather than guessed at.

**`docs/findings/` and `docs/process/` are written but never committed.**
The repository is public, and the user asked that the fleet's internal
writing stay out of it; `.gitignore` enforces that, so an agent cannot
re-add them by forgetting. Keep writing them — the reason they exist is
that a finding nobody wrote down is forgotten, and that has already cost
this project one. But they now live only in the checkout that wrote them,
which has two consequences worth planning around: a sweep's findings do
not reach another worktree through `fleet.sh sync`, so say what you found
in a message as well; and a document that cites one is citing something a
reader of the public repository cannot open. Where that citation carries
the argument rather than just the evidence, put the argument in the
citing document.

A **tester** should invoke the `test-engineer` skill and an **architect** the
`architect` skill; **feature**, **user** and **process** sessions need neither.

The music theory core under `src/theory/` and `src/generate/` is where the
tester role earns its keep. It is pure, deterministic given a seed, and makes
claims that are checkable against theory rather than against a snapshot — a
generated progression either cadences or it does not, a spelled interval
either is an augmented fourth or it is not. Prefer property tests over
thousands of seeds to example tests over one, and **assert constraints, never
aesthetics**: the generators' weights are a tuning problem with no ground
truth, and a test that pins them makes tuning impossible.

**Telling each other is a delivery, not a printout.** `fleet.sh announce`
lists who has not heard that main moved; it cannot send anything. The
delivery is `SendMessage` addressed to the session by name — `ListAgents`
prints the names. "Told" is not a flag main sets about itself — it is a
role's own branch catching up, which `announce` and `status` read directly
and which clears itself the moment a role syncs, whether or not any message
reached it.

**The per-commit nag is silent unless a role is actually addressable.** It
used to ask main to tell every behind role on every commit, with no way to
distinguish "reachable and untold" from "nothing to tell" — the first
pass fixed "not running" (nothing has nothing to deliver and nothing that
clears it, costing four identical re-checks in one day) but, checked rather
than assumed, still nagged about an **orphaned** role: a process does sit at
the worktree's own directory, same as an addressable one, so a bare process
check cannot tell them apart and the first version of this fix caught both.
An orphaned role cannot be messaged or fixed from main either, so it has
the same unclearable shape as not-running — the check now requires a
socket, not merely a process, which is the exact line `tools/sessions.sh`
already draws between the three states. `fleet.sh brief` still catches a
silenced role up whenever it next starts, which never depended on main
doing anything.

**The role sessions are permanent, and main does not start them.** They run
in the user's desktop app, they are part of this project's standing
configuration, and they outlive any one main session. Main has told the user
three times to launch sessions that were already running; this paragraph is
here because saying it twice was not enough.

**An agent's listed name is only good for the instant it was read.** The
fleet skill explains why — the suffix `ListAgents` adds changes every time a
session resumes, so a name kept from earlier in the conversation, or
assembled from the worktree directory, is already stale — and what settles
whether a role is alive when the roster says otherwise (its branch, not the
roster). Here it is enough to say it bit main three times in one day and the
skill's version is the one to read before it bites again.

**The user is not a message bus, and main does not ask them to be one.**
This is the third shape of the same mistake: first main told them to start
sessions that were already running, then it handed them blocks of text to
paste into each one. Both treat the user as the fleet's plumbing. Keeping
the agents informed is main's job and it does not get delegated upwards —
if the user has to carry a message, the protocol has failed, not succeeded
by another route.

**That rule is about relaying, and does not reach asking the user to act.**
Carrying text from one session to another is plumbing; asking them to do a
thing only they can do — rename a session they own, restart one whose
directory is gone — is asking the actor to act, not handing them a wire.
The distinction matters because the sentence above reads absolute enough
to make the second look like the first, and hesitating over it would leave
a known problem in place for the sake of a rule about something else.

**Do not guess whether a role is there. Run `tools/sessions.sh`.**

This is the project's first convention — when a mechanism exists to answer
a question directly, a correlate is not a substitute for running it — and
main has broken it on this exact question four times in a day. `ListAgents`
answers *can I address this right now*. It does not answer *is this session
alive*. Those come apart, and every one of the following came from reading
the first as the second: telling the user to start sessions that were
already running, handing them blocks of text to paste in, and recording an
announcement as delivered having reached one role of four.

The command separates the three states, because the right response differs:

- **running and addressable** — message it. That is main's job, it does not
  get delegated upwards, and nothing else substitutes for it.
- **running but orphaned** — alive with no socket, because its launch
  directory was renamed or removed. This is the write-pin hazard above,
  seen from outside: the agent reads, runs tests and uses git normally and
  cannot save. It cannot be messaged and it cannot be fixed from main.
- **not running** — there is nothing to reach. Say that, not that the role
  is absent; whether it comes back is the user's business. `fleet.sh brief`
  prints what landed at its next start, so it is caught up rather than lost.

**Main is a fourth case these three states do not cover, found 10 October:
running, socketed, and still unaddressable by name.** `SendMessage` reserves
the literal string `main` for a background agent's own parent conversation,
and that reservation wins over a cross-session peer that happens to be
named `main` — before the `[ref]` a listing error suggests is ever
consulted. **Three forms were tried and they fail in two different ways,
not one**, which costs more than a single consistent refusal would: `to:
"main"` names the reservation outright; the ref the error then suggests
comes back "not reachable", offering a second ref; that second ref returns
to the reservation message. Two different refs for one session, live at
the same moment, and the disambiguator the error itself points at is what
gets swallowed — a reader who follows it and lands back at the first error
can reasonably conclude they mistyped rather than that the address cannot
be used at all.

Confirmed independently by three sessions (architect, tester, this one),
each re-reading `ListAgents` immediately before sending — reproduction
through one instrument, which is a repeat count rather than three
witnesses. What actually isolates the cause is the contrast sitting beside
it: messages to `tester` and to `architect`, from the same sessions, in the
same sittings, went through. The failure tracks the reserved name, not the
sender, the host, or main being otherwise unreachable. `ListAgents` keeps
listing `main` as reachable regardless, which is the sharper fact: an
advertised route that cannot be used reads as working right up until it is
tried, where an absent one would send someone looking for another way. A
socket is what every other role's addressability reduces to; main is the
one role where that reduction is wrong, and `tools/sessions.sh` now says so
explicitly rather than reading the socket and reporting addressable.

**The name is unusable; the session is not.** `SendMessage`'s reservation
blocks `to: "main"` and every ref tried against it — it does not block a
reply built from a message main already sent. Copying the `from` address
on an incoming cross-session message — the raw socket path, not the
display name — reached main where the bare name refused, tried the same
minute the refusal was confirmed, by more than one session since. **Put
the other way round, so it cannot be misread as "main is cut off":**
main's own messages reach every role normally, and whoever it writes to
can answer back on that same thread. What the name collision actually
costs is narrower than a severed link — it is main having to speak first,
every time, rather than being reachable cold the way every other role is.
**In practice that precondition costs nothing**, confirmed once every role
had used the socket route: main's own merge and landing announcements are
routine, so by the time any role has something to report back, it has
already received a message from main to reply to. The gap is theoretical
for anyone main has already written to, and real only for reaching main
cold, which is rare — most traffic this way is a reply to begin with.

Work is not stranded either way — `announce` and `status` read each role's
own branch directly, so main's tooling still shows a branch moved without
anyone telling it. What is lost is the fast path and the reasoning behind
it: main learns *that* something changed and not *why*, and reconstructs
from commit messages what a message would have said outright. The
measured cost is main asking more than once for an answer the repository
already held, including one already committed and merged days earlier —
**which is the project's first convention pointed at main rather than at
the protocol**: a message is a correlate of an answer, the repository is
the mechanism, and asking again without first reading what the branch
already says is the same mistake `tools/sessions.sh` exists to stop,
one level up. Worth a main session's own habit, not only a tool's: before
re-asking a role that cannot be reached cold, check what its branch
already holds.

**The fix is not a name this file controls.** The branch still says `main`,
the role still says `main` — what needs to change is the session's own
display title, which this project has had no reason to distinguish from
either until now. A session titled literally `main` cannot be reached cold
by `SendMessage` under a host that reserves the word; one titled anything
else can, at no cost to the branch or the role, since neither reads the
session's title at all. Renaming it is not a worktree session's call to
make — it is not this checkout — so it is recorded here rather than acted
on from one.

**`user` failed the same way the same day, and the cause is not this
one.** `ListAgents` lists it with no `[ref]` at all, unlike every other
role; `tools/sessions.sh` reports a socket; `SendMessage` to the bare name
still refuses with "No agent named 'user' is reachable" — from main twice,
ten minutes apart, and from this session once more immediately after a
fresh `ListAgents`. That rules out a stale read and rules out the sender:
two different roles failed identically. It does not confirm a mechanism —
main's error named the reservation outright, this one does not, and `user`
is not on `SendMessage`'s documented reserved-word list the way `main` is.
One guess worth naming and not yet checked: chat protocols commonly use
`user` as a role token the way this one uses `main` for a parent
conversation, which would make this the same *shape* of collision under a
different reservation. **Recorded as open rather than attributed**, on
this file's own standard: an explanation reached for immediately after one
mechanism is confirmed is selected for fitting the symptom, not for being
true, and this one has a real alternative sitting right next to it.

Two things that follow and are easy to get backwards. An unreachable role
is never a reason to do nothing — there is no flag to set that makes it
told anyway; `announce` and `status` keep showing it behind until its own
branch says otherwise, which is the honest state of things. And the user is
**not** the fallback: if they have to carry a message, the protocol has
failed rather than succeeded by another route.

What carries regardless of who is awake is the repository. `fleet.sh brief`
prints what landed; `docs/IN-FLIGHT.md` is how main says what it wants
looked at; `announce` and `status` now read each role's own branch rather
than a flag main sets about itself, so "told" stops being main's claim and
becomes the fleet's own state. Use the message as the fast path regardless —
the repository catches a role up, but only a `SendMessage` reaches it now.

**`docs/IN-FLIGHT.md` says what is coming, the same way `announce` says what
came.** Before architect or feature starts something that will change an
interface another role depends on — generated output shapes, what a
function returns, anything a test could be written against before the code
exists — main writes a short entry there: which role, what is changing, and
what it implies for whoever reacts to it. Main is the only writer, the same
shape as the protocol's own files and as `main` itself, so two roles never
contend for the same lines; a role that wants an entry says so to main
rather than writing one. Committed to `main`, so the next `fleet.sh sync`
carries it to every worktree whether or not anyone remembered to message
about it — though message anyway, the same as any announcement, since a
synced file nobody was told to read is the gap this whole section exists to
close. An entry is removed once the change has merged and been reviewed,
not left to accumulate; it describes work still in flight, not a history of
it.

This is what gives **tester** a prospective half to the standing job the
skill already describes: after a sync, check `docs/IN-FLIGHT.md` as well as
what just landed, and where it names something checkable before it exists —
a generator's new output shape, an interface a feature is about to change —
write toward it ahead of the merge rather than only after.

**The user role does not read `docs/IN-FLIGHT.md`, for the same reason it
does not read `src/`.** Telling the black-box role what is about to change
is how it stops being a black-box role; it works from the built app and the
brief, and this is neither.

Exercise types are the natural unit of feature work — one worktree per
exercise keeps two agents out of the same file.

**`fleet.sh save` records timing automatically; `fleet.sh stats` reads it
back.** `fleet.sh save "<message>" [tokens]` — the token count is optional
and self-reported, since a hook has no way to see it without an extra call
that would spend tokens measuring tokens.

**`git commit` runs `fleet.sh check` itself now and refuses a NOT GREEN
state, in every worktree.** A pre-commit hook, installed by `fleet.sh sync`
into the shared `.git/hooks/`, after a failing check reached a commit three
times by three different command shapes — reading a tail and missing the
failure above it, then a pipeline (`check | grep ... && commit`) whose exit
status was grep's rather than the check's. Neither reading more carefully
nor a check only `fleet.sh save` enforced would have stopped the third one,
which used `git commit` directly. This does, regardless of shape, at the
cost of the full suite's time on every commit — `fleet.sh check` by hand is
still worth running first, to see the detail rather than just the verdict.

**A refusal through the hook used to leave nothing behind.** `cmd_check`
evals the suite straight to the hook's stdout, which a commit swallows;
a `NOT GREEN` seen once and green on every run since had no output
anywhere to explain it, not because anything was deleted but because
nothing was ever kept. It now tees each eval to `.claude/last-check.log`
in the worktree — fixed path, overwritten each run — and names it beside
a failing verdict, so the next one-off refusal leaves evidence rather
than a story nobody can check.

**`git merge` gets the same gate, separately, because `pre-commit` does not
fire for it at all.** Found within the hour: main's traffic is almost
entirely merges, one direct commit to roughly twenty merges in a day, so
the commit-only gate caught the rare case and missed the common one. A
`pre-merge-commit` hook — a real, documented git hook for exactly this,
confirmed rather than assumed — now covers `fleet.sh integrate` and any
plain `git merge` the same way. `git push` has a third hook, `pre-push`,
for the same reason — only main pushes, and the same agent demonstrated
twice that a manual `check | <filter> && push` can discard the check's
exit status regardless of which filter. Three hooks, each named for the
one git operation it watches, rather than one check trusted to sit
upstream of all three.

**`fleet.sh brief` also checks the shared engine's own health, every
session start.** `~/.claude/scripts/fleet.sh` is unversioned and actively
executed by whoever is running at the time — editing it non-atomically can
produce a torn read, or strip its executable bit, silently, hours before
anyone notices a hook stopped firing. Caught twice in one day, by the
people it happened *to* rather than the edit that caused it. A loud warning
now, not a quiet failure later.

The hazard worth repeating from the skill, because it has bitten here:
`node_modules` is git-ignored, so a fresh worktree cannot run a single npm
script until `sync` has installed it, and after a merge that moved
`package.json` you must install again before trusting a green run.

## Building and testing

Node 20.19+ or 22.12+, and for the Android build a JDK 17+ and the Android SDK.

```bash
./test.sh --check            # is this machine set up
npm test                     # the vitest suite — run this before handing work back
npm run typecheck            # tsc; a merge can pass tests and still not compile
./test.sh --all              # what CI runs: tests, types, lint, offline precache
./build.sh                   # production web build
./build.sh --dev             # the dev server, at http://localhost:5173
make help                    # the same things, wrapped
```

**Several worktrees cannot all have port 5173.** `./build.sh --dev` and
`npm run dev` both want it, and vite silently takes the next free port
instead, which the preview harness does not follow — a live server and a dead
preview. Use `tools/app.sh`, which picks a free port, prints it, and prints
the headless-Chrome command to drive it.

**Before you report what the app does, read `docs/RUNNING-THE-APP.md`.** The
preview harness misreports two things about this app in particular, and two
published findings had to be withdrawn because of it. Checking the app is
cheap; withdrawing a claim is not.

`./build.sh --android` exists and refuses with a reason: Capacitor is not set
up yet, so the app currently ships as a PWA only. `./test.sh --offline` does
the same for the service worker. Both are wired so they start working when
those land rather than being added afterwards; `docs/ROADMAP.md` has the rest.

## The code

```
src/
  theory/     facts about music: pitch, interval, scale, key, chord, meter, roman
  generate/   choices about music: templates, harmony, rhythm, melody, exercise
  audio/
    dsp/      pitch detection, onsets, rhythm alignment — pure maths
    capture/  microphone, AudioWorklet, analysis worker
    output/   the one AudioContext, instruments, metronome, scheduler
  exercises/  one directory per exercise type, plus render/toVexflow.ts
  ui/         notation/, components/, screens/, theme/
  state/      zustand stores and persistence
  app/        composition root
```

The tree above is what each directory *holds*, not what it is for. The
distinction cost two ADRs and a published report: the previous version listed
chroma under `dsp/`, meaning that is where chroma will go, and three documents
read it as a statement that chroma was there. It is not — a chord exercise
needs it written first. If you add a planned component here, say that it is
planned.

**`theory/`, `generate/` and `audio/dsp/` import nothing above themselves and
nothing from the platform — no DOM, no `AudioContext`, no React.** That is what
lets the whole music engine and the whole analysis chain run under vitest on a
laptop, and it is the single constraint most worth protecting. A test enforces
it. If a change to the generator or the detector needs a browser class, it
belongs in `capture/`, `output/` or a component.

**`src/exercises/render/toVexflow.ts` is the only file that may import vexflow.**
A second importer is how that containment quietly dies, so the same test checks
for it.

The pitch-detection constants are measurements, not preferences. Most are
inherited from the sibling tuner at `../tuner`, whose ADRs record what was
measured and on what; changing one means re-running the recordings corpus.

Generation is **deterministic given a seed**. Nothing in `theory/` or
`generate/` may call `Math.random`, read the clock, or let `Set`/`Map` iteration
order decide a musical choice — an exercise a user reports by its seed has to
reproduce exactly.

## Conventions

- **Comments explain why, not what.** The existing ones give the reason a
  threshold exists or a branch is there; match that density and tone rather than
  annotating syntax.
- **Commit messages** are one imperative line saying what changed and why —
  `Target chord tones on strong beats so generated melodies imply their harmony`,
  not `fix melody gen`. Read `git log` before writing one.
- **ADRs are append-only.** `docs/adr/` records decisions that would be expensive
  to reverse. A published record is never rewritten, only marked
  `Superseded by NNNN`, and the index in `docs/adr/README.md` is updated with it.
- **Tests assert constraints, never aesthetics.** The generator's weights are a
  tuning problem with no ground truth; a test that pins them makes tuning
  impossible. Assert that a suspension resolves down by step, not that a
  particular seed produces a particular tune.
- **A mistake that recurs is a signal to write a rule, not to try harder.**
  The ADR README's conventions and `fleet.sh check` both exist because a
  first occurrence was fixed and a second one was not going to be caught by
  more care alone. See the fleet skill, "The review cycle".
- **Positioning derives from a named value, not a repeated constant.**
  Where two things have to line up — a fixed control and the page edge it
  sits at, a column and the gutter beside it — give the value a name once
  and reference it, rather than writing a number in each place and
  trusting them to stay equal. `--page-inset` is the first of these. The cost
  of the other way is not untidiness: reserving space for the settings cog
  with a `padding-right` on every header shifted each header's *content*
  centre by half the reserved width, so the title stopped sharing an axis
  with the stave beneath it and the page had two centres for no reason a
  reader could see. A number that merely matches another number is a
  number that will stop matching.

  **Naming a constant is not the same as removing one**, and the first
  attempt at this rule did only the first. `--page-inset` began as
  `16px`: three copies collapsed into one, which is better, and still a
  number chosen rather than derived. It is `1rem` now — the browser's
  default text size, which the document already scales from and which
  the reader may have changed. Before asking what a value should be,
  ask which quantity the page already has that it *is*.

  **The same rule covers a threshold, not only a position, and that is
  the easier half to miss** — a breakpoint reads as a decision about
  layout, not as a number that has to match anything. The
  circle-of-fifths page switched to two columns at a round `64rem`;
  below the width where both columns actually fit, they squeezed the
  diagram the page exists to show — 480px wide at 1920, 308px at 1200,
  and 162px at 1024, smaller than at any width on either side of that
  band, because one column would have given it back the full 480. The
  breakpoint is `76rem` now, the sum of what has to fit at once: the
  30rem circle, the 15rem key list, a 22rem minimum detail column, plus
  gaps and the page padding.

  **A wrong threshold is worse than no rule at all, which is worth
  naming separately.** The drifting-centres example above is untidy but
  harmless at every width. A wrong breakpoint instead produces an
  interior band where the layout is worse than if nobody had written
  the rule — and the band is exactly what nobody looks at: checking the
  extremes finds both fine, and a round number reads as a tidy choice
  rather than as a claim that owes the same derivation as any other
  positioned value.

- **A tracked document does not chase a figure the next commit can change.**
  Either the number is read out of the repository when someone asks for it
  (`tools/report-facts.sh`), or the document says which commit it describes
  and then stays there. `docs/report/2026-10-04.html` is a dated snapshot of
  `901e3d6` and says so; re-pointing its dateline at HEAD is the error, not
  the staleness. Nine commits have been spent doing exactly that, which is
  why this is written down.
- **Say a thing in one place.** Where this file, `.claude/fleet.conf`, a
  README and the fleet skill all explained the roles, the copies drifted —
  this file said "the three roles" over a table of four for two days. Put the
  argument where it belongs and point at it from everywhere else; the ADR
  index already carries this as its first convention, for claims about code.
- **When a mechanism exists to answer a question directly, a correlate of
  the answer is not a substitute for running it.** A matching test count is
  not `git merge-base`; telling one agent is not `fleet.sh announce`. The
  reasoning is in `docs/process/2026-10-04-a-proxy-is-not-the-mechanism.md`,
  which is on disk and deliberately not in the repository — see below.
- **A safeguard that only fires for someone already inclined to look is not
  a safeguard.** It protects the case that did not need it and misses the
  one that did, because the person who most needs stopping is exactly the
  one who was not going to check. Two independent instances: the commit
  gate existed as `fleet.sh check` for a session to run by hand, and a
  failing check still reached a commit three times by three different
  command shapes before the git hooks made it fire regardless of whether
  anyone meant to look; `docs/ARCHITECTURE.md`'s "What is not built"
  addressed its warning to the *reader*, who was never the one who made
  the list stale — the builder was, and had no reason to open the file —
  so three of four entries went false twice before each claim carried its
  own check instead of a comment asking to be read. Bind the claim to a
  fact a command can verify; a warning that depends on diligence will be
  skipped by precisely the diligence it needed.
- **A document over about a hundred lines opens with a contents block**, as
  links, so an agent can find the one section it needs and read that. Write
  headings that say what is under them rather than gesturing at it, and keep
  sections short enough to be the unit someone reads. An index that is
  already there — the table of records at the top of `docs/adr/README.md` —
  does not want a second one in front of it.
- Prose in docs is written out, British spelling, no telegraphic bullet lists
  where a sentence would do. Short is not telegraphic: cut the paragraph that
  repeats the one above it, not the sentence that gives the reason.
