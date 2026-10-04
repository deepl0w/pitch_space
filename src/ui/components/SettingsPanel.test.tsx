// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsPanel } from './SettingsPanel';
import type { SettingField } from '../../exercises/types';
import { EXERCISE_TYPES } from '../../exercises/registry';

/**
 * The generic panel, over a settings shape invented here.
 *
 * Deliberately not the interval exercise's own fields: the panel's whole
 * claim is that it knows nothing about any particular exercise, and a test
 * written against the one exercise that exists would not notice the panel
 * growing a dependency on it. The registered types are swept separately, at
 * the end, for the things the panel assumes of them.
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface Demo {
  size: string;
  colours: readonly string[];
  loud: boolean;
}

const START: Demo = { size: 'medium', colours: ['red', 'blue'], loud: false };

const FIELDS: readonly SettingField<Demo>[] = [
  {
    kind: 'choice', id: 'size', label: 'Size',
    options: [{ id: 'small', label: 'Small' }, { id: 'medium', label: 'Medium' }],
    selected: (s) => s.size,
    apply: (s, option) => ({ ...s, size: option }),
  },
  {
    kind: 'multi', id: 'colours', label: 'Colours',
    options: [
      { id: 'red', label: 'Red' }, { id: 'green', label: 'Green' }, { id: 'blue', label: 'Blue' },
    ],
    selected: (s) => s.colours,
    apply: (s, options) => (options.length === 0 ? s : { ...s, colours: options }),
  },
  {
    kind: 'toggle', id: 'loud', label: 'Loud',
    selected: (s) => s.loud,
    apply: (s, on) => ({ ...s, loud: on }),
  },
];

let container: HTMLDivElement;
let root: Root;
let settings: Demo;
let changes: Demo[];

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  settings = START;
  changes = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(fields: readonly SettingField<Demo>[] = FIELDS) {
  act(() => root.render(
    <SettingsPanel
      fields={fields}
      settings={settings}
      onChange={(next) => { changes.push(next); settings = next; render(fields); }}
    />,
  ));
}

const panel = () => container.querySelector('.panel') as HTMLElement;
const fieldFor = (label: string) => [...container.querySelectorAll('.field')]
  .find((f) => f.querySelector('span')?.textContent === label) as HTMLElement;
const chip = (label: string) => [...container.querySelectorAll('.chip')]
  .find((b) => b.textContent === label) as HTMLButtonElement;

describe('the shape the stylesheet is written against', () => {
  it('is one panel of labelled fields, one per setting', () => {
    render();
    expect(panel().tagName).toBe('SECTION');
    expect(container.querySelectorAll('.panel')).toHaveLength(1);
    expect([...container.querySelectorAll('.field > span')].map((s) => s.textContent))
      .toEqual(['Size', 'Colours', 'Loud']);
  });

  it('keeps every field a direct child of the panel', () => {
    // `.panel .field:has(.chips)` gives the chip field a row of its own by
    // setting its flex basis, which only reaches it while the panel is the
    // flex container it sits directly inside.
    render();
    for (const field of container.querySelectorAll('.field')) {
      expect(field.parentElement).toBe(panel());
    }
  });

  it('puts the chip list inside the field, where the selector looks for it', () => {
    render();
    const chips = container.querySelector('.chips') as HTMLElement;
    expect(chips.parentElement).toBe(fieldFor('Colours'));
    expect(fieldFor('Colours').matches('.panel .field:has(.chips)')).toBe(true);
    // And nowhere else, or every field would be given the full width.
    expect(fieldFor('Size').matches(':has(.chips)')).toBe(false);
    expect(fieldFor('Loud').matches(':has(.chips)')).toBe(false);
  });

  it('renders each kind of field as the control it describes', () => {
    render();
    expect(fieldFor('Size').querySelector('select')).not.toBeNull();
    expect(fieldFor('Colours').querySelectorAll('.chip')).toHaveLength(3);
    expect(fieldFor('Loud').querySelector('input[type="checkbox"]')).not.toBeNull();
  });

  it('renders nothing but an empty panel for an exercise with no settings', () => {
    render([]);
    expect(panel()).not.toBeNull();
    expect(container.querySelectorAll('.field')).toHaveLength(0);
  });
});

describe('a choice', () => {
  it('shows the option the settings are on', () => {
    render();
    expect((fieldFor('Size').querySelector('select') as HTMLSelectElement).value).toBe('medium');
  });

  it('offers every option, labelled', () => {
    render();
    const options = [...fieldFor('Size').querySelectorAll('option')];
    expect(options.map((o) => [o.value, o.textContent]))
      .toEqual([['small', 'Small'], ['medium', 'Medium']]);
  });

  it('applies the option that was picked', () => {
    render();
    const select = fieldFor('Size').querySelector('select') as HTMLSelectElement;
    act(() => {
      select.value = 'small';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(changes).toEqual([{ ...START, size: 'small' }]);
  });
});

describe('a multi-select', () => {
  it('marks the chosen options, and only those', () => {
    render();
    expect(chip('Red').className).toBe('chip on');
    expect(chip('Blue').className).toBe('chip on');
    expect(chip('Green').className).toBe('chip');
  });

  it('says what it is pressing, for a reader that cannot see the fill', () => {
    render();
    expect(chip('Red').getAttribute('aria-pressed')).toBe('true');
    expect(chip('Green').getAttribute('aria-pressed')).toBe('false');
  });

  it('adds an option without disturbing the others', () => {
    render();
    act(() => chip('Green').click());
    expect(changes).toEqual([{ ...START, colours: ['red', 'green', 'blue'] }]);
  });

  it('removes an option that was on', () => {
    render();
    act(() => chip('Red').click());
    expect(changes).toEqual([{ ...START, colours: ['blue'] }]);
  });

  it('stores the field’s own option order, not the order they were clicked', () => {
    // Otherwise the same set of intervals round-trips through storage as a
    // different list every time, and nothing downstream can compare two.
    render();
    act(() => chip('Red').click());
    act(() => chip('Red').click());
    expect(changes.at(-1)).toEqual({ ...START, colours: ['red', 'blue'] });
  });

  it('shows a refusal before the tap rather than after it', () => {
    // The field may reject an empty pool: unticking the last interval is a
    // slip, and the honest response is for the tick not to come off.
    //
    // It used to come off by the tap being taken and the result discarded,
    // which from the user's side is a button that does nothing and says
    // nothing. The refusal is the field's and stays the field's; what
    // changed is that the chip now wears it.
    settings = { ...START, colours: ['red'] };
    render();
    expect(chip('Red').disabled).toBe(true);
    expect(chip('Red').title).toMatch(/cannot be turned off/);

    act(() => chip('Red').click());
    expect(changes).toEqual([]);
    expect(chip('Red').className).toBe('chip on');
  });

  it('refuses only the chip that is actually holding the pool open', () => {
    // Disabling every chip once one refusal exists would be a far worse lie
    // than the one it replaced.
    render();
    for (const label of ['Red', 'Blue']) expect(chip(label).disabled).toBe(false);
    // An option that is off can always be turned on, whatever the field
    // thinks of the ones that are on.
    expect(chip('Green').disabled).toBe(false);
  });

  it('frees the last chip again as soon as a second one is on', () => {
    settings = { ...START, colours: ['red'] };
    render();
    act(() => chip('Green').click());
    expect(chip('Red').disabled).toBe(false);
    expect(chip('Green').disabled).toBe(false);
  });

  it('leaves a field that refuses nothing entirely alone', () => {
    // The panel asks the field; it does not impose a non-empty rule of its
    // own on a field that never had one.
    const permissive: readonly SettingField<Demo>[] = [{
      kind: 'multi', id: 'colours', label: 'Colours',
      options: [{ id: 'red', label: 'Red' }, { id: 'blue', label: 'Blue' }],
      selected: (s) => s.colours,
      apply: (s, options) => ({ ...s, colours: options }),
    }];
    settings = { ...START, colours: ['red'] };
    render(permissive);
    expect(chip('Red').disabled).toBe(false);
    act(() => chip('Red').click());
    expect(changes).toEqual([{ ...START, colours: [] }]);
  });
});

describe('a toggle', () => {
  it('shows whether it is on, and applies a change either way', () => {
    render();
    const box = () => fieldFor('Loud').querySelector('input') as HTMLInputElement;
    expect(box().checked).toBe(false);

    act(() => box().click());
    expect(changes.at(-1)).toEqual({ ...START, loud: true });
    expect(box().checked).toBe(true);

    act(() => box().click());
    expect(changes.at(-1)).toEqual({ ...START, loud: false });
  });
});

describe('every registered exercise type', () => {
  it('renders in this panel without the panel knowing anything about it', () => {
    expect(EXERCISE_TYPES.length).toBeGreaterThan(0);
    for (const definition of EXERCISE_TYPES) {
      act(() => root.render(
        <SettingsPanel
          fields={definition.settings.fields}
          settings={definition.settings.defaults}
          onChange={() => {}}
        />,
      ));
      // The fields that apply to the defaults, not all of them. A field
      // may declare itself irrelevant — the Picardy third has nothing to
      // do when no minor key is in play — and a panel that drew it anyway
      // would be the inert control `FieldRelevance` exists to prevent.
      const shown = definition.settings.fields
        .filter((f) => f.relevant?.(definition.settings.defaults) !== false);
      expect(container.querySelectorAll('.field')).toHaveLength(shown.length);

      // Every control starts on a value the field actually offers, so no
      // select renders blank and no chip row comes up empty.
      for (const field of shown) {
        if (field.kind !== 'multi') continue;
        const chosen = field.selected(definition.settings.defaults);
        expect(chosen.length).toBeGreaterThan(0);
        expect(fieldFor(field.label).querySelectorAll('.chip.on'))
          .toHaveLength(chosen.length);
      }
    }
  });
});
