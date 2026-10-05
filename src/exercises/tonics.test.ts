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
const POOL = ALL_KEYS.filter((k) => Math.abs(k.accidentals) <= 4);
const poolFor = (mode: Mode) => POOL.filter((k) => k.mode === mode);
/** `keysIn` takes the unfiltered pool and the modes, and orders them itself. */
const narrow = (mode: Mode, tonics: readonly string[]) => keysIn(POOL, tonics, [mode]);

describe('narrowing a pool to chosen tonics', () => {
  it('leaves the pool alone when nothing is chosen', () => {
    // Empty is "all", not "none". A settings blob with no tonics ticked is
    // the default, so reading it as an empty pool would make the exercise
    // ungeneratable out of the box.
    for (const mode of ['major', 'minor'] as const) {
      expect(narrow(mode, [])).toEqual(poolFor(mode));
    }
  });

  it('narrows nine keys to the one that was asked for', () => {
    const minor = poolFor('minor');
    expect(minor.length, 'a pool of one narrows to itself and proves nothing')
      .toBeGreaterThan(1);
    expect(narrow('minor', ['tonic:F']).map(keyId)).toEqual(['F_minor']);
  });

  it('means a different key under a different mode, which is the point', () => {
    // Composition rather than duplication. If the control named keys instead
    // of tonics, one of these two would have to be wrong.
    expect(narrow('minor', ['tonic:F']).map(keyId)).toEqual(['F_minor']);
    expect(narrow('major', ['tonic:F']).map(keyId)).toEqual(['F_major']);
  });

  it('takes several tonics, and only those', () => {
    const chosen = narrow('major', ['tonic:F', 'tonic:D']).map(keyId);
    expect([...chosen].sort()).toEqual(['D_major', 'F_major']);
  });

  it('reads a tonic stored before the prefix existed', () => {
    // Settings live in localStorage, so a blob written by an earlier release
    // is a real thing a browser hands back. Bare and prefixed have to agree.
    for (const mode of ['major', 'minor'] as const) {
      expect(narrow(mode, ['F']).map(keyId))
        .toEqual(narrow(mode, ['tonic:F']).map(keyId));
    }
  });

  it('keeps the tonic and gives up the mode, rather than giving up the tonic', () => {
    /*
      The case where the two settings cannot both be satisfied, which is
      the accidental limit rather than anything about tonics: within four
      accidentals A♭, E♭ and B♭ are major-only and B, F♯ and C♯ are
      minor-only, and the chips are the union of the two.

      It gives the tonic. The mode carries a default and the tonic list
      does not, so the tonic is the more specific and more recent choice.

      This used to hand back the whole pool — ticking one tonic gave you
      *every* key, which is not a weaker version of what was asked but the
      opposite of it, and ADR 0017 already decided a setting excludes
      rather than declines to act. Caught in review rather than by this
      file, which had pinned the old behaviour as merely surprising.

      Asserted through A♭ and B rather than D♯. D♯ was the first example
      written here and it tested the wrong branch under this name: D♯
      minor is six sharps, so D♯ is in neither pool, and the call fell
      through to the *unrecognised tonic* path instead. The asymmetry is
      asserted first below, so this cannot quietly stop testing what it is
      named for.
    */
    const tonicsOf = (mode: Mode) => poolFor(mode).map((k) => pitchName(k.tonic, false));
    // Within four accidentals the two modes do not offer the same tonics:
    // A♭, E♭ and B♭ are major-only, B, F♯ and C♯ are minor-only. The chips
    // are the union of the two, so either kind is one click away.
    expect(tonicsOf('minor')).not.toContain('Ab');
    expect(tonicsOf('major')).not.toContain('B');

    expect(narrow('minor', ['tonic:Ab']).map(keyId)).toEqual(['Ab_major']);
    expect(narrow('major', ['tonic:B']).map(keyId)).toEqual(['B_minor']);

    // And a tonic that the mode *can* build on still wins outright: the
    // relaxation is for an empty result, never for a partial one.
    expect(narrow('minor', ['tonic:Ab', 'tonic:F']).map(keyId)).toEqual(['F_minor']);
  });

  it('falls back to the mode for a tonic that is not a tonic at all', () => {
    // Unreachable from the panel and reachable from a hand-edited blob.
    expect(narrow('major', ['tonic:H'])).toEqual(poolFor('major'));
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
