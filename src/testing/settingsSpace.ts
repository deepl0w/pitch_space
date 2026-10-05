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
export function valuesOf(field: AnyField, settings: unknown = undefined): unknown[] {
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
  const options = typeof field.options === 'function'
    ? field.options(settings) : field.options;
  return options.map((o) => o.id);
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
  let settings: unknown = type.settings.coerce({
    ...(type.settings.defaults as object), ...over,
  });
  for (const field of type.settings.fields as AnyField[]) {
    const widest = field.kind === 'toggle' ? true
      : field.kind === 'multi' ? optionIds(field, settings)
        : undefined;
    if (widest === undefined) continue;
    settings = type.settings.coerce(applyValue(field, settings, widest));
  }
  // The caller's own keys win: a sweep asking for one presentation must get
  // it back, whatever a toggle above did.
  return type.settings.coerce({ ...(settings as object), ...over });
}
