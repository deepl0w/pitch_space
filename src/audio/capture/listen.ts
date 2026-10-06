import { PitchDetector, frameSizeFor, type PitchEstimate } from '../dsp/pitchDetector';
import { detectOnsets, type Onset } from '../dsp/onsetDetector';
import type { CaptureFrame, CaptureSource } from './source';

/**
 * Turning captured frames into the two facts an exercise grades against:
 * when a note started, and what it was.
 *
 * Separate from both detectors on purpose. Each of them answers a question
 * about a buffer it is handed whole; this answers a question about a
 * stream, and the difference is where a capture path actually goes wrong —
 * a note spanning six frames must be reported once rather than six times,
 * and its pitch is a property of the frames after its attack rather than
 * of the frame the attack landed in.
 *
 * **Onsets are found over the whole take rather than frame by frame**, and
 * that is a deliberate limit worth stating. `detectOnsets` adapts its
 * threshold to a median of recent spectral flux, so it needs context on
 * both sides of a candidate; running it per frame would make the first
 * onset of a take systematically different from the rest. The cost is that
 * this reports when the take ends rather than as it goes, which is right
 * for "play this back and be graded" and wrong for a live tuner. A live
 * reading is a different function and should be written as one rather than
 * by weakening this.
 */

/** A note heard: when it began, how long it sounded, and its pitch. */
export interface HeardNote {
  /** Seconds from the start of capture. */
  startSeconds: number;
  /** Until the next onset, or the end of the take. */
  durationSeconds: number;
  /**
   * Median of the stable frames inside the note, or null when none were.
   *
   * Median rather than mean, and over the sustain rather than the attack:
   * a struck string is inharmonic for the first few tens of milliseconds,
   * so the frames around the onset are exactly the ones that lie. A mean
   * would let one of them drag the answer a semitone.
   */
  frequencyHz: number | null;
  /** The best clarity seen inside the note, so a caller can discard a guess. */
  clarity: number;
}

export interface ListenResult {
  notes: readonly HeardNote[];
  /** Every onset, including any whose pitch could not be read. */
  onsets: readonly Onset[];
  /** Total captured length, from the frames rather than from a clock. */
  durationSeconds: number;
  sampleRate: number;
}

export interface ListenOptions {
  /**
   * Below this clarity a frame is not evidence about pitch.
   *
   * The detector's own documentation puts a shaky reading under about 0.8;
   * this is deliberately a little lower, because a real room costs clarity
   * and the median across a note recovers what a single frame loses.
   */
  minClarity?: number;
  /** Frames quieter than this are silence rather than a quiet note. */
  silenceDbfs?: number;
}

const DEFAULT_MIN_CLARITY = 0.7;

/**
 * Inherited rather than chosen, and worth flagging as such: the tuner's
 * gate was measured on Android hardware and has not been re-measured in a
 * browser. `CLAUDE.md` says the pitch constants are measurements; this one
 * is a measurement of something else's microphone.
 */
const DEFAULT_SILENCE_DBFS = -75;

/** Collect a whole take from a source, then analyse it. */
export async function listen(
  source: CaptureSource, options: ListenOptions = {},
): Promise<ListenResult> {
  const chunks: Float32Array[] = [];
  // Copied, because `CaptureFrame.samples` is explicitly reused by the
  // source and keeping the reference would give every chunk the last
  // frame's contents.
  await source.start((frame: CaptureFrame) => { chunks.push(new Float32Array(frame.samples)); });
  const samples = concat(chunks);
  return analyse(samples, source.sampleRate, options);
}

/** The analysis on its own, for a caller that already has the samples. */
export function analyse(
  samples: Float32Array, sampleRate: number, options: ListenOptions = {},
): ListenResult {
  const minClarity = options.minClarity ?? DEFAULT_MIN_CLARITY;
  const silenceDbfs = options.silenceDbfs ?? DEFAULT_SILENCE_DBFS;
  const durationSeconds = samples.length / sampleRate;

  const { onsets } = detectOnsets(samples, { sampleRate });

  const frameSize = frameSizeFor(sampleRate);
  const detector = new PitchDetector({ sampleRate, frameSize });
  // A quarter-frame hop, matching the onset detector's: fine enough that a
  // short note still contains several readings, coarse enough not to run
  // the detector four times over the same sixteenth.
  const hop = Math.max(1, Math.round(frameSize / 4));

  const notes: HeardNote[] = onsets.map((onset, i) => {
    const endSeconds = i + 1 < onsets.length ? onsets[i + 1].timeSeconds : durationSeconds;
    return {
      startSeconds: onset.timeSeconds,
      durationSeconds: Math.max(0, endSeconds - onset.timeSeconds),
      ...pitchOver(samples, sampleRate, detector, frameSize, hop, {
        from: onset.timeSeconds, to: endSeconds, minClarity, silenceDbfs,
      }),
    };
  });

  return { notes, onsets, durationSeconds, sampleRate };
}

/**
 * The pitch of one note, from the frames inside it.
 *
 * Skips the first quarter, on the theory that a struck string is
 * inharmonic while its attack transient decays and YIN reads that as
 * anything at all. A fraction rather than a fixed time, so a sixteenth is
 * not skipped entirely.
 *
 * **That theory is currently unverified and the skip may be doing
 * nothing.** Measured against Karplus–Strong plucks at two brightnesses
 * and two lengths, removing it changed not one reading — so the synthetic
 * signals this is tested on do not have an attack misleading enough to
 * need it. Kept rather than deleted because a recorded piano's attack is
 * a far harsher transient than a delay-loop model produces, and that is
 * the input this layer exists for; deleting it on evidence from a signal
 * that does not exhibit the problem would be the wrong conclusion from
 * the right measurement.
 *
 * **So this is a claim the recording tier has to settle.** When CC0 piano
 * notes land, the test is the same measurement against those: if the skip
 * still changes nothing, it should go.
 */
const ATTACK_FRACTION = 0.25;
/** A struck string's inharmonic opening, from the paragraph above. */
const ATTACK_SECONDS = 0.05;

function pitchOver(
  samples: Float32Array, sampleRate: number, detector: PitchDetector,
  frameSize: number, hop: number,
  span: { from: number; to: number; minClarity: number; silenceDbfs: number },
): { frequencyHz: number | null; clarity: number } {
  const length = span.to - span.from;
  // A fraction of the note, but never more than the attack itself lasts.
  // The last note of a take has no next onset to end it, so its span runs
  // to wherever the player stopped recording — and a quarter of *that* is
  // not a property of the note. At a second of run-on the skip landed past
  // the decay and every frame after it was gated as silence, so the same
  // note read correctly or not at all depending on how long the take went
  // on afterwards. The reason the skip exists is a physical duration —
  // "inharmonic for the first few tens of milliseconds" — so the cap is
  // that duration and the fraction only keeps a sixteenth from being
  // skipped whole.
  const skipSeconds = Math.min(length * ATTACK_FRACTION, ATTACK_SECONDS);
  const to = Math.min(samples.length, Math.floor(span.to * sampleRate));

  const read = (fromSeconds: number) => {
    const readings: number[] = [];
    let best = 0;
    for (let at = Math.floor(fromSeconds * sampleRate); at + frameSize <= to; at += hop) {
      const estimate: PitchEstimate = detector.analyse(samples.subarray(at, at + frameSize));
      if (estimate.levelDbfs < span.silenceDbfs) continue;
      if (estimate.clarity > best) best = estimate.clarity;
      if (estimate.frequencyHz !== null && estimate.clarity >= span.minClarity) {
        readings.push(estimate.frequencyHz);
      }
    }
    return { readings, best };
  };

  let { readings, best } = read(span.from + skipSeconds);
  if (readings.length === 0) {
    // Nothing fit after the skip, which happens when the note is barely
    // longer than one analysis frame — 93 ms at 44.1 kHz, so a note at the
    // end of a take that stops promptly has no room to give any away. A
    // reading taken across the attack is worse than one taken after it and
    // better than none, and the clarity goes up with it so a caller can
    // still tell the difference.
    ({ readings, best } = read(span.from));
  }
  if (readings.length === 0) return { frequencyHz: null, clarity: best };
  readings.sort((a, b) => a - b);
  return { frequencyHz: readings[Math.floor(readings.length / 2)], clarity: best };
}

function concat(chunks: readonly Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}
