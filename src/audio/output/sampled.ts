/**
 * A sampled instrument, once its pack has arrived.
 *
 * The browser half of `pack.ts`: fetching, decoding and sounding. Everything
 * decidable without a browser lives there, so what is left here is the part
 * that genuinely needs an `AudioContext` — which is also the part the suite
 * cannot reach, and the reason there is as little of it as possible.
 *
 * **Nothing in this file is on the path to a first note.** ADR 0046 settles
 * that synthesis is precached and guarantees an instrument always sounds; a
 * pack is fetched on use, and until it arrives the synthesised voice plays.
 * So every failure here — no network, a refused fetch, audio the browser
 * cannot decode — has the same consequence, which is that the synthesised
 * voice goes on playing and the reader is not told about a download they did
 * not ask for.
 */
import { checkManifest, nearestRecorded, parsePack, playbackRate } from './pack';
import type { PackHeader, PackManifest } from './pack';
import index from './packs.json';

/** Every pack the build produced: id, credit and content-addressed filename. */
export const PACKS = index as readonly (Omit<PackHeader, 'bytes'> & { notes: number })[];

/** Whether a recorded instrument exists for an id, without fetching anything. */
export function hasPack(id: string): boolean {
  return PACKS.some((p) => p.id === id);
}

/** Where a built pack is served from, matching `tools/build-instrument-pack.mjs`. */
const PACK_PATH = 'packs';

/**
 * A decoded pack: the recordings, and the level they were measured at.
 *
 * Keyed by the MIDI number actually recorded. The nearest-note search is in
 * `pack.ts` and works off the manifest, so this map is only ever read by a
 * key that search returned.
 */
export interface SampleBank {
  readonly manifest: PackManifest;
  readonly buffers: ReadonlyMap<number, AudioBuffer>;
}

/**
 * Fetch and decode a pack.
 *
 * Decoding every note up front rather than on demand. The alternative is a
 * first note that is silent or late while its own slice decodes, which is
 * the defect the fallback exists to avoid, reintroduced one layer down — and
 * sixteen short notes is a few hundred milliseconds of work on a phone,
 * happening behind a voice that is already sounding.
 *
 * `decodeAudioData` detaches the buffer it is given, so each slice is copied
 * out first; passing views into one array would leave every later note
 * decoding from a detached buffer.
 */
export async function loadPack(id: string, context: AudioContext): Promise<SampleBank> {
  /*
    The index is imported, not fetched. It ships in the bundle because the
    settings screen has to be able to list and credit what is on offer
    before anything has been downloaded and while offline — which is also
    why it is the one part of this feature that is committed.
  */
  const entry = PACKS.find((e) => e.id === id);
  if (!entry) throw new Error(`no pack for ${id}`);

  const response = await fetch(`${PACK_PATH}/${entry.file}`);
  if (!response.ok) throw new Error(`pack ${entry.file}: ${response.status}`);
  const { manifest, audio } = parsePack(new Uint8Array(await response.arrayBuffer()));
  checkManifest(manifest);

  const buffers = new Map<number, AudioBuffer>();
  for (const note of manifest.notes) {
    const slice = audio.slice(note.offset, note.offset + note.bytes);
    buffers.set(note.midi, await context.decodeAudioData(slice.buffer as ArrayBuffer));
  }
  return { manifest, buffers };
}

/**
 * Sound one note from a bank, and hand back the source so it can be cut.
 *
 * The envelope is a release rather than the synthesised voice's full
 * attack-decay-sustain shape, because a recording already has its own attack
 * and its own decay — that is the whole reason for having one. What it does
 * not have is an ending at the moment this particular note stops, so the
 * only shaping applied is a short fade at the end, which is what stops a
 * note being cut off with a click.
 */
export function playSampled(
  context: AudioContext,
  destination: AudioNode,
  bank: SampleBank,
  voice: { midi: number; duration: number; gain?: number },
  at: number,
): AudioBufferSourceNode {
  const recorded = nearestRecorded(bank.manifest.notes, voice.midi);
  const buffer = bank.buffers.get(recorded.midi);
  if (!buffer) throw new Error(`pack has no decoded audio for ${recorded.midi}`);

  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate(voice.midi, recorded.midi);

  const envelope = context.createGain();
  envelope.connect(destination);
  source.connect(envelope);

  const level = (voice.gain ?? 1) * bank.manifest.trim;
  /*
    A few milliseconds of fade-in, to stop the first sample being a step.

    **Not an aesthetic softening — a discontinuity.** A recording that
    begins at steady-state amplitude jumps from silence to full level in
    one sample when the gain is set instantly, and that edge is a click.
    A user reported the electric piano and the organ as sounding "cut
    from the beginning" and those are exactly the two the measurements
    single out: over their first 20ms they are already at the level they
    hold for the next half second (-30.0 against -32.0 dB, and -26.3
    against -25.7), where strings and flute climb from far below it
    (-63.1 to -49.5, -37.4 to -32.2). A sustained instrument sampled
    without its attack has no ramp of its own, so one has to be supplied.

    Four milliseconds: long enough that the step becomes a slope at any
    sample rate, short enough that a struck piano's transient is still a
    transient. The percussive packs did not need it and are not harmed by
    it, which is why it is unconditional rather than per-instrument —
    a flag here would be a per-pack tuning decision with nothing to
    measure it against.
  */
  const ATTACK = 0.004;
  /*
    The note ends when the passage says so or when the recording runs out,
    whichever comes first. Resampling changes how long a recording lasts —
    a note shifted down plays slower and therefore longer — so the available
    length is the buffer's duration divided by the rate, not the buffer's
    duration.
  */
  const available = buffer.duration / source.playbackRate.value;
  const ends = at + Math.min(voice.duration, available);
  const FADE = 0.03;
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(level, Math.min(at + ATTACK, ends));
  envelope.gain.setValueAtTime(level, Math.max(at + ATTACK, ends - FADE));
  envelope.gain.linearRampToValueAtTime(0, ends);

  source.start(at);
  source.stop(ends + 0.01);
  return source;
}
