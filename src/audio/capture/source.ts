/**
 * Where captured sound comes from, and the one thing the analysis knows
 * about it.
 *
 * A source hands over frames of mono audio and says at what rate. Nothing
 * downstream knows whether they came from a microphone, a file, or a
 * generator — which is the point rather than tidiness: the hard part of
 * answering by playing is deciding when a note started and what it was,
 * and that part has to be testable without a device.
 *
 * ADR 0008 is the reason this is not merely convenient. A browser's fake
 * microphone is a 440 Hz beep, so a browser test proves the plumbing and
 * nothing about accuracy; host audio does not reach an emulator's input
 * at all. A recording played through this interface is therefore the
 * *better* input for everything except `getUserMedia` itself, and the
 * untestable part shrinks to the part that genuinely needs hardware.
 */

/** One block of mono samples, with the moment its first sample was captured. */
export interface CaptureFrame {
  /**
   * Mono samples, nominally in [-1, 1] and **not guaranteed to be**.
   *
   * Web Audio is floating point and does not clamp: a loud source, or a
   * device with gain applied before the browser sees it, delivers
   * samples outside the range. Measured at 1.13 from Chrome's own fake
   * capture device on the first run of a real microphone — so this is
   * the ordinary case and not an abuse. Anything here that assumed full
   * scale meant one would be wrong about level, which is how a silence
   * gate comes to be set against a number that does not hold.
   *
   * Owned by the source and reused between frames, because allocating a
   * buffer per frame at 86 frames a second is how a capture path starts
   * dropping audio. A consumer that keeps one must copy it.
   */
  readonly samples: Float32Array;
  /**
   * Seconds from the start of capture to this frame's first sample.
   *
   * Counted from the frames themselves rather than read from a clock: a
   * clock tells you when the frame was *handled*, which includes however
   * long the previous consumer took, and the whole grading path measures
   * differences between onsets. Derived from the sample count, the
   * spacing is exact by construction.
   */
  readonly startSeconds: number;
}

export interface CaptureSource {
  /** Measured, not assumed: a device may refuse the rate that was asked for. */
  readonly sampleRate: number;
  /** Samples per frame. Constant for the life of the source. */
  readonly frameSize: number;
  /**
   * Begin, calling `onFrame` for each frame until `stop`.
   *
   * Asynchronous because a microphone needs permission and a file needs
   * reading, and a caller that cannot await either has to guess.
   */
  start(onFrame: (frame: CaptureFrame) => void): Promise<void>;
  /** Stop and release whatever was held. Safe to call when not started. */
  stop(): void;
}

/**
 * Cut a signal into frames the way a device would.
 *
 * Shared by the file source and the tests, and exported because the
 * framing is the part most likely to be wrong in a way nothing notices:
 * a gap loses audio, an overlap counts it twice, and either reads
 * downstream as a timing error in the player rather than a bug here.
 *
 * The last frame is zero-padded rather than dropped. A dropped tail
 * silently shortens the recording, which would make every onset near the
 * end untestable; padding is audible as silence and is what a device
 * does when the stream ends mid-frame.
 */
export function* framesOf(
  samples: Float32Array, frameSize: number, sampleRate: number,
): Generator<CaptureFrame> {
  if (frameSize <= 0) throw new Error(`Frame size must be positive, got ${frameSize}`);
  if (sampleRate <= 0) throw new Error(`Sample rate must be positive, got ${sampleRate}`);
  for (let start = 0; start < samples.length; start += frameSize) {
    const frame = new Float32Array(frameSize);
    frame.set(samples.subarray(start, Math.min(start + frameSize, samples.length)));
    yield { samples: frame, startSeconds: start / sampleRate };
  }
}
