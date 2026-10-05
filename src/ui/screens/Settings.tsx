import { entryFor } from '../menu';
import { Field, OneOf, Panel } from '../controls';
import { appSynth } from '../sound';
import { settingsStore, useSettings } from '../../state/settingsStore';

const entry = entryFor('settings');

/**
 * The preferences that are not about a particular exercise.
 *
 * Everything an exercise asks lives in its own panel beside the question,
 * where it can be changed while looking at what it changes. What is left
 * over is the app itself — how it looks, how loud it is, what it knows
 * about the hardware — and that had nowhere to live, so audio calibration
 * sat on the home screen beside the exercises as though it were one.
 *
 * Two of the rows below are not built. They are here rather than omitted
 * because the shape of the screen is the useful part: a reader can see
 * where the instrument picker will go, and `docs/ROADMAP.md` says what each
 * is waiting on. A row that says "not yet, and here is why" is honest; a
 * row that looks live and is not is the defect this project keeps finding,
 * so these are plainly inert rather than disabled-looking controls.
 */
export function Settings({ go }: { go(route: string): void }) {
  const appearance = useSettings((s) => s.doc.appearance);
  const audio = useSettings((s) => s.doc.audio);
  const persisting = useSettings((s) => s.persisting);

  function setTheme(theme: string) {
    if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return;
    settingsStore.getState().setAppearance({ theme });
  }

  function setVolume(percent: string) {
    const volume = Number(percent) / 100;
    settingsStore.getState().setAppearance({ volume });
    // Pushed into the engine as well as stored, so the change is audible on
    // the next sound rather than on the next reload. `App` does the same on
    // load; this is the live half.
    appSynth.setVolume(volume);
  }

  const latency = audio.inputLatencyMs === null
    ? 'Not measured'
    : `${Math.round(audio.inputLatencyMs)} ms`;

  return (
    <>
      <header>
        <h1>{entry.name}</h1>
        {entry.lede && <p className="lede">{entry.lede}</p>}
      </header>

      {!persisting && (
        <p className="warning">
          Your saved settings were written by a later version of this app, so
          nothing changed here will be kept. Everything still works for this
          session.
        </p>
      )}

      <Panel>
        <Field label="Theme">
          <OneOf
            options={[
              { id: 'system', label: 'System' },
              { id: 'light', label: 'Light' },
              { id: 'dark', label: 'Dark' },
            ]}
            chosen={appearance.theme}
            onChange={setTheme}
          />
        </Field>
      </Panel>

      <Panel>
        <Field label="Volume">
          <OneOf
            options={[0, 25, 50, 75, 100].map((n) => ({ id: `${n}`, label: `${n}%` }))}
            chosen={`${Math.round(appearance.volume * 100)}`}
            onChange={setVolume}
          />
        </Field>
      </Panel>

      <Panel>
        <Field label="Audio calibration">
          <p className="secondary">
            What your device&rsquo;s microphone delay costs, so rhythm is judged
            against what you played. Currently: <strong>{latency}</strong>.
          </p>
        </Field>
        {/* Inside the panel it belongs to: it sat outside, so the one
            control on this screen that opens another one floated between
            two cards and read as belonging to neither. */}
        <div className="actions">
          <button type="button" onClick={() => go('calibration')}>
            Measure the delay
          </button>
        </div>
      </Panel>

      <Panel>
        <Field label="Instrument">
          <p className="secondary">
            One synthesised instrument for now. Sampled instruments are
            planned — see <code>docs/ROADMAP.md</code> — and are waiting on a
            sample pack small enough to keep the app working offline.
          </p>
        </Field>
      </Panel>

      <Panel>
        <Field label="Your history">
          <p className="secondary">
            Attempts are recorded on this device and nowhere else. Taking them
            with you is planned, and waits on the spaced repetition that would
            make them worth carrying.
          </p>
        </Field>
      </Panel>
    </>
  );
}
