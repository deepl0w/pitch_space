import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES } from '../exercises/registry';
import { optionIds, widestSettings, type AnyField } from './settingsSpace';

/**
 * The helper the sweeps are built on, checked against its own promise.
 *
 * `widestSettings` is not a convenience. Four test files use it as the base
 * they vary one control from, on the understanding that everything else is
 * already open — so a pool it quietly fails to open is a pool none of them
 * reach, and every one of them still passes. That is the worst kind of
 * failure this project keeps finding: a guard that cannot fail, with the
 * difference here that one broken helper empties four guards at once.
 *
 * It was broken exactly that way. The fields are a list, not a dependency
 * graph, and `degree-id` happens to declare tonics before modes; opening
 * them in order opened the tonics the default mode can build and then
 * widened the mode, leaving the three tonics that widening had just made
 * available unselected. The sweeps asked no question in B, F♯ or C♯ minor
 * and said they had asked everything.
 */

type MultiField = Extract<AnyField, { kind: 'multi' }>;

/** Every multi field across every exercise, with the exercise it came from. */
function multiFields(): Array<{ id: string; field: MultiField }> {
  return EXERCISE_TYPES.flatMap((type) => (type.settings.fields as AnyField[])
    .filter((field): field is MultiField => field.kind === 'multi')
    .map((field) => ({ id: `${type.id}.${field.id}`, field })));
}

describe('the widest settings a sweep can start from', () => {
  /*
    The hazard only exists where one control constrains another's options, so
    a schema of static lists would pass the test below without exercising it.
    This says the coupling is still there to get wrong.
  */
  it('is answering a question some field actually poses', () => {
    const coupled = multiFields().filter(({ field }) => typeof field.options === 'function');
    expect(coupled.map((f) => f.id).length,
      'no field resolves its options from the settings, so nothing below is tested')
      .toBeGreaterThan(0);
  });

  it('has every toggle on', () => {
    const off: string[] = [];
    for (const type of EXERCISE_TYPES) {
      const widest = widestSettings(type);
      for (const field of type.settings.fields as AnyField[]) {
        if (field.kind !== 'toggle') continue;
        if (!field.selected(widest as never)) off.push(`${type.id}.${field.id}`);
      }
    }
    expect(off).toEqual([]);
  });

  it('leaves no option a field offers unselected', () => {
    /*
      Asked of what the panel would show lit rather than of the stored
      value, because a field may store "none" and mean "all" — the tonics do.
      What matters to a sweep is which values are in play, and `selected` is
      the one reading of that both the panel and this agree on.
    */
    const unopened: string[] = [];
    for (const type of EXERCISE_TYPES) {
      const widest = widestSettings(type);
      for (const field of type.settings.fields as AnyField[]) {
        if (field.kind !== 'multi') continue;
        const lit = new Set(field.selected(widest as never));
        const missing = optionIds(field, widest).filter((id) => !lit.has(id));
        if (missing.length > 0) unopened.push(`${type.id}.${field.id}: ${missing.join(' ')}`);
      }
    }
    expect(unopened).toEqual([]);
  });

  it('does not depend on the order the schema lists the fields in', () => {
    /*
      The property underneath the two above, stated directly: reversing the
      declaration order must not change where the widening lands. A single
      pass fails this on `degree-id` whichever way round the list is, because
      one of the two orders always resolves the dependent field first.
    */
    for (const type of EXERCISE_TYPES) {
      const reversed = {
        ...type,
        settings: { ...type.settings, fields: [...type.settings.fields].reverse() },
      };
      expect(widestSettings(reversed), `${type.id} widens differently read backwards`)
        .toEqual(widestSettings(type));
    }
  });
});

describe('resolving a field whose options depend on the settings', () => {
  it('refuses without them, rather than failing inside the field', () => {
    /*
      A missing argument used to reach the field as `undefined` and crash on
      a property of it, which names the field rather than the caller that
      forgot. The message has to say what is wanted, because the call site is
      a sweep and the reader is whoever added the coupled field.
    */
    const coupled = multiFields().find(({ field }) => typeof field.options === 'function');
    expect(coupled, 'no coupled field to ask').toBeDefined();
    expect(() => optionIds(coupled!.field, undefined)).toThrow(/needs the settings/);
  });

  it('answers a static list without them, because it does not need them', () => {
    const plain = multiFields().find(({ field }) => typeof field.options !== 'function');
    expect(plain, 'no static multi field to ask').toBeDefined();
    expect(optionIds(plain!.field, undefined).length).toBeGreaterThan(0);
  });
});
