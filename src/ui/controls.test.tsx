// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { Field } from './controls';

function render(node: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => { createRoot(host).render(node); });
  return host;
}

describe('Field', () => {
  /**
   * The defect this pins: `<label>` names exactly one control and a `<button>`
   * is labelable, so a label wrapping a row of chips named the first chip.
   * Clicking the caption "Intervals" toggled the unison, with nothing on
   * screen to suggest the caption did anything at all.
   */
  it('does not make its caption a control when it wraps a group', () => {
    const host = render(
      <Field label="Intervals" group>
        <button type="button">Unison</button>
        <button type="button">Minor 2nd</button>
      </Field>,
    );
    expect(host.querySelector('label')).toBeNull();
    const field = host.querySelector('.field')!;
    expect(field.getAttribute('role')).toBe('group');
    // Still named, and named for all of them rather than for the first.
    const labelledBy = field.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(host.querySelector(`#${CSS.escape(labelledBy!)}`)?.textContent).toBe('Intervals');
  });

  it('still uses a real label when it wraps one control', () => {
    const host = render(
      <Field label="Clef"><select><option>treble</option></select></Field>,
    );
    const label = host.querySelector('label');
    expect(label).not.toBeNull();
    expect(label!.querySelector('select')).not.toBeNull();
  });

  // The CSS rule that gives a chip row the full width of the panel keys off
  // `.panel .field:has(.chips)`, so the class has to survive either branch.
  it('keeps the field class in both forms, which the layout rule needs', () => {
    for (const group of [true, false]) {
      const host = render(<Field label="x" group={group}><span className="chips" /></Field>);
      expect(host.querySelector('.field')).not.toBeNull();
    }
  });
});
