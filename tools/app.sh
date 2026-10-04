#!/usr/bin/env bash
#
# Start the dev server on a port that is actually free, and say which one.
#
# Several worktrees share this repository and `npm run dev` wants 5173 in all
# of them. Vite does not fail on a taken port, it quietly takes the next one —
# so the second agent to start a server gets a live app on a port it does not
# know and a preview harness still pointed at 5173. The symptom is an app that
# looks broken rather than an error that says what happened.
#
#   tools/app.sh              # pick a free port from 5190 up
#   tools/app.sh 5201         # or insist on one
#   tools/app.sh --print      # just say which port would be used, and exit
#
# --strictPort is deliberate: having found a free port, a silent move to
# another one is the whole bug this script exists to avoid.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

print_only=0
case "${1:-}" in --print) print_only=1; shift ;; esac

port="${1:-}"
if [ -z "$port" ]; then
    for candidate in $(seq 5190 5230); do
        # A listening socket is what collides; ss is in iproute2 and present
        # wherever this runs. No ss, no check — vite's --strictPort still
        # refuses rather than wandering, which is the property that matters.
        if command -v ss >/dev/null 2>&1 && ss -ltn "sport = :$candidate" 2>/dev/null | grep -q LISTEN; then
            continue
        fi
        port=$candidate
        break
    done
fi
[ -n "$port" ] || { echo 'No free port between 5190 and 5230.' >&2; exit 1; }

if [ "$print_only" = 1 ]; then printf '%s\n' "$port"; exit 0; fi

cat >&2 <<EOF
Dev server on http://localhost:$port/

To look at it properly — the preview harness does not render the notation and
cannot emulate touch; docs/RUNNING-THE-APP.md says why:

  google-chrome-stable --headless --remote-debugging-port=9333 \\
      --remote-allow-origins='*' 'http://localhost:$port/'

Screens are hash routes, so deep-link rather than click: #/scales, #/interval-id.

EOF
exec npx vite --port "$port" --strictPort
