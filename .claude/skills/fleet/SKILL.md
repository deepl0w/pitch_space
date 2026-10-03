---
name: fleet
description: How the agents on this repository divide work and hand it back — which checkout you are in, what your role lets you change, when to sync with main, when to commit, who may push, and how the main agent merges the worktree branches. Use when a session here starts, when a role is assigned (tester, architect, feature), before committing or merging, when asked to push or to pick up another worktree's work, and when a merge conflicts.
---

# The fleet

Several agents work on this repository at once. They share one git repository and
one `main` branch, so the only thing that keeps them from overwriting each other
is this protocol.

| Role | Works in | Changes | Branch |
| --- | --- | --- | --- |
| **main** | the original checkout | anything; merges everyone else's work; the only agent that pushes | `main` |
| **tester** | a worktree | tests, and the fixes those tests pin down | `claude/<name>` |
| **architect** | a worktree | `docs/`, chiefly `docs/adr/`; source only by exception | `claude/<name>` |
| **feature** | a worktree | whatever the feature needs, with tests | `claude/<name>` |

`.claude/scripts/fleet.sh brief` says which checkout you are in and where your
branch stands. The SessionStart hook runs it for you; run it again whenever you
are unsure.

## The four rules

1. **Only main pushes.** A worktree agent never runs `git push`, with any flag,
   for any reason. If pushing looks necessary, say so and stop — the main agent
   does it.
2. **Start level with main.** `.claude/scripts/fleet.sh sync` merges `main` into
   your branch. Do it before you start, and again before you hand work back, so
   the main agent inherits a merge you already resolved rather than one it has to.
3. **Commit before you go idle.** Work that only exists in a dirty worktree is
   invisible to everyone else and will be lost. A Stop hook will stop you
   finishing a turn with uncommitted changes; that is the rule working, not a
   malfunction. Commit it, or delete it if it was scratch.
4. **Main integrates.** Worktree branches are merged into `main` by the main
   agent, never the other way round, and never by rebasing a branch someone else
   may be sitting on.

## Your role

A worktree's role lives in `.claude/role` (untracked, so it stays with the
worktree and not with the branch). If `brief` says `unassigned`, ask which role
this session is, then record it:

```bash
.claude/scripts/fleet.sh role tester     # or architect, or feature
```

**tester** — exploratory testing and regression tests. Invoke the `test-engineer`
skill; it carries the method. You may change source to fix a defect you have
pinned with a failing test, and you should. You may not redesign around one: if
the fix wants an architectural change, write the test, report the finding, and
leave it.

The music theory core under `src/theory/` is where this role earns its keep. It
is pure, deterministic given a seed, and makes claims that are checkable against
theory rather than against a snapshot — a generated progression either cadences
or it does not, a spelled interval either is an augmented fourth or it is not.
Prefer property tests over thousands of seeds to example tests over one.

**architect** — assess the code against a constraint, record decisions as ADRs in
`docs/adr/`, keep the design documentation honest. Invoke the `architect` skill.
The ADR log is append-only: a published record's argument is never rewritten,
only its status changed to `Superseded by NNNN`. Source edits are an exception
here, not the job; when you make one, say why in the commit message.

**feature** — build the thing you were asked for, with tests, and nothing else.
Scope creep that lands in someone else's merge is expensive. Exercise types are
the natural unit of feature work here: one worktree per exercise keeps two
agents out of the same file.

## The review cycle

Work landing in `main` is the event the fleet turns on. Nobody discovers it by
accident: **when main merges anything, it tells every worktree**, and the first
thing each does is `.claude/scripts/fleet.sh sync`. Reviewing a change against a
branch that predates it wastes the review.

Once synced, each role has a standing job on whatever just changed — it does not
need to be asked:

- **tester** — read the diff. Does the new code have tests, and are they the
  tests that would have caught the defect it fixes? Try to break it. Anything you
  find goes back to main as a **finding**, whether or not you fix it: a failing
  test you have pinned, or a description precise enough for someone else to pin.
- **architect** — read the diff. Does it still make sense against the records in
  `docs/adr/`, and does it contradict one without saying so? A change that
  narrows or supersedes a decision needs a record; a change that quietly
  undermines one is the finding.

A finding is reported twice over: in `.claude/handoff.md` so it survives you, and
as a message to main so it arrives while main can still act on it. Say what you
found, where, and what you did about it. "Nothing to report" is a useful answer
and worth sending — silence is indistinguishable from not having looked.

Main collects findings, acts on the ones that block, and integrates the branches
at the end. The order is deliberate: review first against a synced tree, merge
afterwards, so main is merging work that has already been read by someone other
than its author.

## Commits

Write the message the repository already uses: a single imperative line that says
what changed and, where it is not obvious, why — `Target chord tones on strong
beats so generated melodies imply their harmony`, not `fix melody gen`. A body
paragraph is welcome when the reasoning will not survive without it.

```bash
.claude/scripts/fleet.sh save "<message>"
```

That stages everything and commits. Several small commits beat one that mixes a
test, a fix and a rename.

## ADR numbers

```bash
.claude/scripts/fleet.sh adr-claim "Port the tuner's YIN detector verbatim"
```

Claim before you write, never after, and never by agreeing a number in a
message. The script allocates against every number that exists anywhere — every
branch, every worktree's working tree including drafts nobody has committed, and
the claims file in the main checkout — so it cannot be defeated by two agents
reading the same state before either writes.

Messages cannot do this job. A reservation and the work it was meant to protect
can cross in flight, which is how the tuner came to claim its 0009 twice: main
reserved it for one branch while another had already written and committed it.
The collision was cheap only because the second record did not exist yet.
Announce your claim by all means — but claim it with the script first.

`fleet.sh adr-taken` lists every number in use and where it came from.

## Handing work back

Before you finish a stretch of work: sync, commit, and run the suite so what you
hand over is green.

Anything the main agent needs to know that is not in the commits — a defect you
found but did not fix, a decision you want reviewed, a test that is skipped for a
reason — goes in `.claude/handoff.md` in your worktree. It is untracked; the main
agent reads it when it integrates your branch, and `integrate` prints it. Delete
it once the point has landed.

## Integrating (main only)

```bash
.claude/scripts/fleet.sh status                       # who has what
.claude/scripts/fleet.sh integrate <branch> -m "..."  # merge one branch
```

Merge one branch at a time, `--no-ff` so the history keeps saying where the work
came from, with a message that describes the work rather than the branch name.
Before you merge, read the branch: `git log main..<branch>` and
`git diff main...<branch>`. You are the reviewer — a worktree agent's tests
passing on its own branch is not the same as the suite passing after the merge.

After each merge run `npm test` and `npm run typecheck`, and only then push. A
TypeScript project will merge cleanly and still not compile: two branches can
each add a field to the same interface without git noticing. If a worktree shows
as DIRTY in `status`, its agent left work uncommitted: say so rather than merging
a half-finished branch.

## Conflicts

Resolve towards what the code should be, not towards whichever side is yours.
Both sides were written by an agent that could not see the other, so a conflict
usually means two reasonable answers to the same question — pick one deliberately
and say which in the merge message. Where the conflict is in a test, the stricter
test usually wins; where it is in a constant that was measured against real
audio, keep the one whose measurement is documented and check the ADRs before
overruling it.

Never resolve a conflict by rebasing or force-pushing a branch another worktree
has checked out.
