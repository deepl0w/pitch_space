---
description: Main agent only — review and merge the worktree branches into main
argument-hint: "[branch]"
allowed-tools: Bash(.claude/scripts/fleet.sh:*), Bash(git:*), Bash(npm:*), Read
---

Current state of the fleet:

!`.claude/scripts/fleet.sh status`

Merge the branches that are ahead of main, one at a time, newest work last if
they touch the same files. For each:

1. Read it before you merge it: `git log main..<branch>` and
   `git diff main...<branch>`. You are the reviewer, not a conduit.
2. `.claude/scripts/fleet.sh integrate <branch> -m "<message>"` — the message
   describes the work, not the branch name, in the style of the existing merges.
   It prints that worktree's handoff note if there is one; read it.
3. `npm test` and `npm run typecheck` after each merge. Tests that passed on a
   branch can still fail once two branches meet, and two branches that each
   compiled can stop compiling together.

A branch marked DIRTY has uncommitted work in its worktree — do not merge it
blind; say which worktree it is so its agent can finish.

Stop before pushing and tell the user what landed, what the suite says, and what
the handoff notes raised. $ARGUMENTS
