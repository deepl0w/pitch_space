import { useState } from 'react';
import { entryFor } from '../menu';
import { Actions, Field, Panel, Readout } from '../controls';
import { appSynth } from '../sound';
import { settingsStore, useSettings } from '../../state/settingsStore';
import { CALIBRATION_MESSAGES } from '../../audio/dsp/calibration';
import {
  MEASURE_MESSAGES, measureInputLatency, type MeasureOutcome,
} from '../../audio/capture/measureLatency';

const entry = entryFor('calibration');

/**
 * What the round trip costs, measured or typed.
 *
 * The screen ADR 0018 is about. Three things it has to get right, none of
 * them about the measurement:
 *
 * **Not calibrated is a state, not a zero.** The readout says "not measured"
 * rather than "0 ms", because those are different facts and the second is a
 * claim about the user's hardware that nobody checked.
 *
 * **Nothing here is required.** A musician who opens this, reads it and
 * leaves has done nothing wrong, and the app says so rather than nagging.
 * Blocking a first exercise behind a setup step is a worse first run than
 * slightly-off rhythm scores.
 *
 * **A refusal is the normal outcome of a measurement in a noisy room**, so
 * the failure text is as carefully written as the success text and says what
 * to do differently.
 */
export function Calibration({ measureWith = measureInputLatency }: {
  /**
   * Injected so a test can make the measurement fail, which is the one
   * path that cannot be reached otherwise — the same reason a prompt is
   * handed its `audio` and `measureInputLatency` is handed its `getMedia`.
   */
  measureWith?: typeof measureInputLatency;
  /**
   * Accepted and unused, because every screen is handed it. This one is
   * reached from settings and its back link goes to the home screen like
   * every other, which is the behaviour that was already there.
   */
  go?(route: string): void;
} = {}) {
  const audio = useSettings((s) => s.doc.audio);
  const [state, setState] = useState<'idle' | 'measuring'>('idle');
  const [outcome, setOutcome] = useState<MeasureOutcome | null>(null);
  const [typed, setTyped] = useState('');

  /**
   * Always returns the button to a state the user can act from.
   *
   * It did not. `measureInputLatency` resolves with a refusal for every
   * failure it anticipates, so this read as though it could not reject —
   * but the audio graph it builds can throw, and then the await rejected,
   * `setState('idle')` never ran, and the button sat on "Listening…" for
   * ever with no error and no way back. Found by the user role, which saw
   * it hang past forty seconds in a real room against a measurement that
   * takes five.
   *
   * The `finally` is the fix and the `catch` is the courtesy: a screen
   * that stops responding tells the user nothing, and the one thing it can
   * always say is that the automatic path did not work and the box below
   * still does.
   */
  async function measure() {
    setState('measuring');
    setOutcome(null);
    try {
      const result = await measureWith({ synth: appSynth });
      setOutcome(result);
      if (result.ok) {
        settingsStore.getState().setInputLatency(result.latencySeconds * 1000, 'measured');
      }
    } catch {
      setOutcome({ ok: false, reason: 'unsupported' });
    } finally {
      setState('idle');
    }
  }

  function applyTyped() {
    const ms = Number(typed);
    if (!Number.isFinite(ms) || ms < 0 || ms > 500) return;
    settingsStore.getState().setInputLatency(ms, 'manual');
    setTyped('');
  }

  return (
    <>
      <header>
        <h1>{entry.name}</h1>
        <p className="lede">{entry.lede}</p>
      </header>

      <Panel>
        <Readout
          title="Current setting"
          items={[
            {
              // Null and zero read differently on purpose. "Not measured" is
              // the honest description of most devices, and "0 ms" would be
              // a claim about hardware nobody checked.
              primary: audio.inputLatencyMs === null
                ? 'Not measured'
                : `${audio.inputLatencyMs.toFixed(0)} ms`,
              secondary: audio.source === 'measured' ? 'measured on this device'
                : audio.source === 'manual' ? 'set by you'
                  : 'rhythm timing is judged without allowing for it',
            },
          ]}
        />

        <p className="secondary">
          Your device takes a moment to get sound from the microphone into the
          app, and it will not say how long. Until this is measured, rhythm
          exercises judge your timing without allowing for it — so you may
          read as slightly late when you were not.{' '}
          <strong>Nothing here is required.</strong> Everything works without it.
        </p>
      </Panel>

      <Panel>
        <Actions>
          <button type="button" onClick={() => void measure()} disabled={state === 'measuring'}>
            {state === 'measuring' ? 'Listening…' : 'Measure it'}
          </button>
          {audio.inputLatencyMs !== null && (
            <button
              type="button"
              onClick={() => settingsStore.getState().setInputLatency(null, 'manual')}
            >
              Forget it
            </button>
          )}
        </Actions>
        <p className="secondary">
          Plays six clicks and listens for them coming back. Needs the
          microphone, and the sound playing <strong>out loud</strong> rather
          than through headphones — the microphone has to be able to hear it.
        </p>

        {outcome !== null && <Verdict outcome={outcome} />}
      </Panel>

      <Panel>
        <Field label="Or set it by hand (ms)">
          <input
            type="number"
            min={0}
            max={500}
            step={5}
            value={typed}
            placeholder="e.g. 60"
            onChange={(e) => setTyped(e.target.value)}
          />
        </Field>
        <Actions>
          <button type="button" onClick={applyTyped} disabled={typed.trim() === ''}>
            Use this
          </button>
        </Actions>
        <p className="secondary">
          Worth doing if measuring will not work where you are. Most built-in
          hardware is somewhere between 20 and 100 ms; Bluetooth is usually
          worse and sometimes much worse.
        </p>
      </Panel>
    </>
  );
}

/**
 * What the attempt produced, said in the user's terms.
 *
 * A refusal gets as much room as a success, and names the remedy rather than
 * the cause: "something else may be making noise nearby" is actionable and
 * "interquartile range exceeded tolerance" is not.
 */
function Verdict({ outcome }: { outcome: MeasureOutcome }) {
  if (outcome.ok) {
    return (
      <p className="verdict right">
        {`Measured ${(outcome.latencySeconds * 1000).toFixed(0)} ms`}
        {outcome.spreadSeconds > 0.001
          && `, give or take ${(outcome.spreadSeconds * 1000).toFixed(0)}`}
        {` — from ${outcome.heard} of ${outcome.sent} clicks. Saved.`}
      </p>
    );
  }
  const message = outcome.reason in MEASURE_MESSAGES
    ? MEASURE_MESSAGES[outcome.reason as keyof typeof MEASURE_MESSAGES]
    : CALIBRATION_MESSAGES[outcome.reason as keyof typeof CALIBRATION_MESSAGES];
  return <p className="verdict wrong">{message}</p>;
}
