import { describe, expect, it } from 'vitest';
import { lineKey, lineOfRound, sameLine, type ProgressLine } from './line';
import { EXERCISE_TYPES } from '../exercises/registry';
import { applyValue, valuesOf, widestSettings, type AnyField } from '../testing/settingsSpace';
import type { AnyExerciseDefinition, ItemId, Presentation } from '../exercises/types';

/**
 * What makes two stretches of practice the same line, and what does not.
 *
 * ADR 0039. The claims here are the user's argument in machine-checkable
 * form: the answer space decides, so widening or narrowing a pool is a
 * different line and anything that leaves the pool alone is not.
 */

const line = (over: Partial<ProgressLine> = {}): ProgressLine => ({
  exercise: 'interval-id',
  askable: ['interval:m2:up', 'interval:M2:up'],
  presentation: 'read',
  ...over,
});

describe('the identity of a progression line', () => {
  it('does not depend on the order the items arrive in', () => {
    // The canonical half. Without it a caller could produce two lines for
    // one pool by listing it differently, and a learner's history would
    // split on the order `items(settings)` happened to return.
    expect(lineKey(line({ askable: ['interval:M2:up', 'interval:m2:up'] })))
      .toBe(lineKey(line()));
  });

  it('separates a widened pool from the pool it grew from', () => {
    // The user's own case: two intervals is one line, three is another.
    const wider = line({ askable: ['interval:m2:up', 'interval:M2:up', 'interval:m3:up'] });
    expect(sameLine(wider, line())).toBe(false);
  });

  it('returns to the original line when a pool is narrowed back', () => {
    /*
      The consequence of identity being the set rather than a history of
      edits: going three → two lands on the same line as two, not on a
      third. That is what makes narrowing cheap and is the half ADR 0039
      applied by symmetry rather than being asked.
    */
    const wider = line({ askable: ['interval:m3:up', 'interval:M2:up', 'interval:m2:up'] });
    const back = line({ askable: ['interval:M2:up', 'interval:m2:up'] });
    expect(sameLine(wider, back)).toBe(false);
    expect(sameLine(back, line())).toBe(true);
  });

  it('separates the same pool read from the same pool heard', () => {
    // ADR 0010: two skills, and `items(settings)` does not vary with it,
    // so presentation has to be carried rather than derived.
    expect(sameLine(line({ presentation: 'listen' }), line())).toBe(false);
  });

  it('separates two exercises that offer the same item', () => {
    /*
      No two exercises share an item id today and a guard asserts it, but
      the key must not *rely* on that: curated and generated rhythm would
      both credit `cell:<id>`, which is the case ADR 0041 creates.
    */
    expect(sameLine(line({ exercise: 'rhythm-generated' }), line())).toBe(false);
  });

  it('is unchanged by a setting that leaves the askable set alone', () => {
    /*
      The clause doing the work in 0039, and the reason a learner changing
      clef keeps their week: clef, range, tonic and tempo never reach this
      function, because they do not change what can be asked. There is no
      field here for them to change.
    */
    expect(lineKey(line())).toBe(lineKey(line()));
    expect(Object.keys(line()).sort()).toEqual(['askable', 'exercise', 'presentation']);
  });

  it('is readable, because an export is organised by it', () => {
    expect(lineKey(line())).toBe('interval-id|read|interval:M2:up,interval:m2:up');
  });
});

/**
 * The claim the key rests on, which was a comment.
 *
 * `lineKey` joins three parts with `|` and the items with `,`, and the
 * constants say the separators are "not legal inside an item id or a
 * presentation". Nothing checked that, and a join whose separator can
 * appear in a component is not a key — it is a string that usually works.
 *
 * Two halves, because the first is only interesting if the second is true:
 * no id anywhere in the settings space contains either character, **and**
 * one that did would collide.
 */
describe('the separators the key is joined with', () => {
  it('appear in no exercise id, presentation or item the app can produce', () => {
    /*
      Swept over the settings space rather than the defaults, because the
      askable set is what varies and a separator could arrive with an
      option nobody has turned on. 6,495 ids across 251 combinations —
      every field at every value it offers, from the widest settings.
    */
    const offending: string[] = [];
    let ids = 0;
    for (const definition of EXERCISE_TYPES) {
      if (/[|,]/.test(definition.id)) offending.push(`exercise id ${definition.id}`);
      const widest = widestSettings(definition);
      const space: unknown[] = [definition.settings.coerce(definition.settings.defaults), widest];
      for (const field of definition.settings.fields as AnyField[]) {
        for (const value of valuesOf(field, widest)) {
          space.push(definition.settings.coerce(applyValue(field, widest, value)));
        }
      }
      for (const settings of space) {
        for (const item of definition.items(settings)) {
          ids += 1;
          if (/[|,]/.test(item)) offending.push(`${definition.id}: ${item}`);
        }
      }
    }
    for (const presentation of ['listen', 'read']) {
      if (/[|,]/.test(presentation)) offending.push(`presentation ${presentation}`);
    }

    expect(offending).toEqual([]);
    expect(ids, 'no item was examined, so nothing was checked').toBeGreaterThan(1_000);
  });

  it('would collide if one ever did, which is why the case above matters', () => {
    /*
      The demonstration. Without it the sweep is a fact about today's ids
      and not a statement about the key — and a reader has no way to tell
      whether the constraint is load-bearing or tidy.

      Both separators, because they fail differently: a comma inside an id
      merges two items into one set, and a bar inside an exercise id steals
      the presentation's place.
    */
    const asTwo = lineKey({ exercise: 'x', presentation: 'read', askable: twoItems() });
    const asOne = lineKey({ exercise: 'x', presentation: 'read', askable: oneJoinedItem() });
    expect(asOne, 'a comma inside an item id does not merge the set')
      .toBe(asTwo);

    const barInExercise = lineKey({
      exercise: 'x|read', presentation: 'read', askable: ['q' as ItemId],
    });
    const barInPresentation = lineKey({
      exercise: 'x', presentation: 'read|read' as never, askable: ['q' as ItemId],
    });
    expect(barInExercise, 'a bar in one part does not take another part\'s place')
      .toBe(barInPresentation);
  });
});

/** `['a', 'b']`, built here so the pair below cannot drift apart. */
function twoItems(): ItemId[] { return ['a', 'b'] as ItemId[]; }
/** The same characters with the separator inside one id. */
function oneJoinedItem(): ItemId[] { return ['a,b'] as ItemId[]; }

/**
 * ADR 0039's rule, enforced over the settings space rather than described.
 *
 * *A setting is part of a line's identity if and only if it changes
 * `items(settings)`.* The case above asserts the shape that follows —
 * three keys, no settings blob — which is true by construction and cannot
 * fail while nobody edits `ProgressLine`. What it does not hold is the
 * clause: that **presentation is the only field allowed to split a line
 * without changing what can be asked**, which is ADR 0010's exception and
 * the one a later field is most likely to be given by analogy.
 *
 * Swept over every field of every exercise, so a field added tomorrow is
 * swept tomorrow. That is the point of writing it now: a third
 * presentation and a capture-style setting are being built, and the
 * question of whether the capture style belongs in the identity is
 * exactly this rule applied to a field that does not exist yet. If it
 * does not change `items(settings)` and somebody puts it in the line
 * anyway, this fails and says which field.
 */
describe('what a line is allowed to turn on', () => {
  /*
    The whole settings object as the round's exercise, not a hand-built
    `{ presentation }`.

    The first version passed only the presentation, which made this blind
    to the thing it exists to catch: adding `clef` to `lineOfRound`'s
    return left every case green, because the fixture had no `clef` for it
    to read. A test that builds the input narrower than production does
    cannot see a field production would have passed through — the same
    fault as feeding `intervalPlayed` note lists typed by hand.
  */
  const lineFor = (type: AnyExerciseDefinition, settings: unknown) => lineOfRound(type.id, {
    askable: [...type.items(settings)] as ItemId[],
    exercise: settings as { readonly presentation: Presentation },
  });

  it('turns on the askable set, and on presentation by the exception 0010 names', () => {
    let compared = 0;
    const wrong: string[] = [];

    for (const type of EXERCISE_TYPES) {
      const base = widestSettings(type);
      for (const field of type.settings.fields as AnyField[]) {
        if (field.relevant?.(base) === false) continue;
        for (const value of valuesOf(field, base)) {
          const changed = applyValue(field, base, value);
          const itemsMoved = [...type.items(base)].sort().join(',')
            !== [...type.items(changed)].sort().join(',');
          const lineMoved = lineKey(lineFor(type, base)) !== lineKey(lineFor(type, changed));
          compared += 1;

          // The identity may move only when the askable set does, with
          // presentation as the one field 0010 exempts.
          if (lineMoved && !itemsMoved && field.id !== 'presentation') {
            wrong.push(`${type.id}: ${field.id} splits a line without changing what it asks`);
          }
          if (itemsMoved && !lineMoved) {
            wrong.push(`${type.id}: ${field.id} changes what it asks without splitting the line`);
          }
        }
      }
    }

    // The sweep's own population: a settings space that enumerated
    // nothing would satisfy the rule by never testing it.
    expect(compared, 'no field values compared at all').toBeGreaterThan(50);
    expect([...new Set(wrong)]).toEqual([]);
  });

  /**
   * And presentation really is an exception rather than a field that
   * happens to change the askable set — otherwise the clause above is
   * carrying nothing and would pass with the exemption removed.
   */
  it('exempts presentation for a reason it actually needs', () => {
    const exempted = EXERCISE_TYPES.filter((type) => {
      const base = widestSettings(type);
      const field = (type.settings.fields as AnyField[]).find((f) => f.id === 'presentation');
      if (!field) return false;
      return valuesOf(field, base).some((value) => {
        const changed = applyValue(field, base, value);
        const itemsSame = [...type.items(base)].sort().join(',')
          === [...type.items(changed)].sort().join(',');
        return itemsSame && lineKey(lineFor(type, base)) !== lineKey(lineFor(type, changed));
      });
    });

    expect(exempted.map((t) => t.id).length,
      'no exercise splits a line on presentation alone, so the exemption is unused')
      .toBeGreaterThan(0);
  });
});
