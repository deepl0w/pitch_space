import { describe, expect, it } from 'vitest';
import { GREENEST, standingHue, standingWord } from './Home';

/**
 * How a card reads a line, after the user ruled it reads as a colour.
 *
 * *"Colours from red — bad — to green — good, no completion."* The reading
 * this replaced was a percentage, and a percentage is a completion: it has
 * a hundred in it, and a reader seeing 97% knows what the missing three
 * would mean. These hold the two properties that follow from the ruling —
 * that the scale runs the right way, and that it has no end.
 */
describe('how a line reads on its card', () => {
  it('runs from red at nothing towards green', () => {
    expect(standingHue(0), 'a line at nothing was not red').toBe(0);
    // Monotonic across the whole range rather than at the two ends, which
    // is what makes it a scale rather than two colours.
    const hues = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map(standingHue);
    for (const [i, hue] of hues.slice(1).entries()) {
      expect(hue, `hue fell between ${i} and ${i + 1}`).toBeGreaterThan(hues[i]);
    }
  });

  /**
   * The ruling's other half, and the one a hue scale quietly breaks.
   *
   * Pure green is where the eye stops reading *better* and starts reading
   * *finished*. A scale that arrives there has a colour meaning done, which
   * is the completion the user said there is not — so the best a line can
   * show has to be short of it, by enough to see.
   */
  it('never arrives, however well a line has gone', () => {
    const PURE_GREEN = 120;
    expect(standingHue(1), 'the best a line can do is pure green').toBeLessThan(PURE_GREEN);
    expect(GREENEST).toBeLessThan(PURE_GREEN);
    // And past the end of the scale as well, since `completion` is a ratio
    // and a later change to its denominator could push it over 1.
    expect(standingHue(5)).toBeLessThan(PURE_GREEN);
  });

  it('says how it is going in words as well, for a reader who sees no colour', () => {
    // WCAG 1.4.1: colour may not be the only channel. Asserted as four
    // distinct words over the range rather than as particular wording, so
    // the bands can be renamed without this failing.
    const words = new Set([0, 0.3, 0.6, 0.95].map(standingWord));
    expect(words.size, 'two readings share a word').toBe(4);
  });

  /**
   * The word and the colour say the same thing, which neither case above
   * could tell.
   *
   * Found by mutation: reordering the bands so a line at nothing reads
   * *steady* and one near the top reads *shaky* leaves every other case
   * here green — four distinct words is still four, none of them says
   * finished, and the hue is untouched. The two channels would then
   * disagree in front of a learner, which is the exact failure the
   * accessibility note is about: the word exists so a reader who cannot
   * see the colour gets the same meaning, and a word that contradicts it
   * is worse than no word at all.
   *
   * Asserted as agreement in direction rather than as a mapping from
   * bands to hues, so the bands can be renamed, re-cut or added to — the
   * comment above says four is a judgement — without this failing for
   * anything but disagreement.
   */
  it('never lets the word and the colour disagree about direction', () => {
    const order: string[] = [];
    let previousHue = -1;
    for (let step = 0; step <= 100; step += 1) {
      const fraction = step / 100;
      const word = standingWord(fraction);
      const hue = standingHue(fraction);

      // The hue never falls, which is also the monotonicity the first case
      // samples at seven points — swept here rather than sampled.
      expect(hue, `hue fell at ${fraction}`).toBeGreaterThanOrEqual(previousHue);
      previousHue = hue;

      if (order[order.length - 1] !== word) order.push(word);
    }

    // Each word is entered once and never returned to, so reading the
    // scale upwards reads the words in one order.
    expect(order.length, 'a word was returned to after the scale moved on')
      .toBe(new Set(order).size);
    expect(order.length, 'the whole scale reads as one word').toBeGreaterThan(1);
  });

  /**
   * And a fraction outside the scale reads as its nearest end rather than
   * as nothing. `completion` cannot be negative today; the clamp is in
   * `standingHue` because a later change to its denominator could make it
   * so, and the word has to agree with the clamp.
   */
  it('reads a fraction off either end as that end', () => {
    expect(standingHue(-1), 'below the scale was not red').toBe(0);
    expect(standingWord(-1), 'below the scale was not the lowest word')
      .toBe(standingWord(0));
    expect(standingWord(5), 'above the scale was not the highest word')
      .toBe(standingWord(1));
  });

  it('says nothing that means finished', () => {
    // The word scale is where a completion would sneak back in. None of
    // these is a state you stop practising from.
    const forbidden = /done|complete|finished|mastered|100/i;
    for (const fraction of [0, 0.2, 0.5, 0.8, 1]) {
      expect(standingWord(fraction), `band at ${fraction}`).not.toMatch(forbidden);
    }
  });
});
