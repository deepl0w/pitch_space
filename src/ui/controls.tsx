import type { SettingOption } from '../exercises/types';
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
export function OneOf({ options, chosen, onChange }: {
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

/**
 * A continuous value, dragged rather than chosen.
 *
 * Reports as it moves: `onChange` fires on every input event, so what the
 * reader hears while dragging is what they are setting. That is the whole
 * point of a slider over a row of chips for something audible — the ear
 * is the instrument, and a value that only applied on release would make
 * it useless for the one thing it is for.
 */
export function Slider({ label, value, onChange, format }: {
  label: string;
  /** 0 to 1. */
  value: number;
  onChange(next: number): void;
  format(value: number): string;
}) {
  return (
    <div className="slider">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        aria-label={label}
        onChange={(e) => onChange(Number(e.currentTarget.value) / 100)}
      />
      <output>{format(value)}</output>
    </div>
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

/** Drawn rather than imported: one icon does not earn a dependency. */
/**
 * A cog.
 *
 * Two earlier attempts, and the second was worse than the first. A single
 * outline tracing the silhouette came out a lumpy blob at twenty pixels,
 * because the teeth were smaller than the stroke joining them and
 * antialiasing filled the gaps. Replacing it with a ring and eight radial
 * strokes drew a **sun**: a cog's teeth are part of its rim, and spokes
 * sticking out of a circle are rays.

 * So it is filled rather than stroked, and the teeth are trapezoids on the
 * rim — tooth top, flank, valley floor, repeated eight times — with the
 * centre punched out by `evenodd` rather than drawn over, so it works on
 * any background. Generated rather than hand-written, which is why the
 * numbers are exact.
 */
export function CogIcon() {
  return (
    <svg
      viewBox="0 0 24 24" width="20" height="20"
      fill="currentColor" fillRule="evenodd" aria-hidden="true" focusable="false"
    >
      <path d="M 9.71 2.06L 14.29 2.06L 14.22 4.73L 15.57 5.29L 17.41 3.35L 20.65 6.59L 18.71 8.43L 19.27 9.78L 21.94 9.71L 21.94 14.29L 19.27 14.22L 18.71 15.57L 20.65 17.41L 17.41 20.65L 15.57 18.71L 14.22 19.27L 14.29 21.94L 9.71 21.94L 9.78 19.27L 8.43 18.71L 6.59 20.65L 3.35 17.41L 5.29 15.57L 4.73 14.22L 2.06 14.29L 2.06 9.71L 4.73 9.78L 5.29 8.43L 3.35 6.59L 6.59 3.35L 8.43 5.29L 9.78 4.73ZM 8.40 12.00a 3.60 3.60 0 1 0 7.20 0a 3.60 3.60 0 1 0 -7.20 0Z" />
    </svg>
  );
}
