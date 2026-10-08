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
      // A fraction of peak, and strictly above zero: the envelope ramps
      // to it exponentially and an exponential cannot reach zero.
      expect(i.decayTo, `${i.id} decays outside 0..1`).toBeGreaterThan(0);
      expect(i.decayTo).toBeLessThanOrEqual(1);
      // A trim of zero is a silent instrument, which no other case here
      // would notice: the rest are about shape rather than level.
      expect(i.trim, `${i.id} is silent`).toBeGreaterThan(0);
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
      (i) => `${i.partials.join()}|${i.attack}|${i.decay}|${i.decayTo}|${i.holds}`,
    );
    expect(new Set(shapes).size).toBe(INSTRUMENTS.length);
  });

  it('includes both a struck voice and a held one', () => {
    /*
      The distinction a learner picks between, and the one the envelope
      now has two curves for. Without both families the `holds` flag
      carries no weight and could be deleted unnoticed.

      This case used to infer the families from where the sustain
      values clustered, and carried an honest caveat that whether the
      gap was *audible* was a listening question nothing here could
      settle. Making struck-versus-held a declared property retires the
      inference and the caveat together: it is no longer two ends of a
      number, so the only thing left to assert is that each family has
      a member.
    */
    expect(INSTRUMENTS.some((i) => !i.holds), 'nothing is struck').toBe(true);
    expect(INSTRUMENTS.some((i) => i.holds), 'nothing is held').toBe(true);
  });

  it('trims a held voice below a struck one, because it delivers more', () => {
    /*
      Measured through an analyser on the live graph rather than
      reasoned: dividing by the partial count left the organ about 15 dB
      above the piano, which reads as a volume change rather than a
      change of instrument. A held voice sits at its level for the whole
      note where a struck one is already falling, so it needs the deeper
      trim.

      An ordering rather than the figures, because the figures are
      measurements of this synthesis and move when a voice does. What
      must not move is the direction: a trim making held voices louder
      would be the defect, correctly shaped.
    */
    const loudest = (held: boolean) => Math.max(
      ...INSTRUMENTS.filter((i) => i.holds === held).map((i) => i.trim),
    );
    expect(loudest(true), 'a held voice is trimmed no further than a struck one')
      .toBeLessThan(loudest(false));
  });
});
