import { estimateInputLatency, type CalibrationOutcome } from '../dsp/calibration';
import type { Synth } from '../output/synth';

/**
 * The one part of calibration that needs a device, kept as small as it can be.
 *
 * Everything that decides anything lives in `dsp/calibration.ts`, which is
 * pure and tested against recordings with known latencies. This file plays
 * clicks, records, and hands both to that. It is deliberately thin because
 * **it cannot be tested here**: headless Chrome has no audio device and
 * Node has no `AudioContext`, so the only honest verification is a person
 * with a phone. ADR 0008 made that argument for the tuner's detector and it
 * applies unchanged.
 *
 * It is also the first thing in the app to ask for a microphone, which makes
 * it the first use of the capture layer ADR 0012 specified. The seam it
 * establishes — raw samples and a sample rate, nothing else — is the one the
 * rest of capture will widen.
 */

/** How many clicks, and how far apart. */
const CLICKS = 6;
const GAP_SECONDS = 0.7;
/** A beat of headroom before the first click, so the graph is awake. */
const LEAD_SECONDS = 0.35;
/** Long enough for the last click's echo to arrive however slow the device. */
const TAIL_SECONDS = 0.8;

/**
 * The longest the whole thing may take, whatever the audio graph is doing.
 *
 * The run is 5.35 s of scheduled sound and the wait is computed from the
 * audio clock, so in principle it cannot overrun. In practice a user
 * watched it sit past forty seconds, and a setup screen with no way out is
 * worse than one that admits defeat. A ceiling costs nothing when the
 * normal path takes a third of it.
 */
const DEADLINE_SECONDS = 20;

/** A bright, short click. High, because a room's noise is mostly low. */
const CLICK_MIDI = 93;

export type MeasureFailure =
  /** The user said no, or the browser refused without asking. */
  | 'no-permission'
  /** No microphone at all, or it was taken by something else. */
  | 'no-device'
  /** The browser has no capture API — an old WebView, or an insecure origin. */
  | 'unsupported'
  /** The audio graph never finished, however long it was given. */
  | 'timed-out';

export type MeasureOutcome = CalibrationOutcome | { ok: false; reason: MeasureFailure };

export interface MeasureDeps {
  /** The app's one synth, so the clicks and the clock are the same ones. */
  synth: Synth;
  /** Injected so a test can supply a stream; the browser's by default. */
  getMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

/**
 * The capture constraints, which matter more here than anywhere.
 *
 * All three processors off. The tuner measured the same tone at −26 dBFS
 * through a processed source and −59 dBFS through a raw one, and echo
 * cancellation in particular would do exactly the wrong thing to this
 * measurement: it exists to remove the speaker's output from the
 * microphone's input, and the speaker's output *is* the signal.
 */
const CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
};

/**
 * Play clicks, record them coming back, and say what the round trip cost.
 *
 * Resolves with a refusal rather than rejecting, because every way this can
 * fail is something to tell the user about rather than an exception for a
 * boundary to swallow.
 */
export async function measureInputLatency(deps: MeasureDeps): Promise<MeasureOutcome> {
  const getMedia = deps.getMedia
    ?? (typeof navigator !== 'undefined' && navigator.mediaDevices
      ? (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c)
      : undefined);
  if (!getMedia) return { ok: false, reason: 'unsupported' };

  let stream: MediaStream;
  try {
    stream = await getMedia(CONSTRAINTS);
  } catch (error) {
    return { ok: false, reason: permissionReason(error) };
  }

  try {
    return await Promise.race([
      run(deps.synth, stream),
      // Resolves rather than rejects: a timeout is a thing to tell the user
      // about, not an exception for a boundary to swallow — the same rule
      // every other failure here follows.
      new Promise<MeasureOutcome>((resolve) => {
        setTimeout(
          () => resolve({ ok: false, reason: 'timed-out' }),
          DEADLINE_SECONDS * 1000,
        );
      }),
    ]);
  } finally {
    // Always, including when the estimate throws: a live microphone after a
    // settings screen has closed is the kind of thing a user notices in
    // their browser's tab indicator and does not forgive.
    for (const track of stream.getTracks()) track.stop();
  }
}

async function run(synth: Synth, stream: MediaStream): Promise<MeasureOutcome> {
  // `prepare` rather than reading `audioContext`, which is null until
  // something has played. Calibration records before it hears anything, so
  // on a fresh page that read gave null and this reported the browser as
  // unable to record — in a browser that was perfectly willing. Found by
  // the user role, against a real microphone, on the first sweep.
  let context: AudioContext;
  try {
    context = await synth.prepare();
  } catch {
    return { ok: false, reason: 'unsupported' };
  }

  const source = context.createMediaStreamSource(stream);
  const recorder = context.createScriptProcessor?.(4096, 1, 1);
  if (!recorder) return { ok: false, reason: 'unsupported' };

  const chunks: Float32Array[] = [];
  // The recording's own zero. Every trial time below is relative to this, so
  // the estimator's two timelines are the same one — the correspondence it
  // says it cannot check for itself.
  const startedAt = context.currentTime;
  recorder.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(recorder);
  // Through a silent gain rather than straight to the destination:
  // ScriptProcessor needs a sink to pull it, and routing the microphone to
  // the speakers during a latency test would be a feedback loop.
  const sink = context.createGain();
  sink.gain.value = 0;
  recorder.connect(sink);
  sink.connect(context.destination);

  const trials = Array.from({ length: CLICKS }, (_, i) => ({
    emittedAtSeconds: LEAD_SECONDS + i * GAP_SECONDS,
  }));
  synth.play(trials.map((t) => ({
    midi: CLICK_MIDI, start: t.emittedAtSeconds, duration: 0.08,
  })));

  const total = LEAD_SECONDS + CLICKS * GAP_SECONDS + TAIL_SECONDS;
  await waitUntil(context, startedAt + total);

  recorder.disconnect();
  source.disconnect();
  sink.disconnect();
  recorder.onaudioprocess = null;

  return estimateInputLatency({
    samples: join(chunks),
    sampleRate: context.sampleRate,
    trials,
  });
}

/** Against the audio clock rather than the wall clock, which can drift from it. */
function waitUntil(context: BaseAudioContext, when: number): Promise<void> {
  const remainingMs = Math.max(0, (when - context.currentTime) * 1000);
  return new Promise((resolve) => setTimeout(resolve, remainingMs + 50));
}

function join(chunks: readonly Float32Array[]): Float32Array {
  let length = 0;
  for (const c of chunks) length += c.length;
  const out = new Float32Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/**
 * Telling "you said no" from "there is nothing to record with".
 *
 * Worth the branch because the remedies are different and neither is
 * guessable: one is a permission to grant, the other is a device to plug in.
 */
function permissionReason(error: unknown): MeasureFailure {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'no-permission';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-device';
  return 'no-device';
}

export const MEASURE_MESSAGES: Record<MeasureFailure, string> = {
  'no-permission':
    'The microphone was not allowed. Calibration needs to hear the clicks '
    + 'come back; you can set the delay by hand instead.',
  'no-device':
    'No microphone was available. Plug one in, or set the delay by hand.',
  unsupported:
    'This browser will not let the app record. You can set the delay by hand.',
  'timed-out':
    'The measurement did not finish. Try turning the volume up, or set the '
    + 'delay by hand.',
};
