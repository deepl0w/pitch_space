#!/usr/bin/env bash
# The fleet protocol is generic and lives in ~/.claude/scripts/fleet.sh; what
# is particular to this project is in .claude/fleet.conf beside this file.
#
# This shim exists so every reference — the hooks, the slash commands, the
# docs, and an agent's habit — keeps working wherever the engine lives.
set -euo pipefail
engine="$HOME/.claude/scripts/fleet.sh"
if [ ! -x "$engine" ]; then
    printf 'The fleet engine is missing from %s.\n' "$engine" >&2
    printf 'It is user-level rather than vendored here; see CLAUDE.md.\n' >&2
    exit 1
fi
exec "$engine" "$@"
