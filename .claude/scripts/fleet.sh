#!/usr/bin/env bash
# Plumbing for the agents that work on this repository.
#
# One main agent works in the original checkout, owns `main`, and is the only
# one allowed to push. Every other agent works in a worktree under
# .claude/worktrees/ on its own branch, keeps up to date by merging `main` in,
# commits its own work, and never pushes. This script is the mechanical half of
# that protocol; the judgement half is in .claude/skills/fleet/SKILL.md.
#
# Subcommands:
#   brief                 one screen of state — what the SessionStart hook prints
#   role [name]           show, or set, this worktree's role
#   new <role> [name]     main only: create a worktree and give it a role
#   sync                  bring this worktree up to date with main
#   save "<message>"      stage everything and commit
#   status                every worktree: role, branch, pending commits, dirt
#   integrate [branch]    main only: list mergeable branches, or merge one
#   guard                 Stop-hook check: refuse to go idle with work uncommitted
#   adr-claim "<title>"   reserve the next free ADR number, fleet-wide
#   adr-taken             every ADR number in use anywhere, and who holds it
set -euo pipefail

MAIN_BRANCH=main
SUITE='npm test'

repo_root=$(git rev-parse --show-toplevel)
main_root=$(git worktree list --porcelain | awk '/^worktree /{print substr($0, 10); exit}')
role_file="$repo_root/.claude/role"
handoff_file="$repo_root/.claude/handoff.md"
# Claims live in the main checkout so every worktree reads and writes one file.
adr_claims="$main_root/.claude/adr-claims"

if [ "$repo_root" = "$main_root" ]; then in_main=1; else in_main=0; fi

die() { printf '%s\n' "$*" >&2; exit 1; }

have_main_branch() { git rev-parse --verify --quiet "$MAIN_BRANCH" >/dev/null; }

current_role() {
    if [ "$in_main" = 1 ]; then
        printf 'main\n'
    elif [ -s "$role_file" ]; then
        printf '%s\n' "$(tr -d '[:space:]' < "$role_file")"
    else
        printf 'unassigned\n'
    fi
}

role_of() {
    if [ -s "$1/.claude/role" ]; then
        tr -d '[:space:]' < "$1/.claude/role"
    else
        printf '?'
    fi
}

dirty_count() { git -C "${1:-$repo_root}" status --porcelain | wc -l | tr -d ' '; }

is_clean() { [ "$(dirty_count "${1:-$repo_root}")" -eq 0 ]; }

# node_modules is git-ignored, so a fresh worktree cannot run a single npm
# script until it is installed. Deliberately not done from the SessionStart
# hook: an install can outlast the hook timeout, and a node_modules shared
# between worktrees by symlink would let one branch's dependencies silently
# become another's.
needs_install() { [ ! -d "$repo_root/node_modules" ]; }

ensure_node_modules() {
    needs_install || return 0
    printf 'No node_modules in this worktree; installing...\n'
    (cd "$repo_root" && npm install --no-audit --no-fund)
}

# path<TAB>branch for every worktree except the main checkout.
side_worktrees() {
    git worktree list --porcelain | awk -v skip="$main_root" '
        /^worktree /{ p = substr($0, 10) }
        /^branch /  {
            b = substr($0, 8); sub(/^refs\/heads\//, "", b)
            if (p != skip) print p "\t" b
        }
    '
}

commits_between() { git rev-list --count "$1..$2" 2>/dev/null || printf '0'; }

cmd_brief() {
    local role branch ahead behind dirt
    role=$(current_role)
    branch=$(git rev-parse --abbrev-ref HEAD)
    dirt=$(dirty_count)

    printf 'Fleet: role=%s branch=%s\n' "$role" "$branch"
    if [ "$in_main" = 1 ]; then
        printf 'Checkout: the main one. You own main and are the only agent that may push.\n'
    else
        printf 'Checkout: worktree %s. Commit here; never push.\n' "$(basename "$repo_root")"
        if [ "$role" = unassigned ]; then
            printf 'No role set. Ask which one, then run: .claude/scripts/fleet.sh role <tester|architect|feature>\n'
        fi
    fi

    if have_main_branch && [ "$in_main" = 0 ]; then
        ahead=$(commits_between "$MAIN_BRANCH" HEAD)
        behind=$(commits_between HEAD "$MAIN_BRANCH")
        printf 'Against main: %s commit(s) ahead, %s behind.\n' "$ahead" "$behind"
        if [ "$behind" -gt 0 ]; then
            printf 'Behind main — run .claude/scripts/fleet.sh sync before starting work.\n'
        fi
    fi

    if [ "$dirt" -eq 0 ]; then
        printf 'Working tree: clean.\n'
    else
        printf 'Working tree: %s file(s) changed — uncommitted work from an earlier session.\n' "$dirt"
    fi
    if needs_install; then
        printf 'No node_modules here yet; .claude/scripts/fleet.sh sync installs them.\n'
    fi
    if [ -s "$handoff_file" ]; then
        printf 'A handoff note is waiting in .claude/handoff.md.\n'
    fi

    if [ "$in_main" = 1 ] && have_main_branch; then
        local any=0 path branch_name n
        while IFS=$'\t' read -r path branch_name; do
            if [ -z "${branch_name:-}" ]; then continue; fi
            n=$(commits_between "$MAIN_BRANCH" "$branch_name")
            if [ "$n" -gt 0 ]; then
                if [ "$any" = 0 ]; then printf 'Worktrees with work to merge:\n'; any=1; fi
                printf '  %-10s %-44s %s commit(s)\n' "$(role_of "$path")" "$branch_name" "$n"
            fi
        done < <(side_worktrees)
        if [ "$any" = 1 ]; then
            printf 'Merge with: .claude/scripts/fleet.sh integrate <branch> -m "<message>"\n'
        fi
    fi
}

cmd_role() {
    local wanted="${1:-}"
    if [ -z "$wanted" ]; then current_role; return 0; fi
    if [ "$in_main" = 1 ]; then
        die 'The main checkout is always the main agent; its role cannot be changed.'
    fi
    case "$wanted" in
        tester|architect|feature) ;;
        *) die "Unknown role '$wanted'. Use tester, architect or feature." ;;
    esac
    mkdir -p "$(dirname "$role_file")"
    printf '%s\n' "$wanted" > "$role_file"
    printf 'Role set to %s for %s.\n' "$wanted" "$(basename "$repo_root")"
}

cmd_new() {
    [ "$in_main" = 1 ] || die 'Only the main agent creates worktrees.'
    local role="${1:-}" name="${2:-}"
    case "$role" in
        tester|architect|feature) ;;
        *) die 'Usage: fleet.sh new <tester|architect|feature> [name]' ;;
    esac
    name="${name:-$role}"
    local path="$main_root/.claude/worktrees/$name" branch="claude/$name"
    [ -e "$path" ] && die "$path already exists."
    git rev-parse --verify --quiet "$branch" >/dev/null &&
        die "Branch $branch already exists; pick another name."
    git worktree add -b "$branch" "$path" "$MAIN_BRANCH"
    mkdir -p "$path/.claude"
    printf '%s\n' "$role" > "$path/.claude/role"
    printf 'Worktree %s on %s, role %s.\n' "$path" "$branch" "$role"
    printf 'Start an agent there; its first run of sync will install node_modules.\n'
}

cmd_sync() {
    have_main_branch || die "No $MAIN_BRANCH branch in this repository."
    ensure_node_modules

    if [ "$in_main" = 1 ]; then
        if git remote | grep -q .; then
            git pull --ff-only
        else
            printf 'No remote configured; main is already the source of truth.\n'
        fi
        return 0
    fi

    is_clean || die 'Working tree is dirty. Commit first: .claude/scripts/fleet.sh save "<message>"'

    local behind
    behind=$(commits_between HEAD "$MAIN_BRANCH")
    if [ "$behind" -eq 0 ]; then
        printf 'Already up to date with %s.\n' "$MAIN_BRANCH"
        return 0
    fi
    printf 'Merging %s commit(s) from %s...\n' "$behind" "$MAIN_BRANCH"
    if git merge --no-edit "$MAIN_BRANCH"; then
        printf 'Up to date with %s. If package.json moved, run npm install.\n' "$MAIN_BRANCH"
    else
        die 'Merge conflict. Resolve the files, then: git add <files> && git commit --no-edit'
    fi
}

cmd_save() {
    local message="${1:-}"
    [ -n "$message" ] || die 'Give a commit message: fleet.sh save "<message>"'
    git add -A
    if git diff --cached --quiet; then
        printf 'Nothing to commit.\n'
        return 0
    fi
    git commit -q -m "$message"
    git --no-pager log -1 --oneline
}

cmd_status() {
    have_main_branch || die "No $MAIN_BRANCH branch in this repository."
    printf '%-10s %-44s %6s %7s  %s\n' ROLE BRANCH AHEAD BEHIND STATE
    printf '%-10s %-44s %6s %7s  %s\n' main "$MAIN_BRANCH" - - \
        "$(is_clean "$main_root" && echo clean || echo dirty)"
    local path branch_name
    while IFS=$'\t' read -r path branch_name; do
        if [ -z "${branch_name:-}" ]; then continue; fi
        printf '%-10s %-44s %6s %7s  %s\n' \
            "$(role_of "$path")" "$branch_name" \
            "$(commits_between "$MAIN_BRANCH" "$branch_name")" \
            "$(commits_between "$branch_name" "$MAIN_BRANCH")" \
            "$(is_clean "$path" && echo clean || echo 'DIRTY — work not committed')"
    done < <(side_worktrees)
}

cmd_integrate() {
    [ "$in_main" = 1 ] || die 'Only the main agent integrates. Run this from the main checkout.'
    [ "$(git rev-parse --abbrev-ref HEAD)" = "$MAIN_BRANCH" ] || die "Check out $MAIN_BRANCH first."

    local branch="${1:-}" message=""
    if [ -z "$branch" ]; then
        cmd_status
        printf '\nMerge one with: .claude/scripts/fleet.sh integrate <branch> -m "<message>"\n'
        return 0
    fi
    shift
    while [ $# -gt 0 ]; do
        case "$1" in
            -m|--message) message="${2:-}"; shift 2 ;;
            *) die "Unknown argument '$1'" ;;
        esac
    done

    git rev-parse --verify --quiet "$branch" >/dev/null || die "No such branch: $branch"
    is_clean || die 'The main checkout has uncommitted changes. Deal with those first.'
    [ "$(commits_between "$MAIN_BRANCH" "$branch")" -gt 0 ] ||
        die "$branch has nothing main does not already have."

    local wt
    wt=$(side_worktrees | awk -F'\t' -v b="$branch" '$2 == b { print $1; exit }')
    if [ -n "$wt" ]; then
        if ! is_clean "$wt"; then
            printf 'Warning: %s still has uncommitted changes; they are not in this merge.\n' "$wt" >&2
        fi
        if [ -s "$wt/.claude/handoff.md" ]; then
            printf -- '--- handoff note from %s ---\n' "$branch"
            cat "$wt/.claude/handoff.md"
            printf -- '--- end of note ---\n'
        fi
    fi

    [ -n "$message" ] || message="Merge the work from $branch"
    if git merge --no-ff --no-edit -m "$message" "$branch"; then
        git --no-pager log -1 --oneline
        printf 'Merged. Run the suite before pushing: %s\n' "$SUITE"
    else
        die 'Merge conflict. Resolve it in favour of what the code should be, then: git add <files> && git commit --no-edit'
    fi
}

# ---- ADR numbering -------------------------------------------------------
#
# Numbers are allocated against what exists, not against what anyone remembers
# agreeing. A number is taken if it appears on any branch, in any worktree's
# working tree — including a draft nobody has committed — or in the claims
# file. Reserving by message does not work: a reservation and the work it was
# meant to protect can cross, which is how the tuner came to claim 0009 twice.

adr_numbers_in_use() {
    {
        git for-each-ref --format='%(refname:short)' refs/heads | while read -r branch; do
            git ls-tree -r --name-only "$branch" -- docs/adr 2>/dev/null
        done

        git worktree list --porcelain | awk '/^worktree /{print substr($0, 10)}' |
            while read -r tree; do
                ls "$tree/docs/adr" 2>/dev/null
            done
    } | sed 's|.*/||' | grep -oE '^[0-9]{4}' || true

    [ -f "$adr_claims" ] && grep -oE '^[0-9]{4}' "$adr_claims" || true
}

adr_next_free() {
    local highest
    highest=$(adr_numbers_in_use | sort -n | tail -1)
    printf '%04d\n' $(( 10#${highest:-0} + 1 ))
}

cmd_adr_claim() {
    local title="${1:-}"
    [ -n "$title" ] || die 'Usage: fleet.sh adr-claim "<title>"'
    mkdir -p "$(dirname "$adr_claims")"
    touch "$adr_claims"

    # One writer at a time, so two agents claiming together cannot both read the
    # same highest number before either has written.
    local number
    if command -v flock >/dev/null 2>&1; then
        number=$(flock "$adr_claims" bash -c "
            $(declare -f adr_numbers_in_use adr_next_free)
            adr_claims='$adr_claims'
            n=\$(adr_next_free)
            printf '%s\t%s\t%s\n' \"\$n\" \"$(git rev-parse --abbrev-ref HEAD)\" \"$title\" >> '$adr_claims'
            printf '%s' \"\$n\"
        ")
    else
        number=$(adr_next_free)
        printf '%s\t%s\t%s\n' "$number" "$(git rev-parse --abbrev-ref HEAD)" "$title" >> "$adr_claims"
    fi

    printf '%s\n' "$number"
    printf 'Claimed ADR %s for %s. Write docs/adr/%s-<slug>.md and tell main.\n' \
        "$number" "$(git rev-parse --abbrev-ref HEAD)" "$number" >&2
}

cmd_adr_taken() {
    printf '%-6s %s\n' NUMBER WHERE
    git for-each-ref --format='%(refname:short)' refs/heads | while read -r branch; do
        git ls-tree -r --name-only "$branch" -- docs/adr 2>/dev/null |
            sed 's|.*/||' | grep -oE '^[0-9]{4}' |
            while read -r n; do printf '%-6s branch %s\n' "$n" "$branch"; done
    done || true
    git worktree list --porcelain | awk '/^worktree /{print substr($0, 10)}' |
        while read -r tree; do
            ls "$tree/docs/adr" 2>/dev/null | grep -oE '^[0-9]{4}' |
                while read -r n; do printf '%-6s worktree %s\n' "$n" "$(basename "$tree")"; done
        done || true
    if [ -s "$adr_claims" ]; then
        awk -F'\t' '{printf "%-6s claimed by %s — %s\n", $1, $2, $3}' "$adr_claims"
    fi
    printf '\nNext free: %s\n' "$(adr_next_free)"
}

# Stop hook. Exit 2 puts the message back in front of the model and keeps the
# turn alive; any other exit code lets the session go idle.
cmd_guard() {
    local payload
    payload=$(cat 2>/dev/null || true)
    # Second pass after we already blocked once — let it go rather than loop.
    case "$payload" in
        *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;;
    esac

    if [ "$in_main" = 1 ]; then exit 0; fi   # the main checkout is the user's; never auto-block there
    if is_clean; then exit 0; fi

    printf 'This worktree has uncommitted changes, and worktree agents commit before going idle.\n' >&2
    git -c color.ui=false --no-pager status --short >&2
    printf 'Commit with: .claude/scripts/fleet.sh save "<message saying what changed and why>"\n' >&2
    printf 'If it is scratch work, delete or revert it instead. Either way, do not push.\n' >&2
    exit 2
}

case "${1:-brief}" in
    brief)     cmd_brief ;;
    role)      shift; cmd_role "${1:-}" ;;
    new)       shift; cmd_new "$@" ;;
    sync)      cmd_sync ;;
    save)      shift; cmd_save "${1:-}" ;;
    status)    cmd_status ;;
    integrate) shift; cmd_integrate "$@" ;;
    guard)     cmd_guard ;;
    adr-claim) shift; cmd_adr_claim "${1:-}" ;;
    adr-taken) cmd_adr_taken ;;
    *)         die "Usage: fleet.sh {brief|role|new|sync|save|status|integrate|guard|adr-claim|adr-taken}" ;;
esac
