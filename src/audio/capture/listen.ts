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
  /**
   * Two attacks closer than this are one attack.
   *
   * Passed through to the detector, which **cannot work it out for
   * itself**: it sees a spectrum and not a tempo. Its default is 50 ms,
   * chosen to refuse the double-trigger of one physical event, and the
   * rhythm generator writes tuplets 47 ms apart — so a perfectly played
   * bar at 160 bpm loses notes with the default, measured in
   * `exercises/rhythm-id/heard.test.ts`.
   *
   * Lowering the default is the wrong fix, because the same number is
   * what merges a piano's attack cluster, which wants a *wider* window.
   * One constant, two jobs, different right answers — so the caller
   * decides, and {@link separationForOnsets} derives it from the music
   * rather than from a guess.
   */
  minSeparationSeconds?: number;
}

/**
 * The widest window that cannot merge two notes the piece actually
 * contains: half the shortest gap written into it.
 *
 * Derived from the written onsets rather than from the tempo, because a
 * tuplet's gap is not a simple fraction of the beat and the tempo alone
 * would get it wrong in exactly the case that exposed this.
 *
 * **A third, and the fraction is not arbitrary.** Two notes written `g`
 * apart, each played up to `j·g` off its time, land `g(1 − 2j)` apart —
 * so a window of `f·g` merges two real notes exactly when `f ≥ 1 − 2j`.
 * The fraction is therefore *one minus twice the timing error the chain
 * intends to tolerate*, which makes it answerable rather than a taste.
 * Measured against the generator's own output, notes lost by jitter:
 *
 *     f = 1/8, 1/4, 1/3   none, out to ±50%
 *     f = 1/2             none to ±20%, losing from ±30%
 *     f = 2/3             losing from ±30%
 *     f = 1               catastrophic
 *
 * Half was the first guess and buys a quarter of a gap of human error;
 * a third buys a third and costs nothing measurable.
 *
 * **What this cannot price is going too narrow**, because the harness
 * that measured it plays clean attacks with no double-trigger. That
 * lower bound is what the detector's fixed 50 ms was for — and under
 * ADR 0035 it is no longer this window's job, because a cluster is
 * merged by note assembly on evidence this layer does not have.
 *
 * Returns undefined for a piece with fewer than two notes, where there
 * is nothing to merge and the detector's own default is as good as any.
 *
 * **This is the mechanism, and it is not yet shown to fix the defect it
 * was written for.** `exercises/rhythm-id/heard.test.ts` measures notes
 * lost at 160 bpm with the default window; nothing yet measures them
 * recovered with this. A first attempt to show it used overlapping
 * plucked strings whose decays produced spurious attacks of their own,
 * so the count moved for reasons unrelated to the window — a harness
 * that cannot see the thing it is measuring, which is worth saying
 * rather than reporting the number it produced.
 *
 * What is settled is the structure: the detector sees a spectrum and
 * cannot know a tempo, the caller does, and one constant was serving two
 * jobs with different right answers. What is not settled is whether
 * halving the shortest gap is the right derivation.
 */
export function separationForOnsets(onsets: readonly number[]): number | undefined {
  if (onsets.length < 2) return undefined;
  let shortest = Infinity;
  for (let i = 1; i < onsets.length; i += 1) {
    shortest = Math.min(shortest, onsets[i] - onsets[i - 1]);
  }
  return Number.isFinite(shortest) && shortest > 0 ? shortest / 3 : undefined;
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

/**
 * A take of a fixed length, which is what a live source needs and `listen`
 * cannot give it.
 *
 * **`CaptureSource.start` resolves when the source has *begun*, not when it
 * has finished** — its own documentation says so, and a microphone honours
 * that literally: the promise settles as soon as permission is granted and
 * the graph is wired, with every frame still to come. `listen` above treats
 * that resolution as the end of the take, which is true only of a source
 * that delivers a whole recording inside `start` and then returns, as
 * `RecordedSource` does. Handed a microphone it returns an empty take
 * immediately.
 *
 * So the length has to come from the caller. An exercise asking someone to
 * play an answer knows how long it is prepared to wait; a device does not.
 *
 * `wait` is injected for the same reason `getMedia` is: a test that really
 * slept for the length of every take would be a suite nobody runs.
 */
export async function listenFor(
  source: CaptureSource, seconds: number, options: ListenForOptions = {},
): Promise<ListenResult> {
  const chunks: Float32Array[] = [];
  // Copied for the reason `listen` copies: the source reuses the buffer.
  await source.start((frame: CaptureFrame) => { chunks.push(new Float32Array(frame.samples)); });
  try {
    await (options.wait ?? sleep)(seconds);
  } finally {
    // In a `finally` because a source left running holds the microphone
    // open, and the recording indicator stays on, whatever went wrong.
    source.stop();
  }
  return analyse(concat(chunks), source.sampleRate, options);
}

export interface ListenForOptions extends ListenOptions {
  /** How to pass the time. Defaults to a real timer. */
  wait?: (seconds: number) => Promise<void>;
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, seconds * 1000); });
}

/** The analysis on its own, for a caller that already has the samples. */
export function analyse(
  samples: Float32Array, sampleRate: number, options: ListenOptions = {},
): ListenResult {
  const minClarity = options.minClarity ?? DEFAULT_MIN_CLARITY;
  const silenceDbfs = options.silenceDbfs ?? DEFAULT_SILENCE_DBFS;
  const durationSeconds = samples.length / sampleRate;

  const { onsets } = detectOnsets(samples, {
    sampleRate, minSeparationSeconds: options.minSeparationSeconds,
  });

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

  return {
    notes: assemble(notes, samples, sampleRate), onsets, durationSeconds, sampleRate,
  };
}

/**
 * Two attacks are the same note when they agree about pitch and the
 * second one did not actually get louder.
 *
 * ADR 0035 puts this in note assembly rather than in the detector, and
 * names the risk it has to survive: a merge rule can swallow a real
 * repeated note, because the same pitch struck twice looks exactly like
 * a cluster. A trill is music a learner will play.
 *
 * **Pitch alone cannot tell those apart.** Twenty-four flux peaks inside
 * one struck A1 all report A1, and so do two deliberate A1s. What
 * separates them is that a new note is an *attack*: the sound gets
 * louder. A flux peak inside a decaying tail does not — the spectrum
 * shifts as partials die at different rates, which is what the detector
 * sees, but the level is flat or falling.
 *
 * So the test is a rise: the peak just after the attack against the peak
 * just before it. Measured, as that ratio:
 *
 *     inside one struck piano note    0.47 … 1.52   (median ~0.95)
 *     a genuinely repeated note       unbounded — the 80 ms before it
 *                                     had decayed to silence
 *
 * including a decrescendo where the repeat is a tenth the volume of the
 * first, which is the case that defeats any rule comparing a note to its
 * predecessor's loudness. A ratio of before-to-after is scale-free, so a
 * quiet note after a loud one still rises.
 *
 * **What this cannot do**, and ADR 0035 says so too: an instrument that
 * does not decay between repeats defeats it. Two slurred notes of the
 * same pitch on a bowed string have neither a pitch change nor a rise,
 * and nothing available at this layer separates them.
 */
const MERGE_CENTS = 60;

/**
 * Below this, the attack did not rise and is part of the sound before it.
 *
 * Sits in a gap between 1.52 and unbounded, so it is a measurement
 * rather than a weight — but it is one library's piano, which is the
 * fifth convention applied to the evidence this rests on.
 */
const NEW_NOTE_RISE = 2;

/** How long before and after an attack the rise is measured over. */
const RISE_BEFORE_SECONDS = 0.08;
const RISE_AFTER_SECONDS = 0.03;

function assemble(
  notes: readonly HeardNote[], samples: Float32Array, sampleRate: number,
): HeardNote[] {
  const out: HeardNote[] = [];
  for (const note of notes) {
    const previous = out[out.length - 1];
    if (previous && sameSound(previous, note, samples, sampleRate)) {
      // The attack is the first one's; the sound runs to the end of this.
      previous.durationSeconds = note.startSeconds + note.durationSeconds
        - previous.startSeconds;
      previous.clarity = Math.max(previous.clarity, note.clarity);
      continue;
    }
    out.push({ ...note });
  }
  return out;
}

function sameSound(
  a: HeardNote, b: HeardNote, samples: Float32Array, sampleRate: number,
): boolean {
  if (a.frequencyHz === null || b.frequencyHz === null) return false;
  if (Math.abs(1200 * Math.log2(b.frequencyHz / a.frequencyHz)) > MERGE_CENTS) return false;

  const before = peakOver(
    samples, b.startSeconds - RISE_BEFORE_SECONDS, b.startSeconds - 0.005, sampleRate,
  );
  // Nothing before it at all is a first attack, not a continuation.
  if (before <= 0) return false;
  const after = peakOver(
    samples, b.startSeconds, b.startSeconds + RISE_AFTER_SECONDS, sampleRate,
  );
  return after / before < NEW_NOTE_RISE;
}

function peakOver(
  samples: Float32Array, fromSeconds: number, toSeconds: number, sampleRate: number,
): number {
  const from = Math.max(0, Math.floor(fromSeconds * sampleRate));
  const to = Math.min(samples.length, Math.floor(toSeconds * sampleRate));
  let peak = 0;
  for (let i = from; i < to; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
  return peak;
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
  /*
    Two independent corrections, both measured, and they compose.

    **The skip is capped at the attack's own length.** A fraction alone
    made the last note of every take read against when the player stopped
    recording: it has no next onset to end it, so its span runs to the end
    of the tape and a quarter of *that* is not a property of the note. At
    a second of run-on the skip landed past the decay and every frame
    after it was gated as silence, so the same note read correctly or not
    at all depending on how long the take went on. The reason the skip
    exists is a physical duration, so the cap is that duration; the
    fraction now only keeps a sixteenth from being skipped whole.

    **The window is at least one analysis frame.** `frameSizeFor` is 8192
    samples at 44.1 kHz — 186 ms — because the detector has to resolve a
    30 Hz fundamental, so a segment shorter than that fits no frame and
    the loop below never ran. The note came back with no pitch, silently,
    and indistinguishably from one nobody played. Measured on recorded
    piano, where it is the difference between hearing nothing and hearing
    the note: a hammer strike produces several flux peaks, so one struck
    note is cut into several short segments and every one was unpitchable.

    Reading on past `span.to` is a statement about the *segmentation*
    rather than about the pitch. A segment shorter than one frame is not
    a note — nothing that short can be played — so the audio beyond it
    belongs to the same sound. Where segments are real and merely fast
    this reads into the next note, which is the honest cost and is why it
    is a floor rather than a window.
  */
  const skipSeconds = Math.min(length * ATTACK_FRACTION, ATTACK_SECONDS);
  const minimum = Math.floor((span.from + skipSeconds) * sampleRate) + frameSize;
  const to = Math.min(samples.length, Math.max(Math.floor(span.to * sampleRate), minimum));

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
