import type { SettingField, SettingOption } from '../../exercises/types';
import { Field, Panel, Toggle } from '../controls';

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
      {/*
        A field that cannot affect the next question is not shown. It is
        worse than a missing control, because it invites the user to set
        something and then ignores them — key identification asked by ear
        left its clef and its read-source enabled and inert.
      */}
      {runs(fields.filter((field) => field.relevant?.(settings) ?? true)).map((run, index) => (
        run[0].kind === 'toggle'
          /*
            A run of toggles is one row of chips, not one row each. They
            are independent settings and they read as a list of things
            that are in play — the same shape as a multi-select, which is
            the same decision. Grouping them is also what keeps the first
            of them off the end of whatever chip row came before.
          */
          ? (
            <div className="chips chips-toggles" key={`toggles-${index}`}>
              {run.map((field) => (
                <Toggle
                  key={field.id}
                  label={field.label}
                  checked={field.kind === 'toggle' && field.selected(settings)}
                  onChange={(on) => {
                    if (field.kind === 'toggle') onChange(field.apply(settings, on));
                  }}
                />
              ))}
            </div>
          )
          : run.map((field) => renderField(field))
      ))}
    </Panel>
  );

  function renderField(field: SettingField<S>) {
    switch (field.kind) {
      case 'choice':
        return (
          <Field key={field.id} label={field.label} group>
            <OneOf
              options={field.options}
              chosen={field.selected(settings)}
              onChange={(option) => onChange(field.apply(settings, option))}
            />
          </Field>
        );
      case 'multi':
        return (
          <Field key={field.id} label={field.label} group>
            <Chips
              options={field.options}
              chosen={field.selected(settings)}
              onChange={(next) => onChange(field.apply(settings, next))}
              /*
                Asked rather than assumed. Some fields refuse a selection
                — unticking the last mode would leave the generator
                nothing to draw from, so `apply` hands back the settings
                unchanged. That refusal is right and it was invisible:
                the chip took the tap, nothing moved, and nothing said
                why. Putting the question to the field keeps the policy
                where it was and only makes it legible.
              */
              accepts={(next) => {
                const after = field.selected(field.apply(settings, next));
                return after.length === next.length
                  && next.every((id) => after.includes(id));
              }}
            />
          </Field>
        );
      case 'toggle':
        // Handled above, as part of its run.
        return null;
    }
  }
}

/** Consecutive fields of the same kind, so a run of toggles can share a row. */
function runs<S>(fields: readonly SettingField<S>[]): SettingField<S>[][] {
  const out: SettingField<S>[][] = [];
  for (const field of fields) {
    const last = out[out.length - 1];
    const sameRun = last !== undefined
      && (last[0].kind === 'toggle') === (field.kind === 'toggle');
    if (sameRun) last.push(field);
    else out.push([field]);
  }
  return out;
}

/**
 * Every option visible at once, because the thing being chosen is the size of
 * the pool and a closed dropdown hides it.
 *
 * The selection is rebuilt from the option order rather than by pushing onto
 * the current list, so what gets stored does not depend on the order the user
 * happened to click.
 */
/**
 * A single choice, laid out like the multi-select rather than folded into
 * a dropdown.
 *
 * Same argument as `Chips`, applied one field over: the options are the
 * thing being chosen between and a closed `select` shows one of them.
 * These lists are short — two modes, four clefs, three directions — so
 * there is nothing a dropdown was buying except a second visual grammar
 * in the same panel for the same kind of decision.
 *
 * A radio group rather than a row of toggles, and marked as one: exactly
 * one is always on, so `aria-checked` and `role="radio"` say what
 * `aria-pressed` would not. Clicking the one already chosen does
 * nothing — there is no state where none is selected.
 */
function OneOf({ options, chosen, onChange }: {
  options: readonly SettingOption[];
  chosen: string;
  onChange(next: string): void;
}) {
  return (
    <div className="chips chips-single" role="radiogroup">
      {options.map((option) => {
        const on = option.id === chosen;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            className={on ? 'chip on' : 'chip'}
            aria-checked={on}
            onClick={() => { if (!on) onChange(option.id); }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Chips({ options, chosen, onChange, accepts }: {
  options: readonly SettingOption[];
  chosen: readonly string[];
  onChange(next: readonly string[]): void;
  /** Whether the field would actually take this selection. */
  accepts(next: readonly string[]): boolean;
}) {
  return (
    <div className="chips">
      {options.map((option) => {
        const on = chosen.includes(option.id);
        const next = options
          .map((o) => o.id)
          .filter((id) => (id === option.id ? !on : chosen.includes(id)));
        const refused = !accepts(next);
        return (
          <button
            key={option.id}
            type="button"
            className={on ? 'chip on' : 'chip'}
            aria-pressed={on}
            disabled={refused}
            // Said in words as well as in the disabled state, which a screen
            // reader announces as "unavailable" without saying what for.
            title={refused ? `${option.label} cannot be turned off — something must stay on` : undefined}
            onClick={() => onChange(next)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
