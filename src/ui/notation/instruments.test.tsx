// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { midiOf, parsePitch } from '../../theory/pitch';
import { SCALE_TYPES, spellScale } from '../../theory/scale';
import {
  FRETS, GUITAR_TUNING, fretPositions, isBlack, keyboardSpan, spelledNames,
} from './instruments';
import { Fretboard, InstrumentDiagram, Keyboard } from './InstrumentDiagram';
import { settingsStore } from '../../state/settingsStore';

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const p = (names: string[]) => names.map(parsePitch);

describe('where notes fall on a keyboard', () => {
  it('draws whole octaves from C, so the black-key groups can be found', () => {
    const { low, high } = keyboardSpan(p(['E4', 'G4', 'B4', 'D5']));
    expect(low).toBe(midiOf(parsePitch('C4')));
    expect(high).toBe(midiOf(parsePitch('B5')));
  });

  it('knows the five black keys of every octave', () => {
    const blacks = Array.from({ length: 24 }, (_, i) => 48 + i).filter(isBlack).map((m) => m % 12);
    expect(blacks).toEqual([1, 3, 6, 8, 10, 1, 3, 6, 8, 10]);
  });
});

describe('where notes fall on a guitar neck', () => {
  it('finds every position of every note, and nothing else', () => {
    // Every scale, from a few roots: each position must be one of the
    // scale's notes, and each note must appear on every string — twelve
    // frets is an octave, so no pitch class can be missing from a string.
    for (const type of SCALE_TYPES) {
      for (const root of ['C4', 'F#4', 'Bb3']) {
        const scale = spellScale(parsePitch(root), type);
        const classes = new Set(scale.map((n) => midiOf(n) % 12));
        const found = fretPositions(scale);
        for (const at of found) {
          expect(classes.has((GUITAR_TUNING[at.string] + at.fret) % 12)).toBe(true);
          expect(at.fret).toBeLessThanOrEqual(FRETS);
        }
        for (let string = 0; string < GUITAR_TUNING.length; string += 1) {
          const onString = new Set(found.filter((f) => f.string === string).map((f) => f.pitchClass));
          expect(onString, `${type.id} on ${root}, string ${string}`).toEqual(classes);
        }
      }
    }
  });

  it('puts an open E on both outer strings', () => {
    const at = fretPositions(p(['E4']));
    expect(at.filter((f) => f.fret === 0).map((f) => f.string)).toEqual([0, 5]);
  });

  it('names each note as the scale spells it, not as a table prefers', () => {
    // C blues has G♭ and G; a sharp-preferring lookup would print F♯.
    const blues = spellScale(parsePitch('C4'), SCALE_TYPES.find((t) => t.id === 'blues')!);
    expect(spelledNames(blues).get(6)).toBe('Gb');
  });
});

describe('the drawing', () => {
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
    act(() => settingsStore.getState().setAppearance({ diagram: 'none' }));
  });

  const triad = p(['C4', 'E4', 'G4']);
  const marks = () => [...container.querySelectorAll('.diagram-root, .diagram-note')]
    .map((g) => `${g.classList.contains('diagram-root') ? '*' : ''}${g.textContent}`);

  it('marks each sounding key once on the piano, the root apart', () => {
    act(() => root.render(<Keyboard pitches={triad} root={triad[0]} label="C" />));
    expect(marks()).toEqual(['*C', 'E', 'G']);
  });

  it('marks every position on the neck, the roots apart', () => {
    act(() => root.render(<Fretboard pitches={triad} root={triad[0]} label="C" marking="map" />));
    expect(marks().length).toBe(fretPositions(triad).length);
    expect(marks().filter((m) => m === '*C').length).toBe(
      fretPositions(triad).filter((f) => f.pitchClass === 0).length,
    );
  });

  it('tells an octave from a unison on the neck when it is drawing a distance', () => {
    /*
      By pitch class C4–C5 and C4–C4 are the same six dots, every one marked
      as the root — so the intervals page drew a perfect octave exactly as it
      drew a unison. Marking where the two notes sound tells them apart.
    */
    const strong = () => [...container.querySelectorAll('.diagram-root, .diagram-note')]
      .map((g) => g.getAttribute('data-at'));
    const draw = (names: string[]) => {
      act(() => root.render(
        <Fretboard pitches={p(names)} root={parsePitch(names[0])} label="x" marking="sounding" />,
      ));
      return strong();
    };
    const octave = draw(['C4', 'C5']);
    const unison = draw(['C4', 'C4']);
    expect(octave).not.toEqual(unison);
    // The positions not sounding are kept, dimmed: the map stays, with the
    // distance on it.
    expect(container.querySelectorAll('.diagram-dim').length).toBeGreaterThan(0);
  });

  it('draws nothing until an instrument is chosen, then the one chosen', () => {
    const view = <InstrumentDiagram pitches={triad} root={triad[0]} label="C" marking="map" />;
    act(() => settingsStore.getState().setAppearance({ diagram: 'none' }));
    act(() => root.render(view));
    expect(container.querySelector('svg')).toBeNull();
    act(() => settingsStore.getState().setAppearance({ diagram: 'guitar' }));
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toMatch(/guitar/);
    act(() => settingsStore.getState().setAppearance({ diagram: 'piano' }));
    expect(container.querySelector('svg')?.getAttribute('aria-label')).toMatch(/piano/);
  });
});
