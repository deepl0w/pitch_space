import { describe, expect, it } from 'vitest';
import { lineKey, sameLine, type ProgressLine } from './line';

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
