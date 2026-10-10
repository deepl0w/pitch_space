import { listenFor } from '../audio/capture/listen';
import { MicrophoneSource } from '../audio/capture/microphone';
import type { CaptureSource } from '../audio/capture/source';
import type { AudioIn, Heard } from '../exercises/types';

/**
 * The app's microphone, as an exercise is allowed to see it.
 *
 * This is the composition root's half of the capture seam, and the reason
 * the seam exists: `AudioIn` is declared in `exercises/types.ts` and nothing
 * under `exercises/` imports `audio/capture`, so an exercise is written
 * against a one-method interface and this file is where that interface meets
 * a real device. The same arrangement `AudioOut` and `ui/sound.ts` already
 * have, for the same reason — a prompt has to render under jsdom, which has
 * neither an `AudioContext` nor a microphone.
 *
 * **A fresh source per take rather than one held open.** A microphone that
 * stays open keeps the browser's recording indicator lit between questions,
 * which is both alarming and, in a practice app, untrue: the app is not
 * listening while you read the next exercise. Opening costs a permission
 * check the browser has already answered and an `AudioContext` that is torn
 * down with it, which is a fraction of the take it precedes.
 */

/**
 * How long a listening prompt is given before the take is cut.
 *
 * Not a guess at how long a player takes — that is the exercise's business
 * and it passes its own figure — but the ceiling this module imposes when
 * asked for something unreasonable. A take is held entirely in memory as
 * `Float32Array` chunks at the device's rate, so thirty seconds at 48 kHz is
 * about six megabytes; the analysis that follows is over the whole buffer,
 * and `detectOnsets` adapting its threshold over a minute of mostly silence
 * is a worse reading than over the ten seconds that held the answer.
 */
export const LONGEST_TAKE_SECONDS = 30;

/**
 * An `AudioIn` over whatever source is handed to it.
 *
 * The factory is a parameter rather than a `new MicrophoneSource()` inlined
 * below, and that is the whole of what makes this file testable: the two
 * branches worth having are a device that refuses and a device that is not
 * there, and neither can be produced under jsdom by any arrangement of a
 * real `MicrophoneSource`. A suite that could not reach them would be
 * asserting the happy path of the one function here whose job is the
 * unhappy ones.
 *
 * A factory rather than a source, because a take opens and releases its own
 * device — see above.
 */
export function microphoneIn(options: MicrophoneInOptions = {}): AudioIn {
  return { listen: (seconds: number) => take(options, seconds) };
}

export interface MicrophoneInOptions {
  /** Where a take's device comes from. Defaults to a real microphone. */
  source?: () => CaptureSource;
  /**
   * How a take passes its length. Defaults to a real timer.
   *
   * Injected for the same reason `source` is, and it is not the same
   * reason: a test can reach the refusal branches without this, but every
   * one of them would sit through the take first. A suite that really
   * spent four seconds per listening case is a suite that gets run less
   * often, which is the slow way of having no tests at all.
   */
  wait?: (seconds: number) => Promise<void>;
}

/** Opens a microphone, records for `seconds`, and reports what it heard. */
export const appMicrophone: AudioIn = microphoneIn();

async function take(options: MicrophoneInOptions, seconds: number): Promise<Heard> {
  try {
    const source = (options.source ?? (() => new MicrophoneSource()))();
    const result = await listenFor(source, Math.min(seconds, LONGEST_TAKE_SECONDS), {
      wait: options.wait,
    });
    /*
      Spread, not wrapped. `ListenResult` is a structural superset of what
      the `heard: true` arm carries, so the real result goes up unchanged
      with the one bit added — which is the property `captureSeam.test.ts`
      pins and the reason `PlayedNote` is declared rather than imported. A
      conversion function here would be the place the two quietly diverge.
    */
    return { heard: true, ...result };
  } catch (error) {
    /*
      Every failure is an outcome, never an exception the caller has to
      field. ADR 0047 is about the consequence of getting this wrong: a
      refused microphone that reaches the exercise as a wrong answer resets
      the item's streak and drags the figure on the home card, so the one
      thing this must not do is resolve in a way that reads as a silent
      room.

      `stop` has already run in `listenFor`'s `finally`, so a device that
      was opened is released before this branch is reached. Constructing the
      source is inside the `try` as well, since a browser with no
      `AudioContext` at all throws there rather than in `start`.
    */
    return { heard: false, reason: refused(error) ? 'refused' : 'unavailable' };
  }
}

/**
 * Telling "you said no" from "there was nothing to listen with".
 *
 * The same split `measureLatency.ts` makes and for the same reason — the
 * remedies are different and neither is guessable — narrowed to the two
 * words `Heard` carries. Everything that is not a refusal is lumped
 * together deliberately: a missing device, a browser without
 * `AudioWorklet`, and a worklet that failed to load are indistinguishable
 * to the person holding the instrument, and all three mean the same thing
 * to them.
 */
function refused(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError';
}
