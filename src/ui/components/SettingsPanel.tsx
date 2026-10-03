import type { SettingField } from '../../exercises/types';

/**
 * One settings panel for every exercise type.
 *
 * It renders a list of {@link SettingField} descriptions and knows nothing
 * about any particular exercise, which is the other half of what makes the
 * sixth exercise type cheap: a new type contributes a list, not a component.
 */
export function SettingsPanel<S>({ fields, settings, onChange }: {
  fields: readonly SettingField<S>[];
  settings: S;
  onChange(next: S): void;
}) {
  return (
    <section className="panel">
      {fields.map((field) => (
        <label className="field" key={field.id}>
          <span>{field.label}</span>

          {field.kind === 'choice' && (
            <select
              value={field.selected(settings)}
              onChange={(e) => onChange(field.apply(settings, e.target.value))}
            >
              {field.options.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          )}

          {field.kind === 'multi' && (
            <div className="chips">
              {field.options.map((option) => {
                const chosen = field.selected(settings).includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={chosen ? 'chip on' : 'chip'}
                    aria-pressed={chosen}
                    onClick={() => onChange(field.apply(
                      settings,
                      // Rebuilt from the field's own option order rather than
                      // by pushing onto the current list, so the stored set
                      // does not depend on the order the user clicked.
                      field.options
                        .map((o) => o.id)
                        .filter((id) => (id === option.id ? !chosen : field.selected(settings).includes(id))),
                    ))}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}

          {field.kind === 'toggle' && (
            <input
              type="checkbox"
              checked={field.selected(settings)}
              onChange={(e) => onChange(field.apply(settings, e.target.checked))}
            />
          )}
        </label>
      ))}
    </section>
  );
}
