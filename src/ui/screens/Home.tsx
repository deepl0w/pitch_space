import { EXERCISE_MENU, REFERENCE_MENU, SETUP_MENU, type MenuEntry } from '../menu';

/**
 * The way in. Two halves, because the app does two different things: a
 * reference you poke at, and drills you work through.
 */
export function Home({ go }: { go: (route: string) => void }) {
  return (
    <>
      <header>
        <h1>Pitch Space</h1>
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

      {/*
        Last, and that is the point. Calibration is offered rather than
        required (ADR 0018): a musician who never opens it has done nothing
        wrong, so it sits after the things they came for rather than in
        front of them.
      */}
      <h2 className="section">Setup</h2>
      <ul className="menu">
        {SETUP_MENU.map((entry) => (
          <MenuCard key={entry.route} entry={entry} go={go} />
        ))}
      </ul>
    </>
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
