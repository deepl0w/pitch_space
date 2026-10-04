# In flight

What is being worked on right now, and what it is expected to change for
whoever is not the one building it — mainly **tester**, whose standing job
after a sync now includes this file as well as what just landed
(`CLAUDE.md`, "Several agents work here at once"). This is not `ROADMAP.md`:
that is what is planned but not yet started, architect's to keep; this is
what is already underway, and an entry leaves the moment its change has
merged and been reviewed.

**Main is the only writer.** A role that wants an entry says so to main
rather than adding one, the same reason `.claude/scripts/fleet.sh` and the
fleet skill have a single writer — two roles editing a shared forward plan
in the same week is the merge conflict waiting to happen, and main already
integrates everything else this file would need to stay correct about.

**The user role does not read this file.** See `CLAUDE.md`.

### `main` — `Difficulty` leaves the codebase; each exercise gets the parameter it was hiding

**Branch:** `main`, directly, because it touches all four exercises at once
and the field cannot leave `BaseSettings` in stages.

**Why.** The user's direction for the app: *"hardcoded things like
easy/hard difficulty have no place here. everything in the exercises should
be configurable."* `Difficulty` is a 1–5 ordinal that every exercise uses as
a secret index into a private table — it does not name a property of the
exercise, it names a row. A user who wants six accidentals cannot ask for
six accidentals; they can ask for "level 5" and find out afterwards.

**Changes**, exercise by exercise. In each case the table goes and the thing
it was looking up becomes the setting:

| Exercise | Was | Becomes |
| --- | --- | --- |
| `degree-id` | `difficulty` → `DEGREES_AT` | nothing; `degrees` already *is* the setting, so this is dead state |
| `key-id` | `difficulty` → `ACCIDENTAL_LIMIT` | `maxAccidentals: number` |
| `interval-id` | `difficulty` → `SPREAD` | `window: number` (semitones either side of the clef's centre) |
| `progression-id` | `difficulty` → `SHAPE_AT` | `grade: number`; `bars` is already its own setting |

`BaseSettings` is left holding only `presentation`. The `Difficulty` type,
`presetFor`, `DIFFICULTY_BLURBS` and four hand-rolled 1-to-5 validators go
with it.

**What does *not* change, and must not.** `grade` on `CELLS` and `minGrade`
on `TEMPLATES` are the catalogues' own ordering and are untouched — ADRs
0011 and 0021 are about those, not about this. 0021's open question is
*resolved* by this rather than threatened: if `grade` becomes directly
settable there is no difficulty-to-grade mapping left to extend, and nothing
is stranded. `SHAPE_AT` is the only such mapping in the codebase and
`catalogues.test.ts` reads it, so that test re-anchors onto `GRADE_CHOICES`.

**No `SETTINGS_SCHEMA` bump.** Per-exercise settings are stored as
`Record<string, unknown>` and every exercise has a `coerce` that ignores
what it does not recognise, so a stored `difficulty: 4` is dropped on load
the same way any other unknown key is. The defaults are chosen to match what
level 2 produced, so nobody's saved settings change meaning.

**For tester:** four things to expect. Every `{ ...defaults, difficulty: n }`
in a test becomes the named field — `itemLabel.test.ts` and
`settingsStore.test.ts` both do this, the latter only as an opaque payload
where any key would do. `catalogues.test.ts`'s reachability sweep currently
walks `SHAPE_AT`'s five rows and will walk `GRADE_CHOICES` instead; the
*claim* it makes is unchanged and the five-unreachable-templates figure
should survive, so if it moves, that is a real finding and not bookkeeping.
The monotonicity property worth having afterwards is new and did not exist
before: a larger `maxAccidentals`, `window` or `grade` must admit a superset
of what a smaller one admits, which was true of the tables by construction
and is now a thing the code has to earn. And there is nothing to write
against `degree-id`: its settings lose a field that no test asserts on,
because nothing ever read it.
