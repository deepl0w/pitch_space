import { useEffect, useState } from 'react';
import { Home } from './ui/screens/Home';
import { Scales } from './ui/screens/Scales';
import { Chords } from './ui/screens/Chords';
import { KeyChords } from './ui/screens/KeyChords';
import { Rhythms } from './ui/screens/Rhythms';
import { CircleOfFifths } from './ui/screens/CircleOfFifths';
import { Calibration } from './ui/screens/Calibration';
import { PracticeScreen } from './ui/screens/PracticeScreen';
import { findFamily } from './exercises/registry';
import { stopSound } from './ui/sound';

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

const SCREENS: Partial<Record<string, () => React.ReactElement>> = {
  scales: Scales,
  chords: Chords,
  'key-chords': KeyChords,
  rhythms: Rhythms,
  circle: CircleOfFifths,
  calibration: Calibration,
};

export default function App() {
  const [route, go] = useRoute();
  const Screen = SCREENS[route];
  // A family id is what the menu links to; a member id is what links made
  // before the families existed still carry. Both land on the practice
  // screen rather than silently on the home one.
  const exercise = findFamily(route);

  // Notes are scheduled into the future against the audio clock, so leaving a
  // screen does not stop the passage it started — it plays on over whatever
  // comes next. Silence it on every route change.
  useEffect(() => { stopSound(); }, [route]);

  return (
    <main>
      {(Screen || exercise) && (
        <button className="back" onClick={() => go('')}>&larr; Everything</button>
      )}
      {exercise ? <PracticeScreen exerciseId={route} onSwitch={go} />
        : Screen ? <Screen /> : <Home go={go} />}
    </main>
  );
}
