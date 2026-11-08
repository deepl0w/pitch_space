import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `./test.sh --offline`, asked whether it actually fails.
 *
 * **Written because it did not.** With `dist/sw.js` missing the script printed
 * a yellow warning and did not count a failure, so `--offline` exited 0 on a
 * build that had stopped emitting a service worker — the check reporting
 * success for the one state it exists to catch. The message was stale as well,
 * still saying the PWA plugin was unwired long after it was wired, and the
 * stale message is what got noticed: it is visible on every run, while the
 * exit status is visible only to whoever is reading `$?`.
 *
 * So this asks the script the question a caller asks it, which is its exit
 * status, and nothing about what it prints. Shelling out rather than reading
 * the source: the defect was the absence of one `FAILURES=$((FAILURES + 1))`,
 * and no static rule over the text distinguishes a branch that forgot to count
 * from a branch deliberately left as a warning — the slow-test listing beside
 * it is exactly that, and is correct.
 *
 * Run against a copied tree rather than this checkout, so the answer does not
 * depend on whether anybody has built recently.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'precache-'));
  copyFileSync('test.sh', join(dir, 'test.sh'));
  // Copied, so the executable bit is set explicitly rather than inherited.
  chmodSync(join(dir, 'test.sh'), 0o755);
  mkdirSync(join(dir, 'tools'), { recursive: true });
  copyFileSync('tools/check-precache.mjs', join(dir, 'tools', 'check-precache.mjs'));
});

afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

/**
 * One precached url per thing `check-precache.mjs` requires, keyed by the
 * description the checker prints.
 *
 * Keyed rather than listed so the two can be compared: the checker names four
 * requirements and, before this, exactly one of them was held — removing *the
 * app shell* from its `REQUIRED` left every case here green, and a build that
 * stopped emitting `index.html` would then have passed `--offline`. A check
 * that runs in CI wants its own requirements pinned, not just one of them.
 */
const SATISFIES: Record<string, string> = {
  'the app shell': 'index.html',
  'the app bundle': 'assets/index-abc123.js',
  'the notation chunk': 'assets/notation-def456.js',
  'the stylesheet': 'assets/index-abc123.css',
};

const COMPLETE = Object.values(SATISFIES);

function serviceWorker(urls: readonly string[]): void {
  mkdirSync(join(dir, 'dist'), { recursive: true });
  const manifest = urls.map((url) => `{url:"${url}",revision:"0"}`).join(',');
  writeFileSync(join(dir, 'dist', 'sw.js'), `precacheAndRoute([${manifest}])\n`);
}

/** The script's exit status, which is the whole of what a caller sees. */
function offlineCheck(): number {
  try {
    execFileSync('./test.sh', ['--offline'], { cwd: dir, stdio: 'pipe' });
    return 0;
  } catch (error) {
    return (error as { status: number }).status;
  }
}

describe('./test.sh --offline', () => {
  it('fails when the build emitted no service worker', () => {
    expect(offlineCheck(), 'a missing service worker was reported as success').not.toBe(0);
  });

  it('knows every requirement the checker makes', () => {
    /*
      The population. Two hand-written lists — the checker's `REQUIRED` and
      the fixtures above — drift apart silently, and the drift shows up as a
      requirement nothing exercises rather than as a failure. Read from the
      script itself so adding one fails here until a fixture names it.
    */
    const script = readFileSync('tools/check-precache.mjs', 'utf8');
    const block = /const REQUIRED = \[([\s\S]*?)\n\];/.exec(script);
    expect(block, 'could not find REQUIRED in check-precache.mjs').not.toBeNull();

    const named = [...block![1].matchAll(/\['([^']+)'/g)].map((m) => m[1]);
    expect(named.length, 'the checker requires nothing').toBeGreaterThan(2);
    expect(named.sort(), 'the checker requires something no fixture here covers')
      .toEqual(Object.keys(SATISFIES).sort());
  });

  it.each(Object.keys(SATISFIES))('fails when %s is not precached', (requirement) => {
    // Each requirement in turn, because the checker reports them one by one
    // and a list where only one entry is exercised is a list three quarters
    // unheld.
    serviceWorker(COMPLETE.filter((url) => url !== SATISFIES[requirement]));
    expect(offlineCheck(), `a service worker missing ${requirement} passed`).not.toBe(0);
  });

  it('passes when everything the app needs offline is precached', () => {
    /*
      The case that makes the two above mean anything. Without it they are
      satisfied by a script that fails unconditionally, which is precisely
      what a wrongly-placed `exit 1` would produce — and an always-failing
      check is as useless as the always-passing one this replaced, while
      looking much more diligent.
    */
    serviceWorker(COMPLETE);
    expect(offlineCheck(), 'a complete service worker was reported as a failure').toBe(0);
  });
});
