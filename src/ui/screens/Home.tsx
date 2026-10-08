import { EXERCISE_MENU, REFERENCE_MENU, type MenuEntry } from '../menu';

/**
 * The way in. Two halves, because the app does two different things: a
 * reference you poke at, and drills you work through.
 */
export function Home({ go }: { go: (route: string) => void }) {
  return (
    <>
      <header>
        <h1>Pitch Space</h1>
        {/*
          The second sentence says what is not here yet, and it stays until
          it is. This line claimed the app was answered by playing while
          every built exercise was answered by clicking a button or tapping
          a key — the brief's promise written as though delivered, in the
          loudest copy on the home screen. The exercise cards were honest
          throughout and only this was not, which is how it survived: the
          claim lived one level above everything that could contradict it.
        */}
        <p className="lede">
          Exercises generated on the spot, following real patterns rather than
          random notes. For now you answer by naming what you hear or tapping
          what you read; answering by playing is being built.
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
