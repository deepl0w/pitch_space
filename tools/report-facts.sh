#!/usr/bin/env bash
#
# Figures for a status report, read out of the repository rather than recalled.
# A report's only real claim is that its numbers are checkable, so none of them
# should be written from memory.
#
#   tools/report-facts.sh           # read what is already there
#   tools/report-facts.sh --run     # run the suite and the checks first
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Written beside the repository rather than inside it, so a --run leaves no
# untracked file behind for someone to commit by accident.
RESULTS="${TMPDIR:-/tmp}/pitch-space-report-tests.json"
export RESULTS
trap 'rm -f "$RESULTS"' EXIT

if [ "${1:-}" = "--run" ]; then
    npx vitest run --reporter=json --outputFile="$RESULTS" >/dev/null 2>&1 \
        && echo "suite: ran" || echo "suite: FAILED — report that, not a number"
fi

printf 'date            %s\n' "$(date '+%-d %B %Y')"
printf 'main            %s  (%s commits)\n' "$(git rev-parse --short HEAD)" "$(git rev-list --count HEAD)"
printf 'authors         %s\n' "$(git log --format='%ae' | sort -u | tr '\n' ' ')"
printf 'adrs            %s\n' "$(ls docs/adr/[0-9]*.md 2>/dev/null | wc -l | tr -d ' ')"
# `git ls-files src` and grep, not a '**' pathspec: git's fnmatch skipped
# src/architecture.test.ts, so the first version of this undercounted by one.
src_files() { git ls-files src | grep '\.tsx\?$'; }
printf 'source files    %s ts/tsx (%s test)\n' \
    "$(src_files | wc -l | tr -d ' ')" "$(src_files | grep -c '\.test\.')"
# `wc -l <` per file and sum, rather than `xargs wc -l | tail -1`: past
# ARG_MAX xargs runs wc more than once and tail takes only the last batch's
# total. Correct at 97 files; wrong silently at some larger number.
printf 'source lines    %s\n' "$(src_files | tr '\n' '\0' | xargs -0 cat | wc -l)"

if [ -f "$RESULTS" ]; then
    node -e '
      const r = require(process.env.RESULTS);
      console.log(`tests           ${r.numPassedTests} passing, ${r.numFailedTests} failed, ${r.numTodoTests} todo, across ${r.numTotalTestSuites} suites`);
    ' 2>/dev/null || echo "tests           results unreadable — run with --run"
else
    echo "tests           no results — run with --run"
fi

printf 'typecheck       %s\n' "$(npm run typecheck --silent >/dev/null 2>&1 && echo clean || echo 'FAILING')"
printf 'lint            %s\n' "$(npx --no-install oxlint src >/dev/null 2>&1 && echo clean || echo 'findings')"

# Catalogue sizes: the musical assets, which are the thing most worth counting.
node -e '
  const fs = require("fs");
  const count = (f, re) => (fs.readFileSync(f, "utf8").match(re) || []).length;
  try {
    console.log(`catalogues      ${count("src/generate/cells.ts", /^  cell\(/gm)} rhythm cells, ` +
      `${count("src/generate/patterns.ts", /^  pattern\(/gm)} named patterns, ` +
      `${count("src/generate/templates.ts", /^  template\(/gm)} progression templates`);
  } catch { console.log("catalogues      unreadable"); }
' 2>/dev/null

# Counted from the filesystem, not from registry.ts. Two earlier versions
# read the source: the first required an identifier of [a-zA-Z]+ and would
# have dropped chord7Identification, and the second parsed the EXERCISE_TYPES
# array literal — which stopped existing the moment that array became the
# families flattened, and quietly printed 0. A directory with an index.ts is
# an exercise, and registry.test.ts already fails if one is not registered.
printf 'exercises       %s built\n' \
    "$(find src/exercises -mindepth 2 -maxdepth 2 -name index.ts | wc -l | tr -d ' ')"
printf 'families        %s\n' \
    "$(grep -cE "^    id: '" src/exercises/registry.ts 2>/dev/null || echo '?')"
printf 'screens         %s\n' "$(ls src/ui/screens/*.tsx 2>/dev/null | grep -vc test || echo 0)"

# Whether the thing the app says it is for is connected to anything.
#
# An architecture review reported the scheduler's tri-state missing two days
# after it shipped, and reported a module "wired to nothing" that was still
# wired to nothing a day later — the first wrong, the second right, neither
# checkable without reading the tree. An inventory that says it was measured
# is only true on the day it was measured, so it is generated here instead.
# Counting importers rather than mentions: three comments in PracticeScreen
# describe what the scheduler wants and are not callers.
# `grep -c` exits 1 on a count of zero, which is the answer we most expect
# here, so the count is taken without letting that become a fallback that
# appends a second value.
sched_importers=$(grep -rlE "from '[^']*state/schedule'" src --include='*.ts' --include='*.tsx' 2>/dev/null |
    grep -v '\.test\.' | wc -l | tr -d ' ')
printf 'scheduler       %s production importer(s)\n' "$sched_importers"
printf 'aiming          %s exact, %s lossy, %s none\n' \
    "$(grep -rh "aims: 'exact'" src/exercises/*/index.ts 2>/dev/null | wc -l | tr -d ' ')" \
    "$(grep -rh "aims: 'lossy'" src/exercises/*/index.ts 2>/dev/null | wc -l | tr -d ' ')" \
    "$(grep -rh "aims: 'none'" src/exercises/*/index.ts 2>/dev/null | wc -l | tr -d ' ')"
# Type and presentation together, because a schedule is keyed on both (0037).
# Prompts rendering a choice list from live settings rather than from the
# frozen exercise.
#
# A question generated with one answer and re-rendered from settings that have
# since changed can offer a choice list the answer is not in — measured once at
# {Unison, Octave}, unticking Unison, and the only remaining button scoring
# wrong. The fix freezes the pool on the exercise, and this counts how many
# prompts have not had it.
#
# A proxy and not the mechanism: it matches `settings.x.map(` in a prompt,
# which is how every instance has looked and is not what "live" means. A
# prompt reaching live settings another way is not counted.
printf 'live choice     %s prompt(s) mapping settings rather than exercise\n' \
    "$(grep -rlE "\{\s*settings\.[A-Za-z]+\.map\(" src/exercises/*/[A-Z]*.tsx 2>/dev/null |
       grep -v '\.test\.' | wc -l | tr -d ' ')"
printf 'schedules       %s (type x presentation) pair(s)\n' \
    "$(grep -rho "presentations: \[[^]]*\]" src/exercises/*/index.ts 2>/dev/null |
       grep -o "'" | wc -l | awk '{print $1/2}')"

# A dist older than the last commit that could change it reports a previous
# commit's bundle with no sign that it is doing so. It was caught doing exactly that: a 15-minute-old dist
# printed 464 kB where HEAD builds 465. A figure that is quietly one commit
# behind is worse than no figure, because the report's whole claim is that its
# numbers are checkable. Dated against the last commit touching src, the
# lockfile or the build config rather than against HEAD: a doc-only commit
# cannot change the bundle, and a check that cries stale for one gets ignored,
# which is how the figure starts lying again. Test files are excluded for the
# same reason — vite does not bundle them, and this cried stale for a commit
# that touched one.
if [ ! -d dist ]; then
    echo "bundle          not built"
elif built_after=$(git log -1 --format=%ct -- \
        ':(exclude)src/**/*.test.ts' ':(exclude)src/**/*.test.tsx' ':(exclude)src/*.test.ts' \
        src package.json package-lock.json vite.config.ts index.html) \
     && [ "$(find dist -newermt "@$built_after" -print -quit 2>/dev/null)" = "" ]; then
    echo "bundle          STALE — dist predates HEAD; rebuild before quoting it"
else
    gz=$(find dist/assets -name '*.js' -exec sh -c 'gzip -c "$1" | wc -c' _ {} \; 2>/dev/null |
         awk '{s+=$1} END {printf "%.0f", s/1024}')
    printf 'bundle          %s kB gzipped js\n' "${gz:-?}"
fi

echo
echo "branches"
git for-each-ref --format='%(refname:short)' refs/heads | grep -v '^main$' | while read -r b; do
    printf '  %-36s %s ahead, %s behind\n' "$b" \
        "$(git rev-list --count main.."$b" 2>/dev/null)" "$(git rev-list --count "$b"..main 2>/dev/null)"
done
