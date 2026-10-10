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
 * How a line is going, as a colour and a word.
 *
 * **Not a percentage, and the difference is the user's ruling rather than
 * a presentation choice.** Asked what a line should read, they said:
 * colours from red for bad to green for good, and *no completion*. A
 * percentage is a completion — it has a 100 in it, and a reader who sees
 * 97% knows what the missing 3% would mean. The previous reading said
 * `100%` meant every item on the top rung and treated that as "the one
 * claim worth being exact about", which was exact about a thing the app
 * is not supposed to have.
 *
 * **The scale is approached and not arrived at.** Pure green at 120° is
 * where the eye stops reading "better" and starts reading "finished", so
 * the best a line can show is short of it. That is the same ruling from
 * the 7th — *a high cap is the colour ceiling* — and it is what stops a
 * hue scale becoming a completion by another name: there is no hue that
 * means done, because the hue that would is not on the scale.
 *
 * **The word is not decoration.** Colour alone cannot carry a meaning
 * (WCAG 1.4.1), and a reader with no colour vision would otherwise get a
 * grey dot and a presentation label. The bands say how it is going and
 * none of them says finished.
 */
export const GREENEST = 108;

/** Red at nothing, through to {@link GREENEST}. */
export function standingHue(fraction: number): number {
  return Math.max(0, Math.min(1, fraction)) * GREENEST;
}

/**
 * The bands, lowest first, as `[upTo, word]`.
 *
 * Four rather than three or five because each has to be a thing a learner
 * would recognise having been; the top one is "strong", which is a state
 * you can be in and keep practising from, where "done" is not.
 */
const BANDS: readonly (readonly [number, string])[] = [
  [0.2, 'shaky'],
  [0.5, 'coming along'],
  [0.8, 'steady'],
  [Infinity, 'strong'],
];

export function standingWord(fraction: number): string {
  return BANDS.find(([upTo]) => fraction < upTo)?.[1] ?? 'strong';
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
            The presentation is named beside the reading because the
            reading is only true of that one: a learner fluent by eye and
            lost by ear is in two very different places here, and an
            unlabelled reading would be whichever they happened to
            practise last.
          */
          <span className="card-progress">
            <span
              className="card-standing"
              style={{ background: `hsl(${standingHue(progress.fraction)} 62% 42%)` }}
              aria-hidden="true"
            />
            {standingWord(progress.fraction)} · {progress.presentation}
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
