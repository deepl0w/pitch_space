# Music Practice — notes for agents

A practice app for musicians: sight reading, note identification, rhythm, chord,
chord-progression and scale exercises, generated on the spot and answered by
playing them on a real instrument. One TypeScript codebase ships as an
installable PWA and as an Android APK. `README.md` describes what it does and how
the generation works; this file is about working on it.

## Several agents work here at once

The protocol is generic and lives in your user config: `~/.claude/skills/fleet/SKILL.md`
for the rules, `~/.claude/scripts/fleet.sh` for the plumbing, and `/role`,
`/sync`, `/wrap-up` and `/integrate` as commands. `.claude/scripts/fleet.sh`
here is a shim onto it, so every reference keeps working. What is particular
to this repository is `.claude/fleet.conf` — the roles, the test and check
commands, and how a fresh worktree installs itself — and the rest of this
section.

Read the skill for the four rules and the review cycle. In short: one **main**
agent works in this checkout, owns `main`, and is the only one that may push;
everyone else works in a worktree under `.claude/worktrees/` on `claude/<name>`,
syncs before starting, commits before going idle, and never pushes.

**The three roles this project runs**, and what each may change:

| Role | Changes |
| --- | --- |
| **tester** | tests, and the fixes those tests pin down |
| **architect** | `docs/`, chiefly `docs/adr/`; source only by exception |
| **feature** | whatever the feature needs, with tests |

A **tester** should invoke the `test-engineer` skill and an **architect** the
`architect` skill; a **feature** session needs neither.

The music theory core under `src/theory/` and `src/generate/` is where the
tester role earns its keep. It is pure, deterministic given a seed, and makes
claims that are checkable against theory rather than against a snapshot — a
generated progression either cadences or it does not, a spelled interval
either is an augmented fourth or it is not. Prefer property tests over
thousands of seeds to example tests over one, and **assert constraints, never
aesthetics**: the generators' weights are a tuning problem with no ground
truth, and a test that pins them makes tuning impossible.

Exercise types are the natural unit of feature work — one worktree per
exercise keeps two agents out of the same file.

The hazard worth repeating from the skill, because it has bitten here:
`node_modules` is git-ignored, so a fresh worktree cannot run a single npm
script until `sync` has installed it, and after a merge that moved
`package.json` you must install again before trusting a green run.

## Building and testing

Node 20.19+ or 22.12+, and for the Android build a JDK 17+ and the Android SDK.

```bash
./test.sh --check            # is this machine set up
npm test                     # the vitest suite — run this before handing work back
npm run typecheck            # tsc; a merge can pass tests and still not compile
./test.sh --all              # what CI runs: tests, types, lint, offline precache
./build.sh                   # production web build
./build.sh --dev             # the dev server, at http://localhost:5173
make help                    # the same things, wrapped
```

`./build.sh --android` exists and refuses with a reason: Capacitor is not set
up yet, so the app currently ships as a PWA only. `./test.sh --offline` does
the same for the service worker. Both are wired so they start working when
those land rather than being added afterwards; `docs/ROADMAP.md` has the rest.

## The code

```
src/
  theory/     facts about music: pitch, interval, scale, key, chord, meter, roman
  generate/   choices about music: templates, harmony, rhythm, melody, exercise
  audio/
    dsp/      pitch detection, chroma, onsets — pure maths
    capture/  microphone, AudioWorklet, analysis worker
    output/   the one AudioContext, instruments, metronome, scheduler
  exercises/  one directory per exercise type, plus render/toVexflow.ts
  ui/         notation/, components/, screens/, theme/
  state/      zustand stores and persistence
  app/        composition root
```

**`theory/`, `generate/` and `audio/dsp/` import nothing above themselves and
nothing from the platform — no DOM, no `AudioContext`, no React.** That is what
lets the whole music engine and the whole analysis chain run under vitest on a
laptop, and it is the single constraint most worth protecting. A test enforces
it. If a change to the generator or the detector needs a browser class, it
belongs in `capture/`, `output/` or a component.

**`src/exercises/render/toVexflow.ts` is the only file that may import vexflow.**
A second importer is how that containment quietly dies, so the same test checks
for it.

The pitch-detection constants are measurements, not preferences. Most are
inherited from the sibling tuner at `../tuner`, whose ADRs record what was
measured and on what; changing one means re-running the recordings corpus.

Generation is **deterministic given a seed**. Nothing in `theory/` or
`generate/` may call `Math.random`, read the clock, or let `Set`/`Map` iteration
order decide a musical choice — an exercise a user reports by its seed has to
reproduce exactly.

## Conventions

- **Comments explain why, not what.** The existing ones give the reason a
  threshold exists or a branch is there; match that density and tone rather than
  annotating syntax.
- **Commit messages** are one imperative line saying what changed and why —
  `Target chord tones on strong beats so generated melodies imply their harmony`,
  not `fix melody gen`. Read `git log` before writing one.
- **ADRs are append-only.** `docs/adr/` records decisions that would be expensive
  to reverse. A published record is never rewritten, only marked
  `Superseded by NNNN`, and the index in `docs/adr/README.md` is updated with it.
- **Tests assert constraints, never aesthetics.** The generator's weights are a
  tuning problem with no ground truth; a test that pins them makes tuning
  impossible. Assert that a suspension resolves down by step, not that a
  particular seed produces a particular tune.
- Prose in docs is written out, British spelling, no telegraphic bullet lists
  where a sentence would do.
