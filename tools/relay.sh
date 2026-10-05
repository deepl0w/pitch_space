#!/usr/bin/env bash
#
# Print a paste-ready briefing for every worktree that has not heard main move.
#
# Why this exists. `fleet.sh announce` says who is owed the news and cannot
# send it; the delivery is a `SendMessage` to the session by name. But
# `ListAgents` is an address book, not a roster of what exists — the role
# sessions here are persistent ones in the user's desktop app, and a session
# missing from that list is unreachable from the main checkout rather than
# absent. Main spent three rounds reading the absence as non-existence and
# telling the user to start sessions that were already running.
#
# `CLAUDE.md` already names the fallback for an undeliverable announcement:
# the user relays it. This makes that cheap. It is the same move as
# `fleet.sh brief` — which prints what landed so a session can begin its
# standing review without having been told — pointed the other way, at the
# agent who has to do the telling.
#
# Usage:  tools/relay.sh [role ...]      # all owed roles when given none
set -euo pipefail
cd "$(dirname "$0")/.."

MAIN=main
announced=.claude/announced
told=$([ -s "$announced" ] && tr -d '[:space:]' < "$announced" || printf '')
head_sha=$(git rev-parse "$MAIN")

if [ -n "$told" ] && [ "$told" = "$head_sha" ]; then
    printf 'Everyone has been told about %s. Nothing to relay.\n' \
        "$(git --no-pager log -1 --format='%h %s' "$MAIN")"
    exit 0
fi

mapfile -t roles < <(
    if [ "$#" -gt 0 ]; then printf '%s\n' "$@"
    else git for-each-ref --format='%(refname:short)' 'refs/heads/claude/*' | sed 's|^claude/||'
    fi
)

printf '# Relay to the role sessions\n\n'
printf 'Main is at %s.\n' "$(git --no-pager log -1 --format='%h %s' "$MAIN")"
printf 'Paste the block for each role into that session in the desktop app.\n'

for role in "${roles[@]}"; do
    branch="claude/$role"
    git rev-parse --verify --quiet "refs/heads/$branch" >/dev/null || continue
    behind=$(git rev-list --count "$branch..$MAIN")
    [ "$behind" -eq 0 ] && continue

    printf '\n--- %s ------------------------------------------------\n\n' "$role"
    printf 'main has moved and you are %s commit(s) behind. Run `/sync` first.\n\n' "$behind"
    printf 'What landed:\n'
    git --no-pager log --reverse --format='  %h %s' -n 12 "$branch..$MAIN"
    [ "$behind" -gt 12 ] && printf '  ... and %s more.\n' "$(( behind - 12 ))"
    printf '\nYour standing review starts there. Report back even if there is\n'
    printf 'nothing to report — silence and not having looked are the same\n'
    printf 'from the outside.\n'
done

printf '\n--- end ---------------------------------------------------\n'
printf '\nAfter relaying: .claude/scripts/fleet.sh announce --done\n'
