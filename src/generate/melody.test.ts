import { describe, expect, it } from 'vitest';
import { generateMelody, type MelodyNote, type MelodySlot } from './melody';
import { generateHarmony, type Harmony } from './harmony';
import { generateRhythm } from './rhythm';
import { ALL_KEYS, type Key } from '../theory/key';
import { spellChord } from '../theory/chord';
import { midiOf } from '../theory/pitch';
import { TICKS_PER_QUARTER, beatLevel, metricWeight, timeSignature } from '../theory/meter';
import { makeRng } from '../theory/rng';

/**
 * What the melody generator claims, and how the claims are checkable.
 *
 * The brief asks for lines that follow real patterns rather than random
 * notes, and "sounds musical" is not a thing a test can see. What makes
 * this falsifiable is that every note carries its own analysis: the
 * search computes a role to enforce its constraints, so the role can be
 * checked against the notes either side of it.
 *
 * **So these tests re-derive nothing.** They take the role the
 * generator asserted and ask whether the three-note neighbourhood
 * actually supports it. A generator that mislabels is caught; one that
 * merely sounds odd is not, and that is the honest boundary — the
 * weights are a tuning problem with no ground truth and pinning them
 * would make tuning impossible.
 */

const METERS = ['4/4', '3/4', '6/8'].map(timeSignature);
const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);
const RANGE = [60, 81] as const;

interface Case {
  harmony: Harmony;
  slots: MelodySlot[];
  notes: MelodyNote[];
  label: string;
}

function caseAt(index: number, key: Key, bars = 4): Case {
  const ts = METERS[index % METERS.length];
  const harmony = generateHarmony(makeRng(index), {
    key, timeSignature: ts, bars, sevenths: index % 3 === 0,
  });
  const rhythm = generateRhythm(makeRng(index + 1), {
    timeSignature: ts, bars, allowRests: true, syncopationsPerBar: index % 2,
  });
  const slots = rhythm.flatMap((bar) => bar.events
    .filter((e) => !e.isRest && !e.tiedFromPrevious)
    .map((e) => ({ startTick: e.startTick, durationTicks: e.durationTicks })));
  const notes = generateMelody(makeRng(index + 2), { harmony, slots, range: RANGE });
  return { harmony, slots, notes, label: `seed ${index} ${key.tonic.letter} ${ts.id}` };
}

const SWEEP: Case[] = SEEDS.map((_, i) => caseAt(i, ALL_KEYS[i % ALL_KEYS.length]));

const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;
const chordTones = (c: Case, note: MelodyNote) =>
  new Set(spellChord(c.harmony.events[note.chord].chord).map((p) => pitchClass(midiOf(p))));

describe('the sweep itself', () => {
  it('generates something to test', () => {
    // Without this every property below passes on an empty line.
    expect(SWEEP).toHaveLength(SEEDS.length);
    expect(SWEEP.every((c) => c.notes.length > 0)).toBe(true);
    expect(SWEEP.reduce((n, c) => n + c.notes.length, 0)).toBeGreaterThan(600);
  });

  it('produces a note for every attack and no others', () => {
    for (const c of SWEEP) {
      expect(c.notes.map((n) => n.startTick), c.label)
        .toEqual(c.slots.map((s) => s.startTick));
    }
  });

  it('reaches every role it declares, or the checks below are idle', () => {
    // A role nothing produces is a branch of the classifier no test
    // touches. This does not require all seven — anticipation and
    // escape are genuinely rare — but it does require more than
    // chord tones, or "every non-chord tone is classifiable" is
    // vacuously true.
    const roles = new Set(SWEEP.flatMap((c) => c.notes.map((n) => n.role)));
    expect(roles.has('chord-tone')).toBe(true);
    expect([...roles].filter((r) => r !== 'chord-tone').length).toBeGreaterThan(1);
  });
});

describe('every note is accounted for', () => {
  it('is a chord tone exactly when it says it is', () => {
    // Both directions. "Says chord-tone and is one" alone would pass
    // on a generator that called everything a chord tone and never
    // produced anything else.
    for (const c of SWEEP) {
      for (const note of c.notes) {
        const isTone = chordTones(c, note).has(pitchClass(midiOf(note.pitch)));
        expect(note.role === 'chord-tone', `${c.label}: ${note.role} at ${note.startTick}`)
          .toBe(isTone);
      }
    }
  });

  it('steps into and out of a passing note, the same way', () => {
    /*
      The definition, asserted of the neighbourhood rather than taken
      from the generator. A "passing note" that leaps in is the
      commonest way a naive line goes wrong, and it is invisible
      without the label to check against.
    */
    for (const c of SWEEP) {
      for (const [i, note] of c.notes.entries()) {
        if (note.role !== 'passing') continue;
        const before = midiOf(c.notes[i - 1].pitch);
        const here = midiOf(note.pitch);
        const after = midiOf(c.notes[i + 1].pitch);
        expect(Math.abs(here - before), `${c.label}: passing not stepped into`)
          .toBeLessThanOrEqual(2);
        expect(Math.abs(after - here), `${c.label}: passing not stepped out of`)
          .toBeLessThanOrEqual(2);
        expect(Math.sign(here - before), `${c.label}: passing changes direction`)
          .toBe(Math.sign(after - here));
      }
    }
  });

  it('returns a neighbour note to where it came from', () => {
    for (const c of SWEEP) {
      for (const [i, note] of c.notes.entries()) {
        if (note.role !== 'neighbour') continue;
        const before = midiOf(c.notes[i - 1].pitch);
        const here = midiOf(note.pitch);
        expect(midiOf(c.notes[i + 1].pitch), `${c.label}: neighbour does not return`)
          .toBe(before);
        expect(Math.abs(here - before)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('prepares a suspension and resolves it down by step', () => {
    // The one dissonance licensed on a strong beat, so its definition
    // is the thing that licence rests on: held from the chord before,
    // falling by a step into the chord it is over.
    for (const c of SWEEP) {
      for (const [i, note] of c.notes.entries()) {
        if (note.role !== 'suspension') continue;
        const before = c.notes[i - 1];
        const after = midiOf(c.notes[i + 1].pitch);
        const here = midiOf(note.pitch);
        expect(midiOf(before.pitch), `${c.label}: suspension not prepared`).toBe(here);
        expect(before.chord, `${c.label}: suspension inside one chord`).not.toBe(note.chord);
        expect(here - after, `${c.label}: suspension does not resolve down by step`)
          .toBeGreaterThan(0);
        expect(here - after).toBeLessThanOrEqual(2);
      }
    }
  });

  it('leaps into an appoggiatura and steps out the other way', () => {
    for (const c of SWEEP) {
      for (const [i, note] of c.notes.entries()) {
        if (note.role !== 'appoggiatura' || i === 0 || i === c.notes.length - 1) continue;
        const before = midiOf(c.notes[i - 1].pitch);
        const here = midiOf(note.pitch);
        const after = midiOf(c.notes[i + 1].pitch);
        expect(Math.abs(here - before), `${c.label}: appoggiatura not leapt into`)
          .toBeGreaterThan(2);
        expect(Math.sign(after - here), `${c.label}: appoggiatura does not resolve back`)
          .toBe(-Math.sign(here - before));
      }
    }
  });
});

describe('what the line does as a line', () => {
  it('puts a chord tone on every strong beat, or a prepared suspension', () => {
    /*
      The constraint that makes a generated line imply its harmony
      rather than merely avoid clashing with it. The exception is
      named and is the only one: a suspension is a dissonance the
      previous chord prepared.
    */
    for (const c of SWEEP) {
      const ts = c.harmony.timeSignature;
      for (const note of c.notes) {
        const weight = metricWeight(ts, note.startTick % ts.barTicks);
        if (weight < beatLevel(ts)) continue;
        expect(
          note.role === 'chord-tone' || note.role === 'suspension',
          `${c.label}: ${note.role} on a strong beat at ${note.startTick}`,
        ).toBe(true);
      }
    }
  });

  it('stays inside the range it was given', () => {
    for (const c of SWEEP) {
      for (const note of c.notes) {
        expect(midiOf(note.pitch), c.label).toBeGreaterThanOrEqual(RANGE[0]);
        expect(midiOf(note.pitch), c.label).toBeLessThanOrEqual(RANGE[1]);
      }
    }
  });

  it('never leaps further than an octave', () => {
    for (const c of SWEEP) {
      for (let i = 1; i < c.notes.length; i += 1) {
        const leap = Math.abs(midiOf(c.notes[i].pitch) - midiOf(c.notes[i - 1].pitch));
        expect(leap, `${c.label}: leap of ${leap} at note ${i}`).toBeLessThanOrEqual(12);
      }
    }
  });

  it('mostly moves by step, which is what makes it a line and not a list', () => {
    // A proportion rather than a rule, and a loose one: the weights
    // are a tuning problem and this asserts only that stepwise motion
    // is the default rather than an accident. Measured across the
    // sweep rather than per phrase, so one angular line is allowed.
    const intervals = SWEEP.flatMap((c) => c.notes.slice(1).map(
      (n, i) => Math.abs(midiOf(n.pitch) - midiOf(c.notes[i].pitch)),
    ));
    const steps = intervals.filter((i) => i > 0 && i <= 2).length;
    expect(steps / intervals.length).toBeGreaterThan(0.4);
  });

  it('does not trade two notes back and forth for a phrase', () => {
    /*
      Blandness, which the plan names as this generator's real failure
      mode rather than illegality — and it was real. Every hard
      constraint was satisfied by lines reading `E5 C5 E5 C5 E5 C5
      E5`: two chord tones alternating for a whole phrase, legal and
      characterless. The `repeat` penalty missed it because no pitch
      repeats consecutively.

      A measured proportion across the sweep rather than a rule, for
      the reason this file says at the top: A–B–A is a neighbour
      figure and perfectly good once. What is wrong is a phrase made
      of them. The bound is loose — it sits at about 3% and fails well
      before a line goes back to alternating — so tuning the weight
      does not move it.
    */
    const occurrences = SWEEP.flatMap((c) => {
      const midis = c.notes.map((n) => midiOf(n.pitch));
      return midis.slice(2).map((_, i) => midis[i + 2] === midis[i]);
    });
    const rate = occurrences.filter(Boolean).length / occurrences.length;
    expect(rate, `${(rate * 100).toFixed(1)}% of notes return to the one before last`)
      .toBeLessThan(0.15);
  });

  it('has one high point, not a plateau at the top', () => {
    /*
      "A single clear high point" is the shape claim, and the
      checkable half is that the maximum is not reached repeatedly.
      Asserted as a proportion of phrases rather than of every one,
      because a short line over a static harmony can legitimately
      touch its ceiling twice and failing on that would be pinning an
      aesthetic.
    */
    const singlePeaked = SWEEP.filter((c) => {
      const midis = c.notes.map((n) => midiOf(n.pitch));
      const top = Math.max(...midis);
      return midis.filter((m) => m === top).length === 1;
    });
    expect(singlePeaked.length / SWEEP.length).toBeGreaterThan(0.5);
  });
});

describe('determinism', () => {
  it('reproduces exactly from a seed', () => {
    // ADR 0005: an exercise reported by its seed has to come back.
    for (const i of [0, 7, 23]) {
      const a = caseAt(i, ALL_KEYS[i % ALL_KEYS.length]).notes;
      const b = caseAt(i, ALL_KEYS[i % ALL_KEYS.length]).notes;
      expect(a).toEqual(b);
    }
  });

  it('does not ignore the seed', () => {
    // The other half, and the one a constant generator would pass
    // without: different seeds have to give different lines.
    const lines = new Set(SWEEP.map((c) => c.notes.map((n) => midiOf(n.pitch)).join(',')));
    expect(lines.size / SWEEP.length).toBeGreaterThan(0.9);
  });
});

describe('the awkward inputs', () => {
  it('returns nothing for no slots rather than throwing', () => {
    const harmony = generateHarmony(makeRng(1), {
      key: ALL_KEYS[0], timeSignature: timeSignature('4/4'), bars: 2,
    });
    expect(generateMelody(makeRng(1), { harmony, slots: [], range: RANGE })).toEqual([]);
  });

  it('refuses a range with no scale notes in it, saying so', () => {
    const harmony = generateHarmony(makeRng(1), {
      key: ALL_KEYS[0], timeSignature: timeSignature('4/4'), bars: 2,
    });
    const slots = [{ startTick: 0, durationTicks: TICKS_PER_QUARTER }];
    expect(() => generateMelody(makeRng(1), { harmony, slots, range: [60, 60] }))
      .toThrow(/scale notes/);
  });

  it('fills a line over a range only a few notes wide', () => {
    // Where the search has least room and relaxation is most likely.
    const harmony = generateHarmony(makeRng(3), {
      key: ALL_KEYS[0], timeSignature: timeSignature('4/4'), bars: 2,
    });
    const slots = Array.from({ length: 8 }, (_, i) => ({
      startTick: i * TICKS_PER_QUARTER, durationTicks: TICKS_PER_QUARTER,
    }));
    const notes = generateMelody(makeRng(3), { harmony, slots, range: [60, 67] });
    expect(notes).toHaveLength(8);
    for (const note of notes) {
      expect(midiOf(note.pitch)).toBeGreaterThanOrEqual(60);
      expect(midiOf(note.pitch)).toBeLessThanOrEqual(67);
    }
  });
});
