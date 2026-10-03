import type { SettingField, SettingOption } from '../../exercises/types';
import { Field, Panel, Picker } from '../controls';

/**
 * One settings panel for every exercise type.
 *
 * It renders a list of {@link SettingField} descriptions and knows nothing
 * about any particular exercise, which is the other half of what makes the
 * sixth exercise type cheap: a new type contributes a list, not a component.
 *
 * Built on the shared controls rather than beside them. `Panel`, `Field` and
 * `Picker` are what every other screen's panel is made of, and a second set
 * of the same markup here is how two panels start to drift apart under one
 * stylesheet. The chip list below is the one piece that is genuinely this
 * panel's own — nothing else in the app offers a multi-select — and it sits
 * inside a `Field` like everything else, because `.panel .field:has(.chips)`
 * is what gives the chips a row to themselves.
 */
export function SettingsPanel<S>({ fields, settings, onChange }: {
  fields: readonly SettingField<S>[];
  settings: S;
  onChange(next: S): void;
}) {
  return (
    <Panel>
      {fields.map((field) => {
        switch (field.kind) {
          case 'choice':
            return (
              <Picker
                key={field.id}
                label={field.label}
                value={field.selected(settings)}
                onChange={(option) => onChange(field.apply(settings, option))}
                options={field.options.map((o) => ({ value: o.id, label: o.label }))}
              />
            );
          case 'multi':
            return (
              <Field key={field.id} label={field.label}>
                <Chips
                  options={field.options}
                  chosen={field.selected(settings)}
                  onChange={(next) => onChange(field.apply(settings, next))}
                />
              </Field>
            );
          case 'toggle':
            return (
              <Field key={field.id} label={field.label}>
                <input
                  type="checkbox"
                  checked={field.selected(settings)}
                  onChange={(e) => onChange(field.apply(settings, e.target.checked))}
                />
              </Field>
            );
        }
      })}
    </Panel>
  );
}

/**
 * Every option visible at once, because the thing being chosen is the size of
 * the pool and a closed dropdown hides it.
 *
 * The selection is rebuilt from the option order rather than by pushing onto
 * the current list, so what gets stored does not depend on the order the user
 * happened to click.
 */
function Chips({ options, chosen, onChange }: {
  options: readonly SettingOption[];
  chosen: readonly string[];
  onChange(next: readonly string[]): void;
}) {
  return (
    <div className="chips">
      {options.map((option) => {
        const on = chosen.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            className={on ? 'chip on' : 'chip'}
            aria-pressed={on}
            onClick={() => onChange(options
              .map((o) => o.id)
              .filter((id) => (id === option.id ? !on : chosen.includes(id))))}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
