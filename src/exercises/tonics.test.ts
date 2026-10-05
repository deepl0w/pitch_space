import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES } from './registry';
import { keysIn } from './types';
import { ALL_KEYS, type Mode, keyId } from '../theory/key';
import { pitchName } from '../theory/pitch';

/**
 * Choosing which tonics a question may be built on.
 *
 * Three exercises grew the control at once — "Tonics" on progressions and
 * degrees, "Roots" on chords — and the first two share `keysIn` while the
 * third has its own filter of the same shape. One claim in three places is
 * the arrangement that drifts, so it is asserted in one.
 *
 * The claim has two halves and the second is the one worth the file.
 * **Narrowing**: picking a tonic means questions are built on it.
 * **Composition**: a tonic is not a key. `F` with the mode set to minor is
 * F minor and nothing else, and the same `F` with the mode set to major is
 * F major — so the control multiplies with mode rather than duplicating it,
 * and twelve chips plus two modes is twenty-four keys rather than a second
 * way of saying the nine the mode already chose.
 */

/** The pool each exercise draws from: anything within four accidentals. */
const poolFor = (mode: Mode) =>
  ALL_KEYS.filter((k) => k.mode === mode && Math.abs(k.accidentals) <= 4);

describe('narrowing a pool to chosen tonics', () => {
  it('leaves the pool alone when nothing is chosen', () => {
    // Empty is "all", not "none". A settings blob with no tonics ticked is
    // the default, so reading it as an empty pool would make the exercise
    // ungeneratable out of the box.
    for (const mode of ['major', 'minor'] as const) {
      expect(keysIn(poolFor(mode), [])).toEqual(poolFor(mode));
    }
  });

  it('narrows nine keys to the one that was asked for', () => {
    const minor = poolFor('minor');
    expect(minor.length, 'a pool of one narrows to itself and proves nothing')
      .toBeGreaterThan(1);
    expect(keysIn(minor, ['tonic:F']).map(keyId)).toEqual(['F_minor']);
  });

  it('means a different key under a different mode, which is the point', () => {
    // Composition rather than duplication. If the control named keys instead
    // of tonics, one of these two would have to be wrong.
    expect(keysIn(poolFor('minor'), ['tonic:F']).map(keyId)).toEqual(['F_minor']);
    expect(keysIn(poolFor('major'), ['tonic:F']).map(keyId)).toEqual(['F_major']);
  });

  it('takes several tonics, and only those', () => {
    const chosen = keysIn(poolFor('major'), ['tonic:F', 'tonic:D']).map(keyId);
    expect([...chosen].sort()).toEqual(['D_major', 'F_major']);
  });

  it('reads a tonic stored before the prefix existed', () => {
    // Settings live in localStorage, so a blob written by an earlier release
    // is a real thing a browser hands back. Bare and prefixed have to agree.
    for (const mode of ['major', 'minor'] as const) {
      expect(keysIn(poolFor(mode), ['F']).map(keyId))
        .toEqual(keysIn(poolFor(mode), ['tonic:F']).map(keyId));
    }
  });

  it('falls back to the whole pool for a tonic the mode cannot build on', () => {
    /*
      The trap, and it is deliberate rather than an accident of the filter.
      `D#` is a tonic chip somewhere — the minor pool has D# minor — and the
      major pool within four accidentals has no D# major. Narrowing to
      nothing would leave the generator with an empty pool and an exercise
      that cannot be asked; handing back everything at least asks something.

      Worth knowing because it is surprising from the outside: ticking one
      impossible tonic gives you *all* of them rather than none, so a user
      who sees every key after choosing one has not hit a bug in the
      narrowing, they have chosen a key that mode cannot spell.
    */
    const major = poolFor('major');
    expect(major.map((k) => pitchName(k.tonic, false))).not.toContain('D#');
    expect(keysIn(major, ['tonic:D#'])).toEqual(major);
    // And a chosen tonic that exists alongside an impossible one still wins,
    // because the fallback is for an empty result rather than a partial one.
    expect(keysIn(major, ['tonic:D#', 'tonic:F']).map(keyId)).toEqual(['F_major']);
  });
});

describe('every exercise that offers the control', () => {
  /** Exercises with a tonic or root chooser, found rather than listed. */
  const withTonics = EXERCISE_TYPES
    .map((type) => ({
      type,
      field: type.settings.fields.find((f) => f.id === 'keys' || f.id === 'roots'),
    }))
    .filter((e): e is { type: typeof e.type; field: NonNullable<typeof e.field> } =>
      e.field !== undefined && e.field.kind === 'multi');

  it('is more than none of them, or the sweep below is idle', () => {
    expect(withTonics.map((e) => e.type.id).sort())
      .toEqual(['chord-id', 'degree-id', 'progression-id']);
  });

  it('builds only on the tonic that was chosen', () => {
    /*
      End to end, through `generate` rather than through the filter, because
      the filter being right and the generator calling it are two claims and
      only the second is what a user meets.

      Read off the generated exercise rather than recomputed: the tonic is in
      `keyId` where there is a key and in `root` where there is not, which is
      the difference between an exercise built in a key and one built on a
      note. Chord identification has no key at all, which is why its control
      is called Roots.
    */
    for (const { type, field } of withTonics) {
      if (field.kind !== 'multi') continue;
      for (const option of field.options.slice(0, 4)) {
        const settings = type.settings.coerce({
          ...(type.settings.defaults as object), [field.id]: [option.id],
        });
        const wanted = option.id.replace(/^tonic:/, '').replace(/\d+$/, '');
        const built = new Set<string>();
        for (let seed = 0; seed < 60; seed += 1) {
          const exercise = type.generate({ seed, settings }) as {
            keyId?: string; root?: { } };
          if (typeof exercise.keyId === 'string') built.add(exercise.keyId.split('_')[0]);
          else if (exercise.root) built.add(pitchName(exercise.root as never, false));
        }
        expect([...built], `${type.id} asked for ${option.id} and built on`)
          .toEqual([wanted]);
      }
    }
  });

  it('builds on everything when nothing is chosen', () => {
    // The other half of "empty is all": a default settings blob has to reach
    // more than one tonic or the exercise only ever asks about one note.
    for (const { type, field } of withTonics) {
      const settings = type.settings.coerce({
        ...(type.settings.defaults as object), [field.id]: [],
      });
      const built = new Set<string>();
      for (let seed = 0; seed < 120; seed += 1) {
        const exercise = type.generate({ seed, settings }) as {
          keyId?: string; root?: { } };
        if (typeof exercise.keyId === 'string') built.add(exercise.keyId.split('_')[0]);
        else if (exercise.root) built.add(pitchName(exercise.root as never, false));
      }
      expect(built.size, `${type.id} with nothing chosen built on only ${[...built]}`)
        .toBeGreaterThan(1);
    }
  });
});
