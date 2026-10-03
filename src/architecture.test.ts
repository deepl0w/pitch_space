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

/** Every module specifier a file imports or re-exports, static or dynamic. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ];
  return patterns.flatMap((p) => [...source.matchAll(p)].map((m) => m[1]));
}

/** Where a relative specifier lands, as a path under src/, or null for a package. */
function resolveWithin(file: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  return show(join(file, '..', specifier));
}

describe('ADR 0001 — a pure core', () => {
  // Nothing here may reach for the platform. This is what lets the whole music
  // engine and the whole analysis chain run under vitest on a laptop.
  // Audio types are spelled out rather than matched loosely because audio/dsp/
  // is the directory most at risk: it is arithmetic over Float32Array that
  // sits one import away from the microphone that produced it. The timers are
  // here rather than under ADR 0002 because they are the platform's clock:
  // nothing in a pure layer should be scheduling itself.
  const PLATFORM = new RegExp([
    /\b(document|window|navigator|localStorage|sessionStorage|indexedDB)\s*\./,
    /\b(Offline)?AudioContext\b|\bAudioWorklet\w*\b|\bMediaStream\b|\bgetUserMedia\b/,
    /\bHTML\w*Element\b|\bfetch\s*\(/,
    /\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/,
  ].map((r) => r.source).join('|'));

  it('finds the core directories it is meant to be guarding', () => {
    // A rule that silently guards nothing is worse than no rule, so fail loudly
    // if theory/ moves rather than reporting a vacuous pass.
    expect(filesUnder(join(SRC, 'theory')).length).toBeGreaterThan(0);
  });

  it('reaches for no platform API', () => {
    expect(hits(coreFiles(), PLATFORM)).toEqual([]);
  });

  // An allowlist rather than a list of the layers that exist today: a blocklist
  // goes quietly out of date the moment someone adds a directory to src/.
  const MAY_IMPORT: Record<string, string[]> = {
    theory: ['theory'],
    generate: ['generate', 'theory'],
    'audio/dsp': ['audio/dsp'],
  };
  const PLATFORM_PACKAGES = ['react', 'react-dom', 'zustand', 'vexflow', '@capacitor', 'vite'];

  it('imports nothing from the layers above it', () => {
    const offenders: string[] = [];
    for (const dir of CORE_DIRS) {
      for (const file of filesUnder(join(SRC, ...dir.split('/')))) {
        for (const specifier of importsOf(file)) {
          const target = resolveWithin(file, specifier);
          if (target === null) continue;
          const allowed = MAY_IMPORT[dir]
            .some((layer) => target === layer || target.startsWith(`${layer}/`));
          if (!allowed) offenders.push(`${show(file)} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('imports no package that only exists in a browser', () => {
    const offenders: string[] = [];
    for (const file of coreFiles()) {
      for (const specifier of importsOf(file)) {
        if (specifier.startsWith('.')) continue;
        if (PLATFORM_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))) {
          offenders.push(`${show(file)} imports ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('ADR 0002 — generation is reproducible from its seed', () => {
  // Stated around the musical choice rather than around the call: minting a
  // seed is the one allowed entry point, spending one is pure. Asserting that
  // there are no callers at all would make the rule false on day one, and a
  // rule the code already breaks teaches people to ignore the check.
  it('lets entropy in at randomSeed and nowhere else', () => {
    // Scoped to the function rather than to the file. Asserting only that
    // rng.ts is the sole file would let a second generator be added beside
    // randomSeed, which is the whole thing this rule exists to stop.
    const entropy = hits(coreFiles(), /Math\.random/).filter(
      (h) => !/^\s*(\*|\/\/|\/\*)/.test(h.slice(h.indexOf('  ') + 2)),
    );
    expect(entropy).toHaveLength(1);
    expect(entropy[0]).toMatch(/^theory\/rng\.ts:/);

    const lines = readFileSync(join(SRC, 'theory', 'rng.ts'), 'utf8').split('\n');
    const opens = lines.findIndex((l) => l.includes('export function randomSeed'));
    const closes = lines.findIndex((l, i) => i > opens && l.startsWith('}'));
    const at = Number(/^[^:]+:(\d+)/.exec(entropy[0])![1]);
    expect(opens).toBeGreaterThanOrEqual(0);
    expect(at).toBeGreaterThan(opens);
    expect(at).toBeLessThanOrEqual(closes + 1);
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
      filesUnder(SRC)
        .filter((f) => importsOf(f).some((s) => s === 'vexflow' || s.startsWith('vexflow/')))
        .map(show),
    )].sort();
    // Zero is the state before the renderer lands; more than one is how the
    // containment quietly dies.
    expect(importers.length).toBeLessThanOrEqual(1);
    for (const path of importers) expect(path).toBe(ALLOWED);
  });
});
