#!/usr/bin/env bash
#
# Which role sessions are actually running, and which can be messaged.
#
# This exists because main kept *guessing*. An empty `ListAgents` row was
# read, on three separate occasions, as a session that did not exist —
# which led to telling the user to start sessions already running, and then
# to handing them text to paste. Each time the fix was to go and look, and
# each time looking was a one-off shell pipeline nobody could run again.
#
# The project's first convention says it plainly: when a mechanism exists to
# answer a question directly, a correlate of the answer is not a substitute
# for running it. `ListAgents` answers "can I address this right now"; it
# does not answer "is this session alive". Those come apart, and the gap is
# where every one of those mistakes lived.
#
# Three states, which need telling apart because the response differs:
#
#   running, addressable  — message it; that is main's job and nothing else
#                           substitutes for it
#   running, orphaned     — alive with no socket. Its launch directory was
#                           renamed or removed, which is the write-pin
#                           hazard CLAUDE.md describes: it reads and runs
#                           tests normally and cannot save. It cannot be
#                           messaged and it cannot be fixed from here.
#   not running           — nothing to reach. `fleet.sh brief` catches it up
#                           at its next start; say so rather than calling it
#                           absent, since whether it comes back is the
#                           user's business and not main's reading.
#
# A fourth state surfaced 10 October, for main specifically, and a socket
# check cannot see it: `SendMessage` reserves the literal string "main" for
# a background agent's own parent conversation, and that reservation wins
# over a cross-session peer that happens to carry the same name — before
# the `[ref]` disambiguator a listing error suggests is ever consulted.
# Confirmed from two independent sessions, each retrying with a freshly
# re-read ref, both refused the same way. A role running with a live
# socket is "addressable" by every test this script otherwise has, and
# main is the one role for which that conclusion is wrong — reported here
# rather than left for whoever next trusts the three-state table on faith.
set -euo pipefail
cd "$(dirname "$0")/.."

socks="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/cc-socks"

printf '%-12s %-30s %s\n' ROLE DIR STATE

# main first and separately: it is not a `claude/*` worktree branch, so the
# loop below never reaches it, and its addressability does not reduce to
# socket state the way every other role's does — see the comment at the
# top of this file.
main_dir=$(git worktree list --porcelain | awk '
    /^worktree /{w=$2} $0=="branch refs/heads/main"{print w}')
if [ -n "$main_dir" ]; then
    base=$(basename "$main_dir")
    pid=""
    for p in $(pgrep -f claude 2>/dev/null || true); do
        cwd=$(readlink "/proc/$p/cwd" 2>/dev/null || true)
        [ "$cwd" = "$main_dir" ] || continue
        [ -S "$socks/$p.sock" ] && pid=$p
    done
    if [ -n "$pid" ]; then
        state="running, socket present (pid $pid) — but SendMessage cannot reach"
        state="$state \"main\" by name; see the note above"
    else
        state='not running, or no socket — same unaddressable-by-name caveat applies either way'
    fi
    printf '%-12s %-30s %s\n' "main" "$base" "$state"
fi

for branch in $(git for-each-ref --format='%(refname:short)' 'refs/heads/claude/*'); do
    role=${branch#claude/}
    dir=$(git worktree list --porcelain | awk -v b="refs/heads/$branch" '
        /^worktree /{w=$2} $0=="branch "b{print w}')
    [ -n "$dir" ] || continue
    base=$(basename "$dir")

    # Every process in the directory, not the first one found.
    #
    # A role can have more than one: a session that was orphaned and a
    # live one started beside it, which is exactly what a user does after
    # being told the first is broken. Taking the first match reported the
    # role by whichever the process table happened to list first — and on
    # 7 October that was a stale orphan, so this tool said a healthy
    # session could not save while it was syncing and reporting findings.
    # Main repeated that to the user as fact.
    #
    # A socket is the thing that decides, so a role with any socketed
    # process is addressable and the rest are noted beside it rather than
    # standing in for it.
    pid=""
    stale=""
    for p in $(pgrep -f claude 2>/dev/null || true); do
        cwd=$(readlink "/proc/$p/cwd" 2>/dev/null || true)
        [ "$cwd" = "$dir" ] || continue
        if [ -S "$socks/$p.sock" ]; then pid=$p; else stale="$stale $p"; fi
    done

    if [ -n "$pid" ] && [ -n "$stale" ]; then
        state="running, addressable (pid $pid) — ListAgents for its current name;"
        state="$state also stale with no socket:$stale"
    elif [ -n "$stale" ] && [ -z "$pid" ]; then
        state="running, ORPHANED (pid ${stale# }) — no socket; cannot save or be messaged"
    elif [ -z "$pid" ]; then
        state='not running — brief will catch it up'
    elif [ -S "$socks/$pid.sock" ]; then
        state="running, addressable (pid $pid) — ListAgents for its current name"
    else
        state="running, ORPHANED (pid $pid) — no socket; cannot save or be messaged"
    fi
    printf '%-12s %-30s %s\n' "$role" "$base" "$state"
done

# Sessions alive in a directory that no longer exists. They are not in the
# table above because there is no worktree to match them to, and they are
# worth naming: a session pinned to a deleted directory is the failure mode
# that looks like a working agent right up to its first save.
orphans=$(for p in $(pgrep -f claude 2>/dev/null || true); do
    cwd=$(readlink "/proc/$p/cwd" 2>/dev/null || true)
    case "$cwd" in *"(deleted)"*) printf '  pid %s  %s\n' "$p" "$cwd";; esac
done)
[ -n "$orphans" ] && { printf '\nAlive in a deleted directory:\n%s\n' "$orphans"; }
exit 0
