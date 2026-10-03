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
const entries = [...source.matchAll(/"(?:url|revision)":\s*"([^"]+)"/g)].map((m) => m[1]);

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
