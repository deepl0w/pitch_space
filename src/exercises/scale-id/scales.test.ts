import { describe, expect, it } from 'vitest';
import {
  SCALE_DEFAULTS, allowedTypes, coerceScaleSettings, generateScale, gradeScale,
  scaleItems, scalePlayed, scaleScoreSpec, scaleVoices, type ScaleSettings,
} from './scales';
import { SCALE_TYPES, scaleType, spellScale } from '../../theory/scale';
import { midiOf, parsePitch, pitchName } from '../../theory/pitch';
import type { PlayedNote } from '../types';

/**
 * What this exercise owes beyond the registry contract.
 *
 * The contract tests ask the generic questions. These are the two claims
 * particular to naming a scale: that what sounds is what is written, and
 * that the spelling is the scale's own rather than whichever accidental
 * was nearer.
 */

const SEEDS = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);
const ALL = SCALE_TYPES.map((t) => t.id);

function settings(over: Partial<ScaleSettings> = {}): ScaleSettings {
  return { ...SCALE_DEFAULTS, ...over };
}

describe('the scale a question is built from', () => {
  it('is spelled the way the type requires, in every root it offers', () => {
    /*
      The reason this exercise cannot respell anything. A C blues wants
      G♭ and G, not F♯ and G, because the scale has a flattened fifth and
      a natural fifth and they are different degrees — written as F♯ and
      G they are the same staff step twice and the figure is unreadable.

      Asserted as a property of every generated question rather than
      against a list of examples: the claim is about all twenty types and
      the example would only ever be about blues.
    */
    for (const seed of SEEDS) {
      const e = generateScale({ seed, settings: settings({ types: ALL }) });
      const type = scaleType(e.typeId);
      expect(e.pitches).toEqual(spellScale(e.root, type));

      // A seven-note scale uses each letter once — that is what makes it
      // readable, and it is the property `spellScale`'s staff-step array
      // exists to guarantee. Pentatonics and the octatonics cannot, so
      // the claim is scoped to the scales it is true of rather than
      // weakened to one that is true of everything.
      if (type.steps.length === 7 && new Set(type.steps).size === 7) {
        const letters = e.pitches.map((p) => p.letter);
        expect(new Set(letters).size, `${type.name} on ${pitchName(e.root, false)} reuses a letter`)
          .toBe(7);
      }
    }
  });

  it('sounds exactly what it draws, and closes on the octave', () => {
    // The staff and the audio are built from the same `pitches`, so this
    // is really asserting that neither path adds or drops a note — which
    // is the thing a learner would hear as the question not matching the
    // answer.
    for (const seed of SEEDS.slice(0, 40)) {
      const e = generateScale({ seed, settings: settings({ types: ALL, direction: 'up' }) });
      const drawn = scaleScoreSpec(e).notes.flatMap((n) => n.pitches.map(midiOf));
      const heard = scaleVoices(e).map((v) => v.midi);
      expect(heard).toEqual(drawn);
      expect(drawn[drawn.length - 1] - drawn[0]).toBe(12);
    }
  });

  it('turns around without sounding the top note twice', () => {
    // A scale up and back is one gesture. Repeating the turning point
    // makes it two, and the ear hears a mistake rather than a shape.
    const e = generateScale({ seed: 7, settings: settings({ direction: 'updown' }) });
    const heard = scaleVoices(e).map((v) => v.midi);
    const up = scaleVoices({ ...e, direction: 'up' }).map((v) => v.midi);
    expect(heard).toEqual([...up, ...[...up].reverse().slice(1)]);
    expect(heard.filter((m) => m === Math.max(...heard))).toHaveLength(1);
  });

  it('plays the notes in the other order when asked to descend', () => {
    const e = generateScale({ seed: 11, settings: settings({ direction: 'down' }) });
    const down = scaleVoices(e).map((v) => v.midi);
    const up = scaleVoices({ ...e, direction: 'up' }).map((v) => v.midi);
    expect(down).toEqual([...up].reverse());
    // And they go out in time order regardless, or the scheduler would be
    // handed a descending list to play ascending.
    const starts = scaleVoices(e).map((v) => v.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});

describe('what the exercise asks about', () => {
  it('asks the type and never the root', () => {
    // The item is `scale:<type>` with no root in it. Keying on the root
    // would split one skill across twelve questions and teach that a
    // Dorian from D is a different thing to learn from a Dorian from E♭.
    for (const seed of SEEDS.slice(0, 60)) {
      const e = generateScale({ seed, settings: settings({ types: ALL }) });
      expect(e.items).toEqual([`scale:${e.typeId}`]);
      expect(gradeScale(e, { typeId: e.typeId }).outcomes.map((o) => o.item))
        .toEqual([`scale:${e.typeId}`]);
    }
  });

  it('moves the root unless told not to', () => {
    /*
      A learner who only ever hears the modes from C has learned the
      white notes. Asserted both ways round, because "it transposes" and
      "the switch turns it off" are different claims and only the second
      one has a control behind it.
    */
    const moving = new Set(SEEDS.map(
      (seed) => pitchName(generateScale({ seed, settings: settings() }).root, false),
    ));
    expect(moving.size).toBeGreaterThan(6);

    const fixed = new Set(SEEDS.map(
      (seed) => pitchName(generateScale({ seed, settings: settings({ transpose: false }) }).root, false),
    ));
    expect([...fixed]).toEqual(['C']);
  });

  it('offers every type it might ask, and no type it will not', () => {
    // Containment and reachability, the pairing `registry.test.ts` runs
    // generically — here against the buttons the user actually sees,
    // which is the thing that would strand an answer.
    for (const types of [['dorian'], ['major', 'blues', 'altered'], ALL]) {
      const s = settings({ types });
      const asked = new Set(SEEDS.map((seed) => generateScale({ seed, settings: s }).typeId));
      const offered = new Set(generateScale({ seed: 1, settings: s }).choices);
      expect([...offered].sort()).toEqual([...types].sort());
      for (const id of asked) expect(offered.has(id), `${id} asked, not offered`).toBe(true);
      expect(scaleItems(s).map(String).sort())
        .toEqual([...types].map((t) => `scale:${t}`).sort());
    }
  });

  it('keeps the catalogue order rather than the order a setting was stored in', () => {
    // So the buttons do not reshuffle because somebody unticked and
    // reticked a chip.
    const backwards = settings({ types: [...ALL].reverse() });
    expect(allowedTypes(backwards).map((t) => t.id)).toEqual(ALL);
  });
});

describe('settings arriving from storage', () => {
  it('drops a type this build has never heard of and keeps the rest', () => {
    const got = coerceScaleSettings({ types: ['dorian', 'bebop-something', 'blues'] });
    expect(got.types).toEqual(['dorian', 'blues']);
  });

  it('falls back rather than leaving the generator with nothing to pick', () => {
    for (const stored of [{}, { types: [] }, { types: ['nope'] }, { types: 'dorian' }, null, 7]) {
      const got = coerceScaleSettings(stored);
      expect(got.types.length, JSON.stringify(stored)).toBeGreaterThan(0);
      expect(() => generateScale({ seed: 1, settings: got })).not.toThrow();
    }
  });

  it('refuses to be left with no scales by the panel either', () => {
    const field = SCALE_DEFAULTS.types;
    const types = SCALE_TYPES.map((t) => t.id);
    expect(field.every((id) => types.includes(id))).toBe(true);
  });
});

describe('what the answer says', () => {
  it('names the scale and the note it started on, right or wrong', () => {
    const e = generateScale({ seed: 3, settings: settings({ types: ['dorian'] }) });
    const root = pitchName(e.root, false);
    expect(gradeScale(e, { typeId: 'dorian' }).feedback).toContain('Dorian');
    expect(gradeScale(e, { typeId: 'dorian' }).feedback).toContain(root);
    // Wrong answers are told what it was, not only that they were wrong.
    const wrong = gradeScale(e, { typeId: 'major' });
    expect(wrong.correct).toBe(false);
    expect(wrong.feedback).toContain('Dorian');
  });

  it('credits the item it asked about whether the answer was right or not', () => {
    const e = generateScale({ seed: 3, settings: settings({ types: ['dorian', 'major'] }) });
    for (const typeId of ['dorian', 'major']) {
      const r = gradeScale(e, { typeId });
      expect(r.outcomes).toHaveLength(1);
      expect(r.outcomes[0].item).toBe(`scale:${e.typeId}`);
      expect(r.outcomes[0].correct).toBe(typeId === e.typeId);
    }
  });
});

describe('the staff the answer is drawn on', () => {
  it('carries no key signature, because the signature would be the answer', () => {
    // A reader who can read a signature would not have to hear anything.
    // Every accidental is written in instead, which is also how a mode is
    // printed when it is not the key of the piece.
    const e = generateScale({ seed: 5, settings: settings({ types: ALL }) });
    expect(scaleScoreSpec(e).key).toBeUndefined();
  });

  it('draws one note per degree, plus the octave', () => {
    for (const id of SCALE_TYPES.map((t) => t.id)) {
      const e = generateScale({ seed: 2, settings: settings({ types: [id] }) });
      expect(scaleScoreSpec(e).notes, id).toHaveLength(scaleType(id).semitones.length + 1);
    }
  });

  it('starts the drawn scale on the root it says it started on', () => {
    const e = generateScale({ seed: 9, settings: settings({ types: ALL }) });
    expect(scaleScoreSpec(e).notes[0].pitches[0]).toEqual(e.root);
    expect(midiOf(e.root)).toBe(midiOf(parsePitch(pitchName(e.root, false) + e.root.octave)));
  });
});

/**
 * Reading a scale off what somebody played.
 *
 * The question is the type and never the root, so this is matched on the
 * pattern between the notes. Every case where the answer is `null` is a case
 * where the learner has not answered, and the thing that must never happen is
 * a number coming back for one of those — a grade against an unanswered
 * question resets a streak they never got to keep (ADR 0047).
 */
describe('the scale someone played', () => {
  const RATE = 440;
  /** A sequence of semitone offsets, as frequencies a detector would report. */
  const played = (...semitones: number[]): PlayedNote[] =>
    semitones.map((semitone, i) => ({
      startSeconds: i * 0.4,
      durationSeconds: 0.35,
      frequencyHz: RATE * 2 ** (semitone / 12),
    }));

  const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12];
  const ALL = SCALE_TYPES.map((t) => t.id);

  it('names the type from the pattern between the notes', () => {
    expect(scalePlayed(played(...MAJOR), ALL)).toBe('major');
  });

  it('does not care which root it was played from', () => {
    // The answer buttons say "Dorian", not "D Dorian", so a learner who
    // transposed has answered the question that was asked.
    const fromAnywhere = MAJOR.map((s) => s + 7);
    expect(scalePlayed(played(...fromAnywhere), ALL)).toBe('major');
  });

  it('does not care which octave it was played in', () => {
    expect(scalePlayed(played(...MAJOR.map((s) => s - 24)), ALL)).toBe('major');
  });

  /**
   * Played downwards, which is the case that fails silently if the run is
   * read from the note it started on.
   *
   * A major scale from its octave down to its root has the semitones of
   * Phrygian when measured from the top. That is a real scale and the wrong
   * answer — the worst kind of failure, since it grades rather than refuses.
   */
  it('reads a descending scale as the same scale', () => {
    expect(scalePlayed(played(...[...MAJOR].reverse()), ALL)).toBe('major');
  });

  /**
   * Tolerant of an instrument that is not quite in tune, within a limit this
   * states rather than implies.
   *
   * Every reading is relative to the lowest note, so that note's own error
   * moves all of them: two notes 20 cents out in opposite directions are 40
   * cents apart, which still rounds to the right semitone. Push both to 30
   * and the interval is 60 cents out and rounds to the wrong one — so the
   * usable tolerance is half a semitone *on the interval*, which is a
   * quarter tone each way and not a quarter tone per note.
   */
  it('is tolerant of an instrument that is not quite in tune', () => {
    const wobbly = MAJOR.map((s) => s + (s % 2 === 0 ? 0.2 : -0.2));
    expect(scalePlayed(played(...wobbly), ALL)).toBe('major');
  });

  /**
   * And past that limit it refuses rather than naming a different scale.
   *
   * Not guaranteed by construction, which is why it is a case: a pattern
   * mangled by tuning usually matches nothing in the catalogue, but nothing
   * stops it landing on a real type. This holds the one that would be worst
   * — a whole semitone of error on one degree, turning major's third into
   * the minor one — and asserts the refusal rather than the misreading.
   */
  it('refuses a pattern tuning has mangled, rather than naming its neighbour', () => {
    const flattened = [0, 2, 3, 5, 7, 9, 11, 12];
    // That pattern is melodic minor, a real type — so this is only a
    // refusal if melodic minor is not among the choices.
    const offered = ALL.filter((id) => scaleType(id).semitones.join(',') !== flattened.slice(0, -1).join(','));
    expect(scalePlayed(played(...flattened), offered)).toBeNull();
  });

  it.each([
    ['nothing at all', [] as number[]],
    ['one note', [0]],
    ['a run that stops short of the octave', [0, 2, 4, 5]],
    ['a run that overshoots it', [0, 2, 4, 5, 7, 9, 11, 12, 14]],
  ])('refuses to read a scale from %s', (_name, semitones) => {
    expect(scalePlayed(played(...semitones), ALL)).toBeNull();
  });

  /**
   * The octave is the end of the run, and a run that goes past it is not a
   * scale this can read.
   *
   * Isolated deliberately. The neighbouring case — a run that overshoots —
   * also refuses with this check removed, because `0,2,4,5,7,9,11,12` is
   * not a pattern any type has, so it passes for the wrong reason. Here
   * the pattern below the final note *is* major, so the only thing
   * refusing is the requirement that the run stop at twelve.
   */
  it('refuses a run that carries on past the octave', () => {
    expect(scalePlayed(played(0, 2, 4, 5, 7, 9, 11, 13), ALL)).toBeNull();
  });

  /**
   * And a note struck again once the octave is reached is not a second
   * chance to change the answer.
   *
   * The run ends at the octave, so what follows is not part of it — a
   * learner who lands on the top note and plays it again has still played
   * the scale. This is also what tells the monotonic check from a looser
   * one: with repeats merely tolerated rather than ending the run, this
   * take reads `0,2,4,5,7,9,11,12` as the pattern and matches nothing.
   */
  it('answers a scale whose last note was struck twice', () => {
    expect(scalePlayed(played(0, 2, 4, 5, 7, 9, 11, 12, 12), ALL)).toBe('major');
  });

  it('refuses a re-struck note rather than guessing past it', () => {
    // The same refusal `intervalPlayed` makes, and for the same reason: two
    // attacks on one pitch do not say which was the answer.
    expect(scalePlayed(played(0, 0, 2, 4, 5, 7, 9, 11, 12), ALL)).toBeNull();
  });

  /**
   * Two octaves is refused, and a fumble after the octave is forgiven.
   *
   * Both fall out of "the run has to reach the octave and stop there" and
   * neither was asserted, so a change to that line could flip either
   * without anything saying so. They are also **opposite answers to the
   * same kind of input**, which is worth having written down somewhere:
   * notes beyond what was asked for.
   *
   * A learner who plays the scale through two octaves has demonstrated it
   * more thoroughly than asked and is told to try again. A learner who
   * finishes the octave and then fumbles a lower note is answered, because
   * the run has already stopped and what follows is never read.
   *
   * **The two-octave refusal is over-determined, which I got wrong first
   * and a mutant corrected.** I wrote that it is refused because the run
   * ends at 24 rather than 12; loosening that check to accept any octave
   * multiple leaves the case green, because fourteen offsets then match no
   * type in the table either. So accepting two octaves is a two-part
   * change — the octave check *and* reading only the first octave of the
   * run — and anyone who makes one of them will find this case still
   * refusing, for the other reason.
   *
   * **Pinned as the behaviour that exists, not as a decision.** The
   * interval rule refuses a third attack outright; this one refuses extra
   * notes before the octave and ignores them after it. Both are
   * defensible and they are not the same rule, and which a learner meets
   * depends on where in the phrase they went wrong. If that is settled
   * either way, these two cases are where it lands.
   */
  it('refuses a scale played through two octaves', () => {
    const twoOctaves = [...MAJOR, ...MAJOR.slice(1).map((s) => s + 12)];
    expect(twoOctaves[twoOctaves.length - 1], 'the fixture does not reach the second octave')
      .toBe(24);
    expect(scalePlayed(played(...twoOctaves), ALL)).toBeNull();
  });

  it('answers a scale that was complete before the player fumbled', () => {
    // The octave, then a note below it: the run has already stopped, so
    // what follows is not read at all.
    expect(scalePlayed(played(...MAJOR, 0), ALL)).toBe('major');
    expect(scalePlayed(played(...MAJOR, 7), ALL)).toBe('major');
  });

  it('refuses a pattern no offered type has', () => {
    // A learner who played something that is not on the buttons has not
    // answered the question; the app does not pick the nearest.
    expect(scalePlayed(played(0, 1, 2, 3, 4, 5, 6, 12), ALL)).toBeNull();
  });

  it('refuses a type that was not offered, rather than answering off the menu', () => {
    // The pattern is a real scale and a correct reading, and it is not one
    // of the choices this question was drawn from.
    const offered = ALL.filter((id) => id !== 'major');
    expect(scalePlayed(played(...MAJOR), offered)).toBeNull();
  });

  it('reads every type in the catalogue that spans an octave', () => {
    // The population guard: each case above is one scale, and a matcher
    // that only worked for the diatonic ones would pass all of them.
    const read = SCALE_TYPES
      .map((type) => [type.id, scalePlayed(played(...type.semitones, 12), ALL)] as const)
      .filter(([id, got]) => got !== id);
    expect(read, 'types that did not read back as themselves').toEqual([]);
  });
});
