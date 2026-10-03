import type { ReactNode } from 'react';

/** A labelled control. Shared so every screen's panel lines up with the others. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
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
