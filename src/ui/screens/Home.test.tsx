import { describe, expect, it } from 'vitest';
import { percent } from './Home';

/**
 * The three readings a card can give, and the two that are easy to confuse.
 *
 * A learner answered a question correctly and read "0%", and reported it as
 * "that did not count" — rightly, because the line had moved and the figure
 * said it had not. Showing nothing is reserved for a line never practised,
 * so the gap between *not started* and *barely started* needs its own words.
 */
describe('a completion as a card reads it', () => {
  it('says less than one per cent rather than none, once a line has moved', () => {
    expect(percent(0.0001)).toBe('<1%');
    expect(percent(0.009)).toBe('<1%');
  });

  it('still says none for a line that has genuinely not moved', () => {
    // Net zero is real: a wrong answer resets the item's streak, so a
    // session can end exactly where it started. That is not the same as
    // the band above and must not borrow its words.
    expect(percent(0)).toBe('0%');
  });

  it('rounds down everywhere else, so a full line is really full', () => {
    expect(percent(0.01)).toBe('1%');
    expect(percent(0.999)).toBe('99%');
    expect(percent(1)).toBe('100%');
  });
});
