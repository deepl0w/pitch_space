import { useEffect, useMemo, useState } from 'react';
import { EXERCISE_MENU, REFERENCE_MENU, SETUP_MENU, type MenuEntry } from '../menu';
import { findFamily } from '../../exercises/registry';
import { progressStore, tallyItems, useProgress } from '../../state/progressStore';
import { useSettings } from '../../state/settingsStore';
import { dueCount } from '../../state/schedule';

/**
 * The way in. Two halves, because the app does two different things: a
 * reference you poke at, and drills you work through.
 */
export function Home({ go }: { go: (route: string) => void }) {
  // The log lives in IndexedDB and arrives after the first frame (ADR 0006).
  useEffect(() => { void progressStore.getState().load(); }, []);

  const status = useProgress((s) => s.status);
  const attempts = useProgress((s) => s.attempts);
  const exercises = useSettings((s) => s.doc.exercises);

  /**
   * How much each kind of practice is waiting on, or null while that
   * cannot be said.
   *
   * **Null until the log has loaded, and that is the whole decision ADR
   * 0006 asked for.** With no history every item reads as never-seen and
   * therefore due, so a count rendered during the load is the same
   * number a brand-new user sees — right, for the wrong reason, and
   * indistinguishable from the real thing. A count that cannot be told
   * apart from a placeholder is worse than no count, so there is none
   * until there is one.
   *
   * Counted per *family*, because that is what a card is. A family with
   * two members sums them: the home screen offers "note identification"
   * and the choice between intervals and scale degrees is made inside.
   *
   * The clock is read once, when the screen opens, rather than during
   * each render that uses it. `Date.now()` is impure: a render that
   * reads it answers differently every time React decides to run one,
   * which is the same reason the scheduler takes its clock as an
   * argument rather than reading one.
   *
   * Once is enough and the staleness is the right trade. These counts
   * move on the scale of minutes at the shortest interval and days at
   * the longest, and a home screen left open does not need a number
   * that ticks — opening an exercise and coming back re-mounts this
   * and re-reads the clock.
   */
  const [now] = useState(() => Date.now());

  const due = useMemo(() => {
    if (status !== 'ready') return null;
    const tallies = tallyItems(attempts);
    const counts = new Map<string, number>();
    for (const entry of EXERCISE_MENU) {
      const family = findFamily(entry.route);
      if (family === undefined) continue;
      let total = 0;
      for (const member of family.members) {
        const settings = member.settings.coerce(exercises[member.id]);
        total += dueCount(member.items(settings), tallies, settings.presentation, now);
      }
      counts.set(entry.route, total);
    }
    return counts;
  }, [status, attempts, exercises, now]);

  return (
    <>
      <header>
        <h1>Music Practice</h1>
        <p className="lede">
          Exercises generated on the spot, following real patterns rather than
          random notes, and answered by playing them.
        </p>
      </header>

      <h2 className="section">Exercises</h2>
      <ul className="menu">
        {EXERCISE_MENU.map((entry) => (
          <MenuCard key={entry.route} entry={entry} go={go} due={due?.get(entry.route)} />
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

function MenuCard({ entry, go, due }: {
  entry: MenuEntry;
  go: (route: string) => void;
  /** Items waiting, or undefined when the history cannot say yet. */
  due?: number;
}) {
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
        {/*
          Nothing at all when there is nothing waiting, rather than "0
          due". A zero is a thing to read and dismiss on every card you
          have finished, and the useful signal is which cards have
          something in them.
        */}
        {due !== undefined && due > 0 && (
          <span className="card-due">{due} to practise</span>
        )}
      </button>
    </li>
  );
}
