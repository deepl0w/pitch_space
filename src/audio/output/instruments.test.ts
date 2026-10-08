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

  it('includes both a struck voice and a held one', () => {
    // The distinction a learner actually picks between, and the one the
    // envelope was generalised to express. Without both, the sustain
    // field is carrying no weight and could be deleted unnoticed.
    expect(INSTRUMENTS.some((i) => i.sustain <= 0.35), 'nothing is struck').toBe(true);
    expect(INSTRUMENTS.some((i) => i.sustain >= 0.8), 'nothing is held').toBe(true);
  });
});
