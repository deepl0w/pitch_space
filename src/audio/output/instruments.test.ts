import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INSTRUMENT_ID, INSTRUMENTS, instrument, isInstrumentId,
} from './instruments';

/**
 * The catalogue, asserted as a catalogue rather than as a sound.
 *
 * Nothing here says an organ sounds like an organ — that is taste and
 * the suite has no standing on it. What it does say is that each entry
 * is playable, that the ids a user's settings will hold are stable and
 * distinct, and that the entries differ from one another, since a picker
 * offering six identical voices is worse than offering one.
 */
describe('the instrument catalogue', () => {
  it('has a default that is in it', () => {
    expect(() => instrument(DEFAULT_INSTRUMENT_ID)).not.toThrow();
  });

  it('gives every instrument a distinct id', () => {
    // Ids are written to a user's device, so a duplicate would make one
    // of two voices unreachable for anyone who had stored it.
    const ids = INSTRUMENTS.map((i) => i.id);
    expect(new Set(ids).size, 'nothing to compare, so nothing below is asserted')
      .toBe(ids.length);
    expect(ids.length).toBeGreaterThan(1);
  });

  it('refuses an id it does not have, rather than falling back', () => {
    // Repair belongs at the boundary with storage. A caller holding a
    // bad id has a bug and a silent piano would hide it.
    expect(() => instrument('tuba')).toThrow(/tuba/);
    expect(isInstrumentId('tuba')).toBe(false);
    expect(isInstrumentId(DEFAULT_INSTRUMENT_ID)).toBe(true);
  });

  it('can actually be played: every envelope is orderable and audible', () => {
    for (const i of INSTRUMENTS) {
      expect(i.partials.length, `${i.id} has no partials`).toBeGreaterThan(0);
      expect(i.partials[0], `${i.id} has no fundamental`).toBeGreaterThan(0);
      // Every segment must advance. A zero-length attack cannot ramp and
      // a negative one schedules into the past.
      expect(i.attack, `${i.id} attacks instantly`).toBeGreaterThan(0);
      expect(i.decay, `${i.id} has no decay`).toBeGreaterThan(0);
      expect(i.release, `${i.id} has no release`).toBeGreaterThan(0);
      // Sustain is a fraction of peak, and a negative or louder-than-peak
      // one would make the envelope's exponential ramp meaningless.
      expect(i.sustain, `${i.id} sustains outside 0..1`).toBeGreaterThanOrEqual(0);
      expect(i.sustain).toBeLessThanOrEqual(1);
      expect(i.inharmonicity, `${i.id} is sharp in the wrong direction`)
        .toBeGreaterThanOrEqual(0);
    }
  });

  it('offers voices that differ from each other', () => {
    /*
      The control on the whole catalogue. Six entries whose partials and
      envelopes happened to be equal would satisfy every case above and
      give a learner a picker that does nothing — which is exactly the
      failure the picker exists to avoid.
    */
    const shapes = INSTRUMENTS.map(
      (i) => `${i.partials.join()}|${i.attack}|${i.decay}|${i.sustain}`,
    );
    expect(new Set(shapes).size).toBe(INSTRUMENTS.length);
  });

  it('separates into a struck family and a held one, rather than a continuum', () => {
    /*
      The distinction a learner actually picks between, and the one the
      envelope was generalised to express. Without both, the sustain field
      carries no weight and could be deleted unnoticed.

      **Asked as a shape rather than against two thresholds.** The first
      version of this required a sustain at or below 0.35 and one at or
      above 0.8 — numbers chosen rather than measured, which pass a
      catalogue tuned until the two families are 0.45 apart and nothing is
      audibly either.

      So: sort the sustains, take the widest gap, and require it to be
      wider than the spread inside either group it separates. That is the
      difference between two families and a gradient, it needs no figure
      anyone picked, and it survives ordinary retuning — today the gap is
      0.55 against a widest within-group spread of 0.15, so there is room
      to move an instrument without this complaining.

      **It does not settle the worry that motivated it, and should not be
      read as doing so.** The concern was a catalogue tuned until the two
      families stop being audibly different; tightening every instrument
      to 0.33–0.35 and 0.80–0.82 passes this, because 0.45 apart with
      spreads of 0.02 genuinely *is* two families by any structural
      measure. It also passed the thresholds it replaced.

      Whether 0.45 of sustain is audible is a listening question and
      nothing off a speaker answers it. What this rules out is the other
      failure — a catalogue with no families at all, where the field has
      quietly stopped meaning anything — and it does that without a figure
      anyone picked.
    */
    const sustains = INSTRUMENTS.map((i) => i.sustain).sort((a, b) => a - b);
    const gaps = sustains.slice(1).map((v, i) => v - sustains[i]);
    const widest = Math.max(...gaps);
    const at = gaps.indexOf(widest);

    const struck = sustains.slice(0, at + 1);
    const held = sustains.slice(at + 1);
    expect(struck.length, 'nothing is struck').toBeGreaterThan(0);
    expect(held.length, 'nothing is held').toBeGreaterThan(0);

    const spread = (group: number[]) => group[group.length - 1] - group[0];
    expect(widest, 'the sustains are a gradient rather than two families')
      .toBeGreaterThan(Math.max(spread(struck), spread(held)));
  });
});
