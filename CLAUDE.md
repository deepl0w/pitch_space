# Music Practice — notes for agents

A practice app for musicians: sight reading, note identification, rhythm, chord,
chord-progression and scale exercises, generated on the spot and answered by
playing them on a real instrument. One TypeScript codebase ships as an
installable PWA and as an Android APK. `README.md` describes what it does and how
the generation works; this file is about working on it.

## Several agents work here at once

One **main** agent works in the original checkout at
`/home/deeplow/workspace/music_practice`, owns `main`, and is the only one that
may push. Every other agent works in a worktree under `.claude/worktrees/` on its
own `claude/<name>` branch.

If you are in a worktree:

- **Never push.** Not with any flag, not for any reason.
- **Sync before you start**: `.claude/scripts/fleet.sh sync` merges `main` in,
  and installs `node_modules` the first time.
- **Commit before you go idle**: `.claude/scripts/fleet.sh save "<message>"`. A
  Stop hook will not let you finish a turn with changes uncommitted.
- Your role lives in `.claude/role`; `/role tester|architect|feature` sets it.

The main agent merges those branches with `/integrate`, runs the suite, and pushes.

When main merges anything it tells every worktree, and each syncs before doing
anything else. A tester then checks whether the change is tested and tries to
break it; an architect checks whether it still agrees with `docs/adr/`. Both
report what they found back to main — including finding nothing — and main
integrates at the end. The cycle is in the `fleet` skill under *The review cycle*.

ADR numbers are claimed with `.claude/scripts/fleet.sh adr-claim "<title>"`,
never agreed in a message: a reservation and the work it protects can cross in
flight. `adr-taken` shows who holds what.

`.claude/scripts/fleet.sh brief` prints where you are and where your branch
stands — the SessionStart hook runs it for you. The protocol in full, including
what each role may change, is in `.claude/skills/fleet/SKILL.md`; commands are
`/role`, `/sync`, `/wrap-up` and `/integrate`.

Two hazards worth knowing. The git **stash stack is shared** across every
worktree, so never use a bare `git stash` / `git stash pop` — use a WIP commit
instead. And `node_modules` is git-ignored, so a fresh worktree cannot run a
single npm script until `sync` has installed it; after a merge that moved
`package.json`, install again before you trust a green run.

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
