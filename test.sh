#!/usr/bin/env bash

# Pitch Space - Test Script
# Runs the suite, the type check, the linter and the toolchain doctor

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

cd "$(dirname "${BASH_SOURCE[0]}")"

# Read from package.json rather than hardcoded, so a rename cannot leave this
# script quietly reporting the wrong project.
pkg_value() {
    node -p "require('./package.json').$1 || ''" 2>/dev/null
}

UNIT=false LINT=false TYPES=false OFFLINE=false CHECK=false WATCH=false COVERAGE=false

usage() {
    cat <<EOF
Usage: ./test.sh [OPTIONS]

Options:
  -u, --unit        Unit tests (the default when no flag is given)
  -w, --watch       Unit tests in watch mode
      --coverage    Unit tests with a coverage report
  -t, --types       Type check only (tsc --noEmit)
  -l, --lint        Lint only (oxlint)
      --offline     Build, then assert the service worker precaches what the
                    app needs to run with no network
      --all         unit + types + lint + offline
  -c, --check       Check this machine is set up, and run nothing
  -h, --help        This message

Examples:
  ./test.sh                 # the suite
  ./test.sh --check         # is this machine able to build the app
  ./test.sh --all           # what CI runs

A failing run prints the path to its report. --check never fails on a missing
Android SDK: the web build does not need one, and only ./build.sh --android does.
EOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--unit) UNIT=true; shift ;;
        -w|--watch) WATCH=true; shift ;;
        --coverage) COVERAGE=true; shift ;;
        -t|--types) TYPES=true; shift ;;
        -l|--lint) LINT=true; shift ;;
        --offline) OFFLINE=true; shift ;;
        --all) UNIT=true; TYPES=true; LINT=true; OFFLINE=true; shift ;;
        -c|--check) CHECK=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Run './test.sh --help' for usage information"
            exit 1
            ;;
    esac
done

if ! $UNIT && ! $LINT && ! $TYPES && ! $OFFLINE && ! $CHECK && ! $WATCH && ! $COVERAGE; then
    UNIT=true
fi

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}Pitch Space - Tests${NC}"
echo -e "${BLUE}=====================================${NC}"
echo

# ---- Toolchain check -----------------------------------------------------

if $CHECK; then
    ERRORS=0

    # Against vite's own declared range rather than a number copied in here,
    # which would go stale the first time vite is upgraded.
    echo -n "Checking Node... "
    want=$(node -p "require('./node_modules/vite/package.json').engines.node" 2>/dev/null || echo '')
    have=$(node -v 2>/dev/null || echo '')
    if [ -z "$have" ]; then
        echo -e "${RED}✗${NC} not found"; ERRORS=$((ERRORS + 1))
    elif [ -z "$want" ]; then
        echo -e "${YELLOW}⚠${NC} $have (vite not installed, so its requirement is unknown)"
    else
        major=$(printf '%s' "$have" | sed -E 's/^v([0-9]+).*/\1/')
        minor=$(printf '%s' "$have" | sed -E 's/^v[0-9]+\.([0-9]+).*/\1/')
        if { [ "$major" -eq 20 ] && [ "$minor" -ge 19 ]; } || [ "$major" -ge 22 ]; then
            echo -e "${GREEN}✓${NC} $have (vite wants $want)"
        else
            echo -e "${RED}✗${NC} $have, but vite wants $want"; ERRORS=$((ERRORS + 1))
        fi
    fi

    # The classic "you forgot npm ci": present but older than the lockfile.
    echo -n "Checking dependencies... "
    if [ ! -d node_modules ]; then
        echo -e "${RED}✗${NC} node_modules is missing — run: npm install"; ERRORS=$((ERRORS + 1))
    elif [ package-lock.json -nt node_modules ]; then
        echo -e "${YELLOW}⚠${NC} node_modules is older than package-lock.json — run: npm ci"
    else
        echo -e "${GREEN}✓${NC} $(ls node_modules | wc -l | tr -d ' ') packages"
    fi

    echo -n "Checking TypeScript... "
    if v=$(npx --no-install tsc --version 2>/dev/null); then
        echo -e "${GREEN}✓${NC} $v"
    else
        echo -e "${RED}✗${NC} tsc did not resolve"; ERRORS=$((ERRORS + 1))
    fi

    # The suite renders notation under jsdom; without it every component test
    # dies with a worker error rather than anything useful.
    echo -n "Checking jsdom... "
    if [ -d node_modules/jsdom ]; then
        echo -e "${GREEN}✓${NC} present"
    else
        echo -e "${RED}✗${NC} absent — component and notation tests cannot run"; ERRORS=$((ERRORS + 1))
    fi

    echo -n "Checking the Android toolchain... "
    if [ ! -d android ]; then
        echo -e "${YELLOW}⚠${NC} no android/ — only needed for ./build.sh --android (npx cap add android)"
    elif [ -z "${ANDROID_HOME:-}" ] && [ ! -f android/local.properties ]; then
        # local.properties is git-ignored, so a fresh clone or worktree has none.
        echo -e "${YELLOW}⚠${NC} neither ANDROID_HOME nor android/local.properties is set"
    else
        echo -e "${GREEN}✓${NC} configured"
    fi

    echo -n "Checking the build config loads... "
    if npx --no-install vite build --logLevel silent --outDir .vite-check >/dev/null 2>&1; then
        rm -rf .vite-check
        echo -e "${GREEN}✓${NC} success"
    else
        rm -rf .vite-check
        echo -e "${RED}✗${NC} vite could not build"; ERRORS=$((ERRORS + 1))
    fi

    echo
    if [ "$ERRORS" -eq 0 ]; then
        echo -e "${GREEN}Environment looks good${NC}"
        exit 0
    fi
    echo -e "${RED}$ERRORS problem(s) found${NC}"
    exit 1
fi

# ---- Running -------------------------------------------------------------

FAILURES=0

if $WATCH; then exec npx vitest; fi

if $TYPES; then
    echo -e "${BLUE}Type check${NC}"
    if npm run typecheck --silent; then
        echo -e "${GREEN}✓${NC} no type errors"
    else
        echo -e "${RED}✗${NC} type errors"; FAILURES=$((FAILURES + 1))
    fi
    echo
fi

if $LINT; then
    echo -e "${BLUE}Lint${NC}"
    if npx oxlint src; then
        echo -e "${GREEN}✓${NC} clean"
    else
        echo -e "${RED}✗${NC} lint findings above"; FAILURES=$((FAILURES + 1))
    fi
    echo
fi

if $COVERAGE; then
    echo -e "${BLUE}Unit tests with coverage${NC}"
    if npx vitest run --coverage; then
        echo -e "${GREEN}✓${NC} passed"
    else
        echo -e "${RED}✗${NC} failed"
        echo "  Report: coverage/index.html"
        FAILURES=$((FAILURES + 1))
    fi
    echo
elif $UNIT; then
    echo -e "${BLUE}Unit tests${NC}"
    # Verbose into a file, so the slow list below has durations to read.
    # The reporter only prints a test's time once it crosses
    # `slowTestThreshold`, and the default reporter never prints it at all,
    # so without this the threshold in vite.config.ts is a setting nobody
    # ever sees — which is the whole guard that justified raising
    # `testTimeout` off its default.
    UNIT_LOG="$(mktemp -t vitest-XXXXXX.log)"
    if npx vitest run --reporter=verbose >"$UNIT_LOG" 2>&1; then
        grep -E '^ *Test Files |^ *Tests ' "$UNIT_LOG"
        echo -e "${GREEN}✓${NC} passed"
    else
        cat "$UNIT_LOG"
        echo -e "${RED}✗${NC} failed — rerun one file with: npx vitest run <path>"
        FAILURES=$((FAILURES + 1))
    fi

    # Tests slow enough to be worth knowing about. Not a failure: a slow
    # sweep is usually a sweep doing its job, and the number is here so a
    # creep from one second to fifteen is visible on the run that caused
    # it rather than on the CI run that eventually times out.
    SLOW="$(grep -oE '^ *✓ .* [0-9]{4,}ms$' "$UNIT_LOG" | sed -E 's/^ *✓ /  /' || true)"
    if [ -n "$SLOW" ]; then
        echo -e "${YELLOW}⚠${NC} slow tests (over ${SLOW_TEST_MS:-1000}ms):"
        echo "$SLOW"
    fi
    rm -f "$UNIT_LOG"
    echo
fi

if $OFFLINE; then
    echo -e "${BLUE}Offline precache${NC}"
    if [ ! -f dist/sw.js ]; then
        echo -e "${YELLOW}⚠${NC} no service worker in dist/ — the PWA plugin is not wired up yet"
        echo "  Nothing to check. See the it.todo in src/architecture.test.ts."
    elif node tools/check-precache.mjs; then
        echo -e "${GREEN}✓${NC} the app's own assets are precached"
    else
        echo -e "${RED}✗${NC} something the app needs offline is not precached"
        FAILURES=$((FAILURES + 1))
    fi
    echo
fi

if [ "$FAILURES" -eq 0 ]; then
    echo -e "${GREEN}All selected checks passed${NC}"
else
    echo -e "${RED}$FAILURES check(s) failed${NC}"
    exit 1
fi
