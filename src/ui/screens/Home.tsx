import { useMemo } from 'react';
import { EXERCISE_MENU, REFERENCE_MENU, type MenuEntry } from '../menu';
import { findFamily } from '../../exercises/registry';
import { PRESENTATION_LABELS } from '../../exercises/types';
import {
  lastLineAmong, tallyItems, useProgress, type ProgressStatus,
} from '../../state/progressStore';
import { completion } from '../../state/schedule';

/**
 * What a card says about how far you have got, or nothing.
 *
 * Three states rather than a number, because the log is asynchronous and
 * the settings are not ([0006](../../../docs/adr/0006-settings-in-localstorage-progress-in-indexeddb.md)):
 * the first frame genuinely does not know. A count shipped here once and
 * was pulled within the hour for exactly this — with storage blocked, an
 * unreadable history made every item unseen, unseen read as due, and a
 * returning learner saw a stranger's numbers. So *cannot read* is a thing
 * this says in words, and *loading* shows nothing at all rather than a
 * zero that will change under the reader.
 *
 * **Three states in the store, two on screen, and that is deliberate.**
 * `silent` covers both *still loading* and *never practised*, so do not
 * read the missing third as an oversight. The confusion 0006 exists to
 * prevent is new-versus-unreadable, and those two are kept apart in
 * words; loading-versus-new is collapsed because loading terminates and
 * the card is then correct either way, so nobody is ever shown a wrong
 * thing by the merge.
 */
type CardProgress =
  | { kind: 'silent' }
  | { kind: 'unavailable' }
  | { kind: 'advanced'; fraction: number; presentation: string };

/**
 * The way in. Two halves, because the app does two different things: a
 * reference you poke at, and drills you work through.
 */
export function Home({ go }: { go: (route: string) => void }) {
  const status = useProgress((s) => s.status);
  const attempts = useProgress((s) => s.attempts);
  // Same shape as the practice screen's: one pass over the log, memoised on
  // it, rather than a pass per card.
  const tally = useMemo(() => tallyItems(attempts), [attempts]);

  function progressFor(entry: MenuEntry): CardProgress {
    return cardProgress(entry, status, attempts, tally);
  }

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
          random notes. Answer by naming what you hear, by tapping what you
          read, or — on intervals so far — by playing it.
        </p>
      </header>

      <h2 className="section">Exercises</h2>
      <ul className="menu">
        {EXERCISE_MENU.map((entry) => (
          <MenuCard key={entry.route} entry={entry} go={go} progress={progressFor(entry)} />
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

/**
 * A card's figure, decided from the log rather than from the card.
 *
 * Kept out of the component so it can be read as one rule: *show a figure
 * only for a line this learner has actually practised, name the
 * presentation it is about, and say so plainly when the history cannot be
 * read.* Each branch below is one of the three states a first paint has.
 */
/**
 * A completion as a percentage, with the two ends told apart.
 *
 * **`<1%` rather than `0%` for a line that has been practised.** A
 * learner who answered a question correctly and then read "0%" reported
 * it as "that did not count" — and they were right to, because the line
 * had moved and the figure said it had not. A pool of thirty items
 * advanced by one rung on one item is under half a percent, which is
 * honestly tiny and is not nothing.
 *
 * Nothing at all is still what an unpractised line shows, so the three
 * readings stay distinct: no figure means never practised, `<1%` means
 * started, a number means measurably along.
 *
 * `Math.floor` for everything above that, so `100%` means every item is
 * actually on the top rung rather than merely near it. Reaching the end
 * of a line is the one claim here worth being exact about.
 *
 * **Exported so the `<1%` branch is checkable, because the app can barely
 * produce it.** One item on the first rung is a seventh of a rung, so the
 * band needs a pool of about fifteen or more with exactly one item moved
 * — the user role tried three pools and landed on a real figure every
 * time. A branch that cannot be reached from outside is still reachable
 * here, and an untestable branch nobody can observe is one nobody can
 * tell is wrong.
 */
export function percent(fraction: number): string {
  if (fraction > 0 && fraction < 0.01) return '<1%';
  return `${Math.floor(fraction * 100)}%`;
}

function cardProgress(
  entry: MenuEntry,
  status: ProgressStatus,
  attempts: Parameters<typeof lastLineAmong>[0],
  tally: ReturnType<typeof tallyItems>,
): CardProgress {
  // Nothing while it loads. A figure that appears and then corrects itself
  // is worse than one that arrives a moment later.
  if (status === 'loading') return { kind: 'silent' };
  if (status === 'unavailable') return { kind: 'unavailable' };

  const family = findFamily(entry.route);
  if (family === undefined) return { kind: 'silent' };
  const types = new Set(family.members.map((m) => m.id));
  const line = lastLineAmong(attempts, types);
  // Never practised, or practised only in ways that carry no line. Both are
  // "nothing to say" rather than "zero": a card reading 0% on a first visit
  // is a scoreboard, and this is not one.
  if (line === undefined) return { kind: 'silent' };

  const fraction = completion(line, tally);
  if (fraction === null) return { kind: 'silent' };
  return {
    kind: 'advanced',
    fraction,
    presentation: PRESENTATION_LABELS[line.presentation],
  };
}

function MenuCard({ entry, go, progress }: {
  entry: MenuEntry;
  go: (route: string) => void;
  progress?: CardProgress;
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
        {progress?.kind === 'advanced' && (
          /*
            The presentation is named beside the figure because the figure
            is only true of that one: a learner fluent by eye and lost by
            ear has two very different numbers here, and an unlabelled one
            would be whichever they happened to practise last.

            Rounded, and never to 100 from below — `Math.floor` rather than
            `Math.round`, so "100%" means every item is actually on the top
            rung rather than merely close to it. Reaching the end of a line
            is the one claim here worth being exact about.
          */
          <span className="card-progress">
            {percent(progress.fraction)} · {progress.presentation}
          </span>
        )}
        {progress?.kind === 'unavailable' && (
          <span className="card-progress card-progress-unknown">
            Your history could not be read
          </span>
        )}
      </button>
    </li>
  );
}
