// @vitest-environment jsdom
import { useEffect, useState, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PracticeScreen } from './PracticeScreen';
import { EXERCISE_TYPES } from '../../exercises/registry';
import type { AudioOut } from '../../exercises/types';
import { resizeTo } from '../../testing/resizeObserver';

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
  /*
    Faked for the whole block, because one exercise answers on a timer and
    the sweep is over all of them. Everything else here presses buttons and
    does not notice; the progression prompt reads `Date.now()` for its
    latency and gets a frozen clock, which it reports as an instant answer
    and nothing in this file asserts.
  */
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

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

    for (let tap = 0; tap < 40; tap += 1) {
      if ((container.textContent ?? '').includes('this session')) return true;
      const named = (text: string) => [...container.querySelectorAll('.actions button')]
        .find((b) => b.textContent === text) as HTMLButtonElement | undefined;

      // A pad on screen means an attempt is already running: tap it, and
      // let the window close on its own rather than looking for a submit
      // that does not exist.
      const pad = container.querySelector('.tap-pad') as HTMLButtonElement | null;
      if (pad) {
        act(() => pad.click());
        act(() => { vi.advanceTimersByTime(30_000); });
        continue;
      }

      const submit = named('Check');
      const perform = named('Tap it back');
      const next = (submit && !submit.disabled) ? submit
        : live('.choices button') ?? (perform && !perform.disabled ? perform : undefined);

      if (next === undefined) {
        // Nothing live to press. Either the question is still sounding or
        // a window is still open, and both end on a timer rather than on
        // anything this driver can do.
        act(() => { vi.advanceTimersByTime(30_000); });
        continue;
      }
      act(() => next.click());
    }
    return (container.textContent ?? '').includes('this session');
  }

  /*
    There is no exemption here any more, and that is the point of the
    clock above.

    Rhythm used to be excluded by name: its answer is a performance — a
    count-in, taps against a clock, and a window that closes on a timer —
    so no single press constitutes answering, and this driver only knew
    how to press things. The comment that stood here said the exclusion
    should go the day someone could drive it, and `vi.useFakeTimers()` is
    that day. Nothing on screen waits on anything but `setTimeout`, so
    advancing the clock is the whole of it.

    Keeping every exercise in one sweep matters more than the one case it
    covers: an exemption is a list, and a list is the thing that stops
    being true quietly.
  */

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

  it('lists what was judged, not what was shown', () => {
    /*
      ADR 0024, which was accepted on 4 October and not built until the
      sixth — so this is the guard that would have caught the gap, written
      after it rather than with it.

      The two lists differ, and ADR 0007 keeps them both on purpose. An
      item in `exercise.items` and not in the result's outcomes is
      contained-and-not-tested: degree identification *shows* a key and
      grades only the degree, so a learner read "A♭ major — not recorded
      yet" after every single attempt and could do nothing about it. The
      readout is the one place the app tells someone what they know, and a
      row that can never fill tells them something false.

      Asserted as the relation rather than by naming degree-id, because
      the symptom moved once already: 0024 was written about key
      identification by ear, 0028 deleted that mode, and the decision
      stayed unbuilt until the same shape surfaced somewhere else.
    */
    for (const type of EXERCISE_TYPES) {
      const s = screen(type.id);
      s.start();
      expect(answerFully(s.container), `${type.id} could not be answered`).toBe(true);

      /*
        Asserted through "not recorded yet" rather than by comparing two
        lists, because that phrase is the symptom a learner actually
        reads and it needs nothing from inside the component.

        The reasoning: the readout now lists the attempt's outcomes, and
        an outcome is by definition something that was just graded — so
        the tally has a figure for every row. A row with no figure is
        therefore a row listing something that was *not* judged, which is
        exactly the state ADR 0024 removed. Under the old code degree
        identification printed one every single time.
      */
      const rows = [...s.container.querySelectorAll('.readout .items li')];
      expect(rows.length, `${type.id} listed nothing`).toBeGreaterThan(0);
      for (const row of rows) {
        expect(
          row.textContent,
          `${type.id} listed "${row.querySelector('.primary')?.textContent}", `
          + 'which nothing in this attempt judged',
        ).not.toContain('not recorded yet');
      }
    }
  });
});

/**
 * The question on screen and the controls beside it, disagreeing.
 *
 * `RoundView` is keyed on `definition.id`, so a settings change does not
 * invalidate the generated exercise: the control moves and the question
 * does not. It is a property rather than a list of fields — 104 of the 108
 * controls across the seven exercises leave a question on screen untouched,
 * the exception being a relabelling.
 *
 * **Pinned on Mode rather than on the clef it was found with**, because the
 * contradiction is structural there and needs nothing read off a glyph. A
 * listening question has no stave at all: that is the mode's defining
 * property, not one of its settings. So a stave drawn while the panel says
 * Listening is a disagreement no renderer behaviour could account for, and
 * the cold start beside it is the control — absence has to be what
 * Listening looks like, or the case is about something else.
 *
 * The clef version of this is gone rather than kept beside it: same
 * mechanism, same ruling resolves both, and the renderer claim its control
 * carried — that the four clefs draw differently — is asserted where it
 * belongs, on the adapter, in `toVexflow.test.ts`.
 *
 * **The resolution is a product decision and this does not take it.**
 * Regenerating on change and applying at the next question are both
 * defensible; what is not is a sidebar describing a question other than the
 * one in front of the learner. **If "apply next question" wins this is
 * rewritten rather than deleted** — the claim becomes that the panel marks
 * the change as pending.
 */
describe('changing the mode while a question is on screen', () => {
  /** A started round of intervals in one mode, with the stave given a width. */
  function roundIn(mode: string) {
    const screen = mount('interval-id');
    act(() => { screen.button(mode)?.click(); });
    screen.start();
    const host = screen.container.querySelector('.score-host');
    if (host) act(() => { resizeTo(host, 760); });
    return screen;
  }

  const staveShowing = (screen: { container: HTMLElement }) =>
    screen.container.querySelector('.score-host svg') !== null;

  it('is a mode that shows no stave, or the case below is about nothing', () => {
    // The control, and it is the whole of what makes absence meaningful: a
    // listening question withholds the notation until it is answered.
    expect(staveShowing(roundIn('Listening')),
      'a cold listening start drew a stave, so a stave proves nothing').toBe(false);
    expect(staveShowing(roundIn('Reading')),
      'a reading start drew none, so the comparison has no two sides').toBe(true);
  });

  it.fails('shows no stave once the panel says the question is by ear', () => {
    /*
      Switch Reading to Listening with a question up and the stave stays
      fully drawn — `.score-host svg` present while `presentation` reads
      `listen`. Found by the user role; main's own probe had printed
      `+stave` an hour earlier and read past what it meant in Listening.

      Checked to fail by assertion rather than by throwing: run as a plain
      `it` it reports "the stave outlived the mode that drew it".
    */
    const screen = roundIn('Reading');
    act(() => { screen.button('Listening')?.click(); });
    const host = screen.container.querySelector('.score-host');
    if (host) act(() => { resizeTo(host, 760); });

    expect(staveShowing(screen), 'the stave outlived the mode that drew it').toBe(false);
  });
});

describe('narrowing the pool while a question is on screen', () => {
  const INTERVALS = [
    'Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th',
    'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th',
    'Octave',
  ];

  /** Intervals narrowed to a pair, so one untick leaves exactly one button. */
  function twoIntervalRound() {
    const screen = mount('interval-id');
    const panel = () =>
      [...screen.container.querySelectorAll('.practice-settings button')] as HTMLButtonElement[];
    const chip = (label: string) => panel().find((b) => b.textContent?.trim() === label);
    const toggle = (label: string) => act(() => { chip(label)?.click(); });

    if (!chip('Unison')?.className.includes('on')) toggle('Unison');
    for (const name of INTERVALS) {
      if (name === 'Unison' || name === 'Octave') continue;
      if (chip(name)?.className.includes('on')) toggle(name);
    }
    return {
      ...screen,
      toggle,
      choices: () =>
        ([...screen.container.querySelectorAll('.choice')] as HTMLButtonElement[])
          .map((b) => b.textContent?.trim() ?? ''),
      press: (label: string) => act(() => {
        ([...screen.container.querySelectorAll('.choice')] as HTMLButtonElement[])
          .find((b) => b.textContent?.trim() === label)?.click();
      }),
      /** What the verdict says the answer was, and how many attempts stand. */
      verdict: () => {
        const text = screen.container.textContent ?? '';
        return {
          answer: text.match(/(?:Yes — |No: that was )([A-Za-z0-9 ]+?)[,(]/)?.[1]?.trim(),
          /*
            The session line, not the per-item one. "N of M right" appears
            once per item in the breakdown, so reading it gives whichever
            item happens to be listed first — a count that went 1, 1, 2, 2,
            3, 4, 5, 3 across eight rounds and would have made any
            assertion about it nonsense.
          */
          recorded: Number(text.match(/(\d+) of (\d+) this session/)?.[2] ?? 0),
        };
      },
    };
  }

  it('cannot be left with no right answer on screen', () => {
    /*
      **Inverted rather than deleted**, now that `IntervalExercise` carries
      the choices it was drawn against.

      It was written as `it.fails` on the claim that no attempt is recorded
      for an unoffered answer, and the fix made it green-by-accident: no
      round can go unanswerable any more, so the control — "at least one
      round went unanswerable, or nothing above was asserted" — is what
      fails, and `it.fails` accepts any failure. The case would have gone on
      reporting as a known defect while testing nothing, and the recorded
      message beside it is the only thing that would have said so.

      So the walk and the control stay and the claim turns over: unticking
      the answer mid-question leaves it on screen, and the attempt that
      follows is the one the learner was actually asked. The storage half is
      still what is asserted — no attempt against an item that was not
      offered — because that is what costs a learner something whichever way
      the stale-display question resolves.
    */
    const screen = twoIntervalRound();
    let wouldHaveBeenUnanswerable = 0;
    let answered = 0;

    for (let round = 0; round < 8; round += 1) {
      act(() => { screen.button(round === 0 ? 'Start' : 'Next')?.click(); });
      screen.toggle('Unison');
      const offered = screen.choices();

      screen.press(offered[0]);
      const after = screen.verdict();

      expect(after.answer, `round ${round}: no verdict was reported`).toBeDefined();
      expect(offered, `round ${round}: the answer was not among the choices`)
        .toContain(after.answer);
      answered += 1;
      if (after.answer === 'Unison') wouldHaveBeenUnanswerable += 1;

      screen.toggle('Unison');
    }

    // Every round reached storage, counted once. Asserted over the whole
    // walk rather than as an increment per round: the tally is cleared
    // while a new question is up, so a per-round reading is of the gap
    // rather than of the log.
    expect(screen.verdict().recorded, 'the session counted a different number of attempts')
      .toBe(answered);

    /*
      The control, and it is the whole case. Unticking an interval the
      question was not about proves nothing — the rounds that matter are the
      ones where the answer *is* the interval that was switched off, which
      is the state that used to leave one wrong button on screen.
    */
    expect(wouldHaveBeenUnanswerable,
      'no round had its own answer unticked, so none of them was the defect')
      .toBeGreaterThan(0);
  });
});
