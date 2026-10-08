// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { Settings } from './Settings';

function render(node: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => { createRoot(host).render(node); });
  return host;
}

/**
 * The labelable elements that *do something* when activated.
 *
 * A `<label>` names exactly one control — the first labelable element in
 * tree order — and forwards clicks anywhere in the label to it. So a
 * label containing several does not caption a group: it captions the
 * first member and makes the whole caption a remote control for it.
 *
 * `<output>`, `<meter>` and `<progress>` are labelable and are left out,
 * because nothing happens when activation reaches them. The first draft
 * of this list included them and flagged the volume slider, which pairs
 * an `<input type="range">` with an `<output>` showing its value — two
 * labelable elements, one control, and no defect: the label names the
 * input, which is the one a reader means. A rule that fires there is
 * measuring the wrong thing and would be turned off rather than obeyed.
 */
const INTERACTIVE = 'button, input, select, textarea';

describe('the settings screen', () => {
  /**
   * `Field` grew a `group` prop for this exact defect and
   * `controls.test.tsx` pins it — at the component. That was not enough:
   * the component was correct and two call sites here never passed the
   * flag, so Theme and Instrument shipped as labels round six buttons
   * each. Pressing any chip also activated the first one, which is what a
   * reader saw as the "Piano" text twitching when they clicked "Organ",
   * and clicking the caption selected the first instrument outright.
   *
   * So the claim belongs where the mistake is actually made. A test on
   * `Field` asks whether the component can be used correctly; this asks
   * whether the screen does. Only the second kind catches a call site
   * added next month that forgets the flag again.
   */
  it('never captions a group of controls with a single label', () => {
    const host = render(<Settings go={() => {}} />);

    const fields = [...host.querySelectorAll('label.field')];
    const offenders = fields
      .map((field) => ({
        caption: field.querySelector('span')?.textContent ?? '(unnamed)',
        controls: field.querySelectorAll(INTERACTIVE).length,
      }))
      .filter((f) => f.controls > 1);

    expect(offenders).toEqual([]);
  });

  /**
   * The guard above is satisfied by a screen that rendered nothing at all,
   * and a settings screen that fails to mount is exactly the kind of thing
   * that would make it pass quietly. Assert the subject exists.
   */
  it('renders captioned fields for the test above to be about', () => {
    const host = render(<Settings go={() => {}} />);
    expect(host.querySelectorAll('.field').length).toBeGreaterThan(3);
    // And the two that carried the defect are groups now, not labels.
    const captions = [...host.querySelectorAll('.field[role="group"] > span')]
      .map((s) => s.textContent);
    expect(captions).toContain('Theme');
    expect(captions).toContain('Instrument');
  });
});
