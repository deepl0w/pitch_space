// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CircleOfFifths } from './CircleOfFifths';
import { CIRCLE } from '../../theory/circle';
import { keyName } from '../../theory/key';

/**
 * What each wedge of the circle claims about key signatures.
 *
 * Three of the twelve positions carry two spellings, and the screen used to
 * print one accidental count for both: the wedge naming D♭ and C♯ said "5♭",
 * which is right for D♭ and wrong for C♯ by two accidentals and the wrong
 * symbol. B over C♭ said "5♯" where C♭ has seven flats.
 *
 * That is the worst thing this screen can do. Its whole job is teaching key
 * signatures, and a learner reading it has no way to know the number under
 * the name is not the number for that name. A wrong note is a bug; a wrong
 * fact taught confidently is the screen failing at the one thing it is for.
 *
 * Checked against `CIRCLE` rather than against a list of the three positions
 * that happen to pair today, so a change to how keys are enumerated cannot
 * quietly take a wedge out of the sweep.
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
  act(() => root.render(<CircleOfFifths />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * Every label of one kind, grouped by the wedge it sits on.
 *
 * A stacked pair is two `text` elements sharing an `x` and differing in
 * `y`, so a wedge is identified by its `x` rather than by a single
 * element. Assertions stay about what a wedge *says* rather than about
 * which branch drew it.
 */
function lines(scope: Element | null, selector: string): string[] {
  if (scope === null) return [];
  return [...scope.querySelectorAll(selector)]
    .sort((a, b) => Number(a.getAttribute('y')) - Number(b.getAttribute('y')))
    .map((t) => t.textContent ?? '');
}

/** The signature a key actually has, spelled the way the wedge spells it. */
const expected = (accidentals: number) =>
  accidentals === 0 ? '—' : `${Math.abs(accidentals)}${accidentals > 0 ? '♯' : '♭'}`;

const wedges = () => [...container.querySelectorAll('svg.circle > g')];

describe('every wedge of the circle', () => {
  it('draws one signature for every spelling it names', () => {
    expect(wedges()).toHaveLength(CIRCLE.length);

    for (const [i, position] of CIRCLE.entries()) {
      const signatures = lines(wedges()[i], '.wedge-signature');
      expect(signatures).toHaveLength(position.major.length);
    }
  });

  it('gives each spelling its own count, not its neighbour\'s', () => {
    for (const [i, position] of CIRCLE.entries()) {
      const signatures = lines(wedges()[i], '.wedge-signature');

      expect(signatures).toEqual(position.major.map((k) => expected(k.accidentals)));
    }
  });

  it('keeps the signatures in the order of the names above them', () => {
    // The pairing is only legible because the rows line up: second line of
    // names to second line of signatures. Stacking them in different orders
    // would be worse than printing one, because it would look deliberate.
    for (const [i, position] of CIRCLE.entries()) {
      const wedge = wedges()[i];
      const names = lines(wedge, '.wedge-label:not(.wedge-label-minor)');
      const signatures = lines(wedge, '.wedge-signature');

      expect(names).toEqual(position.major.map((k) => keyName(k).replace(' major', '')));
      expect(signatures).toHaveLength(names.length);
    }
  });
});

describe('the enharmonic positions', () => {
  /**
   * The guard against the sweep above passing vacuously.
   *
   * If every position carried one spelling, all three tests would be green
   * and would be asserting nothing about the defect they exist for.
   */
  it('are there to be got wrong', () => {
    const paired = CIRCLE.filter((p) => p.major.length > 1);
    expect(paired.length).toBeGreaterThan(0);
  });

  it('name two keys whose signatures genuinely differ', () => {
    for (const position of CIRCLE.filter((p) => p.major.length > 1)) {
      const counts = new Set(position.major.map((k) => expected(k.accidentals)));
      // D♭/C♯ is 5♭ against 7♯, B/C♭ is 5♯ against 7♭, G♭/F♯ is 6♭ against
      // 6♯ — same number, opposite symbol. None of the three is a case where
      // printing one count would have been harmless.
      expect(counts.size).toBe(position.major.length);
    }
  });
});

/**
 * The stack spacing has to follow the type size, because one component
 * sets three rows at three sizes.
 *
 * It was a fixed 11px: comfortable under an 8px signature, and exactly the
 * glyph height under an 11px major name — so the three enharmonic majors
 * printed B over Cb, Gb over F#, Db over C# at the same point, while the
 * minor ring one step in, with identical markup, read cleanly. Found by
 * the user role, by comparing the two rings rather than reading either
 * alone; a test that checked only "two lines are present" passed
 * throughout, and this is the assertion that would not have.
 */
describe('stacking two spellings on one wedge', () => {
  /**
   * Drawn apart, asserted in the coordinates the browser uses.
   *
   * Two earlier versions stacked with `dy` on tspans — once a hardcoded
   * pixel gap that collided under the largest of the three type sizes,
   * once `em` on a `dy` attribute, which shipped as fixed and changed
   * nothing on the page. Neither could be checked here: jsdom implements
   * no `SVGAnimatedLengthList`, so a `dy` is an opaque string to this
   * suite however it is written.
   *
   * Separate `text` elements at explicit `y` need no `dy` semantics, and
   * `y` is a number this test can compare.
   */
  it('gives the two spellings different y, on every row that stacks', () => {
    const stacked = [...container.querySelectorAll('g')]
      .flatMap((wedge) => ['.wedge-label:not(.wedge-label-minor)', '.wedge-label-minor', '.wedge-signature']
        .map((sel) => [...wedge.querySelectorAll(sel)])
        .filter((group) => group.length > 1));

    // Three wedges carry two spellings, and each has three rows.
    expect(stacked.length).toBe(9);

    for (const group of stacked) {
      const ys = group.map((t) => Number(t.getAttribute('y')));
      const sizes = group.map((t) => Number(t.getAttribute('font-size')));
      expect(new Set(ys).size, `${group.map((t) => t.textContent)} share a y`).toBe(ys.length);
      // And far enough apart to clear the glyphs: the gap has to beat the
      // type size, which is the thing the first version got wrong.
      expect(Math.abs(ys[1] - ys[0])).toBeGreaterThan(Math.max(...sizes));
    }
  });

  it('puts both spellings of every shared wedge on their own line', () => {
    const all = [...container.querySelectorAll('g')]
      .map((wedge) => lines(wedge, '.wedge-label:not(.wedge-label-minor)'))
      .filter((l) => l.length > 1);

    for (const pair of [['B', 'Cb'], ['Gb', 'F#'], ['Db', 'C#']]) {
      expect(all, `${pair.join('/')} is not stacked`)
        .toContainEqual(expect.arrayContaining(pair));
    }
  });
});
