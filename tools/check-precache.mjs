#!/usr/bin/env node
/**
 * Assert the service worker precaches what the app needs to run offline.
 *
 * The offline claim is the kind that fails silently: the page loads from
 * cache, the notation chunk does not, and the score is simply blank with no
 * error anywhere. Parsing the generated manifest is the cheapest way to know,
 * and it runs in CI where nobody is watching a screen.
 */
import { readFileSync, existsSync } from 'node:fs';

const SW = 'dist/sw.js';
if (!existsSync(SW)) {
  console.error('No dist/sw.js — build first, or the PWA plugin is not wired up.');
  process.exit(1);
}

const source = readFileSync(SW, 'utf8');

/*
  Workbox minifies its precache manifest, so the keys are bare
  identifiers: `{url:"index.html",revision:"6f40..."}` and not
  `{"url": "index.html"}`.

  This matched quoted keys and therefore matched nothing, which went
  unnoticed for as long as it did because the check exits early with
  "no dist/sw.js" whenever the PWA plugin is unwired — which it was,
  from the scaffold until the app was deployed. The first run against
  a real service worker reported all four requirements missing while
  every one of them was present. A check written against an imagined
  format is a check that has never run.

  Only `url` now, not `revision`: a revision is a content hash and
  matching it put thirty hex strings into the list being searched for
  file paths.
*/
const entries = [...source.matchAll(/\burl:\s*"([^"]+)"/g)].map((m) => m[1]);
if (entries.length === 0) {
  console.error(`No precache entries found in ${SW} — has Workbox changed its output format?`);
  process.exit(1);
}

/** Each entry is a description and a predicate over the precached paths. */
const REQUIRED = [
  ['the app shell', (u) => u.endsWith('index.html')],
  ['the app bundle', (u) => /assets\/index-.*\.js$/.test(u)],
  ['the notation chunk', (u) => /assets\/notation-.*\.js$/.test(u)],
  ['the stylesheet', (u) => /assets\/.*\.css$/.test(u)],
];

let missing = 0;
for (const [what, matches] of REQUIRED) {
  if (entries.some(matches)) {
    console.log(`  ok      ${what}`);
  } else {
    console.error(`  MISSING ${what}`);
    missing += 1;
  }
}
process.exit(missing === 0 ? 0 : 1);
