---
description: Bring this worktree up to date with main
allowed-tools: Bash(.claude/scripts/fleet.sh:*), Bash(git:*), Bash(npm:*)
---

```bash
.claude/scripts/fleet.sh sync
```

It refuses on a dirty tree — commit first with
`.claude/scripts/fleet.sh save "<message>"`, or revert the changes if they were
scratch.

On a conflict, resolve towards what the code should be rather than towards your
own side, `git add` the files and `git commit --no-edit`. Then run `npm test` and
`npm run typecheck` — a merge that passes tests is not a merge that compiles, and
in TypeScript those are genuinely different questions — and report what moved and
anything the merge changed about your own work.

If `package.json` moved in the merge, `npm install` before you trust a green run.
