import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHORD_TYPES } from './theory/chord';
import { SCALE_TYPES } from './theory/scale';
import { EXERCISE_FAMILIES } from './exercises/registry';

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
    // Written when generate/ and audio/dsp/ were still planned. All four
    // core directories exist now, which turns this from robustness into a
    // way for the scan to shrink in silence — so it stays, and the test
    // below is what refuses to let it pass for nothing.
    return [];
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
    /*
      A rule that silently guards nothing is worse than no rule.

      Every rule in this describe and the next reads `coreFiles()` and
      asserts the result is empty, so a directory that moves takes five
      assertions quiet with it — `filesUnder` answers a missing path with
      `[]` rather than complaining. This checked `theory/` alone, which left
      three of the four able to disappear unnoticed, including `audio/dsp/`:
      the one the comment below calls the directory most at risk.
    */
    const empty = CORE_DIRS.filter((dir) => filesUnder(join(SRC, ...dir.split('/'))).length === 0);
    expect(empty, 'core directories the scan found nothing in').toEqual([]);
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
    /*
      Exactly one, where this used to allow zero.

      Zero was right while the renderer was unwritten, and reading it as
      "fewer importers is better" outlived that: the adapter exists and has
      imported the library since. Allowing zero now means the rule also
      passes if the import is spelled in a way `importsOf` does not match,
      which is the failure it is supposed to catch arriving as a silence.
    */
    expect(importers).toEqual([ALLOWED]);
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
    let calls = 0;
    for (const file of filesUnder(join(SRC, 'exercises'))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const match of line.matchAll(/vexKey\s*\(\s*([A-Za-z_$][\w$]*)/g)) {
          calls += 1;
          if (match[1] !== 'simplifySpelling') raw.push(`${show(file)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(raw).toEqual([]);
    // The funnel itself, counted: this scan reports call sites that are
    // wrong, so renaming the helper leaves it reporting nothing and saying
    // the spellings are safe.
    expect(calls, 'no call to vexKey under exercises/ at all').toBeGreaterThan(0);
  });
});

describe('what an attempt is told it was asked against', () => {
  /**
   * `attemptFrom`'s askable set comes from the round, never from the
   * settings in scope at answering time.
   *
   * ADR 0039 keys a progression line on the set the settings could ask, so
   * taking it from the panel after the learner has changed something files
   * the attempt under a line they were never practising. That is the
   * stale-settings defect in the one place it corrupts stored history
   * rather than a drawing, and **a mutant doing exactly that survived every
   * test**: the join that would catch it runs from the screen to storage,
   * which no test can observe while `PracticeScreen` holds the
   * module-level store and jsdom has no IndexedDB.
   *
   * So the opportunity was narrowed instead — `askable` is frozen on the
   * `Round` beside `settings`, computed at generation where there is no
   * live set to reach for. It is narrowed rather than closed:
   * `definition.items(settings)` typechecks perfectly well at the call
   * site, and both spellings compile.
   *
   * This is the shape the `vexKey` rule above has, for the same reason: a
   * plausible edit at one call site, invisible to every behavioural test,
   * and cheap to refuse by name.
   */
  it('passes a frozen set rather than recomputing one', () => {
    const offenders: string[] = [];
    let calls = 0;
    for (const file of filesUnder(SRC)) {
      if (/\.test\.tsx?$/.test(file)) continue;
      const source = codeOf(file).join('\n');
      for (const match of source.matchAll(/attemptFrom\s*\(([^;]*?)\)\s*;/gs)) {
        calls += 1;
        const args = match[1];
        if (/\bitems\s*\(/.test(args)) {
          offenders.push(`${show(file)}: recomputes the askable set at answering time`);
        } else if (!/\.askable\b/.test(args)) {
          offenders.push(`${show(file)}: passes no frozen set`);
        }
      }
    }
    expect(offenders).toEqual([]);
    // The call itself, counted: a rename leaves this scanning for nothing
    // and reporting that every call site is fine.
    expect(calls, 'nothing calls attemptFrom in a shipped file').toBeGreaterThan(0);
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
describe('the records the code cites', () => {
  /**
   * Every ADR a source file points at exists.
   *
   * A dangling reference is the worst kind this project has: a comment
   * saying "see ADR 0028" reads as *decided*, and a reader who does not go
   * and look carries away a decision nobody made. It is not a broken link,
   * it is a claim about the state of the argument.
   *
   * It happened. `0028` was cited by `keys.ts`, `KeyPrompt.tsx`,
   * `keys.test.ts` and `index.ts` for days before the record was written,
   * and it was caught because the person who owed it said so rather than
   * because anything checked. `CLAUDE.md`'s own convention is that a
   * mistake which recurs wants a rule rather than more care; this is the
   * rule, and it costs one scan.
   *
   * Numbers rather than links, because the citations are prose — "see ADR
   * 0028", `docs/adr/0005`, `adr/0011-what-a-catalogue-owes.md` — and what
   * is checked is that the record exists, not how it was spelled.
   */
  /**
   * And no document points at a file that is not there.
   *
   * The same fault as citing a record nobody wrote, one level down: the
   * prose names `src/audio/capture/listen.ts` or `tools/app.sh`, somebody
   * renames it, and the citation keeps reading perfectly. Fifty-odd such
   * paths are quoted across the documents; a rename today breaks them
   * silently and the next reader follows a pointer to nothing.
   *
   * **The two gitignored directories are the exception and the reason is
   * in `CLAUDE.md`.** `docs/findings/` and `docs/process/` are written and
   * never committed, because the repository is public and the fleet's
   * internal writing stays out of it — so a citation of one is citing
   * something a reader of the public repository cannot open, which that
   * file says outright. Excluded by prefix with the reason named, rather
   * than by the scan quietly tolerating anything it cannot find.
   *
   * **What this cannot catch**, said because the episode that prompted it
   * was exactly this: a citation naming a real thing in the wrong place. A
   * comment pointer was attributed to `MERGE_CENTS` when it sits above
   * `NEW_NOTE_RISE`, thirty-four lines apart in one file and governing two
   * halves of the same decision. Both names exist, so a scan for existence
   * passes it — and that is worse than a dangling path, which fails on
   * sight.
   */
  it('points at no file that is not there', () => {
    const UNCOMMITTED = ['docs/findings/', 'docs/process/'];
    /*
      Walked here rather than through `filesUnder`, which keeps only
      `.ts`/`.tsx` — reusing it found fourteen paths instead of fifty-odd
      and the population guard below said so on the first run, which is
      what it is for.
    */
    const markdown = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return markdown(path);
        return entry.name.endsWith('.md') ? [path] : [];
      });
    const documents = [
      ...markdown(join(SRC, '..', 'docs')),
      join(SRC, '..', 'CLAUDE.md'),
      join(SRC, '..', 'README.md'),
    ];

    const cited = new Map<string, Set<string>>();
    for (const file of documents) {
      for (const match of readFileSync(file, 'utf8')
        .matchAll(/`((?:src|tools|docs)\/[A-Za-z0-9_./-]+)`/g)) {
        const path = match[1];
        if (UNCOMMITTED.some((prefix) => path.startsWith(prefix))) continue;
        const where = cited.get(path) ?? new Set<string>();
        where.add(show(file));
        cited.set(path, where);
      }
    }

    // The population: a regex that stopped matching would pass this by
    // having nothing to look for.
    expect(cited.size, 'no source paths cited in any document').toBeGreaterThan(20);

    const dangling = [...cited]
      .filter(([path]) => !existsSync(join(SRC, '..', path)))
      .map(([path, where]) => `${path} — cited by ${[...where].sort().join(', ')}`);
    expect(dangling, 'cited and not there').toEqual([]);
  });

  it('cites no record that was never written', () => {
    const cited = new Set<string>();
    for (const file of filesUnder(SRC)) {
      for (const match of readFileSync(file, 'utf8')
        .matchAll(/(?:ADR\s+|adr\/)(\d{4})/g)) cited.add(match[1]);
    }

    const written = new Set(
      readdirSync(join(SRC, '..', 'docs', 'adr'))
        .filter((name) => /^\d{4}-.*\.md$/.test(name))
        .map((name) => name.slice(0, 4)),
    );

    const dangling = [...cited].filter((n) => !written.has(n)).sort();
    expect(dangling, 'cited by the code and not in docs/adr/').toEqual([]);

    // The scan has to have found citations, or a codebase that stopped
    // naming its records reports a clean bill of health it has not earned.
    expect(cited.size, 'no source file cites a record at all').toBeGreaterThan(20);
  });
});

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

/**
 * The claim that survived longest and cost the most: the home screen's lede
 * said exercises were "answered by playing them" while every built exercise
 * was answered by clicking a button or tapping a key. Every exercise card
 * was honest about its own answer path; only the lede — which describes all
 * six at once rather than any one screen — was not, and nothing caught it
 * because nothing checked a claim about six exercises against any single one
 * of them. Found from outside by the user role, fixed by main at 16e5cff.
 *
 * This does not snapshot the sentence. A reworded lede that still claims
 * playing as a present capability should still fail here, and the sentence
 * is free to change in every other way. What it is checked against is the
 * fact the wording has to answer to: whether any exercise actually hands a
 * response to the capture layer, rather than to a click or a keypress.
 * `audio/capture/` exists and works (ADR 0035) — this asserts it is not yet
 * wired to any exercise's grading, which is what makes the claim false today.
 * The day an exercise does wire it, this goes green on its own and the lede
 * is free to say so; it is the other direction — claiming it with nothing
 * behind the claim — that this exists to catch.
 */
describe("the home screen's claim about how exercises are answered", () => {
  const HOME = join(SRC, 'ui', 'screens', 'Home.tsx');

  /**
   * The names that mean captured audio, rather than the directory that
   * holds them.
   *
   * The first version asked whether a file imported anything from
   * `audio/capture/`, which is directory membership wearing a
   * measurement's clothes. `listen.ts` also exports `separationForOnsets`,
   * pure arithmetic over written onset times that any code may use — and
   * ADR 0036 says a rhythm exercise's tolerance derives from exactly that
   * quantity, so the natural implementation of it has `rhythm-id` import
   * the helper. Under the old condition, the day 0036 landed this test
   * would have declared the app answered by playing with nothing wired,
   * and the lede would have lost its last true sentence to a rename.
   *
   * None of these can be satisfied by a pure helper: they are a source of
   * frames, or the function that drives one.
   */
  const CAPTURE_BEARING = ['listen', 'CaptureSource', 'MicrophoneSource', 'RecordedSource', 'framesOf'];

  /**
   * Calibration measures the round trip and is not an exercise answering.
   *
   * A named exception rather than a directory filter, because an exception
   * can be read and argued with. The second version of this test scoped
   * the scan to `exercises/`, which looks tighter and is in fact blind:
   * the exercise layer deliberately never imports the platform. `AudioOut`
   * is declared *in* `exercises/types.ts` and the composition root supplies
   * something satisfying it, which ADR 0029 restated as the rule — so
   * capture arrives as an `AudioIn` beside it, injected by the screen, and
   * no file under `exercises/` imports anything from `audio/capture` on
   * the day a learner can first answer by playing.
   *
   * A scope that happens to exclude the likely site is the proxy fault
   * again. The claim is about the app, so the scan is the app.
   */
  const NOT_AN_ANSWER = ['ui/screens/Calibration.tsx'];

  /**
   * Every capture-bearing name is really exported by `audio/capture`.
   *
   * Without it the list is five strings nothing holds to the code.
   * Renaming `listen` leaves all five matching nothing, the scan reports
   * "not wired" for ever after, and the lede below becomes true by a
   * typo — a guard going blind rather than noisy, which is the failure
   * this whole describe is a worked example of. Replacing all five with
   * invented names left the describe entirely green, which is how it was
   * found.
   *
   * The import rule above argues for an allowlist over a blocklist
   * because "it is hard to tell when it has gone out of date". A list of
   * names cannot be turned into an allowlist, but it can be made to
   * prove its names exist.
   *
   * `function*` is in the pattern because `framesOf` is a generator, and
   * the first version reported it missing — the check working on its
   * first run, which is worth leaving written down.
   */
  it('names only symbols the capture layer actually exports', () => {
    const exported = new Set(
      filesUnder(join(SRC, 'audio', 'capture'))
        .filter((file) => !/\.test\.tsx?$/.test(file))
        .flatMap((file) => [...readFileSync(file, 'utf8')
          .matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|interface|type)\s+(\w+)/g)]
          .map((match) => match[1])),
    );
    const missing = CAPTURE_BEARING.filter((name) => !exported.has(name));
    expect(missing, 'capture-bearing names that no longer exist').toEqual([]);
  });

  function appIsWiredToCapture(): boolean {
    /*
      Shipped files only: capture reached from a test shows the chain can
      be driven, not that a learner's answer travels it.

      Asked as "reaches capture *and* names something capture-bearing"
      rather than by reading names out of braces. A braces-only reading
      sees nothing in `import * as capture from '.../listen'` followed by
      `capture.listen(...)` — the same wiring in another spelling, and one
      a bundler-minded refactor could arrive at without meaning anything by
      it. `importsOf` above already knows the four forms a specifier
      arrives in, so it answers the first half, and the names are looked
      for in the file's code rather than in its comments.
    */
    return filesUnder(SRC)
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) => !relative(SRC, file).split(sep).join('/').startsWith('audio/capture/'))
      .filter((file) => !NOT_AN_ANSWER.includes(relative(SRC, file).split(sep).join('/')))
      .some((file) => {
        const reachesCapture = importsOf(file)
          .some((specifier) => resolveWithin(file, specifier)?.startsWith('audio/capture'));
        if (!reachesCapture) return false;
        const code = codeOf(file).join('\n');
        return CAPTURE_BEARING.some((name) => new RegExp(`\\b${name}\\b`).test(code));
      });
  }

  /**
   * Just the rendered paragraph, not the file.
   *
   * The file also carries the comment explaining this exact test, in prose
   * that necessarily uses the words "answered", "playing" and "built" to
   * describe the bug it is guarding against — and a whole-file scan matched
   * that narration instead of the markup, passing or failing by accident of
   * how the comment was worded rather than by what the page renders. Scoped
   * to the `<p className="lede">` tag, which is also tighter than the
   * surrounding rule needs to be: a disclaimer anywhere outside this one
   * paragraph should not be able to launder a bare claim inside it.
   */
  /**
   * The README makes the same claim and nothing was watching it.
   *
   * `appIsWiredToCapture` already decides this for the home screen's lede,
   * and the lede flipped on its own the day the adapter landed. The README
   * says it too — "capture is not wired ... with nothing feeding them" — in
   * a section whose whole job is to be honest about what is missing, and it
   * went on saying it, because the mechanism was pointed at one file.
   *
   * That is the shape of the gap rather than one instance of it: the claim
   * with a test behind it stayed true while the prose claims rotted. The
   * same predicate costs nothing to point at a second place.
   *
   * Scoped to the section that lists what is missing, for the lede's
   * reason: the README discusses the microphone elsewhere — in the brief,
   * and in what the exercises are for — and a sentence there should not be
   * able to fail a claim about what is built.
   *
   * **The scoping is not enough on its own, which this found immediately.**
   * The first corrected bullet explained its own history — *this entry said
   * capture was not wired for a session after it was* — and that sentence
   * trips the predicate, because a report of a past false claim is shaped
   * exactly like the claim. The lede test hit the same thing with the
   * comment describing it. So the section stays factual and the history
   * lives here, where no scan is looking.
   */
  const README = join(SRC, '..', 'README.md');

  function notBuiltSection(source: string): string {
    const start = source.indexOf('## What is not built yet');
    if (start === -1) throw new Error('could not find the "not built" section in README.md');
    const next = source.indexOf('\n## ', start + 1);
    return source.slice(start, next === -1 ? undefined : next);
  }

  /**
   * A sentence saying capture is absent, with nothing in it disclaiming
   * that as partial. Sentence-scoped for the lede's reason — a qualifier
   * in one sentence must not launder a bare claim in another.
   */
  function claimsCaptureUnbuilt(text: string): boolean {
    const sentences = text.replace(/\s+/g, ' ').match(/[^.]+\./g) ?? [];
    return sentences.some((sentence) =>
      /\b(capture|microphone)\b/i.test(sentence)
      && /\b(not wired|not built|nothing feeding|is not|are not)\b/i.test(sentence)
      && !/\b(intervals?|so far|only|partly|one exercise)\b/i.test(sentence));
  }

  it('does not tell a reader capture is missing once it is wired', () => {
    const section = notBuiltSection(readFileSync(README, 'utf8'));
    // Not idle: the section exists and still lists something.
    expect(section.length, 'the "not built" section is empty').toBeGreaterThan(200);

    if (appIsWiredToCapture()) {
      expect(claimsCaptureUnbuilt(section), 'README says capture is not wired, and it is')
        .toBe(false);
    } else {
      expect(claimsCaptureUnbuilt(section), 'capture is unwired and the README does not say so')
        .toBe(true);
    }
  });

  /**
   * The counts the README quotes are the catalogues' own.
   *
   * "from twenty-four", "from twenty types", "six kinds of practice" — each
   * is a fact about an array that anybody may add to, written in prose that
   * nothing recomputes. None has rotted yet; the microphone entry above
   * shows what happens when one does, and these are the same shape with a
   * cheaper mechanism available.
   *
   * The numbers come from the code and the claims are found by phrase, so
   * this cannot drift into a second copy of the figures. A phrase that
   * stops appearing fails rather than passing, because a claim nobody can
   * locate any more is exactly the state this is meant to catch.
   */
  const WORDS: Record<string, number> = {
    four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    twelve: 12, fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20,
    'twenty-four': 24, 'twenty-one': 21, thirty: 30,
  };

  it('quotes the catalogues at the sizes they are', () => {
    const readme = readFileSync(README, 'utf8').replace(/\s+/g, ' ');
    const claims: [string, RegExp, number][] = [
      ["a chord's qualities", /quality, from ([\w-]+),/i, CHORD_TYPES.length],
      ['the scale types', /a scale, from ([\w-]+) types/i, SCALE_TYPES.length],
      ['the kinds of practice', /([\w-]+) kinds of practice/i, EXERCISE_FAMILIES.length],
    ];

    for (const [what, pattern, actual] of claims) {
      const match = pattern.exec(readme);
      expect(match, `the README no longer states ${what} where this looks for it`)
        .not.toBeNull();
      const word = match![1].toLowerCase();
      // Loudly, rather than skipping: a number this cannot read is a claim
      // going unchecked, which is the thing being guarded against.
      expect(WORDS, `the README writes ${what} as "${word}", which this cannot read`)
        .toHaveProperty(word);
      expect(WORDS[word], `the README says ${word} ${what}; there are ${actual}`)
        .toBe(actual);
    }
  });

  function ledeText(source: string): string {
    const match = source.match(/<p className="lede">([\s\S]*?)<\/p>/);
    if (!match) throw new Error('could not find the lede paragraph in Home.tsx');
    return match[1];
  }

  /**
   * A sentence mentioning both "answer" and "playing" with nothing in it
   * disclaiming that as future work. Sentence-scoped rather than
   * paragraph-scoped so a disclaimer in one sentence cannot launder a bare
   * claim sitting in another — which is close to how the original line
   * read, in a paragraph that also disclaimed Sight reading correctly.
   */
  function claimsPlayingIsCurrent(lede: string): boolean {
    const sentences = lede.replace(/\s+/g, ' ').match(/[^.]+\./g) ?? [];
    return sentences.some((sentence) =>
      /\bplaying\b/i.test(sentence)
      && /\banswer(ed|ing)?\b/i.test(sentence)
      && !/\b(being built|not built|not yet|unbuilt|planned|is coming|will be)\b/i.test(sentence));
  }

  it('does not claim playing as a current answer path while no exercise is wired to capture', () => {
    const lede = ledeText(readFileSync(HOME, 'utf8'));
    const claimsPlayingNow = claimsPlayingIsCurrent(lede);
    const wiredToCapture = appIsWiredToCapture();
    expect(
      { claimsPlayingNow, wiredToCapture },
      'home screen claims an answer path no exercise has',
    ).not.toEqual({ claimsPlayingNow: true, wiredToCapture: false });
  });

  /**
   * The other direction, which has no reader to catch it.
   *
   * A claim that something exists is contradicted the moment someone opens
   * the file and finds it absent. A claim that it is *not yet* built is
   * contradicted by nobody, because building the thing does not prompt
   * anyone to delete the sentence saying it is unbuilt. The ADR index's
   * sixth convention names that asymmetry; this is the half of it that
   * applies once the wiring lands, and the only moment anyone would
   * otherwise have had no reason to look at the lede again.
   */
  it('stops disclaiming playing once an exercise is wired to capture', () => {
    const lede = ledeText(readFileSync(HOME, 'utf8')).replace(/\s+/g, ' ');
    const disclaims = /\b(being built|not built|not yet|unbuilt|planned|is coming|will be)\b/i.test(lede);
    expect(
      { disclaims, wiredToCapture: appIsWiredToCapture() },
      'an exercise now answers by playing, so the lede may no longer call it unbuilt',
    ).not.toEqual({ disclaims: true, wiredToCapture: true });
  });

  it('still mentions playing, so the rule above is not defending a lede that dropped the word entirely', () => {
    const lede = ledeText(readFileSync(HOME, 'utf8'));
    expect(/\bplaying\b/i.test(lede)).toBe(true);
  });
});

/**
 * `docs/instrument-pack-format.md`: a sampled pack carries its own measured
 * `trim`, and nothing in the loading path substitutes the synthesised voice's.
 *
 * Written before the loading path exists, because this is the half of that
 * rule the suite can hold. The other half — whether a pack lacking a trim
 * refuses to load — needs a loader to refuse, and the figure itself cannot be
 * checked at all: loudness is the one thing this suite has no instrument for,
 * which `instruments.test.ts` says of the synthesised numbers and which is no
 * less true of a recorded one.
 *
 * What it does have an instrument for is which field a code path reads. The
 * six synthesised trims are measurements of that synthesis and say so; a
 * sampled voice's level comes from whoever made the recording and has no
 * relation to a figure tuned for an oscillator stack. Copying one across is
 * the obvious shortcut, and it would put the defect those measurements were
 * taken to remove *inside one instrument* — so a pack arriving mid-exercise
 * would change the volume as it swapped in.
 */
describe('a sampled voice does not inherit a synthesised trim', () => {
  it('reads a trim only where a voice is built', () => {
    const readers = filesUnder(SRC)
      .filter((file) => !/\.test\.tsx?$/.test(file))
      // `.trim` the property, not `.trim()` the string method, which is
      // everywhere and means nothing here.
      .filter((file) => hits([file], /\.trim\b(?!\s*\()/).length > 0);

    /*
      Two readers now, and they read two different figures. `synth.ts`
      reads the synthesised voice's trim; `sampled.ts` reads the one its
      pack measured from its own recordings. This case asked for exactly
      one reader when only one voice existed, and widening it is the
      right response to a sampled voice arriving — but widening a list is
      also how a guard quietly stops guarding, so the claim that actually
      prevents the defect is the one below, not this one.
    */
    expect(readers.map(show)).toEqual([
      // Refuses a pack whose trim was never measured, rather than
      // defaulting it to 1 — a plausible-looking value for a thing nobody
      // measured is worse than an absent one, because nothing goes looking.
      'audio/output/pack.ts',
      'audio/output/sampled.ts',
      'audio/output/synth.ts',
    ]);
  });

  /**
   * The defect itself, which a list of filenames cannot express.
   *
   * Copying the synthesised trim onto a sampled voice is the obvious
   * shortcut and `docs/instrument-pack-format.md` forbids it: those figures
   * are measurements of *that synthesis* and have no relation to whatever
   * level a recording was made at. Worse than being wrong, it would be
   * wrong between the two halves of one instrument — so a pack landing
   * mid-exercise would change the volume as it swapped in, which is the one
   * thing the trims were measured to prevent.
   *
   * Stated as an import rather than as a value, because that is what can be
   * checked: the sampled path cannot borrow a figure from a catalogue it
   * cannot see. A sampled voice reaching for `instruments.ts` has no honest
   * reason to, and this fails the moment it does.
   */
  it('builds the sampled voice without seeing the synthesised catalogue', () => {
    /*
      `importsOf`, not a regex for one spelling of the specifier.

      The first version matched `from './instruments'` literally, which a
      re-export, a `../output/` path or a dynamic import all walk past —
      and this file already has the mechanism for the question, used by
      the vexflow and upward-import rules. A correlate of the answer is
      not a substitute for the thing that answers it, which is this
      project's first convention and is cheaper here than the regex was.
    */
    const sampled = join(SRC, 'audio', 'output', 'sampled.ts');
    const specifiers = importsOf(sampled);
    expect(specifiers.filter((m) => /(^|\/)instruments$/.test(m)),
      'sampled.ts reaches the synthesised catalogue').toEqual([]);
    // Not idle: it does import its own source of a trim, by the same means.
    expect(specifiers.filter((m) => /(^|\/)pack$/.test(m)).length).toBeGreaterThan(0);
  });

  /**
   * And the guard is not idle: it is looking for something that is there.
   * A pattern that matched nothing would pass the case above by finding no
   * readers at all, which is the same empty-population failure as a sweep
   * over no seeds.
   */
  it('is looking at a file that does read it', () => {
    expect(hits([join(SRC, 'audio', 'output', 'synth.ts')], /\.trim\b(?!\s*\()/))
      .toHaveLength(1);
  });
});
