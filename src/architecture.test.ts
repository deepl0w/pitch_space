import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The boundaries from docs/adr/, asked of the repository.
 *
 * ADR 0001, 0002 and 0003 each state a constraint that is a convention rather
 * than a module boundary — nothing in the language stops a later branch from
 * importing `document` into the generator. Until this file existed those held
 * on authorship alone, and the first breach would have arrived in a branch
 * whose own tests were green.
 *
 * The scan walks the filesystem rather than `git ls-files`, so an untracked
 * file breaches the rule too. A boundary that only applies once you commit is
 * not much of a boundary.
 */

const SRC = new URL('.', import.meta.url).pathname;

function filesUnder(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return []; // generate/ and audio/dsp/ do not exist yet; the rule still stands.
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const CORE_DIRS = ['theory', 'generate', 'audio/dsp'];

function coreFiles(): string[] {
  return CORE_DIRS.flatMap((d) => filesUnder(join(SRC, ...d.split('/'))));
}

function show(path: string): string {
  return relative(SRC, path).split(sep).join('/');
}

/** Line-by-line matches, so a failure names the line and not just the file. */
function hits(files: string[], pattern: RegExp): string[] {
  const found: string[] = [];
  for (const file of files) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (pattern.test(line)) found.push(`${show(file)}:${i + 1}  ${line.trim()}`);
    });
  }
  return found;
}

describe('ADR 0001 — a pure core', () => {
  // Nothing here may reach for the platform. This is what lets the whole music
  // engine and the whole analysis chain run under vitest on a laptop.
  const PLATFORM = /\b(document|window|navigator|localStorage|sessionStorage|indexedDB)\s*\.|{\bAudioContext\b|\bHTMLElement\b|\bfetch\s*\(/;

  it('finds the core directories it is meant to be guarding', () => {
    // A rule that silently guards nothing is worse than no rule, so fail loudly
    // if theory/ moves rather than reporting a vacuous pass.
    expect(filesUnder(join(SRC, 'theory')).length).toBeGreaterThan(0);
  });

  it('reaches for no platform API', () => {
    expect(hits(coreFiles(), PLATFORM)).toEqual([]);
  });

  it('imports nothing from the layers above it', () => {
    const forbidden = /from\s+'(react|react-dom|zustand|vexflow|\.\.\/(ui|app|state|exercises|audio\/(capture|output)))/;
    expect(hits(coreFiles(), forbidden)).toEqual([]);
  });
});

describe('ADR 0002 — generation is reproducible from its seed', () => {
  // Stated around the musical choice rather than around the call: minting a
  // seed is the one allowed entry point, spending one is pure. Asserting that
  // there are no callers at all would make the rule false on day one, and a
  // rule the code already breaks teaches people to ignore the check.
  it('lets entropy in at randomSeed and nowhere else', () => {
    const callers = new Set(
      hits(coreFiles(), /Math\.random/).map((h) => h.split(':')[0]),
    );
    expect([...callers]).toEqual(['theory/rng.ts']);

    const rng = readFileSync(join(SRC, 'theory', 'rng.ts'), 'utf8');
    const fn = rng.slice(rng.indexOf('export function randomSeed'));
    expect(fn.slice(0, fn.indexOf('}'))).toContain('Math.random');
  });

  it('reads no clock', () => {
    expect(hits(coreFiles(), /Date\.now|new Date\(|performance\.now/)).toEqual([]);
  });

  it('never spreads a Set or Map straight into a choice', () => {
    // Insertion order is not a musical rule. Spreading is fine when the result
    // is sorted before anything picks from it, so this looks for a spread that
    // is not followed by a sort on the same line or the next.
    const offenders: string[] = [];
    for (const file of coreFiles()) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/\[\.\.\.(new Set|new Map|\w*([Ss]et|[Mm]ap))\b/.test(line)) return;
        const window = line + (lines[i + 1] ?? '');
        if (!/\.sort\(/.test(window)) offenders.push(`${show(file)}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('ADR 0003 — one importer for the notation library', () => {
  const ALLOWED = 'exercises/render/toVexflow.ts';

  it('keeps vexflow behind a single adapter', () => {
    const importers = [...new Set(
      hits(filesUnder(SRC), /from\s+['"]vexflow|require\(['"]vexflow/)
        .map((h) => h.split(':')[0]),
    )];
    // Zero is the state before the renderer lands; more than one is how the
    // containment quietly dies.
    expect(importers.length).toBeLessThanOrEqual(1);
    for (const path of importers) expect(path).toBe(ALLOWED);
  });
});
