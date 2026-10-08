# The instrument pack format

What a sampled instrument pack contains, and what the builder that makes one
must refuse. Specified before the builder exists, because the format is the
expensive half — packs are immutable artefacts and a field added later cannot
be added to the ones already on someone's device.

[ADR 0046](adr/0046-a-sampled-pack-is-fetched-on-use-not-precached.md) settled
delivery: synthesis is precached and guarantees offline, a pack is
runtime-cached on first use, and the credits index ships in the bundle. This is
the shape of the two files that implies.

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
Copying the synthesised `trim` across is the obvious shortcut and it would
reintroduce exactly the defect those measurements were taken to remove — worse,
between the two halves of the same instrument, so switching from the
synthesised piano to the recorded one while a pack downloads would change the
volume mid-exercise.

This is the repository's standing rule about this kind of constant rather than
a new one: a value whose rightness is a matter of how it sounds gets changed by
measuring it again, never by reviewing the line that sets it. The builder
measures the pack and writes the figure.

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

## What the builder refuses

- A licence identifier not on the allowlist, or absent.
- A missing `source`.
- A pack whose measured `trim` has not been written — not defaulted to 1, which
  is a plausible-looking value for a thing nobody measured.
