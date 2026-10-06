import type { CaptureFrame, CaptureSource } from './source';
import workletUrl from './capture.worklet.ts?worker&url';

/**
 * The microphone, as a {@link CaptureSource}.
 *
 * The one implementation that needs a browser, and deliberately the
 * smallest thing in `capture/`. Everything that decides anything — when a
 * note started, what it was, whether two attacks are one note — is in
 * `listen.ts`, which takes a source and never knows which one. ADR 0008
 * is why: a browser's fake microphone is a 440 Hz beep, so a test driving
 * this can only prove the plumbing, and the less that is true of, the
 * more of the chain is actually checked.
 *
 * So this class is: ask for the microphone, start a worklet, forward what
 * it sends. It has no fallback path and no analysis, and a test of it can
 * only say that frames arrive.
 */
export interface MicrophoneOptions {
  /** Injected so a test can supply a stream; defaults to the real device. */
  getMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

/**
 * All three off, inherited from the tuner's ADR 0002 rather than chosen.
 *
 * It measured the same tone at −26 dBFS through the processed source and
 * −59 through the raw one, and automatic gain distorts a decaying string's
 * pitch — which is the whole signal here. These are requests and not
 * guarantees; what the browser actually applied is read back below,
 * because a refused constraint is a thing the player should be told about
 * rather than a silent change to what they are being judged on.
 */
const CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};

export class MicrophoneSource implements CaptureSource {
  /** Not known until the device answers; `start` fills both in. */
  sampleRate = 0;
  readonly frameSize = 1024;

  /**
   * What the browser actually applied, which is not what was asked for.
   *
   * Populated by `start`. A device that refused `autoGainControl` is
   * still usable and the player is entitled to know, so this is reported
   * rather than thrown on.
   */
  applied: MediaTrackSettings | null = null;

  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;

  private readonly options: MicrophoneOptions;

  // A plain field rather than a parameter property: `erasableSyntaxOnly`
  // is on, so the shorthand is not available here.
  constructor(options: MicrophoneOptions = {}) {
    this.options = options;
  }

  async start(onFrame: (frame: CaptureFrame) => void): Promise<void> {
    const getMedia = this.options.getMedia
      ?? ((c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c));

    this.stream = await getMedia(CONSTRAINTS);
    this.applied = this.stream.getAudioTracks()[0]?.getSettings() ?? null;

    // Its own context rather than the synth's. The synth's exists to play
    // and may be suspended or running at a rate chosen for output; capture
    // wants whatever the device gives, and `sampleRate` below is read back
    // rather than requested for exactly that reason.
    const context = new AudioContext();
    this.context = context;
    /*
      The context's rate, not the track's, and they disagree.

      Measured on Chrome: the context reported 48000 while the track's
      own settings said 44100, for the same stream. The worklet runs at
      the context's rate and times its frames from it, so that is the
      one every downstream second is counted in — reading
      `applied.sampleRate` instead would put every onset out by nine per
      cent, which is a tenth of a semitone on a pitch and a whole
      sixteenth over a bar.
    */
    this.sampleRate = context.sampleRate;

    await context.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNode(context, 'capture');
    this.node = node;
    node.port.onmessage = (event: MessageEvent<CaptureFrame>) => onFrame(event.data);

    context.createMediaStreamSource(this.stream).connect(node);
    // Connected to the destination through a silent gain: a worklet with
    // no sink is not pulled, and routing the microphone to the speakers
    // for real would be a feedback loop in a room with a microphone open.
    const silent = context.createGain();
    silent.gain.value = 0;
    node.connect(silent).connect(context.destination);
  }

  stop(): void {
    this.node?.port.close();
    this.node?.disconnect();
    this.node = null;
    // Tracks first: releasing the device is what turns the recording
    // indicator off, and a user who pressed stop should see that happen
    // rather than wait for a context to close.
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
  }
}
