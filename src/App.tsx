import { useEffect, useState } from 'react';
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
import { appSynth, stopSound } from './ui/sound';
import { useSettings } from './state/settingsStore';

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

export default function App() {
  const [route, go] = useRoute();
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
  // A family id is what the menu links to; a member id is what links made
  // before the families existed still carry. Both land on the practice
  // screen rather than silently on the home one.
  const exercise = findFamily(route);

  // Notes are scheduled into the future against the audio clock, so leaving a
  // screen does not stop the passage it started — it plays on over whatever
  // comes next. Silence it on every route change.
  useEffect(() => { stopSound(); }, [route]);

  return (
    /*
      The practice route gets a shell rather than a page: a sidebar the
      height of the window and a question beside it, each scrolling on
      its own. `shell` is what turns the padding and the centred column
      off so the grid can own the viewport; every other route is an
      ordinary scrolling page and keeps them.
    */
    <main className={exercise ? 'shell' : undefined}>
      {Screen && !exercise && (
        <button className="back" onClick={() => go('')}>&larr; Everything</button>
      )}
      {exercise
        ? <PracticeScreen exerciseId={route} onSwitch={go} onBack={() => go('')} />
        : Screen ? <Screen go={go} /> : <Home go={go} />}
    </main>
  );
}
