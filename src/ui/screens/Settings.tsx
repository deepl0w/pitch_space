import { entryFor } from '../menu';
import { Field, OneOf, Panel, Slider } from '../controls';
import { INSTRUMENTS } from '../../audio/output/instruments';
import { PACKS, hasPack } from '../../audio/output/sampled';
import { appSynth } from '../sound';
import { settingsStore, useSettings } from '../../state/settingsStore';

const entry = entryFor('settings');

/** The packs this build produced, in the order the picker shows them. */
const RECORDED = PACKS;

/**
 * The preferences that are not about a particular exercise.
 *
 * Everything an exercise asks lives in its own panel beside the question,
 * where it can be changed while looking at what it changes. What is left
 * over is the app itself — how it looks, how loud it is, what it knows
 * about the hardware — and that had nowhere to live, so audio calibration
 * sat on the home screen beside the exercises as though it were one.
 *
 * One row below is not built — exporting your history — and it is here
 * rather than omitted because a row that says "not yet, and here is why"
 * is honest, while a row that looks live and is not is the defect this
 * project keeps finding. `docs/ROADMAP.md` says what it waits on.
 *
 * The instrument picker used to be the other one, and this comment went
 * on describing it as a placeholder after it had been built. A comment
 * that narrates the screen's contents has to be edited every time the
 * screen changes, and will not be; this one now states the rule it is
 * really there for and names the single exception.
 */
export function Settings({ go }: { go(route: string): void }) {
  const appearance = useSettings((s) => s.doc.appearance);
  const audio = useSettings((s) => s.doc.audio);
  const persisting = useSettings((s) => s.persisting);

  function setTheme(theme: string) {
    if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return;
    settingsStore.getState().setAppearance({ theme });
  }

  function setInstrument(id: string) {
    settingsStore.getState().setAppearance({ instrument: id });
    // Stored and pushed, the same pair as the volume below: stored so it
    // survives a reload, pushed so the next note uses it rather than the
    // next session.
    appSynth.setInstrument(id);
    /*
      And sounded, which the volume does not need to do because the user
      is already hearing something when they drag it. An instrument
      picked in silence tells you nothing, and the whole reason to pick
      one is what it sounds like — so the control demonstrates itself.
    */
    appSynth.play([{ midi: 60, start: 0, duration: 0.6 }]);
  }

  function setVolume(volume: number) {
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
        <Field label="Theme" group>
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
          <Slider
            label="Volume"
            value={appearance.volume}
            onChange={setVolume}
            format={(v) => `${Math.round(v * 100)}%`}
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
            Measure it
          </button>
        </div>
      </Panel>

      <Panel>
        <Field label="Instrument" group>
          <OneOf
            /*
              A recorded instrument says so in its own label rather than
              in the prose below, because the prose cannot be read while
              you are choosing — the eye is on the row. Reading it off
              the generated index means a pack added tomorrow labels
              itself and nobody has to remember this line exists.
            */
            options={INSTRUMENTS.map((i) => ({
              id: i.id,
              label: hasPack(i.id) ? `${i.name} \u00b7 recorded` : i.name,
            }))}
            chosen={appearance.instrument}
            onChange={setInstrument}
          />
          {/*
            No repository path here. This screen is served to anyone who
            opens the site, and a reader there cannot follow a filename —
            the user role caught it. What they can use is the reason.
          */}
          {/*
            Twice wrong here, the same way both times, which is why this
            comment is longer than the sentence it guards.

            It first said "so the app keeps working offline", which is
            false — a recording would be cached by the service worker
            like everything else. Corrected to a size argument: "tens of
            megabytes". That was not measured either. Encoding the
            project's own CC0 piano fixtures at a playable length puts a
            note at roughly 22 KiB and a whole instrument, sampled every
            third semitone across five octaves, at about 460 KiB. Off by
            close to two orders of magnitude, and in the direction that
            made a real option look impossible.

            Both were plausible reasons nobody would check, offered for
            a decision that had already been taken. The rule this earns:
            user-facing copy does not get to state a cost that nothing
            measured. Either cite a figure the repository can produce or
            say the shape of the thing without the number.
          */}
          {/*
            Third revision, and the first one that was not about being
            wrong. It led with the comparison — recorded instruments are
            "the aim" and these a "fallback underneath them" — on a
            screen showing six generated instruments and nothing
            recorded anywhere. Underneath what? The reader has no tier to
            see. It answered a question they had not asked inside the
            one paragraph explaining the control they are using.

            "Your history" below does the same present-fact-then-plan
            move and reads cleanly, because it telegraphs the pivot at
            the start of its own sentence rather than burying it in the
            middle of one. Same house style; copy it rather than
            inventing a second shape.
          */}
          {/*
            Fourth revision, and this one is a fact changing rather than a
            sentence being wrong: the piano is a recording now. The first
            three are worth leaving in the comments above as a record of
            how user-facing copy goes wrong — a false reason, an unmeasured
            cost, and a comparison to a tier the screen did not show.
          */}
          <p className="secondary">
            {RECORDED.length > 0
              ? `Recorded instruments play real recordings, downloaded once and
                 kept. The rest are generated as they play.`
              : 'Generated as they play rather than recorded.'}
            {' '}Picking one plays a note.
          </p>
          {/*
            The credit, read off the generated index rather than typed.

            A pack's licence may oblige the app to name its source, and
            attribution the app does not display is attribution the app has
            failed to make. Driving it from the index is what stops that
            being a thing someone has to remember: a pack cannot be added
            without its credit appearing, because the same build writes
            both. The current one is CC0 and obliges nothing, which is
            exactly why it is worth wiring now — the cheap case is a bad
            time to leave the mechanism unbuilt.
          */}
          {RECORDED.map((pack) => (
            <p className="secondary" key={pack.id}>
              {pack.name}: {pack.attribution} ({pack.licence}).
            </p>
          ))}
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
