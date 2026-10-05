import { EXERCISE_MENU, REFERENCE_MENU, type MenuEntry } from '../menu';

/**
 * The way in. Two halves, because the app does two different things: a
 * reference you poke at, and drills you work through.
 */
export function Home({ go }: { go: (route: string) => void }) {
  return (
    <>
      <header className="home-header">
        <h1>Pitch Space</h1>
        {/*
          Settings is chrome, not a destination, so it is a corner control
          rather than a card. It used to be one of two cards under "Setup",
          beside audio calibration — which Settings already links to and
          already names in its own blurb, so the home screen offered the
          same place twice and called the second one something else.

          Calibration is still offered rather than required (ADR 0018); it
          is reached from inside Settings, which is where a technical setup
          step belongs once the screen that owns it exists.
        */}
        <button
          type="button"
          className="cog"
          onClick={() => go('settings')}
          aria-label="Settings"
          title="Settings"
        >
          <CogIcon />
        </button>
        <p className="lede">
          Exercises generated on the spot, following real patterns rather than
          random notes, and answered by playing them.
        </p>
      </header>

      <h2 className="section">Exercises</h2>
      <ul className="menu">
        {EXERCISE_MENU.map((entry) => (
          <MenuCard key={entry.route} entry={entry} go={go} />
        ))}
      </ul>

      <h2 className="section">Theory reference</h2>
      <ul className="menu">
        {REFERENCE_MENU.map((entry) => (
          <MenuCard key={entry.route} entry={entry} go={go} />
        ))}
      </ul>
    </>
  );
}

/** Drawn rather than imported: one icon does not earn a dependency. */
function CogIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
        fill="none" stroke="currentColor" strokeWidth="1.6"
      />
      <path
        d="M19.4 13a7.6 7.6 0 0 0 0-2l1.7-1.3-1.8-3.1-2 .8a7.7 7.7 0 0 0-1.7-1l-.3-2.1h-3.6l-.3 2.1a7.7 7.7 0 0 0-1.7 1l-2-.8-1.8 3.1L7.6 11a7.6 7.6 0 0 0 0 2l-1.7 1.3 1.8 3.1 2-.8c.5.4 1.1.7 1.7 1l.3 2.1h3.6l.3-2.1c.6-.3 1.2-.6 1.7-1l2 .8 1.8-3.1Z"
        fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuCard({ entry, go }: { entry: MenuEntry; go: (route: string) => void }) {
  if (!entry.ready) {
    return (
      <li className="card card-pending">
        <span className="card-name">{entry.name}</span>
        <span className="card-blurb">{entry.blurb}</span>
        <span className="card-state">not built yet</span>
      </li>
    );
  }
  return (
    <li>
      <button className="card" onClick={() => go(entry.route)}>
        <span className="card-name">{entry.name}</span>
        <span className="card-blurb">{entry.blurb}</span>
      </button>
    </li>
  );
}
