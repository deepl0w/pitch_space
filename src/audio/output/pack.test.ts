import { describe, expect, it } from 'vitest';
import {
  COMPASS, LICENCES, PACK_MAGIC, type PackManifest,
  checkManifest, licenceAllowed, nearestRecorded, parsePack, playbackRate, uncovered,
} from './pack';

/**
 * What a pack has to be before it is allowed to sound.
 *
 * `docs/instrument-pack-format.md` lists three refusals, and the reason they
 * are worth a test is that each one fails quietly if it is missing. A pack
 * with no `source` credits nobody, which is a licence obligation unmet
 * rather than a feature absent. A licence outside the allowlist makes a
 * claim on the application around the audio, and the app is MIT. And a pack
 * whose `trim` was never measured would, defaulted to 1, play at whatever
 * level the recordings happened to sit at — plausible enough that nobody
 * goes looking, which is what makes it worse than an absent value.
 *
 * None of this is about how a pack sounds. The suite has no instrument for
 * loudness, which `instruments.test.ts` says of the synthesised figures and
 * which is no less true of a recorded one: what is checkable is that a pack
 * carries its own measured value and that nothing substitutes another.
 */

/** A manifest that passes, so each case below can break exactly one thing. */
function manifest(over: Partial<PackManifest> = {}): PackManifest {
  return {
    id: 'piano',
    name: 'Upright Piano',
    source: 'https://github.com/sgossner/VCSL',
    licence: 'CC0-1.0',
    attribution: 'Versilian Community Sample Library',
    bytes: 1024,
    file: 'piano-9f3c2a7e.pack',
    notes: [
      { midi: 57, offset: 0, bytes: 512 },
      { midi: 60, offset: 512, bytes: 512 },
    ],
    trim: 0.62,
    ...over,
  };
}

describe('a pack is refused rather than played wrong', () => {
  it('accepts the one that is complete, or every case below is about nothing', () => {
    expect(() => checkManifest(manifest())).not.toThrow();
  });

  it('refuses a pack that credits nobody', () => {
    expect(() => checkManifest(manifest({ source: '' }))).toThrow(/names no source/);
  });

  it('refuses a licence that reaches past the audio file', () => {
    // Share-alike is the case the rule exists for: it would make a claim on
    // the application around the recordings, and the app is MIT.
    for (const licence of ['CC-BY-SA-4.0', 'GPL-3.0-only', 'CC-BY-NC-4.0', 'Public domain']) {
      expect(() => checkManifest(manifest({ licence })), licence)
        .toThrow(/is not allowed/);
    }
    // And every identifier the allowlist names is actually accepted, so the
    // rule is a comparison rather than a wall.
    for (const licence of LICENCES) {
      expect(() => checkManifest(manifest({ licence })), licence).not.toThrow();
    }
  });

  /**
   * The refusal the format document spends a section on. A trim that was
   * never measured must not become 1: a number that looks like a value is
   * how an unmeasured quantity stops being noticed.
   */
  it('refuses a trim that was never measured, in every shape an absent one takes', () => {
    for (const trim of [undefined, null, 0, -0.5, Number.NaN, '0.62']) {
      expect(() => checkManifest(manifest({ trim: trim as number })), String(trim))
        .toThrow(/no measured trim/);
    }
  });

  it('refuses a pack that records nothing, which no note table can index', () => {
    expect(() => checkManifest(manifest({ notes: [] }))).toThrow(/records no notes/);
  });

  /**
   * Only an ordering, never a figure.
   *
   * `instruments.test.ts` sets the pattern and the reason carries over
   * unchanged: whether a sampled piano and a synthesised organ sound equally
   * loud is a listening question, and a test that pinned 2.52 would make
   * re-measuring the pack a test edit. What a trim must be is positive and
   * finite — a silent instrument and an infinite one are both broken in a
   * way that has nothing to do with taste.
   */
  it('says only that a trim is a real level, not what level it is', () => {
    for (const trim of [0.01, 0.62, 2.52, 100]) {
      expect(() => checkManifest(manifest({ trim }))).not.toThrow();
    }
  });
});

describe('reading a pack', () => {
  /** The container, built here the way the builder writes it. */
  function packed(json: string, audio: readonly number[]): Uint8Array {
    const head = new TextEncoder().encode(PACK_MAGIC);
    const body = new TextEncoder().encode(json);
    const out = new Uint8Array(head.length + 4 + body.length + audio.length);
    out.set(head, 0);
    new DataView(out.buffer).setUint32(head.length, body.length, false);
    out.set(body, head.length + 4);
    out.set(audio, head.length + 4 + body.length);
    return out;
  }

  it('returns the manifest and the audio that followed it', () => {
    const bytes = packed(JSON.stringify(manifest()), [1, 2, 3, 4]);
    const { manifest: read, audio } = parsePack(bytes);
    expect(read.id).toBe('piano');
    expect(read.trim).toBe(0.62);
    expect([...audio]).toEqual([1, 2, 3, 4]);
  });

  /**
   * The length prefix is what separates the two, so a manifest that grows
   * must not take the first bytes of the audio with it. Asserted by varying
   * the manifest's size rather than by reading the prefix back, which would
   * only check that the test and the parser agree on arithmetic.
   */
  it('splits them by the length it was given, whatever that length is', () => {
    for (const padding of ['', 'x'.repeat(7), 'y'.repeat(1000)]) {
      const bytes = packed(JSON.stringify(manifest({ name: padding })), [9, 8, 7]);
      expect([...parsePack(bytes).audio], `name of ${padding.length}`).toEqual([9, 8, 7]);
    }
  });

  it('refuses a file that is not a pack rather than reading rubbish as one', () => {
    const notAPack = new TextEncoder().encode('PK\u0003\u0004 a zip, say');
    expect(() => parsePack(notAPack)).toThrow(/not an instrument pack/);
  });

  /**
   * The magic carries a format version, which is the whole reason it is two
   * bytes longer than the word. A later pack shape is a different file, and
   * an older reader has to say so rather than parse a manifest it does not
   * understand.
   */
  it('refuses a later format version, which is what the version byte is for', () => {
    const next = `${PACK_MAGIC.slice(0, -1)}\u0002`;
    const bytes = new TextEncoder().encode(next);
    expect(() => parsePack(bytes)).toThrow(/not an instrument pack/);
  });
});

describe('choosing the recording to play', () => {
  const notes = [57, 60, 63, 66].map((midi) => ({ midi, offset: 0, bytes: 1 }));

  it('takes the nearest recorded semitone', () => {
    expect(nearestRecorded(notes, 60).midi).toBe(60);
    expect(nearestRecorded(notes, 61).midi).toBe(60);
    expect(nearestRecorded(notes, 62).midi).toBe(63);
  });

  /**
   * A tie goes down, and that is a choice rather than a tidiness: shifting a
   * sample up shortens it and thins the body, shifting it down lengthens it,
   * and slightly too dark is less noticeable than slightly too thin. Written
   * because the opposite is one `<=` away and sounds fine in review.
   */
  it('resolves a tie downwards', () => {
    // A table every three semitones has no ties at all, which is why the
    // first draft of this case asserted two notes that were simply nearer
    // one neighbour. A tie needs an even gap.
    const even = [60, 62, 64].map((midi) => ({ midi, offset: 0, bytes: 1 }));
    expect(nearestRecorded(even, 61).midi, 'exactly between 60 and 62').toBe(60);
    expect(nearestRecorded(even, 63).midi, 'exactly between 62 and 64').toBe(62);
    // And the near miss on either side still goes to the nearer one, so the
    // rule above is about ties rather than a downward bias.
    expect(nearestRecorded(even, 60.6).midi).toBe(60);
    expect(nearestRecorded(even, 63.4).midi).toBe(64);
  });

  it('refuses to play a pack with nothing in it', () => {
    expect(() => nearestRecorded([], 60)).toThrow(/no notes/);
  });

  /**
   * And the two halves agree: the rate for the note that was chosen sounds
   * the note that was wanted. `resampling.test.ts` holds the arithmetic over
   * the whole compass; this holds that the search and the rate are about the
   * same pair, which is the join a wrong nearest-note would break silently.
   */
  it('plays the recording it chose at the rate for the note it was asked for', () => {
    for (let midi = COMPASS.lowest; midi <= COMPASS.highest; midi += 1) {
      const chosen = nearestRecorded(notes, midi);
      const rate = playbackRate(midi, chosen.midi);
      expect(Math.log2(rate) * 12 + chosen.midi, `wanting ${midi}`).toBeCloseTo(midi, 9);
    }
  });
});

describe('what a pack fails to reach', () => {
  const table = (from: number, to: number) => {
    const notes = [];
    for (let midi = from; midi <= to; midi += 3) notes.push({ midi, offset: 0, bytes: 1 });
    return notes;
  };

  it('names both ends separately, because a pack can be short at one', () => {
    const asked = [40, 50, 60, 70, 80];
    expect(uncovered(table(48, 72), asked)).toEqual({ below: [40], above: [80] });
    expect(uncovered(table(21, 108), asked)).toEqual({ below: [], above: [] });
  });

  it('reports each missing note once, in order', () => {
    const asked = [30, 30, 29, 100, 100];
    expect(uncovered(table(48, 72), asked)).toEqual({ below: [29, 30], above: [100] });
  });
});

describe('the licence allowlist', () => {
  it('is identifiers rather than prose, so this is a comparison', () => {
    // SPDX ids have no spaces. "Public domain" is the kind of thing a person
    // writes when they are describing rather than identifying, and the point
    // of the list is that nobody has to form a view.
    for (const spdx of LICENCES) expect(spdx).toMatch(/^[\w.-]+$/);
    expect(licenceAllowed('Public domain')).toBe(false);
  });
});
