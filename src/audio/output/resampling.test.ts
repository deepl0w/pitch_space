import { describe, expect, it } from 'vitest';
import { centsOff, freqOf } from '../../theory/pitch';

/**
 * The arithmetic a sampled voice will rest on, written before the voice is.
 *
 * `docs/instrument-pack-format.md` specifies that a pack records only some
 * semitones — VCSL samples roughly every third — and that the player reaches
 * the rest by playing the nearest recording at an adjusted rate. It also
 * specifies that the ratio is **computed rather than stored**:
 *
 *     2 ** ((wanted - nearest) / 12)
 *
 * That is one line, which is exactly why it is worth a test: it is the line
 * most likely to be written from memory, and the failure it produces is a
 * note that sounds like a note and is the wrong one. Nothing in a listening
 * exercise would look wrong, and the user would be marked down for hearing
 * correctly.
 *
 * None of this needs a browser and none of it needs a pack. It is a claim
 * about the relationship between the ratio and what `pitch.ts` says a
 * frequency is, and both halves exist today.
 */

/** The format's rule, as written there. */
function playbackRate(wanted: number, nearest: number): number {
  return 2 ** ((wanted - nearest) / 12);
}

/** The compass a piano pack would cover, as MIDI note numbers: A0 to C8. */
const COMPASS = { lowest: 21, highest: 108 };

/** How far off is "off", in cents. A cent is about the limit of discrimination. */
const AUDIBLE_CENTS = 1;

describe('resampling from a neighbouring semitone', () => {
  /**
   * The claim proper. A recording made at one pitch, played at the rate the
   * format prescribes, is the pitch that was asked for — to within a
   * hundredth of a cent, which is to say exactly, in equal temperament.
   *
   * Swept over every pair rather than a few, because the cost is nothing and
   * the alternative is choosing the pairs that work.
   */
  it('lands on the frequency pitch.ts says the wanted note has', () => {
    let pairs = 0;
    for (let nearest = COMPASS.lowest; nearest <= COMPASS.highest; nearest += 1) {
      for (let shift = -6; shift <= 6; shift += 1) {
        const wanted = nearest + shift;
        if (wanted < COMPASS.lowest || wanted > COMPASS.highest) continue;
        const sounded = freqOf(nearest) * playbackRate(wanted, nearest);
        const { midi, cents } = centsOff(sounded);
        expect(midi, `${nearest} shifted by ${shift}`).toBe(wanted);
        expect(Math.abs(cents), `${nearest} shifted by ${shift}`).toBeLessThan(0.01);
        pairs += 1;
      }
    }
    // The sweep's own population: a loop whose bounds crossed would assert
    // nothing and pass, which is the shape of guard this suite has shipped
    // before.
    expect(pairs).toBeGreaterThan(1000);
  });

  /**
   * The control, and the reason the case above is worth having.
   *
   * Exactness in equal temperament is not a property of the test being
   * careful — it falls out of `freqOf` being `a4 * 2 ** ((midi - 69) / 12)`,
   * so any rate of the same form cancels perfectly however far it reaches.
   * A test that can only see a *large* error would therefore pass a
   * resampler that was nearly right, and nearly right is what a rounded
   * constant or a stored ratio produces.
   *
   * So: round the rate to two decimal places — a plausible thing to do to a
   * number being written into a file — and the check must notice. If it does
   * not, the tolerance above is measuring nothing.
   */
  it('would notice a rate that had been rounded on its way through a file', () => {
    const rounded: { shift: number; cents: number }[] = [];
    for (let shift = -6; shift <= 6; shift += 1) {
      const nearest = 60;
      const rate = Math.round(playbackRate(nearest + shift, nearest) * 100) / 100;
      const { cents } = centsOff(freqOf(nearest) * rate);
      rounded.push({ shift, cents });
    }
    const audible = rounded.filter((r) => Math.abs(r.cents) >= AUDIBLE_CENTS);
    expect(audible.length, 'rounding the ratio is inaudible, so this is not a check')
      .toBeGreaterThan(8);
  });

  /**
   * What the format's sampling interval buys, stated as arithmetic rather
   * than taken on trust.
   *
   * Every third semitone means no note is more than one semitone from a
   * recording. That is the number the pack's size is traded against — a
   * denser grid is a bigger download — so it is worth being able to see
   * what a change to the interval would do to the worst case, rather than
   * rediscovering it when a pack is rebuilt.
   */
  it('never reaches further than the sampling interval allows', () => {
    for (const interval of [1, 2, 3, 4, 6]) {
      const recorded: number[] = [];
      for (let m = COMPASS.lowest; m <= COMPASS.highest; m += interval) recorded.push(m);

      let worst = 0;
      for (let wanted = COMPASS.lowest; wanted <= recorded[recorded.length - 1]; wanted += 1) {
        const nearest = recorded.reduce(
          (best, m) => (Math.abs(m - wanted) < Math.abs(best - wanted) ? m : best),
        );
        worst = Math.max(worst, Math.abs(wanted - nearest));
      }
      expect(worst, `every ${interval} semitones`).toBe(Math.floor(interval / 2));
    }
  });
});
