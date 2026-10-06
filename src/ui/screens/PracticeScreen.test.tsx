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
 * invalidate the generated exercise: the chip moves and the stave does not.
 * Found by the user role on a clef and reproduced here deterministically —
 * it is not clef-specific, because every field in that panel has the same
 * shape and none of them reaches the question already drawn.
 *
 * **The resolution is a product decision and this does not take it.**
 * Regenerating on change and applying at the next question are both
 * defensible; what is not defensible is the state on screen now, where the
 * sidebar says Tenor and the staff is in bass and nothing says which is
 * true. So the case below pins the contradiction rather than either answer,
 * and `it.fails` records that it is known. **If "apply next question" wins,
 * this case has to be rewritten rather than deleted** — the claim becomes
 * that the panel marks the change as pending, because a control that
 * silently describes a question other than the one in front of the user is
 * the same defect with a different cause.
 */
describe('changing a setting while a question is on screen', () => {
  /** The clef the stave is actually drawn with, as markup. */
  function clefDrawn(container: HTMLElement): string {
    const host = container.querySelector('.score-host');
    if (!host) throw new Error('no score was rendered');
    act(() => { resizeTo(host, 760); });
    const clef = container.querySelector('.vf-clef');
    if (!clef) throw new Error('no clef was drawn');
    // VexFlow numbers its groups from a counter that never resets, so the
    // ids differ between any two renders and have to come out before two
    // drawings can be compared at all.
    return clef.outerHTML.replace(/vf-auto\d+/g, 'vf-auto');
  }

  /** A reading round of intervals, started with one clef chosen. */
  function roundIn(clef: string) {
    const screen = mount('interval-id');
    screen.button('Reading')?.click();
    act(() => { screen.button(clef)?.click(); });
    screen.start();
    return screen;
  }

  it('is drawing in a clef at all, or the case below compares nothing', () => {
    // The control. If the stave ignored the clef setting entirely, "the
    // drawing did not follow the chip" would be true and would mean
    // something else — a renderer fault rather than a stale question.
    const treble = roundIn('Treble');
    const bass = roundIn('Bass');
    expect(clefDrawn(treble.container), 'two clefs draw the same stave')
      .not.toBe(clefDrawn(bass.container));
  });

  it.fails('draws the question in the clef the panel says is chosen', () => {
    /*
      Measured: the chip follows every click and the stave follows none of
      them, until the next question is generated.

          after Start with Treble     chip=Treble   drawn=treble
          clicked Bass mid-question   chip=Bass     drawn=treble
          clicked Alto mid-question   chip=Alto     drawn=treble
    */
    // Checked to fail by assertion rather than by throwing — `it.fails`
    // accepts any failure, and `clefDrawn` throws when nothing was drawn,
    // which would have looked exactly the same. Run as a plain `it` it
    // reports "the stave is still in the old clef".
    const inBass = clefDrawn(roundIn('Bass').container);

    const screen = roundIn('Treble');
    act(() => { screen.button('Bass')?.click(); });

    // The chip moved, so the click was received and the panel agrees it is
    // now set to bass.
    expect(screen.container.querySelector('.chip.on')).toBeTruthy();
    expect(clefDrawn(screen.container), 'the stave is still in the old clef')
      .toBe(inBass);
  });
});

/**
 * A question with no right answer on screen, marked wrong.
 *
 * Narrow the pool to two intervals, start a question, untick the one that
 * happens to be the answer, and the only button left is the wrong one.
 * Pressing it records an attempt — scored against the learner, written to
 * the log, and therefore into whatever the schedule makes of it.
 *
 * **This is a different defect from the stale clef above and the difference
 * is the whole of why it is worse.** Clef and range are *stale*: the
 * question holds its generated value, the panel runs ahead, and the display
 * disagrees. The choice list is **live** — it re-renders from the current
 * settings while the generated answer stays fixed — so the two are views of
 * different vintages rather than one frozen view, and only that can produce
 * a question nobody could have answered.
 *
 * Found by the user role, reproduced independently by main, and pinned here
 * on the claim that costs a learner something: **an attempt is never
 * recorded against an item whose correct answer was not offered.** That
 * holds whichever way the stale-display question is resolved, because it is
 * about what reaches storage rather than about what is on screen.
 */
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
          recorded: Number(text.match(/\d+ of (\d+) right/)?.[1] ?? 0),
        };
      },
    };
  }

  it.fails('records no attempt when the answer is no longer among the choices', () => {
    /*
      Reproduced on the first round: offered `Unison | Octave`, unticked
      Unison, pressed the only button left, and got

          No: that was Unison — 0 of 1 right

      Rounds are generated from a fresh seed, so this walks a few and
      asserts on the ones that actually went unanswerable, with a control
      below that at least one did. The assertion is on the count the
      session reports, which is the attempt log's own reading.

      Checked to fail by assertion rather than by throwing: run as a plain
      `it` it reports "an attempt was recorded for a question whose answer
      was not offered".
    */
    const screen = twoIntervalRound();
    let unanswerable = 0;

    for (let round = 0; round < 8; round += 1) {
      act(() => { screen.button(round === 0 ? 'Start' : 'Next')?.click(); });
      screen.toggle('Unison');
      const offered = screen.choices();
      if (offered.length !== 1) { screen.toggle('Unison'); continue; }

      const before = screen.verdict().recorded;
      screen.press(offered[0]);
      const after = screen.verdict();
      if (after.answer && !offered.includes(after.answer)) {
        unanswerable += 1;
        expect(after.recorded,
          'an attempt was recorded for a question whose answer was not offered')
          .toBe(before);
      }
      screen.toggle('Unison');
    }

    expect(unanswerable, 'no round went unanswerable, so nothing above was asserted')
      .toBeGreaterThan(0);
  });
});
