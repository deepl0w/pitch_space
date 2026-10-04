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

if [ "${1:-}" = "--run" ]; then
    npx vitest run --reporter=json --outputFile=.report-tests.json >/dev/null 2>&1 \
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
printf 'source lines    %s\n' "$(src_files | xargs wc -l | tail -1 | awk '{print $1}')"

if [ -f .report-tests.json ]; then
    node -e '
      const r = require("./.report-tests.json");
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

printf 'exercises       %s built\n' "$(grep -cE '^  [a-zA-Z]+,$' src/exercises/registry.ts 2>/dev/null || echo '?')"
printf 'screens         %s\n' "$(ls src/ui/screens/*.tsx 2>/dev/null | grep -vc test || echo 0)"

if [ -d dist ]; then
    gz=$(find dist/assets -name '*.js' -exec sh -c 'gzip -c "$1" | wc -c' _ {} \; 2>/dev/null |
         awk '{s+=$1} END {printf "%.0f", s/1024}')
    printf 'bundle          %s kB gzipped js\n' "${gz:-?}"
else
    echo "bundle          not built"
fi

echo
echo "branches"
git for-each-ref --format='%(refname:short)' refs/heads | grep -v '^main$' | while read -r b; do
    printf '  %-36s %s ahead, %s behind\n' "$b" \
        "$(git rev-list --count main.."$b" 2>/dev/null)" "$(git rev-list --count "$b"..main 2>/dev/null)"
done
