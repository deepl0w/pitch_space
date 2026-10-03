---
description: Commit this worktree's work, sync with main, and leave a handoff note
allowed-tools: Bash(.claude/scripts/fleet.sh:*), Bash(git:*), Bash(npm:*), Read, Write, Edit
---

Hand this worktree's work back to the main agent. In order:

1. `git status --short` and `git diff` — look at everything that changed, and
   drop anything that was scratch rather than committing it.
2. Commit in coherent pieces with `.claude/scripts/fleet.sh save "<message>"`.
   One imperative line saying what changed and why, in the style of the existing
   log; separate commits for separate ideas.
3. `npm test` and `npm run typecheck` — hand back a green branch, and if it is
   not green say so plainly rather than quietly leaving it.
4. `.claude/scripts/fleet.sh sync` — resolve any conflict here, where you have
   the context, instead of leaving it for the merge.
5. Write `.claude/handoff.md` if, and only if, there is something the main agent
   needs that the commits do not say: a defect found but not fixed, a decision
   that wants review, a test skipped for a reason. Delete the file if there is
   nothing.

Then report the branch name, the commits, the test result, and what is in the
handoff note. Do not push — the main agent does that.
