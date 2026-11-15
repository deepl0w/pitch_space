// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Score } from './Score';
import { type ScoreSpec } from '../../exercises/render/toVexflow';
import { noteValue } from '../../theory/meter';
import { findKey } from '../../theory/key';
import { parsePitch } from '../../theory/pitch';
import { observedCount, resetObservers, resizeTo } from '../../testing/resizeObserver';
import {
  installMatchMedia, resetColourScheme, schemeListenerCount, setDarkScheme,
} from '../../testing/colourScheme';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const note = (name: string, base: Parameters<typeof noteValue>[0] = 'q') => ({
  pitches: [parsePitch(name)],
  value: noteValue(base),
});

const scale = (names: string[]): ScoreSpec => ({
  notes: names.map((n) => note(n)),
  clef: 'treble',
  key: findKey('C_major'),
});

/**
 * A dotted 64th is 157.5 ticks, which `ticksOf` refuses rather than rounding,
 * so this is a spec the engraver genuinely cannot lay out — and one a rhythm
 * generator could hand it by mistake, which is the case the error branch is
 * for.
 */
const unengravable: ScoreSpec = {
  notes: [{ pitches: [parsePitch('C4')], value: { base: '64', dots: 1 } }],
  clef: 'treble',
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  resetObservers();
  resetColourScheme();
  installMatchMedia();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  // The root element outlives the container, so a case that set the theme
  // and then failed would hand its attribute to every case after it.
  document.documentElement.removeAttribute('data-theme');
});

const render = (spec: ScoreSpec, height?: number) => {
  act(() => root.render(<Score spec={spec} height={height} />));
};

const hostNode = () => container.querySelector('.score-host') as HTMLDivElement;
const svg = () => hostNode().querySelector('svg');
const errorText = () => container.querySelector('.score-error')?.textContent ?? null;
const noteheads = () => hostNode().querySelectorAll('svg .vf-stavenote').length;

describe('Score', () => {
  it('draws nothing until it has been measured', () => {
    // Width starts at 0, and drawing at nothing would be worse than waiting.
    render(scale(['C4', 'D4', 'E4']));
    expect(svg()).toBeNull();
  });

  it('draws once the resize observer reports a width', () => {
    render(scale(['C4', 'D4', 'E4', 'F4']));
    act(() => resizeTo(hostNode(), 800));
    expect(svg()).not.toBeNull();
    expect(noteheads()).toBe(4);
    expect(errorText()).toBeNull();
  });

  it('never engraves narrower than the floor, however little room it is given', () => {
    // Notation is redrawn at the measured width rather than scaled, so below
    // some width it stops being readable instead of merely small.
    render(scale(['C4', 'D4']));
    act(() => resizeTo(hostNode(), 40));
    expect(svg()!.getAttribute('width')).toBe('320');
  });

  it('redraws when the spec changes, replacing rather than accumulating', () => {
    render(scale(['C4', 'D4']));
    act(() => resizeTo(hostNode(), 800));
    expect(noteheads()).toBe(2);

    render(scale(['C4', 'D4', 'E4', 'F4', 'G4']));
    expect(hostNode().querySelectorAll('svg')).toHaveLength(1);
    expect(noteheads()).toBe(5);
  });

  it('redraws at the new height when only the height changes', () => {
    render(scale(['C4', 'D4']), 170);
    act(() => resizeTo(hostNode(), 800));
    expect(svg()!.getAttribute('height')).toBe('170');

    render(scale(['C4', 'D4']), 240);
    expect(svg()!.getAttribute('height')).toBe('240');
  });

  it('redraws when the width changes', () => {
    render(scale(['C4', 'D4']));
    act(() => resizeTo(hostNode(), 800));
    expect(svg()!.getAttribute('width')).toBe('800');
    act(() => resizeTo(hostNode(), 640));
    expect(svg()!.getAttribute('width')).toBe('640');
  });
});

describe('Score when the engraver refuses', () => {
  it('puts the failure on the page instead of only in the console', () => {
    render(unengravable);
    act(() => resizeTo(hostNode(), 800));
    expect(errorText()).toContain('Could not engrave');
    expect(errorText()).toContain('not an integral duration');
  });

  it('leaves no half-drawn staff behind', () => {
    // drawScore appends its SVG and draws the stave before it reaches the note
    // values, so a failure happens with a partial staff already on the page.
    render(unengravable);
    act(() => resizeTo(hostNode(), 800));
    expect(hostNode().children).toHaveLength(0);
  });

  it('recovers when the next spec is engravable', () => {
    render(unengravable);
    act(() => resizeTo(hostNode(), 800));
    expect(errorText()).not.toBeNull();

    render(scale(['C4', 'D4', 'E4']));
    expect(errorText()).toBeNull();
    expect(noteheads()).toBe(3);
  });
});

describe('Score cleanup', () => {
  it('stops observing when it goes away', () => {
    render(scale(['C4']));
    expect(observedCount()).toBe(1);
    act(() => root.unmount());
    expect(observedCount()).toBe(0);
    // afterEach unmounts again; a second unmount is harmless.
    root = createRoot(container);
  });
});

/**
 * The ink is read from the stylesheet at draw time and handed to VexFlow,
 * because recolouring the output afterwards cannot reach a staff line — so a
 * theme change has to redraw rather than restyle. Whether the redraw happens
 * is the whole of what makes that approach work.
 */
describe('Score when the colour scheme changes', () => {
  it('redraws, rather than leaving ink from the old theme on the page', () => {
    render(scale(['C4', 'D4']));
    act(() => resizeTo(hostNode(), 800));
    const before = svg();
    expect(before).not.toBeNull();

    act(() => setDarkScheme(true));

    // A redraw replaces the host's children, so the old SVG is gone rather
    // than restyled — which is the point, since restyling is what failed.
    expect(hostNode().querySelectorAll('svg')).toHaveLength(1);
    expect(svg()).not.toBe(before);
    expect(noteheads()).toBe(2);
  });

  it('redraws again on the way back', () => {
    render(scale(['C4']));
    act(() => resizeTo(hostNode(), 800));
    act(() => setDarkScheme(true));
    const dark = svg();
    act(() => setDarkScheme(false));
    expect(svg()).not.toBe(dark);
  });

  it('stops listening when it goes away', () => {
    render(scale(['C4']));
    expect(schemeListenerCount()).toBe(1);
    act(() => root.unmount());
    expect(schemeListenerCount()).toBe(0);
    root = createRoot(container);
  });

  /**
   * The reader's own choice of Light or Dark, which is the other half of the
   * palette and moves no media query at all.
   *
   * This stood as a todo whose comment said the behaviour was missing and
   * wanted a MutationObserver written. It is not missing — `App` sets
   * `data-theme` from `appearance.theme` and `Score` watches the attribute,
   * filtered. Only the test was outstanding, and the stale comment was the
   * more costly half: read as written it authorised a second observer beside
   * the one already there.
   *
   * Both directions, because removing the attribute is how the reader goes
   * back to following the device, and a redraw on the way in that does not
   * happen on the way out leaves the chosen ink outliving the choice.
   */
  it('redraws when the reader sets the theme, and when they stop', async () => {
    render(scale(['C4', 'D4']));
    act(() => resizeTo(hostNode(), 800));
    const before = svg();
    expect(before).not.toBeNull();

    // A MutationObserver delivers on a microtask, so the redraw lands after
    // the attribute is set rather than during it.
    await act(async () => { document.documentElement.setAttribute('data-theme', 'dark'); });

    expect(hostNode().querySelectorAll('svg'), 'the old stave was left beside the new one')
      .toHaveLength(1);
    const chosen = svg();
    expect(chosen, 'the ink was read once and outlived the theme it came from').not.toBe(before);
    expect(noteheads()).toBe(2);

    await act(async () => { document.documentElement.removeAttribute('data-theme'); });
    expect(svg(), 'going back to the device preference left the chosen ink on the page')
      .not.toBe(chosen);
  });
});

describe('lighting the note that is sounding', () => {
  const lit = () => [...hostNode().querySelectorAll('svg .vf-stavenote')]
    .map((g, i) => (g.classList.contains('score-lit') ? i : -1)).filter((i) => i >= 0);
  const spec = scale(['C4', 'D4', 'E4', 'F4']);
  const draw = (index: number | null) => act(() => root.render(<Score spec={spec} lit={index} />));

  it('lights exactly the note asked for, and moves when asked', () => {
    draw(1);
    act(() => resizeTo(hostNode(), 800));
    expect(lit()).toEqual([1]);
    draw(3);
    expect(lit()).toEqual([3]);
    draw(null);
    expect(lit()).toEqual([]);
  });

  it('keeps the light through a redraw, which replaces every group', () => {
    draw(2);
    act(() => resizeTo(hostNode(), 800));
    act(() => resizeTo(hostNode(), 640));
    expect(lit()).toEqual([2]);
  });
});

