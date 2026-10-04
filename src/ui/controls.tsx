import { useId, type ReactNode } from 'react';

/**
 * A labelled control, or a labelled group of them.
 *
 * `<label>` names exactly one control, and a `<button>` is labelable — so a
 * label wrapping a row of chips named the first chip, and clicking the
 * caption "Intervals" silently toggled the unison. Which is worse than it
 * sounds: nothing on screen says the caption is clickable, so the setting
 * changes and the user has no reason to look at the chips.
 *
 * A group therefore gets `role="group"` and `aria-labelledby` instead. It
 * reads the same to a screen reader, names all of them rather than one, and
 * the caption stops being a control.
 */
export function Field({ label, children, group = false }: {
  label: string;
  children: ReactNode;
  /** Set when the field wraps several controls rather than one. */
  group?: boolean;
}) {
  const id = useId();
  if (group) {
    return (
      <div className="field" role="group" aria-labelledby={id}>
        <span id={id}>{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * An on-off setting, as a chip you press.
 *
 * The same control the multi-select is made of, because it is the same
 * decision: this thing is in play, or it is not. A panel where styles
 * are bubbles and sevenths is a checkbox is telling the user those are
 * two kinds of choice when they are one.
 *
 * It was a checkbox twice over, and both arrangements were wrong for the
 * same underlying reason — a {@link Field} stacks a caption above its
 * control and stretches to a column, which suits a select and nothing
 * else. First it put an uppercase caption above a lone box and let the
 * two drift into separate rows, so the progression panel read as a
 * scatter of unlabelled boxes. Then, sized to its content, it flowed up
 * beside whatever chip row came before it and read as one more chip —
 * which it may as well be.
 *
 * Keeps the `field` class, because that is what the panel's layout and
 * its contract test both count.
 */
export function Toggle({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange(next: boolean): void;
}) {
  return (
    <button
      type="button"
      className={`field field-toggle chip${checked ? ' on' : ''}`}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
    >
      {label}
    </button>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <section className="panel">{children}</section>;
}

export function Picker<T extends string | number>({
  label, value, onChange, options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  const numeric = typeof value === 'number';
  return (
    <Field label={label}>
      <select
        value={String(value)}
        onChange={(e) => onChange((numeric ? Number(e.target.value) : e.target.value) as T)}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
    </Field>
  );
}

export function Readout({ title, items }: {
  title: string;
  items: ReadonlyArray<{ primary: string; secondary: string }>;
}) {
  return (
    <section className="readout">
      <h2>{title}</h2>
      <ol className="items">
        {items.map((item, i) => (
          <li key={i}>
            <span className="primary">{item.primary}</span>
            <span className="secondary">{item.secondary}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="actions">{children}</div>;
}
