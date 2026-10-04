// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Home } from './Home';
import { EXERCISE_MENU } from '../menu';
import { progressStore } from '../../state/progressStore';
import { EXERCISE_TYPES, findFamily } from '../../exercises/registry';
import type { Attempt } from '../../state/schema';

/**
 * What the first paint is allowed to claim.
 *
 * ADR 0006 keeps progress in IndexedDB and settings in localStorage, and
 * names this screen as the thing that would eventually want the history
 * before it has arrived. Its warning is specific: *decide deliberately
 * what the first frame shows while the log loads, and the temptation at
 * that moment will be the other one* — the other one being to move the
 * log somewhere synchronous.
 *
 * The temptation here is subtler than that and worth writing down,
 * because it looks like it works. With no history every item reads as
 * never-seen and therefore due, so a count rendered during the load is
 * a *correct* count of a tally that is empty — and it is the same
 * number a brand-new user sees. It would be right, for the wrong
 * reason, and indistinguishable from the real figure a moment later.
 * There is no count until the log can produce one.
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = () => act(() => root.render(<Home go={() => {}} />));
const badges = () => [...container.querySelectorAll('.card-due')].map((b) => b.textContent);

describe('the first paint', () => {
  it('offers every exercise the menu lists', () => {
    render();
    const names = [...container.querySelectorAll('.card-name')].map((n) => n.textContent);
    for (const entry of EXERCISE_MENU) expect(names).toContain(entry.name);
  });

  /*
    Driven rather than waited for. The first version of this assumed
    jsdom had no IndexedDB and that the store would settle on
    `unavailable`; there is a shim, it reaches `ready` in milliseconds,
    and the assertion passed only because the status line failed first.
    Setting the state is the only way to hold the interesting frame
    still.
  */
  for (const status of ['loading', 'unavailable'] as const) {
    it(`claims no due count while the history is ${status}`, () => {
      // `unavailable` matters as much as `loading`: a device that
      // refuses the database must not be shown a number invented from
      // an empty tally either, and it stays in that state for good.
      act(() => progressStore.setState({ status, attempts: [] }));
      render();
      expect(badges()).toEqual([]);
    });
  }

  it('counts what is waiting once the history can answer', () => {
    // The other half, or "shows nothing" would pass on a screen that
    // never shows anything. An empty log means every item is unseen,
    // and unseen is due.
    act(() => progressStore.setState({ status: 'ready', attempts: [] }));
    render();
    expect(badges().length).toBeGreaterThan(0);
    for (const badge of badges()) expect(badge).toMatch(/^\d+ to practise$/);
  });

  it('says nothing rather than zero when a card has nothing waiting', () => {
    /*
      A zero is a thing to read and dismiss on every card you have
      finished; the signal worth giving is which cards have something
      in them.

      This needs a card that genuinely has nothing waiting, which an
      empty log cannot produce — every item is then unseen and unseen
      is due. The first version of this case asserted over an empty log
      and passed with the guard removed, because there was no zero for
      it to find. So: answer every item one exercise can ask, just now,
      and check that its card goes quiet while the others do not.
    */
    const chords = EXERCISE_TYPES.find((t) => t.id === 'chord-id')!;
    const items = chords.items(chords.settings.coerce(chords.settings.defaults));
    expect(items.length, 'the exercise asks nothing, so this proves nothing')
      .toBeGreaterThan(0);

    const answeredAt = Date.now();
    const attempts = items.map((item, i): Attempt => ({
      id: `a${i}`,
      exerciseType: chords.id,
      presentation: 'listen',
      seed: i,
      settings: {},
      startedAt: answeredAt,
      answeredAt,
      items: [item],
      outcomes: [{ item, correct: true }],
      correct: true,
    }));

    act(() => progressStore.setState({ status: 'ready', attempts }));
    render();

    const cards = [...container.querySelectorAll('.menu li')];
    const chordCard = cards.find((c) => c.querySelector('.card-name')?.textContent
      === findFamily('chord-id')?.name)!;
    expect(chordCard.querySelector('.card-due'), 'a finished card still shows a count')
      .toBeNull();
    // And the badge has not simply vanished everywhere.
    expect(badges().length, 'nothing is due anywhere, so this proves nothing')
      .toBeGreaterThan(0);
    for (const badge of badges()) expect(badge).not.toMatch(/\b0\b/);
  });
});
