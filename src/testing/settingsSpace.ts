import type { AnyExerciseDefinition, SettingField } from '../exercises/types';

/**
 * The space of settings a user can reach, enumerated from the schema.
 *
 * Three defects in two days had one shape: a sweep holding a user-facing
 * control at its default. Each fix widened a sweep by hand, and each time the
 * next control arrived without the widening following — `bars`, then `styles`
 * and five vocabulary switches, then `types` on two new exercises. Listing
 * the axes is the habit that keeps failing, so the lists are derived here
 * instead and a field added tomorrow is swept tomorrow.
 *
 * Test-only, and deliberately not beside the schema: nothing the app ships
 * needs to enumerate its own settings, and putting this in `exercises/` would
 * invite production code to depend on an enumeration that exists to be
 * exhaustive rather than to be correct.
 */

export type AnyField = SettingField<unknown>;

/**
 * Every value the panel can put a field on.
 *
 * A multi yields the whole set and each option alone, rather than the power
 * set: a control whose only effect shows when exactly one option is chosen is
 * still a control that does something, and the all-and-each pair finds that
 * without the combinatorics.
 */
export function valuesOf(field: AnyField, settings: unknown): unknown[] {
  if (field.kind === 'toggle') return [true, false];
  if (field.kind === 'choice') return field.options.map((o) => o.id);
  const ids = optionIds(field, settings);
  return [ids, ...ids.map((id) => [id])];
}

/**
 * A multi-select's option ids, resolving the ones that depend on settings.
 *
 * Those exist because one control can constrain another — a tonic the
 * chosen mode cannot build is not offered — so a sweep that read the list
 * without the settings would cross combinations the panel never shows.
 */
export function optionIds(field: AnyField, settings: unknown): string[] {
  if (field.kind === 'toggle') return [];
  if (typeof field.options !== 'function') return field.options.map((o) => o.id);
  // Required rather than optional: a field whose options depend on the
  // settings cannot answer without them, and defaulting to `undefined`
  // turned that into a crash inside the field instead of a type error at
  // the call site.
  if (settings === undefined) {
    throw new Error('optionIds needs the settings: this field\'s options depend on them');
  }
  return field.options(settings).map((o) => o.id);
}

/** `field.apply`, with the value narrowed to what that kind of field takes. */
export function applyValue(field: AnyField, settings: unknown, value: unknown): unknown {
  if (field.kind === 'toggle') return field.apply(settings, value as boolean);
  if (field.kind === 'choice') return field.apply(settings, value as string);
  return field.apply(settings, value as readonly string[]);
}

/**
 * Every pool opened and every switch on.
 *
 * The configuration a field conditional on *another* field needs in order to
 * be visible at all — the Neapolitan sixth waits on borrowed chords being in
 * play, the Picardy third on a minor key. A sweep over presentation and mode
 * alone calls those fields "never shown" and is wrong about controls that
 * work.
 *
 * A choice is left where it is, because widest has no meaning for one: there
 * is no ordering on "treble, alto, tenor, bass". Callers that need those
 * walk `valuesOf` instead.
 */
export function widestSettings(type: AnyExerciseDefinition, over: object = {}): unknown {
  const withOver = (s: unknown) => type.settings.coerce({ ...(s as object), ...over });
  let settings: unknown = withOver(type.settings.defaults);
  /*
    Repeated until nothing moves, because one control can narrow another's
    options and the fields are not declared in dependency order.

    `degree-id` declares tonics before modes. A single pass opened the
    tonics the default mode can build, then widened the mode — and left the
    three tonics that widening had just made available unselected, so the
    "widest" settings asked no question in B, F♯ or C♯ minor. A helper whose
    whole job is to open every pool must not depend on the order the schema
    happens to list the fields in; that is the same shape as the sweeps this
    file exists to replace, one level up.

    Bounded by the field count because that is how many passes a chain of
    fields each unlocking the next can need, and a pair that never settles
    is a schema defect rather than something to spin on.
  */
  for (let pass = 0; pass <= type.settings.fields.length; pass += 1) {
    const before = JSON.stringify(settings);
    for (const field of type.settings.fields as AnyField[]) {
      const widest = field.kind === 'toggle' ? true
        : field.kind === 'multi' ? optionIds(field, settings)
          : undefined;
      if (widest === undefined) continue;
      // The caller's own keys win on every pass, not just at the end: a
      // sweep asking for one mode must have the tonics resolved against
      // that mode, rather than against the widened one and then narrowed
      // back to a selection the panel would not show.
      settings = withOver(applyValue(field, settings, widest));
    }
    if (JSON.stringify(settings) === before) break;
  }
  return settings;
}
