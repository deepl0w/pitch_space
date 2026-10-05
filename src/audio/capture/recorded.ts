import { framesOf, type CaptureFrame, type CaptureSource } from './source';

/**
 * A capture source fed by a recording rather than a device.
 *
 * The test tier's microphone, and the only one that can say anything about
 * accuracy — ADR 0008's point is that a browser's fake input is a beep and
 * host audio never reaches an emulator, so a real recording played through
 * the real analysis path is the strongest claim available off-device.
 *
 * It delivers synchronously and as fast as the consumer accepts, rather
 * than pacing itself to the sample rate. A test that waited out eleven
 * seconds of piano to check one onset would be a test nobody runs, and the
 * analysis does not read the clock: every time it reports comes from
 * `startSeconds`, which is counted from samples. Pacing would change how
 * long the test takes and nothing about what it concludes.
 */
export class RecordedSource implements CaptureSource {
  readonly sampleRate: number;
  readonly frameSize: number;

  private readonly samples: Float32Array;
  private stopped = false;

  constructor(options: { samples: Float32Array; sampleRate: number; frameSize: number }) {
    this.samples = options.samples;
    this.sampleRate = options.sampleRate;
    this.frameSize = options.frameSize;
  }

  async start(onFrame: (frame: CaptureFrame) => void): Promise<void> {
    this.stopped = false;
    for (const frame of framesOf(this.samples, this.frameSize, this.sampleRate)) {
      // Checked each time rather than once: a consumer may stop in
      // response to what it just heard, and delivering the rest of the
      // recording after that is the difference between "stop listening"
      // and "stop listening eventually".
      if (this.stopped) return;
      onFrame(frame);
    }
  }

  stop(): void {
    this.stopped = true;
  }
}
