import { describe, expect, it } from 'vitest';
import {
  SCALE_DEFAULTS, allowedTypes, coerceScaleSettings, generateScale, gradeScale,
  scaleItems, scaleScoreSpec, scaleVoices, type ScaleSettings,
} from './scales';
import { SCALE_TYPES, scaleType, spellScale } from '../../theory/scale';
import { midiOf, parsePitch, pitchName } from '../../theory/pitch';

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
