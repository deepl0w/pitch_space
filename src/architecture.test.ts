import { describe, expect, it } from 'vitest';

/**
 * The constraints in CLAUDE.md that are cheap to break and expensive to notice.
 * Keeping the music engine and the analysis chain free of the browser is what
 * lets both run under vitest on a laptop; vexflow staying behind one file is
 * what keeps the notation library out of the rest of the app.
 *
 * The sources are read through import.meta.glob rather than node's fs so that
 * this file obeys the same rule it enforces and needs no node types.
 */
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  )
    .map(([path, source]) => [path.replace(/^\.\//, ''), source as string])
    .filter(([path]) => !/\.test\.tsx?$/.test(path)),
);

const filesUnder = (dir: string) =>
  Object.keys(SOURCES).filter((path) => path.startsWith(`${dir}/`));

/** Every module specifier a file imports or re-exports, static or dynamic. */
function importsOf(path: string): string[] {
  const source = SOURCES[path];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((m) => m[1]));
}

/** Where a relative import lands, as a path under src/, or null for a package. */
function resolveWithin(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const segments = fromFile.split('/').slice(0, -1).concat(specifier.split('/'));
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return out.join('/');
}

// Each pure layer, and the layers it is allowed to reach into.
const PURE_LAYERS = [
  { dir: 'theory', mayImport: ['theory'] },
  { dir: 'generate', mayImport: ['generate', 'theory'] },
  { dir: 'audio/dsp', mayImport: ['audio/dsp'] },
];

// Anything that only exists in a browser. A pure layer importing one of these
// is the first step of the engine becoming untestable off a device.
const PLATFORM_PACKAGES = ['react', 'react-dom', 'zustand', 'vexflow', '@capacitor', 'vite'];

// Browser globals a pure layer must not reach for, and the determinism rules:
// an exercise reported by its seed has to reproduce exactly.
const FORBIDDEN_GLOBALS = [
  /\bdocument\./, /\bwindow\./, /\bnavigator\./, /\blocalStorage\b/,
  /\bAudioContext\b/, /\bHTML[A-Z]\w*\b/, /\bfetch\s*\(/,
  /\bperformance\.now\b/, /\bDate\.now\b/, /\bnew Date\b/, /\bsetTimeout\b/,
];

describe('the pure layers stay pure', () => {
  it.each(PURE_LAYERS)('$dir imports nothing above itself', ({ dir, mayImport }) => {
    for (const file of filesUnder(dir)) {
      for (const specifier of importsOf(file)) {
        const target = resolveWithin(file, specifier);
        if (target === null) continue;
        const allowed = mayImport.some((l) => target === l || target.startsWith(`${l}/`));
        expect(allowed, `${file} imports ${specifier}, outside ${mayImport.join(' or ')}`).toBe(true);
      }
    }
  });

  it.each(PURE_LAYERS)('$dir imports nothing from the platform', ({ dir }) => {
    for (const file of filesUnder(dir)) {
      for (const specifier of importsOf(file)) {
        if (specifier.startsWith('.')) continue;
        for (const pkg of PLATFORM_PACKAGES) {
          expect(specifier === pkg || specifier.startsWith(`${pkg}/`), `${file} imports ${specifier}`)
            .toBe(false);
        }
      }
    }
  });

  it.each(PURE_LAYERS)('$dir reaches for no browser global and no clock', ({ dir }) => {
    for (const file of filesUnder(dir)) {
      for (const pattern of FORBIDDEN_GLOBALS) {
        expect(pattern.test(SOURCES[file]), `${file} matches ${pattern}`).toBe(false);
      }
    }
  });
});

describe('generation is deterministic given a seed', () => {
  // theory/rng.ts owns the one call to Math.random, in randomSeed(), because the
  // seed has to come from somewhere. Everything downstream takes an Rng.
  const SEED_SOURCE = 'theory/rng.ts';

  it.each(PURE_LAYERS)('$dir calls Math.random only where the seed is made', ({ dir }) => {
    for (const file of filesUnder(dir)) {
      if (file === SEED_SOURCE) continue;
      expect(/Math\.random\s*\(/.test(SOURCES[file]), `${file} calls Math.random`).toBe(false);
    }
  });

  it('confines Math.random in the seed source to randomSeed', () => {
    const source = SOURCES[SEED_SOURCE];
    expect(source.match(/Math\.random\s*\(/g) ?? []).toHaveLength(1);
    const body = source.slice(source.indexOf('export function randomSeed'));
    expect(body.slice(0, body.indexOf('\n}'))).toContain('Math.random');
  });
});

describe('vexflow stays behind one file', () => {
  const RENDERER = 'exercises/render/toVexflow.ts';

  it('is imported by nothing but the renderer', () => {
    const importers = Object.keys(SOURCES)
      .filter((file) => importsOf(file).some((s) => s === 'vexflow' || s.startsWith('vexflow/')));
    expect(importers.filter((f) => f !== RENDERER)).toEqual([]);
  });
});
