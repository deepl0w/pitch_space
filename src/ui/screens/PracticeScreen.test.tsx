// @vitest-environment jsdom
import { useEffect, useState, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PracticeScreen } from './PracticeScreen';
import { EXERCISE_TYPES } from '../../exercises/registry';
import type { AudioOut } from '../../exercises/types';

/**
 * Changing which exercise is running, while one is on screen.
 *
 * The screen used to hold the round in state while `definition` followed the
 * route, so a change of type left the outgoing exercise's question in place
 * and ran the incoming exercise's code against it. That shipped as two
 * defects with one cause: four of the six ordered pairs threw — from
 * `KeyPrompt`, `DegreePrompt`, `intervalVoices` and `keyScoreSpec`, and with
 * no error boundary each took the whole page — while the session tally said
 * nothing at all and quietly counted two exercises' answers under one name.
 *
 * The loud half is why it was found and the silent half is why a crash-only
 * test is not enough. So the claim tested here is neither "it does not throw"
 * nor "those two fields reset", but the general one, which is the only one
 * that keeps being true as the screen grows:
 *
 *   **arriving at a type by switching is indistinguishable from arriving at
 *   it fresh.**
 *
 * State scoped to an exercise type must not outlive it. A later type that
 * adds state of its own is covered without this file being touched, which is
 * what the registry's "one import and one array entry" promise needs in order
 * to be true of the screen and not only of the registry.
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Silent, so a round can be started without an AudioContext. */
const silent: AudioOut = { play: () => {} };

/**
 * The route, as `App` holds it.
 *
 * The selector does not change the exercise by itself — it asks the router to,
 * and the new id comes back as a prop. Driving it the long way round is the
 * point: the defect lived in the gap between the prop changing and the state
 * not.
 */
function Harness({ from, onRouter }: {
  from: string;
  /** Hands the router's own setter out, so a test can change the route the
   * way a menu link does rather than only the way the in-page selector
   * does. In an effect rather than during render: writing to a prop while
   * rendering is a mutation React is entitled to repeat or discard. */
  onRouter: (go: (id: string) => void) => void;
}) {
  const [exerciseId, setExerciseId] = useState(from);
  useEffect(() => { onRouter(setExerciseId); }, [onRouter]);
  return <PracticeScreen exerciseId={exerciseId} onSwitch={setExerciseId} audio={silent} />;
}

/** A mounted screen, with the handful of pokes these tests need. */
function mount(from: string) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const route: { go?: (id: string) => void } = {};
  const onRouter = (go: (id: string) => void) => { route.go = go; };
  act(() => root.render(<Harness from={from} onRouter={onRouter} />));

  const buttons = () => [...container.querySelectorAll('button')];
  const button = (label: string) =>
    buttons().find((b) => b.textContent?.trim() === label);
  const switcher = () => container.querySelector('select') as HTMLSelectElement;

  return {
    container,
    button,
    switcher,
    text: () => container.textContent ?? '',
    start: () => act(() => button('Start')?.click()),
    /**
     * Change the running exercise by whichever route the app actually
     * offers for that pair.
     *
     * Within a family the in-page selector does it; across families there
     * is no selector option, because the home screen is where you choose a
     * family and a second full list here would be a duplicate navigation.
     * Both end in the same place — `exerciseId` arriving as a new prop —
     * which is the gap the defect lived in, so both are worth driving and
     * neither is a weaker test than the other.
     */
    switchTo: (id: string) => act(() => {
      const select = container.querySelector('select');
      const offered = select
        && [...select.options].some((o) => o.value === id);
      if (offered && select) {
        select.value = id;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        route.go?.(id);
      }
    }),
    /**
     * Answer whatever is on offer, so the tally exists to be carried.
     *
     * *How* to answer differs per prompt and this is a test about the screen
     * rather than about any one of them, so press towards the only
     * cross-exercise signal that something counted — the tally appearing.
     * Options come last on every prompt, so reverse order reaches them before
     * the control that would skip to a new round.
     */
    answer: () => {
      for (const option of buttons().reverse()) {
        act(() => option.click());
        if ((container.textContent ?? '').includes('this session')) return true;
      }
      return false;
    },
    dispose: () => { act(() => root.unmount()); container.remove(); },
  };
}

let open: ReturnType<typeof mount>[] = [];
const screen = (from: string) => {
  const s = mount(from);
  open.push(s);
  return s;
};

beforeEach(() => { open = []; });
afterEach(() => { open.forEach((s) => s.dispose()); });

/** Every ordered pair of distinct types — what a user can actually do. */
const pairs = EXERCISE_TYPES.flatMap((from) =>
  EXERCISE_TYPES.filter((to) => to.id !== from.id).map((to) => ({ from, to })),
);

describe('switching exercise type with a round on screen', () => {
  it.each(pairs)('arrives at $to.id as a fresh visit would, from $from.id', ({ from, to }) => {
    const switched = screen(from.id);
    switched.start();
    switched.answer();
    switched.switchTo(to.id);

    // The whole claim, in one comparison. It covers the round, the tally and
    // anything a later exercise type adds, because it never names any of them.
    expect(switched.text()).toBe(screen(to.id).text());
  });

  it.each(pairs)('does not take the page down, $from.id → $to.id', ({ from, to }) => {
    const s = screen(from.id);
    s.start();
    // Precondition: with nothing started there is no stale question to hand on.
    expect(s.button('Start')).toBeUndefined();

    s.switchTo(to.id);

    // A screen that threw leaves an empty container, which a `toContain` on
    // the text alone would read as a pass.
    expect(s.container.querySelector('h1')).not.toBeNull();
    // The heading names the *family*, so it does not distinguish two members
    // of one. The lede carries the running definition's own description,
    // which is the thing that has to have changed.
    expect(s.container.querySelector('.lede')?.textContent).toBe(to.description);
    /*
      And it arrived without throwing at all, rather than throwing into the
      boundary.

      Worth asserting separately, because the boundary now hides exactly the
      failure this sweep was written for. Take the remount away and ten of
      the twelve pairs still throw — they are simply caught, so the page is
      no longer blank and every assertion above passes. Without this line the
      sweep would stay green on a broken seam and only the comparison test
      above would go red, which is a guard quietly testing the half that is
      easy to reach.
    */
    expect(s.text()).not.toContain('could not be shown');
  });
});

/**
 * Named separately from the sweep above, which would catch it anyway.
 *
 * This is the half that never threw, and the reason the sweep is written as a
 * comparison rather than as a crash check. Worth failing by name so a
 * regression reads as "the tally blended again" rather than as a diff.
 */
describe('the session tally', () => {
  it("does not count one type's answers under another's name", () => {
    const [first, second] = EXERCISE_TYPES;
    if (second === undefined) return;

    const s = screen(first.id);
    s.start();
    expect(s.answer()).toBe(true);
    expect(s.text()).toContain('this session');

    s.switchTo(second.id);
    expect(s.text()).not.toContain('this session');
  });
});

/**
 * The readout is the one place the app tells a learner what they know, and
 * it was printing the storage key it keys that knowledge by.
 *
 * Asserted here rather than only over `itemLabel`, because the formatter
 * being correct and the screen calling it are two different claims and only
 * the second one is what the user sees.
 */
describe('the readout under an answered question', () => {
  /**
   * Answer whatever prompt is on screen, however many taps it takes.
   *
   * The sweep above has its own one-tap version; this one has to cope with
   * the progression prompt, where the answer is built a chord at a time and
   * tapping a filled slot rewinds it. Picking options until a submit goes
   * live is the one rule that fits both.
   */
  function answerFully(container: HTMLElement): boolean {
    const live = (selector: string) =>
      [...container.querySelectorAll(selector)].find(
        (b) => !(b as HTMLButtonElement).disabled,
      ) as HTMLButtonElement | undefined;

    for (let tap = 0; tap < 24; tap += 1) {
      if ((container.textContent ?? '').includes('this session')) return true;
      const submit = [...container.querySelectorAll('.actions button')]
        .find((b) => b.textContent === 'Check') as HTMLButtonElement | undefined;
      const next = (submit && !submit.disabled) ? submit : live('.choices button');
      if (next === undefined) return false;
      act(() => next.click());
    }
    return (container.textContent ?? '').includes('this session');
  }

  it('names what was practised instead of showing its storage key', () => {
    for (const type of EXERCISE_TYPES) {
      const s = screen(type.id);
      s.start();
      expect(answerFully(s.container), `${type.id} could not be answered`).toBe(true);

      const readout = s.container.querySelector('.readout');
      expect(readout, `${type.id} showed no readout`).not.toBeNull();
      const named = [...readout!.querySelectorAll('.primary')];
      expect(named.length, `${type.id} listed no items`).toBeGreaterThan(0);
      for (const item of named) {
        // Every item id is colon-joined (see registry.test.ts), so a colon
        // on screen is a slug that escaped.
        expect(item.textContent, `${type.id} readout shows a raw id`).not.toContain(':');
      }

      // One card per thing practised. A progression repeats a chord more
      // often than not, and the second card carries the same name and the
      // same figures as the first under a duplicate React key.
      const labels = named.map((n) => n.textContent);
      expect(new Set(labels).size, `${type.id} readout repeats a card`)
        .toBe(labels.length);
    }
  });
});
