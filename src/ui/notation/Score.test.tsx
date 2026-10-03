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
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
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
