import { describe, expect, it } from 'vitest';
import {
  INTERVAL_DEFAULTS, INTERVAL_DIRECTIONS, INTERVAL_SLUGS, MAX_SEMITONES, WINDOW_CHOICES, generateInterval, gradeInterval, intervalItemId, intervalPlayed, intervalScoreNotes, intervalSettingsSchema, intervalVoices, pitchWindow, type IntervalDirection, type IntervalSettings,
} from './intervals';
import { intervalBetween, intervalName, qualityOf } from '../../theory/interval';
import { midiOf, pitchName } from '../../theory/pitch';
import type { PlayedNote } from '../types';

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

  it('does not tie a sounding note to one spelling, wished or not', () => {
    /*
      The reading difficulty of a question is partly its accidentals, and
      the same sound written two ways is two different things to read: a
      learner who only ever meets `F#` has not met `Gb`. So the spelling is
      a coin the seed tosses, and **nothing pinned that it goes on being
      tossed**.

      Handed here from `aiming.test.ts` rather than bolted onto it. That
      file asks whether aiming flattens a field, and it cannot see this
      one: pinning the spelling whenever a wish is honoured leaves
      `pitches` varying by register alone, so the field goes on varying
      while a dimension inside it has stopped. Projecting the register out
      — asking what a *given* sounding note is written as — is a claim
      about spelling, which is why it lives where the spelling rules do.

      **Asked of the first note only, which took a measurement to get
      right.** Over both notes the claim is true and blunt: the second note
      is spelled from the interval rather than from the coin, so a given
      sounding note turns up spelled one way as a first note and another
      way as a second, and the count stays healthy even when the coin is
      pinned. Projected onto the first note — the one the coin actually
      spells — pinning it takes 7 of 18 to 0, which is the whole of the
      claim. Over both notes the same mutant only falls 14 to 7 and passes.
    */
    const spec = settings({ semitones: ALL_SEMITONES, directions: ALL_DIRECTIONS });
    const spellingsByNote = (prefer?: string) => {
      const byMidi = new Map<number, Set<string>>();
      for (let seed = 0; seed < 300; seed += 1) {
        const exercise = generateInterval({
          seed, settings: spec, ...(prefer === undefined ? {} : { prefer }),
        } as never);
        const first = exercise.pitches[0];
        const midi = midiOf(first);
        byMidi.set(midi, (byMidi.get(midi) ?? new Set<string>()).add(pitchName(first, false)));
      }
      return [...byMidi.values()].filter((names) => names.size > 1).length;
    };

    // The control first: a generator that spelled everything one way would
    // make the aimed half below true for the wrong reason.
    expect(spellingsByNote(), 'no sounding note is ever written two ways')
      .toBeGreaterThan(0);
    expect(spellingsByNote('interval:m2:up'),
      'honouring a wish tied every note to one spelling').toBeGreaterThan(0);
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

/**
 * The question carries the choices it was asked against.
 *
 * The prompt used to draw its buttons from the live settings while the
 * answer was fixed at generation, so unticking the interval that happened
 * to be the answer left a question with no correct choice on screen — and
 * answering it recorded a wrong attempt against an item the learner was
 * never asked. ADR 0007: an outcome is a claim that the user was asked.
 *
 * Asserted here rather than only in the component, because the invariant
 * is the generator's: whatever a screen does with `choices`, the answer
 * has to be in it.
 */
describe('the choices a question was asked against', () => {
  it('always contain its own answer, across the settings space', () => {
    const pools: number[][] = [
      [0, 12], [7], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [3, 4, 7], [1, 11],
    ];
    for (const semitones of pools) {
      for (let seed = 0; seed < 60; seed += 1) {
        const settings = intervalSettingsSchema.coerce({ presentation: 'read', semitones });
        const exercise = generateInterval({ seed, settings });
        expect(
          exercise.choices,
          `seed ${seed}, pool ${semitones.join()}: the answer is not offered`,
        ).toContain(exercise.semitones);
      }
    }
  });

  it('is the question\'s own record, not the settings\' array', () => {
    /*
      `choices` exists so a question carries what it was asked against,
      which it does not do if it *is* the array the panel is editing.

      Measured before this was a copy: `exercise.choices === settings.semitones`
      was true, two exercises drawn from one settings object shared a single
      array, and reversing one moved the other and the settings with it.
      Nothing mutates it today and `readonly number[]` stops anything in
      this repository starting, so the risk was never live — but "frozen at
      generation" was true by convention rather than by the code, and the
      fix this is part of was made because a convention was not enough.
    */
    const settings = intervalSettingsSchema.coerce({ presentation: 'read', semitones: [0, 12] });
    const first = generateInterval({ seed: 5, settings });
    const second = generateInterval({ seed: 6, settings });

    expect(first.choices).not.toBe((settings as { semitones: readonly number[] }).semitones);
    expect(first.choices).not.toBe(second.choices);
    // And still the same pool, so independence was not bought by narrowing.
    expect(first.choices).toEqual([0, 12]);
  });

  it('is the pool the settings gave, not a wider or narrower one', () => {
    /*
      The control. "The answer is among the choices" is satisfied by a
      `choices` holding every interval there is, which would reopen the
      defect from the other side — a button for something the settings
      switched off. Both halves or neither.
    */
    const settings = intervalSettingsSchema.coerce({ presentation: 'read', semitones: [0, 12] });
    expect(generateInterval({ seed: 5, settings }).choices).toEqual([0, 12]);
  });
});

/**
 * Reading an interval off what someone played.
 *
 * The arithmetic is one line and the care is all in what it refuses. Every
 * case below where the answer is `null` is a case where the player has not
 * answered — and the thing this must never do is hand back a number for one
 * of those, because a number is graded, and a grade against an unanswered
 * question resets a streak the player never got to keep (ADR 0047).
 */
describe('the interval someone played', () => {
  const at = (frequencyHz: number | null, startSeconds = 0): PlayedNote => (
    { startSeconds, durationSeconds: 0.5, frequencyHz }
  );

  it('is the distance between the two notes with a pitch in them', () => {
    // A4 to C#5 is four semitones however the two are spelled.
    expect(intervalPlayed([at(440), at(554.365, 1)])).toBe(4);
  });

  /**
   * Three notes are not an answer, where they used to be read as the first
   * two of them.
   *
   * The case below this one pinned the consequence as a question. The user
   * answered it from the outside, playing the hesitation a real instrument
   * invites — a note, a pause, the same note again, then the second — and
   * reported being told, in the same wording and the same tally as a clean
   * miss, that they were wrong. Nothing said a third note had arrived.
   *
   * So the reading is refused rather than guessed. An arpeggio does not
   * answer with the interval it opened on; nothing is scored, and the
   * prompt says which way the take was unreadable.
   */
  it('refuses a take with a third note rather than reading the first two', () => {
    expect(intervalPlayed([at(440), at(554.365, 1), at(659.255, 2)])).toBeNull();
  });

  /**
   * The hesitation this was written for, now answered.
   *
   * A learner plays the first note, is unsure of it, strikes it again, then
   * plays the second. That used to read the first two attacks and answer
   * *unison* — a confident wrong answer to a question they were halfway
   * through answering correctly, costing the streak, and indistinguishable
   * from a clean miss in wording, tally and tone.
   *
   * It is the boundary ADR 0047 was corrected about, approached from the
   * other side: the test is *enough to grade* rather than *heard*, and
   * enough wants unambiguous as well as sufficient. The difference from the
   * silence case is that there no bit could separate a quiet room from an
   * unreadable one, and here the count is present — so discarding it was a
   * choice and refusing is the honest one.
   *
   * The case this replaced pinned the old behaviour as a question so that
   * answering it would fail loudly rather than land green. It did.
   */
  it('refuses a re-struck note rather than calling it a unison', () => {
    expect(intervalPlayed([at(440), at(440, 1), at(554.365, 2)])).toBeNull();
  });

  /**
   * And a genuine unison is still answerable, which is what stops the case
   * above being a rule that deletes an interval from the exercise.
   *
   * `INTERVAL_DEFAULTS` offers unison, so a learner can be asked for one and
   * has to be able to play one — two attacks at the same pitch.
   */
  it('still reads a unison played as two notes', () => {
    expect(intervalPlayed([at(440), at(440, 1)])).toBe(0);
  });

  /**
   * And the order read is the array's, not the clock's.
   *
   * `analyse` assembles notes in time order, so the two agree today and no
   * caller is wrong. Written because the function takes a list and reads
   * positions out of it: if a caller ever hands it notes gathered some other
   * way, this is the assumption that breaks, and it breaks into a wrong
   * answer rather than a refusal.
   */
  it('reads the list in the order it was given', () => {
    const descending = [at(554.365, 1), at(440, 0)];
    expect(intervalPlayed(descending)).toBe(4);
    expect(descending.map((n) => n.startSeconds), 'the fixture is in time order')
      .not.toEqual([...descending.map((n) => n.startSeconds)].sort((a, b) => a - b));
  });

  it('is a distance, so playing it downwards answers the same interval', () => {
    // The question asks about direction separately, and the buttons beside
    // this path answer a distance; a sign here would be a second opinion.
    expect(intervalPlayed([at(554.365), at(440, 1)])).toBe(4);
  });

  it.each([
    ['a unison', 440, 440, 0],
    ['a minor second', 440, 466.164, 1],
    ['a tritone', 440, 622.254, 6],
    ['an octave', 440, 880, 12],
    ['a major ninth', 440, 987.767, 14],
  ])('reads %s', (_name, from, to, semitones) => {
    expect(intervalPlayed([at(from), at(to, 1)])).toBe(semitones);
  });

  it('does not fold a compound interval into the octave it fits inside', () => {
    /*
      Stated as its own case because the tempting version of this function
      does fold, and folding would be wrong in the direction that teaches
      the wrong thing: someone answering a major second by playing a major
      ninth has played a different interval, and being told they were right
      is worse than being told they were wrong.
    */
    expect(intervalPlayed([at(440), at(987.767, 1)])).not.toBe(2);
  });

  it('is tolerant of an instrument that is not quite in tune', () => {
    // Thirty cents sharp is audible and is still the same interval. A
    // player tuning up to the app would be a worse app.
    expect(intervalPlayed([at(440), at(554.365 * 2 ** (0.3 / 12), 1)])).toBe(4);
  });

  it('steps over a note whose pitch could not be read', () => {
    // A muted string or a fret buzz between the two real notes. Skipping it
    // is what stops one scrape costing the answer.
    expect(intervalPlayed([at(440), at(null, 0.5), at(554.365, 1)])).toBe(4);
  });

  it.each([
    ['nothing at all', []],
    ['one note', [at(440)]],
    ['two notes, neither with a pitch', [at(null), at(null, 1)]],
    ['two notes, only one with a pitch', [at(440), at(null, 1)]],
  ])('refuses to read an interval from %s', (_name, notes) => {
    expect(intervalPlayed(notes)).toBeNull();
  });

  it('refuses a frequency that cannot be a pitch', () => {
    // Defensive rather than observed: a detector returning zero would
    // otherwise come back as `Infinity` semitones, which grades wrong
    // rather than refusing, and a wrong answer is the one outcome an
    // unanswered question must not produce.
    expect(intervalPlayed([at(0), at(440, 1)])).toBeNull();
    expect(intervalPlayed([at(440), at(0, 1)])).toBeNull();
  });
});

/**
 * The hint on a wrong answer, and the one direction it must not offer.
 *
 * `INTERVAL_MNEMONICS` is ascending throughout. A mnemonic works by handing
 * the ear a contour it already knows, so one offered for the opposite
 * contour points at the thing being learned and points the wrong way —
 * which is worse than no hint, not merely less useful.
 */
describe('the tune a wrong answer suggests', () => {
  const wrongAnswerTo = (direction: IntervalDirection, semitones: number): string => {
    const settings = intervalSettingsSchema.coerce({
      presentation: 'listen', semitones: [semitones], directions: [direction],
    });
    for (let seed = 1; seed < 500; seed += 1) {
      const exercise = generateInterval({ seed, settings });
      if (exercise.direction !== direction || exercise.semitones !== semitones) continue;
      return gradeInterval(exercise, { semitones: semitones === 1 ? 2 : 1 }).feedback;
    }
    throw new Error(`no seed produced ${semitones} semitones ${direction}`);
  };

  it('offers one when the interval rose', () => {
    expect(wrongAnswerTo('up', 9), 'no tune offered for an ascending 6th')
      .toMatch(/Think My Bonnie/);
  });

  it('offers none when the interval fell', () => {
    // The defect: a learner who missed a descending major 6th was told to
    // think of a tune that ascends.
    expect(wrongAnswerTo('down', 9), 'an ascending tune offered for a descending interval')
      .not.toMatch(/Think/);
  });

  it('still names the interval and the pitches when it offers no tune', () => {
    // So the fix removes a wrong hint rather than the whole explanation.
    const feedback = wrongAnswerTo('down', 9);
    expect(feedback).toMatch(/Major 6th/);
    expect(feedback).toMatch(/to/);
  });

  it('keeps it for a harmonic interval, which has no contour to contradict', () => {
    expect(wrongAnswerTo('harmonic', 9)).toMatch(/Think My Bonnie/);
  });
});
