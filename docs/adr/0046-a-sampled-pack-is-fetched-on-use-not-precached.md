# ADR 0046 — A sampled pack is fetched on use, not precached

- **Status:** Accepted
- **Date:** 2026-10-09

How a recorded instrument reaches the device. The direction — recordings are
the aim, synthesis the floor — was settled elsewhere; this is the delivery
question left open with it.

## Context

Recorded instruments are now the aim, on the user's argument that an exercise
answered by ear trains recognition and recognition transfers from the timbre
you have actually played. Measurement put a pack at roughly **460 KiB an
instrument** — six of them around 2.8 MB, against an app shell of about 1.3 MB.

So the question is not whether packs are affordable. It is whether they belong
in the precache, and the app has already answered the general form of that
question for the notation font:

> The notation font is the reason offline is worth claiming at all — a cached
> shell that cannot draw a stave is a blank exercise — so the glyph formats are
> precached with everything else rather than left to a runtime cache.

**What is precached is what the app cannot work without.** That is the test,
and it is already applied.

## Decision

**Synthesis is precached and is the offline guarantee. A sampled pack is
runtime-cached on first use and never enters `globPatterns`.**

Synthesis is code: it is in the bundle already, it costs nothing extra, and it
means an instrument always sounds. A pack therefore fails the test above — the
app works without it, which is exactly what makes synthesis the floor rather
than a fallback nobody maintains. Precaching 2.8 MB to improve something that
already functions would roughly triple the first load for every user including
the ones who never change instrument.

**A pack is immutable and versioned in its URL**, so the service worker can
serve it cache-first with no revalidation: once fetched it is available offline
for good, and a changed pack is a different URL rather than a stale entry.

**Selecting an instrument whose pack is absent is not an error.** Synthesis
plays, the pack downloads in the background, and later notes are sampled. There
is nothing to block on and no spinner to design — which is the practical payoff
of keeping synthesis as a real floor rather than a stub.

## The index is generated, and that is what makes the credits honest

A CC-BY pack obliges the app to display attribution, and attribution the app
does not display is attribution the app has failed to make. So there must be a
credits surface, and it has to work **before** any pack is downloaded and
**while offline**.

**So the index ships in the bundle and the pack builder writes it.** A small
generated file naming every available pack with its source, licence and size:
small enough to precache without argument, complete enough for the settings
screen to list what is on offer and credit what is installed, and impossible to
drift from the packs because no one types it. Each pack also carries its own
copy, so a downloaded pack is self-describing even if the index moves on.

That is this repository's standing convention rather than a new idea — a
summary should be generated from what it summarises, or carry the command that
checks it, or not exist. A hand-maintained credits list is the version of this
that goes wrong silently, and it goes wrong in the direction of an unmet
licence obligation.

**The sequencing consequence is worth stating plainly**: CC0 packs can ship
before the credits screen exists; CC-BY packs cannot.

The format both files take is specified in
[`docs/instrument-pack-format.md`](../instrument-pack-format.md), written
before the builder so that the fields are settled while they are still cheap to
settle.

## What this costs

**The first note on a newly chosen instrument is the synthesised one.** A
learner who switches to the recorded piano hears the synthetic piano until the
download lands. That is the right failure and it is still a failure — the whole
argument for recordings is that the synthetic voice is not the instrument they
know, and the moment of switching is when they are most attending to the
difference.

**The obvious alternative is to precache the default instrument's pack only**,
which would make the app sound right from the first note at the cost of roughly
a third more first load. This record declines that because it is the first-load
cost paid by everyone for a benefit synthesis already covers passably, and
because the figure that would settle it does not exist: nobody has measured how
long 460 KiB actually takes on the connections this app is used on. **Measure
that before revisiting**, rather than arguing it again from the same two
intuitions.

## A tension this inherits rather than creates

The pedagogical argument for recordings — that recognition transfers from the
timbre you have actually played — is an argument that **timbre changes the
skill**. [0043](0043-an-instrument-is-not-part-of-what-a-line-measures.md)
ruled that an instrument is a property of playback and not part of what a line
measures, and accepted as a known cost that a learner who practises on one
voice and switches has a reading that overstates them on the new one.

Those two are in tension and neither is wrong. 0043's reasoning holds —
splitting a line six ways fragments progress into pieces too small to schedule
against — but the user's argument is the strongest statement yet of why that
limitation is real rather than theoretical. **Recordings make it sharper, not
milder**: a learner practising on a recorded piano and tested on a synthetic
one is further apart than two synthetic voices are.

Nothing here reverses 0043 and nothing should, on a delivery record. It is
flagged because the two were written days apart by different hands, the tension
is invisible from inside either, and the place it will surface is whenever
someone asks why switching instruments does not reset anything.

## Revisit when

**A measurement exists for how long a first pack download takes in use.** That
is the number that decides whether the default pack earns a place in the
precache, and it is the only thing that should reopen the question.

## Addendum, 10 October 2026 — the premise this record did not state

Packs were first shipped git-ignored. They existed in the checkout that built
them and nowhere else, so every other checkout, and the deployed app, silently
synthesised. **Found by the user role**, from outside, because from inside
everything worked.

**The decision above has an unstated premise: that the pack is there to
fetch.** Everything this record settles is about *when* a pack is loaded and
*what plays while it loads*. None of it holds if the artefact does not exist,
and the record reads as though existence were someone else's problem.

**Worse, the design in this record is what hid it.** "Selecting an instrument
whose pack is absent is not an error — synthesis plays, the download runs
behind it" is right for a pack that is still arriving and wrong for one that
will never arrive, and **the same silence covers both**. A graceful fallback is
a good thing that makes a class of fault invisible, and this record argued for
the fallback without saying so. The Consequences named the cost as hearing the
synthesised voice first; the real cost is that hearing it forever looks
identical.

**The fix is not to make it an error at runtime**, which would throw away the
property the fallback exists for and would fire on the ordinary case of a slow
connection. It is that **the index and the files must be checked to agree
before anything ships**. The index is generated by the builder, so this is
mechanical: if the index names a pack, a file by that name must be present. One
check, at build time, with no change to runtime behaviour.

That check does not exist yet. `PACKS` in `src/audio/output/sampled.ts` is
imported from the generated index and nothing compares it against
`public/packs/`, so the general form of this fault — an index naming a pack
that is not there — is still reachable by other routes than a `.gitignore`
entry.

**The narrow instance is closed**: the packs are committed and `.gitignore`
carries the reasoning for why they must be.

**What this says about the fallback generally.** Any design where the degraded
path is pleasant needs a separate way to tell *degraded* from *fine*, and the
place to put it is wherever the artefact is produced rather than wherever it is
consumed. The consumer cannot distinguish them — that is the whole point of the
fallback.
