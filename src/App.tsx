import { useEffect, useState } from 'react';
import { CogIcon } from './ui/controls';
import { Home } from './ui/screens/Home';
import { Scales } from './ui/screens/Scales';
import { Chords } from './ui/screens/Chords';
import { KeyChords } from './ui/screens/KeyChords';
import { Rhythms } from './ui/screens/Rhythms';
import { CircleOfFifths } from './ui/screens/CircleOfFifths';
import { Calibration } from './ui/screens/Calibration';
import { Settings } from './ui/screens/Settings';
import { PracticeScreen } from './ui/screens/PracticeScreen';
import { findFamily } from './exercises/registry';
import { backFrom } from './ui/menu';
import { appSynth, stopSound } from './ui/sound';
import { useSettings } from './state/settingsStore';
import { progressStore } from './state/progressStore';
import { DebugColours } from './ui/components/DebugColours';

/**
 * Routing, such as it is.
 *
 * The hash rather than the History API, because this ships as a static bundle
 * to a PWA and inside a Capacitor shell, and neither has a server to rewrite
 * deep links back to index.html. A hash route survives a reload in both
 * without any configuration, which the History API would need and the
 * Capacitor one could not provide at all.
 */
function useRoute(): [string, (route: string) => void] {
  const read = () => window.location.hash.replace(/^#\/?/, '');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return [route, (next: string) => { window.location.hash = next ? `#/${next}` : ''; }];
}

/**
 * Every screen takes `go`, whether or not it uses it.
 *
 * One signature rather than two: a screen that wants to send the reader
 * somewhere else — settings pointing at calibration — should not have to
 * reach for `window.location` and keep a second copy of what a route is.
 */
const SCREENS: Partial<Record<string, (props: { go(route: string): void }) => React.ReactElement>> = {
  scales: Scales,
  chords: Chords,
  'key-chords': KeyChords,
  rhythms: Rhythms,
  circle: CircleOfFifths,
  calibration: Calibration,
  settings: Settings,
};

/**
 * Settings, over whatever is already on screen.
 *
 * The same component the route renders, in a layer rather than a page,
 * so the exercise underneath keeps its round and its audio. Escape and
 * the backdrop both close it, because a thing that covers your work
 * should be dismissible without aiming at a button.
 *
 * `go` closes before it navigates: the two destinations reachable from
 * inside — calibration and the back link — are real route changes, and
 * leaving the layer open over the screen they land on would be a
 * settings panel floating above calibration with no way to tell which
 * one the Escape key belonged to.
 */
function SettingsOverlay({ onClose, go }: { onClose(): void; go(route: string): void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /*
    Hold the page still underneath.

    `.overlay` is fixed and scrolls its own content, which is enough
    until the content fits — then a wheel over the backdrop has nothing
    to scroll, falls through to the document, and moves the page behind
    the panel. Worst on a phone, where the backdrop is the 16px either
    side of a full-width panel and is most of what a thumb lands on.

    The padding is not cosmetic. Removing the scrollbar by hiding
    overflow widens the content box by its width, so every centred thing
    on the page jumps sideways as settings opens and back as it closes —
    replacing a scroll nobody wanted with a lurch nobody wanted. The gap
    is measured rather than assumed because it is zero on overlay
    scrollbars, which is most phones and some desktops.
  */
  useEffect(() => {
    const root = document.documentElement;
    const gap = window.innerWidth - root.clientWidth;
    const scroll = root.style.overflow;
    const pad = root.style.paddingRight;
    root.style.overflow = 'hidden';
    if (gap > 0) root.style.paddingRight = `${gap}px`;
    return () => { root.style.overflow = scroll; root.style.paddingRight = pad; };
  }, []);

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      /* The backdrop only, not a click that bubbled out of the panel. */
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="overlay-panel">
        <button type="button" className="overlay-close" onClick={onClose}>Done</button>
        <Settings go={go} />
      </div>
    </div>
  );
}

export default function App() {
  const [route, go] = useRoute();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const Screen = SCREENS[route];
  const appearance = useSettings((state) => state.doc.appearance);

  /*
    The theme is an attribute on the document element, because that is what
    the stylesheet reads: `system` sets none, so the media query decides,
    and the other two pin it. Set here rather than in the settings screen
    so it holds on a reload, when that screen is never rendered.
  */
  useEffect(() => {
    const root = document.documentElement;
    if (appearance.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', appearance.theme);
  }, [appearance.theme]);

  // Pushed into the engine rather than read by it: `audio/output/` may not
  // import state, which is what keeps the whole engine testable off-browser.
  useEffect(() => { appSynth.setVolume(appearance.volume); }, [appearance.volume]);
  // Pushed on load as well as on change, for the same reason the volume
  // is: a stored choice that only takes effect once you visit Settings
  // is a stored choice the app ignores until you go looking for it.
  useEffect(() => { appSynth.setInstrument(appearance.instrument); }, [appearance.instrument]);
  // A family id is what the menu links to; a member id is what links made
  // before the families existed still carry. Both land on the practice
  // screen rather than silently on the home one.
  const exercise = findFamily(route);

  // Notes are scheduled into the future against the audio clock, so leaving a
  // screen does not stop the passage it started — it plays on over whatever
  // comes next. Silence it on every route change.
  useEffect(() => { stopSound(); }, [route]);

  /*
    Hydrate the attempt log once, here, rather than in the screen that
    happens to need it first.

    It used to be the practice screen's alone, which was true while that
    was the only reader. The home screen now reports how far each line has
    advanced, and with the load left where it was the figure appeared only
    for someone who had already opened an exercise in that page session —
    a returning learner's first sight of the app, which is the one case it
    exists for, showed nothing. Found by reloading rather than by
    navigating, which is why it was invisible while building it.

    Once at the root also means the three-state contract holds everywhere:
    a screen reads `loading` and then `ready`, instead of `loading`
    forever because nobody asked.
  */
  useEffect(() => { void progressStore.getState().load(); }, []);

  return (
    /*
      The practice route gets a shell rather than a page: a sidebar the
      height of the window and a question beside it, each scrolling on
      its own. `shell` is what turns the padding and the centred column
      off so the grid can own the viewport; every other route is an
      ordinary scrolling page and keeps them.
    */
    <main className={exercise ? 'shell' : undefined}>
      {/*
        One cog, in one place, on every page.

        It was the home screen's header control and then also the
        practice layout's corner, which made it two controls doing one
        job in two positions — and the practice one moved to the far
        side of a phone's scroll when the columns stacked. Rendered here
        it is outside every screen, so no screen's layout can move it
        and no screen has to remember to offer it.

        It opens settings over whatever is showing rather than
        navigating, everywhere rather than only on an exercise: the
        reason it must not navigate on a practice screen is that the
        round would be discarded, and the reason to do the same
        elsewhere is that one control should do one thing.
      */}
      {/*
        A development-only colour workbench. `import.meta.env.DEV` is a
        compile-time constant, so neither this nor the component survives a
        production build — which is why it sits in the shell rather than
        behind a setting: a setting would ship.
      */}
      {import.meta.env.DEV && <DebugColours />}
      {route !== 'settings' && !settingsOpen && (
        <button
          type="button"
          className="cog app-cog"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
        >
          <CogIcon />
        </button>
      )}
      {Screen && !exercise && (
        <button className="back" onClick={() => go(backFrom(route).route)}>
          &larr; {backFrom(route).label}
        </button>
      )}
      {exercise
        ? (
          <PracticeScreen
            exerciseId={route}
            onSwitch={go}
            onBack={() => go('')}
          />
        )
        : Screen ? <Screen go={go} /> : <Home go={go} />}

      {/*
        Everywhere, not only over an exercise.

        The cog became persistent before this did, so on every page but
        a practice one it hid itself — the cog is hidden while the layer
        is open — and opened nothing. A control that vanishes and does
        nothing is worse than one that is simply missing. The two
        conditions have to be the same condition.
      */}
      {settingsOpen && (
        <SettingsOverlay
          onClose={() => setSettingsOpen(false)}
          go={(next) => { setSettingsOpen(false); go(next); }}
        />
      )}
    </main>
  );
}
