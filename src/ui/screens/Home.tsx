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

/** Drawn rather than imported: one icon does not earn a dependency. */
/**
 * A cog.
 *
 * Two earlier attempts, and the second was worse than the first. A single
 * outline tracing the silhouette came out a lumpy blob at twenty pixels,
 * because the teeth were smaller than the stroke joining them and
 * antialiasing filled the gaps. Replacing it with a ring and eight radial
 * strokes drew a **sun**: a cog's teeth are part of its rim, and spokes
 * sticking out of a circle are rays.

 * So it is filled rather than stroked, and the teeth are trapezoids on the
 * rim — tooth top, flank, valley floor, repeated eight times — with the
 * centre punched out by `evenodd` rather than drawn over, so it works on
 * any background. Generated rather than hand-written, which is why the
 * numbers are exact.
 */
function CogIcon() {
  return (
    <svg
      viewBox="0 0 24 24" width="20" height="20"
      fill="currentColor" fillRule="evenodd" aria-hidden="true" focusable="false"
    >
      <path d="M 9.71 2.06L 14.29 2.06L 14.22 4.73L 15.57 5.29L 17.41 3.35L 20.65 6.59L 18.71 8.43L 19.27 9.78L 21.94 9.71L 21.94 14.29L 19.27 14.22L 18.71 15.57L 20.65 17.41L 17.41 20.65L 15.57 18.71L 14.22 19.27L 14.29 21.94L 9.71 21.94L 9.78 19.27L 8.43 18.71L 6.59 20.65L 3.35 17.41L 5.29 15.57L 4.73 14.22L 2.06 14.29L 2.06 9.71L 4.73 9.78L 5.29 8.43L 3.35 6.59L 6.59 3.35L 8.43 5.29L 9.78 4.73ZM 8.40 12.00a 3.60 3.60 0 1 0 7.20 0a 3.60 3.60 0 1 0 -7.20 0Z" />
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
