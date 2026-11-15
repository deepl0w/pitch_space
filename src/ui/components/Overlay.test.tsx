// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Overlay } from './Overlay';
import { ReferenceOverlay } from './ReferenceOverlay';
import { referenceFor } from '../reference';
import { resizeTo } from '../../testing/resizeObserver';
import type { ItemId } from '../../exercises/types';

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const escape = () => act(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
});
const layers = () => [...container.querySelectorAll('[role="dialog"]')]
  .map((layer) => layer.getAttribute('aria-label'));

/** Two layers, each closed by its own state, the way the app holds them. */
function Stacked() {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(true);
  return (
    <>
      <button type="button" id="underneath">underneath</button>
      {outer && (
        <Overlay label="Reference" onClose={() => setOuter(false)}>
          <p>reading</p>
        </Overlay>
      )}
      {inner && (
        <Overlay label="Settings" onClose={() => setInner(false)}>
          <p>settings</p>
        </Overlay>
      )}
    </>
  );
}

describe('a layer over the screen', () => {
  it('closes only the layer on top when Escape is pressed', () => {
    /*
      The reference opens over a round and the cog can open settings over
      that. Each layer listened on the window, so one key closed both and
      dropped the learner past the page they were reading.
    */
    act(() => root.render(<Stacked />));
    expect(layers()).toEqual(['Reference', 'Settings']);
    escape();
    expect(layers()).toEqual(['Reference']);
    escape();
    expect(layers()).toEqual([]);
  });

  it('takes focus when it opens and gives it back when it closes', () => {
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" id="opener" onClick={() => setOpen(true)}>open</button>
          {open && <Overlay label="Layer" onClose={() => setOpen(false)}><p>inside</p></Overlay>}
        </>
      );
    }
    act(() => root.render(<Opener />));
    const opener = container.querySelector('#opener') as HTMLButtonElement;
    opener.focus();
    act(() => opener.click());
    expect(document.activeElement?.className).toBe('overlay-close');
    escape();
    expect(document.activeElement).toBe(opener);
  });
});

describe('the reference, opened from an answer', () => {
  /** The value every picker on the page shows. */
  const picked = () => [...container.querySelectorAll('select')].map((select) => select.value);

  function open(item: string) {
    const target = referenceFor(item as ItemId, undefined);
    expect(target, item).not.toBeNull();
    act(() => root.render(<ReferenceOverlay target={target!} onClose={() => {}} />));
    return picked();
  }

  it('opens on the interval asked, in the direction it was asked', () => {
    // 8 semitones is the minor sixth; the page shows its value, not its name.
    expect(open('interval:m6:down')).toEqual(expect.arrayContaining(['8', 'down']));
  });

  it('opens on the scale asked', () => {
    expect(open('scale:harmonic_minor')).toContain('harmonic_minor');
  });

  it('opens on the chord asked, in the inversion asked', () => {
    expect(open('chord:dom7:inv2')).toEqual(expect.arrayContaining(['dom7', '2']));
  });

  it('opens on the key asked', () => {
    open('key:Eb_major');
    // The circle has no picker; the chosen wedge is the pressed one.
    const pressed = [...container.querySelectorAll('[aria-pressed="true"]')]
      .map((wedge) => wedge.getAttribute('aria-label'));
    expect(pressed).toEqual(['Eb major']);
  });

  it('opens on the metre a rhythm figure belongs to', () => {
    expect(open('cell:q')).toContain('4/4');
  });

  /**
   * The sixth route, which had no landing case while the other five did.
   *
   * A progression item carries its mode and numeral but no key, so
   * `reference.ts` sends the page the mode's plainest key — `A_minor` for a
   * minor progression. Nothing rendered that: the whole suite passed with
   * `KeyChords` ignoring `focus` altogether, which puts every minor
   * progression on C major. Right page, wrong mode, nothing on screen
   * suggesting it — the same correct-looking failure the reference guards
   * were written against, on the one route they did not reach.
   *
   * Both modes, because a case for the minor alone would pass against a page
   * hard-wired to A minor, and that is the mirror of the defect.
   */
  it('opens on the key a progression’s mode is plainest in', () => {
    expect(open('progression:minor:iv')).toContain('A_minor');
    /*
      Closed before the second, which is the only way the app reaches it:
      `PracticeScreen` renders the overlay as `{lookingUp && ...}`, so
      closing unmounts it and the next look-up is a fresh mount. Re-rendering
      one mounted overlay at a new target leaves the page where it was —
      `KeyChords` takes its key in a `useState` initialiser, which runs once —
      and asserting against that would be asserting a transition no button
      can produce.
    */
    act(() => root.render(null));
    expect(open('progression:major:V')).toContain('C_major');
  });

  it('singles out the chord the progression asked about, and only a chord the key has', () => {
    const lit = () => [...container.querySelectorAll('.score-host .vf-stavenote')]
      .map((g, i) => (g.classList.contains('score-lit') ? i : -1)).filter((i) => i >= 0);
    const asked = () => [...container.querySelectorAll('.readout li')]
      .filter((li) => li.textContent?.includes('the one asked'))
      .map((li) => li.querySelector('.primary')?.textContent);

    open('progression:major:V');
    for (const host of container.querySelectorAll('.score-host')) {
      act(() => resizeTo(host as HTMLElement, 700));
    }
    // V is the fifth of the seven, counting from zero.
    expect(lit()).toEqual([4]);
    expect(asked()).toEqual(['V']);

    act(() => root.render(null));
    // V/V is not one of the key's own chords, so nothing claims to be it.
    open('progression:major:V/V');
    for (const host of container.querySelectorAll('.score-host')) {
      act(() => resizeTo(host as HTMLElement, 700));
    }
    expect(lit()).toEqual([]);
    expect(asked()).toEqual([]);
  });

  /**
   * The mark is a claim about one question, and the key picker outlives it.
   *
   * `KeyChords` recomputes `markedAt` from the current key on every render,
   * so the numeral follows the picker. Opened from a question about A
   * minor's `v` and switched to E minor, the page labelled B minor "the one
   * asked" — a chord the question was never about. The harmonic case is the
   * same fault arriving the other way: `progression:minor:V` marks nothing
   * in A minor, correctly, because the natural-minor table has `v`; switch
   * to C major and the mark appears on a chord in a key the learner was
   * never asked about.
   *
   * Asserted against the page's own stated principle rather than a
   * preference of this test's: marking the diatonic chord on a numeral's
   * degree "would be a different chord claiming to be the one asked", which
   * is precisely what a key change produces.
   *
   * Both directions, and what each one kills, measured rather than assumed:
   * blanking the mark only when the *mode* changes passes the harmonic case
   * and still carries `v` from A minor into E minor, so the first direction
   * is what rules that out. The second is the edge the change's author named
   * as unprobed, and it is a different symptom rather than a second witness
   * to the first — a mark that materialises where there was none, against
   * one that moves.
   */
  it('leaves the mark behind in the key the question was asked in', () => {
    const asked = () => [...container.querySelectorAll('.readout li')]
      .filter((li) => li.textContent?.includes('the one asked'))
      .map((li) => li.querySelector('.primary')?.textContent);
    const setKey = (id: string) => {
      const field = [...container.querySelectorAll('label.field')]
        .find((l) => l.querySelector('span')?.textContent === 'Key');
      const select = field!.querySelector('select') as HTMLSelectElement;
      act(() => {
        // React listens for the event, not the property, so set it the way
        // the DOM would and let the change bubble.
        Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!
          .set!.call(select, id);
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };

    open('progression:minor:v');
    // The control: without this the case is satisfied by a page that never
    // marks anything at all.
    expect(asked(), 'the key the question was asked in marks nothing').toEqual(['v']);
    setKey('E_minor');
    expect(asked(), 'another key kept the mark, so a chord nobody asked about claims it')
      .toEqual([]);

    act(() => root.render(null));
    open('progression:minor:V');
    expect(asked(), 'a numeral the key does not supply was marked anyway').toEqual([]);
    setKey('C_major');
    expect(asked(), 'the numeral found a key to match in, which is not the one it was asked in')
      .toEqual([]);
  });
});
