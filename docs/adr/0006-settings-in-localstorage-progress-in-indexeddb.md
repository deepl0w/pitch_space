# ADR 0006 — Settings in localStorage, progress in IndexedDB

- **Status:** Accepted
- **Date:** 2026-10-04

The first record about state that outlives the tab. Everything
[0001](0001-a-pure-core.md) protects is pure and regenerates; this is the part
of the app that does not.

## Context

The app keeps two kinds of thing on a user's device, and they look alike only
until you ask when each is read.

**Preferences** are small, bounded and needed before the first paint. Which
exercise the practice screen opens on, how wide the interval pool is, which
clef, and — once the toggle in `docs/ROADMAP.md` lands — which theme. A
preference read after the first paint is a preference the user watches the app
change its mind about: the screen draws in light, the stored theme arrives a
frame later, and the page flashes. The same is true of the exercise selector,
which would mount on the wrong type and then swap. There is exactly one web
storage that can answer before a render, and it is `localStorage`.

**Review history** is the opposite of all of that. It appends once per
answered exercise and never shrinks, it is read in bulk, and nothing on the
first paint depends on it. A person practising a hundred exercises a day
accumulates tens of thousands of records in a year, and an attempt is not
small — it carries the seed, the settings it was generated from, the items the
rendering contained and an outcome per item tested. `localStorage` is a string
store with roughly five megabytes per origin, read and written whole: appending
one attempt means serialising the entire history and parsing it back, on every
answer, for as long as the user keeps practising. That is the wrong shape
twice over, and the quota is a wall rather than a slope.

The thing that makes this a decision rather than a measurement is that both
halves are cheap to get wrong in the same direction. Putting everything in
IndexedDB is tidy, asynchronous throughout, and produces the flash. Putting
everything in `localStorage` is simple, synchronous throughout, and produces an
app that stops recording somewhere in the user's second year — silently, since
a quota error on write is an exception nobody is watching for.

There is a third thing both halves need and only one of them can survive
without: **a migration path that exists before the first release.** Review
history is the first thing in this app whose loss would actually matter to
someone. A migration written afterwards has to be written against data that is
already on people's devices, which means the shape it must read is whatever
shipped, reconstructed from the source history and guessed at where that is
ambiguous.

## Decision

**Preferences go in `localStorage` and are read synchronously at module load.
Attempt history goes in IndexedDB and is read asynchronously after the first
paint. Every stored value is wrapped in a version and migrated on read.**

The split is expressed as two interfaces in
[`src/state/persistence.ts`](../../src/state/persistence.ts), because the
difference that matters is the shape of the access and not the name of the
API:

- A **`Slot<T>`** holds one small document. `read` returns `T | null`
  synchronously. The synchrony is the requirement; `localStorage` is the
  implementation that happens to satisfy it.
- A **`Log<T>`** appends without bound and is read in bulk. Every method
  returns a promise. IndexedDB is the only storage large enough, and it is
  asynchronous, so the interface is.

Three things follow from drawing it that way.

**Each interface has an in-memory implementation that is a complete
substitute.** That is what lets both stores be tested under node with no
browser, and it is what the app falls back to on a device that will not open a
database — a working session with a history that does not outlast the tab,
rather than a screen that will not load.

**Every access to the platform is guarded.** `localStorage` is a property that
*throws* on access when cookies are blocked, and throws on write at quota. An
unguarded read in the first render is an app that does not start for a
minority of users. Failing to persist is the right answer to all of it: the
app still works and the preference just does not survive the tab.

**Versioning is per record, not per database.** Each stored value is a
`{ v, data }` wrapper, and [`migrate`](../../src/state/migrate.ts) brings it
forward on read by applying `steps[n - 1]` to move from version `n` to `n + 1`.
IndexedDB's own `DB_VERSION` changes only when the object stores or indexes
change. Those are deliberately different numbers: rewriting every row inside an
`onupgradeneeded` transaction is how a user with a long history gets a blocked
tab on the morning of a release.

The two halves also differ in **what they do with something they cannot read**,
and this is the part most worth stating. A preference repairs towards its
default, because losing one is cheaper than refusing to render a screen. A
recorded attempt throws, the reader skips it, and the number skipped is
surfaced — because a row that cannot be read is not a row whose defaults anyone
knows, and fabricating one would feed the schedule evidence nobody produced.
A document from a *later* release is refused outright and left alone: a
downgrade, or a second tab mid-deploy, should cost the session and not the
account.

## Consequences

The first paint is correct without a flash, and the history loads behind it.
The progress store therefore has three states rather than two — `loading`,
`ready` and `unavailable` — and the screen shows them apart, because an empty
history the app has not looked at and an empty history the app cannot reach
both render as "nothing here" to a careless caller.

Both stores are plain functions over an interface, so
[`settingsStore`](../../src/state/settingsStore.ts) and
[`progressStore`](../../src/state/progressStore.ts) are tested against fakes in
the node environment, and
[`indexedDbLog`](../../src/state/indexedDbLog.ts) is tested against a real
IndexedDB under `fake-indexeddb`. The `Log` contract is written once and asked
of both implementations, so the fallback cannot quietly behave differently from
the thing it stands in for.

Export becomes a small piece of work rather than a migration. The history is
already a list of self-describing versioned records, which is what
`docs/ROADMAP.md` asks for early and for the right reason.

### What this costs

**Two mechanisms and two sets of failure modes.** A reader of `src/state/` has
to know which half they are in before they know whether a call blocks, whether
it can throw, and what happens to a value it cannot parse. The two interfaces
make that visible, but it is still two of everything.

**The memory fallback is not the same storage, and two differences are
real.** IndexedDB keys attempts by their own id, so appending the same attempt
twice — a double tap, a strict-mode double effect — stores it once; `memoryLog`
pushes and would store it twice. IndexedDB reads through an index on
`answeredAt`, so "oldest first" is true of the data; `memoryLog` returns
insertion order and is only oldest-first because callers happen to append in
order. Neither bites today, because the progress store sorts what it reads and
mints one id per round, but a device that fell back to memory is a device whose
history is slightly different in kind, and that is worth knowing before
something downstream relies on either property.

**Nothing above the progress store may assume a history at first paint**, and
that is a constraint on every feature built on it. The "due today" count the
ROADMAP wants is the obvious case: it cannot be in the first frame, so it has
to have an honest loading state rather than rendering zero.

**A record-level version means every read migrates.** A wrong migration step
does not fail loudly at upgrade time; it shows up as rows that will not coerce,
one user at a time. That is why the count of unreadable rows is carried in the
store's state and shown rather than swallowed — it is the only early evidence
there is.

**`localStorage`'s few megabytes are shared with whatever else the origin
stores**, including anything a future service worker or analytics script puts
there. Preferences are small enough that this is theoretical, but the quota is
not ours alone and a write that fails is a write that fails silently.

## Revisit when

- **Something on the first paint wants the history.** A due count, a streak, a
  resumed session. The answer is not to move the log into `localStorage`; it is
  to decide deliberately what the first frame shows while the log loads, and
  the temptation at that moment will be the other one.
- **Export or import lands.** Both read the whole log and write it back, which
  is the first operation large enough for the record-at-a-time migration to be
  the wrong granularity, and the first one where a partial failure has to mean
  something.
- **A second device appears.** Sync needs ids that are stable across devices
  and an ordering that does not come from the device's clock, and
  `answeredAt` is the device's clock. That is a change to the record shape and
  therefore a migration step, which is the thing this record exists to make
  possible rather than to avoid.
