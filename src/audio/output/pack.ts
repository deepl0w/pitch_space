/**
 * The sampled instrument pack: what one contains, and how to read it.
 *
 * `docs/instrument-pack-format.md` is the specification and this is its
 * implementation; where the two disagree the document is right. Everything
 * here is pure — no `AudioContext`, no `fetch` — because the arithmetic that
 * decides which recording to play and how fast is the part worth testing off
 * a browser, and the part a mistake is invisible in.
 *
 * [ADR 0046](../../../docs/adr/0046-a-sampled-pack-is-fetched-on-use-not-precached.md)
 * settles why a pack is fetched on use rather than precached: synthesis is in
 * the bundle already and guarantees that an instrument always sounds, so a
 * pack is an improvement to something that already works rather than
 * something the app cannot start without.
 */

/** One recorded semitone, as a slice of the pack's audio section. */
export interface PackNote {
  /** The MIDI number actually recorded, not one it stands in for. */
  midi: number;
  /** Bytes from the start of the audio section. */
  offset: number;
  bytes: number;
}

/**
 * What the bundled index carries for each pack, and what each pack repeats
 * about itself.
 *
 * The duplication is deliberate and the format document gives the reason: the
 * index is read before anything is downloaded and while offline, and the
 * in-pack copy is what makes a downloaded pack self-describing when the index
 * has moved on.
 */
export interface PackHeader {
  id: string;
  name: string;
  /** Where the recordings came from, so the credit can name it. */
  source: string;
  /** An SPDX identifier, never prose — see `LICENCES`. */
  licence: string;
  attribution: string;
  bytes: number;
  /** Content-addressed, so the URL is immutable without a version counter. */
  file: string;
}

export interface PackManifest extends PackHeader {
  notes: readonly PackNote[];
  /**
   * The level this pack sits at, measured from its own recordings.
   *
   * Never inherited from the synthesised voice of the same name. Those
   * figures are measurements of that synthesis and say so; a sampled voice's
   * level comes from whoever made the recording and has no relation to one
   * tuned for an oscillator stack. Copying it across would reintroduce the
   * defect they were taken to remove, and do it between the two halves of a
   * single instrument — so a pack arriving mid-exercise would change the
   * volume as it swapped in.
   */
  trim: number;
}

/**
 * The licences a pack may carry.
 *
 * The user's constraint, and it decides the source before any judgement about
 * how an instrument sounds: attribution and carrying a licence file are fine,
 * anything with a non-commercial or share-alike term is not, and the
 * application around the audio stays MIT. The test is whether a licence
 * reaches past the audio file and makes a claim on the app.
 *
 * SPDX identifiers rather than prose so this is a comparison rather than a
 * person reading a page and forming a view.
 */
export const LICENCES: readonly string[] = [
  'CC0-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'MIT',
  'Apache-2.0',
  'BSD-3-Clause',
  'Unlicense',
];

export function licenceAllowed(spdx: string): boolean {
  return LICENCES.includes(spdx);
}

/**
 * The compass a sampled instrument can be recorded over: A0 to C8, the 88
 * keys of a piano.
 *
 * Here rather than in each caller because two test files had already written
 * it out separately, which is the drift this project names as a convention.
 */
export const COMPASS = { lowest: 21, highest: 108 } as const;

/** `PSPACK` then a format version, so a later shape is a different file. */
export const PACK_MAGIC = 'PSPACK\u0000\u0001';

/**
 * Read a pack: its manifest, and the audio the note table indexes into.
 *
 * The container is the magic, a big-endian `uint32` manifest length, the
 * manifest as UTF-8 JSON, and then the audio, with `offset` relative to the
 * audio section. `docs/instrument-pack-format.md` carries the layout, because
 * a file format outlives the code that first read it.
 *
 * **The reason is not that one file is inseparable.** That was the first
 * argument for this shape and it does not decide anything: the obvious
 * alternative — a JSON manifest with the audio base64 inside it — is equally
 * one file, so inseparability rules out only a JSON beside a blob, which
 * nobody proposed. What decides it is the cost of reading:
 *
 * - `offset` and `bytes` index into *decoded* audio, so a base64 reader has
 *   to decode the entire payload before it can slice the first note. The
 *   `fetch().json()` simplicity it appears to buy never arrives, while this
 *   costs a nine-byte compare and one `getUint32`.
 * - Base64 reaches JavaScript as a UTF-16 string, so a 396 KiB pack is
 *   roughly a megabyte of string before a byte is decoded — on a phone.
 *   Here the bytes are handed to `decodeAudioData` as a slice and never
 *   exist twice.
 */
export function parsePack(bytes: Uint8Array): { manifest: PackManifest; audio: Uint8Array } {
  const magic = new TextDecoder().decode(bytes.subarray(0, PACK_MAGIC.length));
  if (magic !== PACK_MAGIC) {
    throw new Error(`not an instrument pack: magic was ${JSON.stringify(magic)}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(PACK_MAGIC.length, false);
  const start = PACK_MAGIC.length + 4;
  const manifest = JSON.parse(
    new TextDecoder().decode(bytes.subarray(start, start + length)),
  ) as PackManifest;
  return { manifest, audio: bytes.subarray(start + length) };
}

/**
 * Refuse a pack rather than play it wrong.
 *
 * Repair belongs at the boundary, the same place `instrument()` puts it: a
 * caller holding a bad pack has a bug, and a silently half-working instrument
 * hides it. The three refusals are the format document's, and the third is
 * the one worth stating — a pack whose trim was never measured does not get
 * defaulted to 1, because 1 looks like a value and is the absence of one.
 */
export function checkManifest(manifest: PackManifest): void {
  if (!manifest.source) throw new Error(`pack ${manifest.id} names no source`);
  if (!licenceAllowed(manifest.licence)) {
    throw new Error(`pack ${manifest.id} has licence ${manifest.licence}, which is not allowed`);
  }
  if (typeof manifest.trim !== 'number' || !(manifest.trim > 0)) {
    throw new Error(`pack ${manifest.id} has no measured trim`);
  }
  if (manifest.notes.length === 0) throw new Error(`pack ${manifest.id} records no notes`);
}

/**
 * The recorded note to play for a wanted one: the nearest by semitone.
 *
 * Ties go to the lower recording, which is a real choice rather than a
 * tidiness: shifting a sample up shortens it and thins the body, shifting it
 * down lengthens it, and a note that is slightly too dark is less noticeable
 * than one that is slightly too thin.
 */
export function nearestRecorded(
  notes: readonly PackNote[], midi: number,
): PackNote {
  if (notes.length === 0) throw new Error('a pack with no notes cannot be played');
  return notes.reduce((best, note) => (
    Math.abs(note.midi - midi) < Math.abs(best.midi - midi) ? note : best
  ));
}

/**
 * How far a recording may be resampled and still sound like the instrument
 * it came from: one octave.
 *
 * A limit on shifting, not on the pack. Every sampled instrument has notes it
 * cannot play — a concert flute stops at middle C and a violin at the G below
 * it — and a pack that stops where the instrument does is correct rather than
 * short. What is wrong is answering a bass note with a flute recording
 * dropped twenty semitones: the formants move with the pitch, so it is no
 * longer a flute, and resampling that far turns a half-second sample into a
 * slow dark growl the learner is then asked to identify.
 *
 * An octave because that is roughly where a shifted sample stops passing. The
 * two semitones the note tables are spaced at are inaudible; a fifth is
 * noticeable and still the instrument; beyond an octave it is not.
 */
export const FURTHEST_SHIFT = 12;

/** Whether a pack has a recording close enough to sound this note honestly. */
export function withinReach(notes: readonly PackNote[], midi: number): boolean {
  return Math.abs(nearestRecorded(notes, midi).midi - midi) <= FURTHEST_SHIFT;
}

/**
 * How fast to play a recording to sound a different semitone.
 *
 * Computed rather than stored. Keeping it in the note table would be a
 * derived number with its own opportunity to drift from the `midi` beside it,
 * and this is one line of arithmetic.
 */
export function playbackRate(wanted: number, nearest: number): number {
  return 2 ** ((wanted - nearest) / 12);
}

/**
 * What a pack's note table fails to reach.
 *
 * Returns the two ends separately rather than a boolean, because "the pack
 * does not cover this" is not a useful failure message and because a pack can
 * be short at the bottom and fine at the top.
 */
export function uncovered(
  notes: readonly { midi: number }[],
  asked: readonly number[],
): { below: number[]; above: number[] } {
  const recorded = notes.map((n) => n.midi);
  const lowest = Math.min(...recorded);
  const highest = Math.max(...recorded);
  return {
    below: [...new Set(asked.filter((m) => m < lowest))].sort((a, b) => a - b),
    above: [...new Set(asked.filter((m) => m > highest))].sort((a, b) => a - b),
  };
}
