#!/usr/bin/env bash
#
# ADRs are append-only (CLAUDE.md, "Conventions"): a published record is
# never rewritten, only marked Superseded by NNNN. Kept by discipline alone
# until 8 November, when a commit was written against a record its own
# author had not noticed main had just published — caught before merging,
# by the author re-reading their own diff, which is exactly the safeguard
# this project's conventions say not to rely on. This is the command.
#
# Scope: docs/adr/NNNN-*.md staged for a commit, or sitting in a completed
# merge. docs/adr/README.md is excluded — it is the index, updated in place
# by design. A record not yet on `main` has nothing published to violate,
# so drafting a brand new ADR on a branch is untouched.
#
# The baseline is `main`'s own content for the file, not the previous
# commit and not the file's first commit ever. Both of those were tried
# and both are wrong: comparing against the previous commit flags a
# corrective commit that undoes an earlier mistaken rewrite on the same
# branch — a real commit sequence, reproduced against this project's own
# 0050 (da1683d rewrote a published paragraph; 8a580eb reverted the
# rewrite and appended properly, and a previous-commit diff cannot tell
# the second from a second violation). Comparing against the branch's own
# first commit would also block ordinary drafting of a new record before
# it is ever merged. `main` is the one baseline that is "published" in
# the sense the convention means, and it updates live in this shared git,
# so a branch behind main is still checked against the true tip.
#
# The one sanctioned deletion is superseding a record, which replaces its
# Status line in place ("- **Status:** Accepted" -> "...Superseded by
# NNNN"). Verified against the three records this project has actually
# superseded (0020, 0021, 0022): each removes that exact line and nothing
# else. The exemption is the line pattern, not a list of records, so nothing
# needs updating when a fourth one supersedes.
#
# A removal is detected as a diff with no corresponding insertion: strip
# the Status line from both main's version and the proposed version, diff
# them, and anything appearing only on the "before" side is a line this
# proposal drops. That also means insertions are free, anywhere, which is
# the whole shape append-only asks for.
#
# Runs against the index (git diff --cached), which is what both pre-commit
# and pre-merge-commit already have staged before the commit object exists.
# Not wired into test.sh --all: this diffs against the live `main` ref, and
# a CI checkout of a feature branch or PR is not guaranteed to have fetched
# `main` at all. The three git hooks already gate every commit, merge and
# push from inside a checkout where `main` is always resolvable, so add
# this to CHECKS in .claude/fleet.conf and fleet.sh check carries it there.
set -euo pipefail
cd "$(dirname "$0")/.."

strip_status() { grep -vE '^- \*\*Status:\*\* '; }

fail=0

while IFS= read -r f; do
    [ -n "$f" ] || continue

    published=$(git show "main:$f" 2>/dev/null | strip_status || true)
    [ -n "$published" ] || continue   # not on main yet: nothing to violate

    staged=$(git show ":$f" 2>/dev/null | strip_status || true)

    removed=$(diff <(printf '%s\n' "$published") <(printf '%s\n' "$staged") \
        | grep -E '^< ' || true)

    if [ -n "$removed" ]; then
        total_removed=$(printf '%s\n' "$removed" | wc -l)
        printf '✗ %s drops a line main already has published — ADRs are append-only\n' "$f"
        printf '%s\n' "$removed" | head -10 | sed 's/^/    /'
        [ "$total_removed" -gt 10 ] && printf '    ... and %d more\n' "$((total_removed - 10))"
        fail=1
    fi
done < <(git diff --cached --name-only -- 'docs/adr/[0-9][0-9][0-9][0-9]-*.md' 2>/dev/null || true)

[ "$fail" -eq 0 ] && echo '✓ every line main already has for an ADR is still present'
exit "$fail"
