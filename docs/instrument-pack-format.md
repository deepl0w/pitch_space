# The instrument pack format

What a sampled instrument pack contains, and what the builder that makes one
must refuse. Specified before the builder exists, because the format is the
expensive half — packs are immutable artefacts and a field added later cannot
be added to the ones already on someone's device.

[ADR 0046](adr/0046-a-sampled-pack-is-fetched-on-use-not-precached.md) settled
delivery: synthesis is precached and guarantees offline, a pack is
runtime-cached on first use, and the credits index ships in the bundle. This is
the shape of the two files that implies.

**This document specifies the artefact, not its provenance.** Where the
recordings come from and how the builder reaches them — loose files over HTTP
for two libraries, an archive unpacked once for the third — is the builder's
business and changes whenever a library does. What a pack *is* must not,
because packs are immutable and already on devices. A source shape in here
would be a fact about today's three libraries sitting in a format contract.

## Two artefacts, one source

The builder emits **one index for the bundle** and **one manifest inside each
pack**, generated in the same pass so they cannot disagree. The index carries
every pack's header; the pack carries its own header again plus its note table.

The duplication is deliberate. The index is what the settings screen reads
before anything is downloaded and while offline; the in-pack copy is what makes
a downloaded pack self-describing when the index has moved on. Neither is
hand-written, which is the property that matters — a hand-maintained credits
list fails silently in the direction of an unmet licence obligation.

## The header

```json
{
  "id": "piano",
  "name": "Upright Piano",
  "source": "https://github.com/sgossner/VCSL",
  "licence": "CC0-1.0",
  "attribution": "Versilian Community Sample Library",
  "bytes": 471040,
  "file": "piano-9f3c2a7e.pack"
}
```

**`licence` is an SPDX identifier, never prose.** That is already this
repository's idiom — `tools/fetch-test-audio.sh` records VCSL as `CC0-1.0` —
and it is what lets the builder enforce the licence rule mechanically instead
of a person reading a page and forming a view. The rule it enforces: public
domain, CC0, CC-BY and permissive software licences are in; anything
non-commercial, share-alike or copyleft is out, as is any custom agreement that
restricts redistribution. **The builder refuses an identifier that is not on
the allowlist, and refuses a pack with no `source`.**

**The allowlist decides whether a licence is *permitted*; it does not tell you
what the source *asks*.** VSCO 2 Community Edition is CC0-1.0 by its
repository's own licence metadata, and its readme additionally says *"We ask
that you do not sell the samples directly"* and asks for credit to Versilian
Studios. Neither is a condition CC0 imposes — CC0 cannot be narrowed by a
readme — and neither constrains an app that is MIT, free, and names its sources
in settings. But **a reader who checks the SPDX identifier and stops has not
finished**, and the gap between what a licence permits and what a source asks
is where someone ships something they should not have.

**The gap has a second instance running the other way, which is why this is a
rule rather than a note about one library.** FreePats states CC0 in a readme
shipped *inside the archive* — a reader checking the project page, or the
repository metadata that settled the other two libraries, would never see it.
There the identifier was not too narrow but **absent from everywhere anyone
would look**, and what established it was opening the package. One library's
licence is weaker than its readme suggests and another's is only findable
inside the download; the allowlist decides in both cases and in neither case
could it have been applied without a person fetching the thing.

So the mechanical check stays mechanical, and a person still reads the readme.
The second never silently overrides the first: a request that turns out to be a
*condition* means the identifier was wrong and the pack is refused; a request
that stays a request is honoured because it costs nothing, not because it
binds.

`attribution` is present even for CC0, where nothing requires it. Crediting a
public-domain dedication costs a line and makes the credits screen uniform;
having the field be optional makes the screen branch, and a branch that is only
exercised by CC-BY packs is a branch nobody tests.

## The filename is a content hash, and that is not cosmetic

0046 requires a pack's URL to be immutable so the service worker can serve it
cache-first with no revalidation. **Content-addressing makes that structural
rather than a discipline**: `piano-9f3c2a7e.pack` cannot be edited in place,
because editing it changes its name. There is no version counter for anyone to
forget to bump, and a rebuilt pack with identical contents keeps its URL and
its cache entry.

## The container

A pack is **one file**: the ASCII magic `PSPACK\0\1`, a big-endian `uint32`
giving the manifest's length, the manifest as UTF-8 JSON, then the audio. Note
offsets are relative to the start of the audio section.

Specified here rather than left in `pack.ts` because a file format outlives the
code that first read it. A second builder, a validator, or anything that has to
open a pack without running this app needs the layout from a document.

**The version lives in the magic**, so a later shape is a different file rather
than a misread one — the same reasoning as the content-addressed name, applied
to the bytes inside instead of the bytes outside.

### Why not JSON with base64 audio

The alternative is one JSON document with the audio base64-encoded inside it,
which would be `fetch().json()` and no binary framing, at about a third more
bytes. It was considered and is worse on two counts that are not the size.

**`fetch().json()` is not actually enough.** The offsets still index into
decoded bytes, so a reader must base64-decode the payload and do the same
slicing arithmetic regardless. What the container costs a reader is a nine-byte
comparison and one `getUint32`; what base64 costs is decoding the entire
payload before anything can be sliced. The simplicity the alternative is bought
for does not arrive.

**And it would hold the audio twice, in the worse form.** A base64 payload
reaches JavaScript as a string — UTF-16 in memory — so a 396 KiB pack becomes
roughly a megabyte of string before a byte is decoded, on a device that may be
a phone. The container hands `decodeAudioData` an `ArrayBuffer` slice directly.

**The argument that the manifest and audio must not be separable is sound and
does not decide this**, which is worth saying because it is the reason that
first suggests itself. Both options are a single file; what that argument rules
out is a JSON file beside a blob, which neither of these is.

## The note table

```json
{
  "notes": [{ "midi": 57, "offset": 0, "bytes": 22016 }, { "midi": 60, "offset": 22016, "bytes": 21888 }],
  "trim": 0.62
}
```

Recorded semitones only. VCSL samples roughly every third — A, B, C♯, D♯, F, G
and nothing between — so a pack holds about 21 notes for five octaves and the
player resamples from the nearest.

**The resampling ratio is computed, not stored.** It is
`2 ** ((wanted - nearest) / 12)` and storing it would be a derived number with
its own opportunity to drift from the `midi` beside it.

## `trim` is measured per pack and must not be inherited

The six synthesised voices carry a measured `trim` that brings them within a
few dB of each other, after the organ was found about 15 dB above the piano and
switching instrument felt like moving the volume slider. Those numbers say of
themselves what their scope is:

> They are measurements of *this* synthesis and have to be re-measured if a
> voice's partials or envelope change; the suite cannot check them, because
> loudness is the one thing it has no instrument for.

**A sampled voice is not that synthesis.** Its level comes from whoever made
the recording and has no relation to the figure tuned for an oscillator stack.

**And it is one gain for the whole pack, never one per note.** This is a claim
about instruments rather than about files, which is why it belongs with the
rule rather than in the builder: the top of a piano really is weaker than its
middle, and normalising each note to the same peak would flatten a real
property of the instrument into a recording artefact. A learner would hear an
instrument nothing sounds like. So the builder measures the set and applies one
figure across it, and a per-note normalisation is a defect rather than a
refinement.
Copying the synthesised `trim` across is the obvious shortcut and it would
reintroduce exactly the defect those measurements were taken to remove — worse,
between the two halves of the same instrument, so switching from the
synthesised piano to the recorded one while a pack downloads would change the
volume mid-exercise.

This is the repository's standing rule about this kind of constant rather than
a new one: a value whose rightness is a matter of how it sounds gets changed by
measuring it again, never by reviewing the line that sets it. The builder
measures the pack and writes the figure.

**What makes this rule apply is the absence of an instrument, not the fact of
having measured.** Worth stating because the rule reads like it generalises to
any measured constant and it does not: a measured *length* has an instrument —
this project drives real Chrome over CDP — so treating one as uncheckable
because it was measured would be this rule used to excuse exactly what it
exists to prevent. Loudness is special here because nothing in the repository
can hear.

**What cannot be checked is the figure. The structure around it can be, and
must be.** An earlier draft of this section said "nothing downstream can check
it", which is true of the number and false of everything else, and a reader
could fairly have taken it as licence to skip the check that is available. The
suite has no instrument for loudness; it has a perfectly good one for which
field a code path reads.

So two claims are worth a test, neither of them a quantity:

- **A pack carries its own measured `trim`**, and a pack lacking one does not
  load — rather than defaulting to `1`, which looks like a value and is the
  absence of one.
- **Nothing in the loading path substitutes the synthesised voice's `trim`**
  for a sampled one. That is the defect this section exists to prevent and it
  is exactly the kind a mutant can demonstrate.

`instruments.test.ts` already shows the pattern for the half that is a
quantity: it asserts `trim > 0` and that held voices are trimmed below struck
ones — "an ordering rather than the figures, because the figures are"
measurements. A pack's figure gets the same treatment, and its wiring gets an
ordinary test.

## The compass is declared once for the app, not per generator

A pack has to cover what the app can ask to be played, and a coverage test that
samples seeds can only ever report a floor. The question that raises is whether
each generator should declare its pitch range so the check becomes exact.

**It should not, and the reason is in the one generator that already has a
range.** `interval-id` exports `pitchWindow(settings)` — the MIDI range both
notes are kept inside — and it exists to keep notes on the staff they are drawn
on, not to describe a compass. Its own comment says why the previous form was
replaced: "Symmetric about the clef's centre, where the table it replaces leant
one semitone sharp at every level. That asymmetry was not a decision about
register; it is what you get from writing five pairs of numbers by hand." Six
more hand-written pairs is that mistake again, multiplied, and a declared range
is a comment stating a constraint — the thing that cannot fail.

**So invert it: the app declares one compass, and no generator may leave it.**
A single pair of MIDI bounds, asserted across every exercise by the test that
already drives the practice screen and collects what reaches `audio.play`. The
pack is then built to cover the compass rather than to cover a sample, and the
coverage check stops being a floor because it is no longer measuring — it is
checking a bound that something else enforces.

**Most of this already exists and the gap is narrower than the paragraph above
implies.** `packCoverage.test.tsx` declares `COMPASS = { lowest: 21, highest:
108 }` — A0 to C8, the 88 keys — and justifies it physically rather than by
taste: it is the widest thing anybody is going to record, so a generator asking
outside it cannot be sampled at all, only synthesised. That is the right bound
and the right reason, and nothing here proposes changing it.

What remains is where it lives and what it binds. The constant sits in a test,
and the test checks the seeds it drew — so it is still a sample, and the
builder has nothing to read. Two consequences:

- **The compass needs one home that the builder and the test share, and the
  home it has is the wrong one.** A fact about instruments is sitting in
  `packCoverage.test.tsx` because that is where it was first needed; the
  physical argument beside it is sound and none of it is a testing concern.
  The moment a builder needs the same bound, that constant becomes the first
  of two copies. The right shape is one exported constant in `audio/output/`
  carrying the physical argument, which the test then imports instead of
  declaring — a source change with no test driving it, so it belongs to
  whoever is next in that file rather than to the session that noticed.
- **The observed reach is not the compass, and they are not the same kind of
  claim.** The compass is a bound from the instrument: fixed, physical, true
  whether or not this app exists. The 49-to-85 is a floor from the seeds that
  happened to run. A pack sized to the floor would be sized to an accident,
  and the two should not share a sentence anywhere this number is inherited —
  which is the whole reason this bullet exists rather than a figure.

The builder's rule follows: **refuse a pack that does not cover the declared
compass** — checkable at build time against a constant, rather than against a
sample of what some seeds happened to produce. **A future exercise that asks
outside it fails the assertion**, which is the right failure: it means the
exercise cannot be sampled at all, and someone should know that before a pack
is blamed.

## What the builder refuses

- A licence identifier not on the allowlist, or absent.
- A missing `source`.
- A pack whose measured `trim` has not been written — not defaulted to 1, which
  is a plausible-looking value for a thing nobody measured.
