import { describe, expect, it } from 'vitest';
import {
  INTERVAL_DEFAULTS, INTERVAL_DIRECTIONS, INTERVAL_SLUGS, MAX_SEMITONES, WINDOW_CHOICES, generateInterval, gradeInterval, intervalItemId, intervalScoreNotes, intervalSettingsSchema, intervalVoices, pitchWindow, type IntervalDirection, type IntervalSettings,
} from './intervals';
import { intervalBetween, intervalName, qualityOf } from '../../theory/interval';
import { midiOf, pitchName } from '../../theory/pitch';

/**
 * Generation and grading are pure, so this is where the exercise's claims
 * get checked — over a few thousand seeds rather than one, which is what
 * ADR 0002's reproducibility buys.
 *
 * Seeds run 0..N rather than being drawn, so a failure here reproduces
 * exactly. Nothing is snapshotted: the assertions are about the interval
 * being the one that was asked for, not about which one a seed happens to
 * produce.
 */

const SEEDS = 2000;

function settings(over: Partial<IntervalSettings> = {}): IntervalSettings {
  return { ...INTERVAL_DEFAULTS, ...over };
}

const ALL_DIRECTIONS = [...INTERVAL_DIRECTIONS];
const ALL_SEMITONES = Array.from({ length: MAX_SEMITONES + 1 }, (_, i) => i);

describe('interval item ids', () => {
  it('uses the form docs/ROADMAP.md already names', () => {
    expect(intervalItemId(3, 'up')).toBe('interval:m3:up');
    expect(intervalItemId(6, 'down')).toBe('interval:tritone:down');
    expect(intervalItemId(7, 'harmonic')).toBe('interval:P5:harmonic');
  });

  it('collapses the unison, which sounds the same whichever way it is played', () => {
    // Three separate histories for one skill, none of which could ever be
    // told apart by the user, is the failure this avoids.
    for (const direction of ALL_DIRECTIONS) {
      expect(intervalItemId(0, direction)).toBe('interval:unison');
    }
  });

  it('gives every presentable interval an id', () => {
    for (const semitones of ALL_SEMITONES) {
      expect(() => intervalItemId(semitones, 'up')).not.toThrow();
    }
    expect(() => intervalItemId(13, 'up')).toThrow();
  });

  it('names the ear-training interval rather than the spelling', () => {
    // A listener cannot hear whether six semitones was written A4 or d5, so
    // the item is the sound. Changing any of these orphans a user's history.
    expect(INTERVAL_SLUGS).toEqual([
      'unison', 'm2', 'M2', 'm3', 'M3', 'P4', 'tritone', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8',
    ]);
  });
});

describe('generating an interval', () => {
  it('is reproducible from its seed', () => {
    const spec = { seed: 12345, settings: settings({ directions: ALL_DIRECTIONS }) };
    expect(generateInterval(spec)).toEqual(generateInterval(spec));
  });

  it('does not produce the same exercise for every seed', () => {
    const spec = settings({ directions: ALL_DIRECTIONS });
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const exercise = generateInterval({ seed, settings: spec });
      seen.add(`${exercise.semitones}:${exercise.direction}:${midiOf(exercise.pitches[0])}`);
    }
    expect(seen.size).toBeGreaterThan(50);
  });

  it('only ever draws from the configured pools', () => {
    const spec = settings({ semitones: [3, 7], directions: ['down', 'harmonic'] });
    for (let seed = 0; seed < SEEDS; seed++) {
      const exercise = generateInterval({ seed, settings: spec });
      expect(spec.semitones).toContain(exercise.semitones);
      expect(spec.directions).toContain(exercise.direction);
    }
  });

  it('sounds the distance it says it does, in the direction it says', () => {
    const spec = settings({ semitones: ALL_SEMITONES, directions: ALL_DIRECTIONS });
    for (let seed = 0; seed < SEEDS; seed++) {
      const { pitches, semitones, direction } = generateInterval({ seed, settings: spec });
      const span = midiOf(pitches[1]) - midiOf(pitches[0]);
      // `|| 0` for the same reason intervalBetween carries it: a descending
      // unison measures -0, which is === 0 but not Object.is 0, and toBe
      // uses the latter.
      expect(span).toBe(direction === 'down' ? -semitones || 0 : semitones);
    }
  });

  it('spells the interval the way it is heard', () => {
    // The point of spelling at all: C-D# and C-Eb are one sound and two
    // intervals, and an exercise that printed an augmented second where the
    // user heard a minor third would be teaching the wrong thing.
    const spec = settings({ semitones: ALL_SEMITONES, directions: ALL_DIRECTIONS });
    const expected = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];
    for (let seed = 0; seed < SEEDS; seed++) {
      const exercise = generateInterval({ seed, settings: spec });
      const measured = intervalBetween(exercise.pitches[0], exercise.pitches[1]);
      expect(intervalName(measured)).toBe(expected[exercise.semitones]);
    }
  });

  it('never needs more than a double accidental, which is all a staff can draw', () => {
    const spec = settings({ semitones: ALL_SEMITONES, directions: ALL_DIRECTIONS });
    for (let seed = 0; seed < SEEDS; seed++) {
      for (const pitch of generateInterval({ seed, settings: spec }).pitches) {
        expect(Math.abs(pitch.alter)).toBeLessThanOrEqual(2);
      }
    }
  });

  it('keeps both notes inside the window the setting allows', () => {
    for (const clef of ['treble', 'bass', 'alto', 'tenor'] as const) {
      for (const window of WINDOW_CHOICES) {
        const spec = settings({
          clef, window, semitones: ALL_SEMITONES, directions: ALL_DIRECTIONS,
        });
        const [low, high] = pitchWindow(spec);
        for (let seed = 0; seed < 300; seed++) {
          for (const pitch of generateInterval({ seed, settings: spec }).pitches) {
            expect(midiOf(pitch)).toBeGreaterThanOrEqual(low);
            expect(midiOf(pitch)).toBeLessThanOrEqual(high);
          }
        }
      }
    }
  });

  it('places an octave even at the narrowest range, rather than refusing', () => {
    // The narrowest window is exactly wide enough for the widest interval,
    // which is the constraint that keeps `rngInt` from being handed a range
    // running backwards.
    const spec = settings({ window: WINDOW_CHOICES[0], semitones: [12], directions: ALL_DIRECTIONS });
    for (let seed = 0; seed < 200; seed++) {
      const exercise = generateInterval({ seed, settings: spec });
      expect(Math.abs(midiOf(exercise.pitches[1]) - midiOf(exercise.pitches[0]))).toBe(12);
    }
  });

  it('carries the item it exercises, and only that one', () => {
    const spec = settings({ semitones: ALL_SEMITONES, directions: ALL_DIRECTIONS });
    for (let seed = 0; seed < 500; seed++) {
      const exercise = generateInterval({ seed, settings: spec });
      expect(exercise.items).toEqual([intervalItemId(exercise.semitones, exercise.direction)]);
    }
  });

  it('records the seed it was made from', () => {
    expect(generateInterval({ seed: 777, settings: settings() }).seed).toBe(777);
  });

  it('presents a unison as a unison in every mode', () => {
    const spec = settings({ semitones: [0], directions: ALL_DIRECTIONS });
    for (let seed = 0; seed < 100; seed++) {
      const { pitches } = generateInterval({ seed, settings: spec });
      expect(pitches[0]).toEqual(pitches[1]);
      // An altered unison would have a direction of 0 and a non-zero
      // semitone count; a true unison has neither.
      const measured = intervalBetween(pitches[0], pitches[1]);
      expect(measured).toEqual({ number: 1, semitones: 0, direction: 0 });
      expect(qualityOf(measured)).toBe('perf');
    }
  });
});

describe('grading an interval', () => {
  const exercise = (over: Partial<IntervalSettings>, seed = 1) =>
    generateInterval({ seed, settings: settings(over) });

  it('accepts the right distance and refuses the wrong one', () => {
    const ex = exercise({ semitones: [7], directions: ['up'] });
    expect(gradeInterval(ex, { semitones: 7 }).correct).toBe(true);
    expect(gradeInterval(ex, { semitones: 6 }).correct).toBe(false);
  });

  it('grades the sound, not the spelling', () => {
    // Six semitones is engraved as an augmented fourth, and the user is
    // asked for a tritone. Answering 6 is right whatever the staff says.
    const ex = exercise({ semitones: [6], directions: ['up'] });
    expect(intervalName(intervalBetween(ex.pitches[0], ex.pitches[1]))).toBe('A4');
    expect(gradeInterval(ex, { semitones: 6 }).correct).toBe(true);
  });

  it('credits exactly the item the exercise tested', () => {
    const ex = exercise({ semitones: [3], directions: ['down'] });
    const result = gradeInterval(ex, { semitones: 3 });
    expect(result.outcomes).toEqual([{ item: 'interval:m3:down', correct: true }]);
    expect(result.outcomes.map((o) => o.item)).toEqual([...ex.items]);
  });

  it('blames the same item when the answer is wrong', () => {
    const ex = exercise({ semitones: [3], directions: ['down'] });
    const result = gradeInterval(ex, { semitones: 4 });
    expect(result.outcomes).toEqual([{ item: 'interval:m3:down', correct: false }]);
  });

  it('carries latency through when it was measured, and omits it when it was not', () => {
    const ex = exercise({ semitones: [5], directions: ['up'] });
    expect(gradeInterval(ex, { semitones: 5, latencyMs: 1420 }).outcomes[0].latencyMs).toBe(1420);
    // Absent rather than zero: zero is the strongest possible claim of
    // fluency, and it would be made about an exercise nobody heard.
    expect(gradeInterval(ex, { semitones: 5 }).outcomes[0]).not.toHaveProperty('latencyMs');
  });

  it('keeps a latency of zero, which is a measurement and not a missing one', () => {
    const ex = exercise({ semitones: [5], directions: ['up'] });
    expect(gradeInterval(ex, { semitones: 5, latencyMs: 0 }).outcomes[0].latencyMs).toBe(0);
  });

  it('says which way a melodic interval went', () => {
    const up = exercise({ semitones: [4], directions: ['up'] });
    const down = exercise({ semitones: [4], directions: ['down'] });
    expect(gradeInterval(up, { semitones: 4 }).feedback).toContain('M3 up');
    expect(gradeInterval(down, { semitones: 4 }).feedback).toContain('M3 down');
  });

  it('says nothing about direction for a harmonic interval', () => {
    const ex = exercise({ semitones: [4], directions: ['harmonic'] });
    const feedback = gradeInterval(ex, { semitones: 4 }).feedback;
    expect(feedback).toContain('M3');
    expect(feedback).not.toContain('up');
    expect(feedback).not.toContain('down');
  });

  it('names both pitches, so the answer can be checked against the staff', () => {
    const ex = exercise({ semitones: [9], directions: ['up'] });
    const feedback = gradeInterval(ex, { semitones: 9 }).feedback;
    expect(feedback).toContain(pitchName(ex.pitches[0]));
    expect(feedback).toContain(pitchName(ex.pitches[1]));
  });

  it('offers the mnemonic when the answer was wrong, and not when it was right', () => {
    const ex = exercise({ semitones: [5], directions: ['up'] });
    expect(gradeInterval(ex, { semitones: 4 }).feedback).toContain('Here Comes the Bride');
    expect(gradeInterval(ex, { semitones: 5 }).feedback).not.toContain('Here Comes the Bride');
  });

  it('has no mnemonic to offer for a unison and does not invent one', () => {
    const ex = exercise({ semitones: [0], directions: ['up'] });
    const feedback = gradeInterval(ex, { semitones: 1 }).feedback;
    expect(feedback).toContain('Unison');
    expect(feedback).not.toContain('undefined');
  });

  it('agrees with itself: the verdict and the item outcome never disagree', () => {
    const spec = settings({ semitones: ALL_SEMITONES, directions: ALL_DIRECTIONS });
    for (let seed = 0; seed < 500; seed++) {
      const ex = generateInterval({ seed, settings: spec });
      for (const answer of ALL_SEMITONES) {
        const result = gradeInterval(ex, { semitones: answer });
        expect(result.outcomes.every((o) => o.correct === result.correct)).toBe(true);
      }
    }
  });
});

describe('the interval settings schema', () => {
  const coerce = intervalSettingsSchema.coerce;

  it('falls back whole when there is nothing stored', () => {
    expect(coerce(undefined)).toEqual(INTERVAL_DEFAULTS);
    expect(coerce(null)).toEqual(INTERVAL_DEFAULTS);
    expect(coerce('nonsense')).toEqual(INTERVAL_DEFAULTS);
  });

  it('keeps what it can read and repairs the rest', () => {
    const coerced = coerce({ clef: 'bass', window: 99, semitones: [3, 7] });
    expect(coerced.clef).toBe('bass');
    expect(coerced.window).toBe(INTERVAL_DEFAULTS.window);
    expect(coerced.semitones).toEqual([3, 7]);
  });

  it('sorts and de-duplicates the interval pool', () => {
    // The pool decides a musical choice, so its order must come from a rule
    // rather than from whatever order it was last written in (ADR 0002).
    expect(coerce({ semitones: [7, 3, 7, 3] }).semitones).toEqual([3, 7]);
  });

  it('drops intervals it has no name for', () => {
    expect(coerce({ semitones: [3, 13, -1, 2.5, 'x'] }).semitones).toEqual([3]);
  });

  it('refuses an empty pool rather than handing the generator one', () => {
    expect(coerce({ semitones: [] }).semitones).toEqual(INTERVAL_DEFAULTS.semitones);
    expect(coerce({ directions: [] }).directions).toEqual(INTERVAL_DEFAULTS.directions);
    expect(coerce({ directions: ['sideways'] }).directions).toEqual(INTERVAL_DEFAULTS.directions);
  });

  it('puts directions in their canonical order whatever order they were stored in', () => {
    expect(coerce({ directions: ['harmonic', 'up'] }).directions).toEqual(['up', 'harmonic']);
  });

  it('always coerces to settings the generator can actually use', () => {
    const rubbish: unknown[] = [
      undefined, null, 0, [], {}, { semitones: null }, { directions: 5 },
      { clef: 'percussion', window: '3', semitones: {} },
    ];
    for (const stored of rubbish) {
      const coerced = coerce(stored);
      expect(() => generateInterval({ seed: 1, settings: coerced })).not.toThrow();
    }
  });

  it('round-trips every field through its own control', () => {
    // What the settings panel does, without the panel: a field has to be
    // able to read back what it just wrote, or a control will not stick.
    for (const field of intervalSettingsSchema.fields) {
      if (field.kind === 'choice') {
        for (const option of field.options) {
          expect(field.selected(field.apply(INTERVAL_DEFAULTS, option.id))).toBe(option.id);
        }
      }
      if (field.kind === 'multi') {
        const options = typeof field.options === 'function'
          ? field.options(INTERVAL_DEFAULTS) : field.options;
        const ids = options.slice(0, 2).map((o) => o.id);
        expect([...field.selected(field.apply(INTERVAL_DEFAULTS, ids))]).toEqual(ids);
      }
    }
  });

  it('will not let a multi-choice field be emptied', () => {
    for (const field of intervalSettingsSchema.fields) {
      if (field.kind !== 'multi') continue;
      expect(field.apply(INTERVAL_DEFAULTS, [])).toEqual(INTERVAL_DEFAULTS);
    }
  });
});

describe('presenting an interval', () => {
  it('sounds a harmonic interval as one event', () => {
    const ex = generateInterval({ seed: 4, settings: settings({ directions: ['harmonic'] }) });
    const voices = intervalVoices(ex);
    expect(voices).toHaveLength(2);
    expect(voices[0].start).toBe(0);
    expect(voices[1].start).toBe(0);
  });

  it('sounds a melodic interval as two, in the order they are heard', () => {
    const ex = generateInterval({ seed: 4, settings: settings({ directions: ['down'] }) });
    const voices = intervalVoices(ex);
    expect(voices).toHaveLength(2);
    expect(voices[0].start).toBe(0);
    expect(voices[1].start).toBeGreaterThan(0);
    expect(voices.map((v) => v.midi)).toEqual(ex.pitches.map(midiOf));
  });

  it('engraves a harmonic interval on one stem and a melodic one on two', () => {
    const harmonic = generateInterval({ seed: 4, settings: settings({ directions: ['harmonic'] }) });
    expect(intervalScoreNotes(harmonic)).toHaveLength(1);
    expect(intervalScoreNotes(harmonic)[0].pitches).toHaveLength(2);

    const melodic = generateInterval({ seed: 4, settings: settings({ directions: ['up'] }) });
    expect(intervalScoreNotes(melodic)).toHaveLength(2);
  });

  it('engraves the notes the exercise actually sounded', () => {
    for (const direction of ALL_DIRECTIONS as IntervalDirection[]) {
      const ex = generateInterval({ seed: 9, settings: settings({ directions: [direction] }) });
      const engraved = intervalScoreNotes(ex).flatMap((n) => [...n.pitches]);
      expect(engraved).toEqual([...ex.pitches]);
    }
  });
});
