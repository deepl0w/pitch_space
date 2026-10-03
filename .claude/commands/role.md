---
description: Adopt a fleet role for this worktree (tester, architect or feature)
argument-hint: tester | architect | feature
allowed-tools: Bash(.claude/scripts/fleet.sh:*), Skill
---

Record this worktree's role and then work as it:

```bash
.claude/scripts/fleet.sh role $ARGUMENTS
```

If `$ARGUMENTS` is empty, ask which role this session is before writing anything.

Then read `.claude/skills/fleet/SKILL.md` for what the role may and may not
change, and invoke the skill that carries the method for it — `test-engineer` for
tester, `architect` for architect. A feature session needs neither; it just
builds the thing, with tests.

Finally, bring the worktree level with main (`.claude/scripts/fleet.sh sync`,
which also installs node_modules the first time) before starting, and report what
you found: the role, how far behind main you were, and whether anything was left
uncommitted here by an earlier session.
