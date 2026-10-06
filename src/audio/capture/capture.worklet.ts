/**
 * The audio thread's half of capture: forward frames and do nothing else.
 *
 * A worklet rather than a `ScriptProcessor` because this runs for the
 * whole of a take. ScriptProcessor delivers on the main thread, so a
 * React render or a VexFlow redraw lands between two buffers and audio
 * arrives late or not at all — and the one thing a capture path must not
 * do is lose samples while the page is busy drawing the notes the player
 * is reading.
 *
 * It deliberately contains no analysis. Everything decidable off the
 * audio thread is decided off it: a worklet that overruns its quantum
 * drops audio for everyone, and analysis in here would be the one part
 * of the chain no test could reach.
 *
 * Not typechecked against the DOM lib — a worklet has its own globals
 * and none of the project's other files may use them, so the handful it
 * needs are declared here rather than widening `lib` for everything.
 */

interface Processor { readonly port: MessagePort }

declare const sampleRate: number;
declare const AudioWorkletProcessor: { new(): Processor };
declare function registerProcessor(name: string, ctor: new () => Processor): void;

/** Matches `MicrophoneSource.frameSize`; the host is told, it does not guess. */
const FRAME = 1024;

class CaptureProcessor extends AudioWorkletProcessor {
  private readonly buffer = new Float32Array(FRAME);
  private filled = 0;
  /** Samples forwarded so far, which is how the host times each frame. */
  private sent = 0;

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    // No input before the stream connects is normal; staying alive is the
    // difference between a slow microphone and a dead node.
    if (!channel) return true;

    for (let i = 0; i < channel.length; i += 1) {
      this.buffer[this.filled] = channel[i];
      this.filled += 1;
      if (this.filled < FRAME) continue;
      // A copy, because the transfer is asynchronous and this buffer is
      // refilled on the next quantum.
      const samples = new Float32Array(this.buffer);
      this.port.postMessage(
        { samples, startSeconds: this.sent / sampleRate }, [samples.buffer],
      );
      this.sent += FRAME;
      this.filled = 0;
    }
    return true;
  }
}

registerProcessor('capture', CaptureProcessor);
