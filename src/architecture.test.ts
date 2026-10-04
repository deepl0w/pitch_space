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

/**
 * `audio/testing/` is in here with the rest of the core rather than excused as
 * test scaffolding. It synthesises the signals the dsp tests are judged
 * against, so a clock or a `Math.random` in it would make those tests
 * irreproducible — which is the same defect ADR 0002 guards the generator
 * against, arriving through the fixtures instead of through the code.
 */
const CORE_DIRS = ['theory', 'generate', 'audio/dsp', 'audio/testing'];

function coreFiles(): string[] {
  return CORE_DIRS.flatMap((d) => filesUnder(join(SRC, ...d.split('/'))));
}

function show(path: string): string {
  return relative(SRC, path).split(sep).join('/');
}

/**
 * The file with its comments blanked out, line numbers preserved.
 *
 * These rules match prose otherwise: a sentence ending "…had only partly
 * entered the window." tripped the platform rule, which is the kind of false
 * positive that teaches people the guard is noise.
 *
 * Skipping lines that *look* like comments was the first fix and it cut the
 * other way — `const w = 2\n  * window.innerWidth;` begins with `*`, so a real
 * platform read hid behind a continuation line. `audio/dsp/` wraps arithmetic
 * across lines constantly, which is where that would have landed. Blanking the
 * comments themselves has neither failure mode.
 */
function codeOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  // Spaces rather than nothing, so columns and line numbers both survive.
  const blanked = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return blanked.split('\n').map((l) => l.replace(/\/\/.*$/, ''));
}

/** Line-by-line matches, so a failure names the line and not just the file. */
function hits(files: string[], pattern: RegExp): string[] {
  const found: string[] = [];
  for (const file of files) {
    codeOf(file).forEach((line, i) => {
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

  // An allowlist rather than a list of the layers that exist today. A blocklist
  // goes quietly out of date the moment someone adds a directory to src/, and
  // it is hard to tell when it has: the version that matched only single quotes
  // let `from "react"` through, and the mutation that should have exposed that
  // was caught by the ADR 0003 rule instead, which hid the gap. Reading every
  // import and asking where it lands has nothing to keep in step.
  const MAY_IMPORT: Record<string, string[]> = {
    theory: ['theory'],
    generate: ['generate', 'theory'],
    'audio/dsp': ['audio/dsp'],
    // Everything in here exists to be analysed by audio/dsp or to verify that
    // it was. It borrows theory/'s seeded Rng rather than carrying a second
    // copy of mulberry32: one PRNG in the repository is one place a seed can
    // stop reproducing.
    'audio/testing': ['audio/testing', 'audio/dsp', 'theory'],
  };

  /**
   * A dsp *test* may reach for its own synthesised signals; nothing that ships
   * may. The alternative was a Karplus–Strong string copied into each test
   * file, which costs the tests their agreement about what a plucked note is,
   * and the agreement is the whole value of a shared fixture.
   *
   * `audio/testing/` is held to every other rule in this file, so the import
   * cannot smuggle a platform call or a clock into the chain — only a signal.
   */
  const MAY_IMPORT_IN_TESTS: Record<string, string[]> = {
    'audio/dsp': ['audio/testing'],
  };
  const PLATFORM_PACKAGES = ['react', 'react-dom', 'zustand', 'vexflow', '@capacitor', 'vite'];

  it('imports nothing from the layers above it', () => {
    const offenders: string[] = [];
    for (const dir of CORE_DIRS) {
      for (const file of filesUnder(join(SRC, ...dir.split('/')))) {
        const allowedHere = /\.test\.tsx?$/.test(file)
          ? [...MAY_IMPORT[dir], ...(MAY_IMPORT_IN_TESTS[dir] ?? [])]
          : MAY_IMPORT[dir];
        for (const specifier of importsOf(file)) {
          const target = resolveWithin(file, specifier);
          if (target === null) continue;
          const allowed = allowedHere
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
  // Test files are in scope deliberately. A suite about determinism that
  // seeds itself randomly is a suite that fails intermittently, and the rule
  // is easier to keep with no exclusions than with one.
  //
  // No exception, because the core has nothing to except. Minting a seed is
  // an app-layer event — the user asking for a new exercise — and the core
  // only ever spends one. An earlier draft of this rule carved out
  // randomSeed(); deleting the function was cheaper than documenting it, and
  // left the rule true as CLAUDE.md states it. See docs/adr/0005.
  it('lets no entropy into the core at all', () => {
    expect(hits(coreFiles(), /Math\.random|crypto\.getRandomValues/)).toEqual([]);
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

  /**
   * Every pitch reaching a VexFlow key goes through simplifySpelling first.
   *
   * VexFlow's key parser accepts at most a double accidental, and spellings
   * past that are reachable from the shipped key list — a Cb diminished
   * seventh contains a Bbbb. That once refused to draw. The adapter funnels
   * every pitch through one helper, and this keeps it funnelled: a later edit
   * reaching for vexKey directly would compile, pass every test in the suite,
   * and break only on the chords nobody generates by hand.
   */
  it('simplifies every spelling before it becomes a vexflow key', () => {
    const raw: string[] = [];
    for (const file of filesUnder(join(SRC, 'exercises'))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const match of line.matchAll(/vexKey\s*\(\s*([A-Za-z_$][\w$]*)/g)) {
          if (match[1] !== 'simplifySpelling') raw.push(`${show(file)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(raw).toEqual([]);
  });
});

describe('one audio graph', () => {
  /**
   * `new Synth()` outside the one module that owns it.
   *
   * A second instance is not a duplicate, it is a second AudioContext with
   * its own scheduled notes that `stopSound` cannot reach. That is exactly
   * what happened: `src/ui/sound.ts` said "one AudioContext for the whole
   * app; creating a second is how you get drift", and the practice screen
   * fourteen files away constructed one anyway — so an interval kept playing
   * over the home screen after the user navigated back.
   *
   * The comment was the invariant and nothing enforced it, which is the only
   * reason it could be broken by someone who had read it.
   */
  const OWNER = 'ui/sound.ts';

  it('builds a Synth in one place only', () => {
    const builders = [...new Set(
      hits(filesUnder(SRC), /\bnew Synth\s*\(/).map((h) => h.split(':')[0]),
    )].filter((path) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'));
    expect(builders).toEqual([OWNER]);
  });

  it('still has the owner it is guarding, so the rule cannot pass vacuously', () => {
    expect(readFileSync(join(SRC, 'ui', 'sound.ts'), 'utf8')).toContain('new Synth(');
  });
});

describe('the npm scripts', () => {
  const pkg = JSON.parse(
    readFileSync(join(SRC, '..', 'package.json'), 'utf8'),
  ) as { scripts: Record<string, string>; devDependencies: Record<string, string> };

  /**
   * `npx <name>` falls back to the registry when nothing local provides that
   * binary, downloads whatever is published under the name and runs it. The
   * android scripts called `npx cap` with no Capacitor installed, and `cap` on
   * the registry is an unrelated native packet-capture binding — so a script
   * documented in CLAUDE.md would have fetched and executed a stranger's code.
   * `--no-install` makes npx refuse rather than reach out.
   */
  it('never lets npx reach the registry for a missing binary', () => {
    const offenders = Object.entries(pkg.scripts)
      .flatMap(([name, body]) =>
        [...body.matchAll(/npx\s+(?:(-{1,2}\S+)\s+)*/g)]
          .filter((m) => !/--no-install|--no\b/.test(m[0]))
          .map(() => `${name}: ${body}`));
    expect(offenders).toEqual([]);
  });

  /**
   * A declared dependency that nothing imports is usually harmless, but these
   * two are load-bearing claims: CLAUDE.md's first paragraph says the app ships
   * as an installable PWA and as an Android APK. Neither is true while the
   * plugin is unwired, so the gap should be visible here rather than only in a
   * document nobody diffs.
   */
  it.todo('wires vite-plugin-pwa into vite.config.ts so the PWA half is real');
  it.todo('installs @capacitor/cli and core so the android scripts can run');
});

/**
 * The one convention in `docs/adr/README.md` that is not a row in a table.
 *
 * Four of the fifteen records exist because someone checked a claim about the
 * code against the code instead of against the record that made it: a chroma
 * feature two ADRs asserted and the repository never had, a tempo crossover
 * reasoned about from memory rather than evaluated, a session tally that
 * blends across an exercise change, and four exercise transitions that blank
 * the page. The paragraph naming that habit cost one edit and is the cheapest
 * thing in the index.
 *
 * It is also the most losable. The index is a living document that gets
 * rewritten whenever the table grows, and a paragraph between a table and a
 * diagram is what a tidying edit removes without anyone deciding to. The
 * *claims* a record makes are not mechanically checkable — a link checker
 * validates links, not assertions about a codebase — but the convention's own
 * survival is, so it is checked here.
 *
 * This asserts presence, not wording — for the paragraph. Not quite for the
 * sentence: what is matched is one distinctive clause of it, because an idea
 * cannot be asserted and a clause is the practical approximation. So rewriting
 * the prose around the convention is free, and rewording the convention itself
 * will go red. That is allowed. Change the clause here to match, and keep the
 * habit; the test defends a phrasing only because it cannot defend a meaning.
 */
describe('the conventions the ADR index carries', () => {
  it('still tells the next author to check a claim against the code', () => {
    // Whitespace collapsed first: the sentence is hard-wrapped in the source,
    // so matching it line by line would pass or fail on where the paragraph
    // happens to break. It did, on the first run of this test.
    const index = readFileSync(join(SRC, '..', 'docs', 'adr', 'README.md'), 'utf8')
      .replace(/\s+/g, ' ');
    expect(index).toContain('against the code, not against the record that made it');
  });
});
