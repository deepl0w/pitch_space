// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CircleOfFifths, GLYPH_HEIGHT } from './CircleOfFifths';
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
 * Every label of one kind, in the order they are drawn down the wedge.
 *
 * A stacked pair is two `text` elements sharing an `x` and differing in
 * `y`, so a wedge is identified by its `x` rather than by a single
 * element. A signature is a `tspan` inside its key's name and has no `y`
 * of its own, so it is ordered by the line it sits on. Assertions stay
 * about what a wedge *says* rather than about which branch drew it.
 */
function lines(scope: Element | null, selector: string): string[] {
  if (scope === null) return [];
  return [...scope.querySelectorAll(selector)]
    .map((el) => ({ el, y: Number((el.closest('text') ?? el).getAttribute('y')) }))
    .sort((a, b) => a.y - b.y)
    .map(({ el }) => el.textContent ?? '');
}

/** A name without the signature its own tspan contributes to `textContent`. */
function nameOf(el: Element): string {
  const signature = el.querySelector('.wedge-signature');
  return (el.textContent ?? '').replace(signature?.textContent ?? '\u0000', '').trim();
}

/** The signature a key actually has, spelled the way the wedge spells it. */
const expected = (accidentals: number) =>
  accidentals === 0 ? '—' : `${Math.abs(accidentals)}${accidentals > 0 ? '♯' : '♭'}`;

/** Signatures as drawn, with the thin space that separates them from the name. */
const drawn = (scope: Element) =>
  lines(scope, '.wedge-signature').map((t) => t.replace('\u2009', ''));

const wedges = () => [...container.querySelectorAll('svg.circle > g')];

describe('every wedge of the circle', () => {
  it('draws one signature for every spelling it names', () => {
    expect(wedges()).toHaveLength(CIRCLE.length);

    for (const [i, position] of CIRCLE.entries()) {
      const signatures = drawn(wedges()[i]);
      expect(signatures).toHaveLength(position.major.length);
    }
  });

  it('gives each spelling its own count, not its neighbour\'s', () => {
    for (const [i, position] of CIRCLE.entries()) {
      const signatures = drawn(wedges()[i]);

      expect(signatures).toEqual(position.major.map((k) => expected(k.accidentals)));
    }
  });

  it('keeps the signatures in the order of the names above them', () => {
    // The pairing is only legible because the rows line up: second line of
    // names to second line of signatures. Stacking them in different orders
    // would be worse than printing one, because it would look deliberate.
    for (const [i, position] of CIRCLE.entries()) {
      const wedge = wedges()[i];
      const names = [...wedge.querySelectorAll('.wedge-label:not(.wedge-label-minor)')]
        .sort((a, b) => Number(a.getAttribute('y')) - Number(b.getAttribute('y')))
        .map(nameOf);
      const signatures = drawn(wedge);

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
 * Nothing a wedge draws may sit on top of anything else it draws.
 *
 * This is the assertion three attempts at this screen did without, and all
 * three shipped something that still overlapped. The first stacked two
 * names 11px apart under 11px type; the second moved the gap to `em` on a
 * `dy` attribute and changed nothing on the page; the third separated the
 * names properly and left the signature ring, drawn at a fixed radius for
 * one line of names, printing straight through the two.
 *
 * Each of those was checked by a test about the thing that had just been
 * moved — do the two names differ in `y` — and each passed while the wedge
 * was still unreadable. The property that actually has to hold is about
 * every pair of labels in the wedge, not about the pair under repair, and
 * it is the one worth paying a box-intersection test for.
 *
 * A signature is now a `tspan` inside its name, so it is one text run with
 * it and cannot collide with it by construction; what remains checkable
 * here is the stacking, and it is checked exhaustively.
 */
describe('what a wedge draws', () => {
  /**
   * An approximate ink box for an SVG label.
   *
   * jsdom measures no text, so both dimensions are modelled. The width is
   * a generous estimate — 0.62em per character is wide for digits and
   * narrow for nothing in this alphabet. The height is not an estimate but
   * {@link GLYPH_HEIGHT}, read off `getBBox` in Chrome, and using it here
   * is the whole point: the first version of this test modelled a line as
   * 1.0em tall, agreed with a layout that left the stacked pairs touching
   * by 1.7px, and passed. A box test is only as good as its box.
   */
  function box(el: Element) {
    const size = Number(el.getAttribute('font-size'));
    const x = Number(el.getAttribute('x'));
    const y = Number(el.getAttribute('y'));
    const width = (el.textContent ?? '').length * size * 0.62;
    const height = size * GLYPH_HEIGHT;
    return { l: x - width / 2, r: x + width / 2, t: y - height / 2, b: y + height / 2 };
  }

  const overlaps = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
    a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

  it('keeps every label clear of every other label on the same wedge', () => {
    for (const [i, position] of CIRCLE.entries()) {
      const labels = [...wedges()[i].querySelectorAll('text')];
      for (const [j, first] of labels.entries()) {
        for (const second of labels.slice(j + 1)) {
          expect(
            overlaps(box(first), box(second)),
            `on the ${position.major.map((k) => keyName(k)).join('/')} wedge, `
            + `"${first.textContent}" overlaps "${second.textContent}"`,
          ).toBe(false);
        }
      }
    }
  });

  it('has wedges that draw enough labels for that to mean something', () => {
    // Twelve positions, three of which name two keys: fifteen names and
    // fifteen minors. A wedge drawing one label can never fail the sweep
    // above, so the sweep is only worth having if most of them draw more.
    const counts = CIRCLE.map((_, i) => wedges()[i].querySelectorAll('text').length);
    expect(counts.filter((n) => n > 2).length).toBe(3);
    expect(Math.min(...counts)).toBe(2);
  });
});

/**
 * The stack spacing has to follow the type size, because one component
 * sets two rows at two sizes.
 *
 * It was a fixed 11px: comfortable under an 8px signature, and exactly the
 * glyph height under an 11px major name — so the three enharmonic majors
 * printed B over C♭, G♭ over F♯, D♭ over C♯ at the same point, while the
 * minor ring one step in, with identical markup, read cleanly. Found by
 * the user role, by comparing the two rings rather than reading either
 * alone; a test that checked only "two lines are present" passed
 * throughout.
 */
describe('stacking two spellings on one wedge', () => {
  it('gives the two spellings different y, on every row that stacks', () => {
    const stacked = [...container.querySelectorAll('g')]
      .flatMap((wedge) => ['.wedge-label:not(.wedge-label-minor)', '.wedge-label-minor']
        .map((sel) => [...wedge.querySelectorAll(sel)])
        .filter((group) => group.length > 1));

    // Three wedges carry two spellings, and each stacks both of its rows.
    expect(stacked.length).toBe(6);

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
      .map((wedge) => [...wedge.querySelectorAll('.wedge-label:not(.wedge-label-minor)')]
        .sort((a, b) => Number(a.getAttribute('y')) - Number(b.getAttribute('y')))
        .map(nameOf))
      .filter((l) => l.length > 1);

    for (const pair of [['B', 'Cb'], ['Gb', 'F#'], ['Db', 'C#']]) {
      expect(all, `${pair.join('/')} is not stacked`)
        .toContainEqual(expect.arrayContaining(pair));
    }
  });

  it('keeps each signature on the line of the key it belongs to', () => {
    // The defect this screen exists to not have: D♭'s five flats printed
    // against C♯. Checked as containment within one text run rather than
    // as two coordinates that happen to agree.
    for (const [i, position] of CIRCLE.entries()) {
      const names = [...wedges()[i].querySelectorAll('.wedge-label:not(.wedge-label-minor)')]
        .sort((a, b) => Number(a.getAttribute('y')) - Number(b.getAttribute('y')));

      for (const [j, key] of position.major.entries()) {
        const signature = names[j].querySelector('.wedge-signature');
        expect(signature, `${keyName(key)} has no signature on its own line`).not.toBeNull();
        expect(signature!.textContent?.replace('\u2009', '')).toBe(expected(key.accidentals));
      }
    }
  });
});
