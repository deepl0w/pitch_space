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

## Nothing in flight

Nothing is currently recorded here. An entry looks like this:

> ### `<role>` — one line saying what is changing
>
> **Branch:** `claude/<name>`
> **Changes:** the interface, output shape, or behaviour that will differ,
> concretely enough to write a test against before the change lands.
> **For tester:** what to expect and what it implies — a new property to
> assert, an existing assertion that will need to change, or nothing yet if
> the shape is still moving.
