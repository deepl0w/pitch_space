import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES } from './registry';
import { keysIn } from './types';
import type { SettingOption } from './types';
import { ALL_KEYS, type Mode, keyId } from '../theory/key';
import { pitchName } from '../theory/pitch';
import { optionIds, valuesOf, widestSettings, applyValue, type AnyField } from '../testing/settingsSpace';

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

/** A multi-select's options, which may be a function of the settings. */
function resolveOptions(
  field: { options: readonly SettingOption[] | ((s: never) => readonly SettingOption[]) },
  settings: unknown,
): readonly SettingOption[] {
  return typeof field.options === 'function'
    ? field.options(settings as never) : field.options;
}

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

  it('ignores a tonic the mode cannot build, and keeps the mode', () => {
    /*
      The case where the two settings cannot both be satisfied: within four
      accidentals A♭, E♭ and B♭ are major-only and B, F♯ and C♯ are
      minor-only.

      **The mode wins, and this is the third answer to that question**,
      which is worth recording because the first two were each a defect.
      Returning the whole unnarrowed pool meant ticking one tonic handed
      you every key — the opposite of the request. Letting the tonic win
      instead gave a mode control reading "Minor" while every question
      came out major, with nothing on screen saying so; the user role
      called that a bug rather than a surprise.

      What makes the mode the right answer now is that the panel no longer
      offers the pair: `keysField` lists only tonics the chosen modes can
      build, and drops stored ones that are no longer offered. So this
      branch is reachable only from a blob written before the mode
      changed, and it resolves the way the panel would display it — no
      tonic chosen, therefore no tonic filter.
    */
    const tonicsOf = (mode: Mode) => poolFor(mode).map((k) => pitchName(k.tonic, false));
    expect(tonicsOf('minor'), 'A♭ minor is seven flats').not.toContain('Ab');
    expect(tonicsOf('major'), 'A♭ major is four flats').toContain('Ab');
    expect(tonicsOf('major'), 'B major is five sharps').not.toContain('B');
    expect(tonicsOf('minor'), 'B minor is two sharps').toContain('B');

    expect(narrow('minor', ['tonic:Ab']).map(keyId)).toEqual(poolFor('minor').map(keyId));
    expect(narrow('major', ['tonic:B']).map(keyId)).toEqual(poolFor('major').map(keyId));

    // A tonic the mode *can* build still wins outright: the relaxation is
    // for an empty result, never for a partial one.
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
      for (const option of resolveOptions(field, type.settings.defaults).slice(0, 4)) {
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

  it('builds on what the panel shows lit, for a pair the panel cannot offer', () => {
    /*
      The other half of "the mode wins", and the half nothing asserted.

      `keysIn` resolving a stale tonic to the mode is one claim; the panel
      displaying that same resolution is another, and they live in different
      functions — `keysIn` returns a pool and `keysField.selected` returns
      chips. Each was changed on its own twice in three days, and they agree
      at the moment only because both were written to. Two independent
      fallbacks that happen to coincide are exactly what a test is for: a
      third change to either is otherwise silent, and the symptom is the one
      the user role already reported, a control showing a selection that
      nothing honours.

      The offending pair is derived rather than written down. "A♭ with minor
      only" is true today and was wrong once already in this file's history
      — a case built on D♯ asserted the asymmetry and reached the
      unrecognised-tonic branch instead, because D♯ minor is six sharps and
      is not a chip at all. So the stale ids here are whatever widening
      another control offers that this configuration does not, which stays
      correct when the pool or the accidental cap moves.
    */
    let asked = 0;
    for (const { type, field } of withTonics) {
      if (field.kind !== 'multi') continue;
      const wide = optionIds(field, widestSettings(type));
      for (const other of type.settings.fields as AnyField[]) {
        if (other.id === field.id) continue;
        for (const value of valuesOf(other, type.settings.defaults)) {
          const narrowed = type.settings.coerce(
            applyValue(other, type.settings.coerce(type.settings.defaults), value),
          );
          const offered = optionIds(field, narrowed);
          const stale = wide.filter((id) => !offered.includes(id));
          if (stale.length === 0) continue;

          // Only the stale ones chosen, so the generator has nothing it can
          // honour and has to fall back — the blob a user gets by picking
          // tonics and then changing the mode.
          const settings = type.settings.coerce(applyValue(field, narrowed, stale));
          const lit = new Set(field.selected(settings as never)
            .map((id) => id.replace(/^tonic:/, '')));
          expect([...lit].some((t) => stale.includes(`tonic:${t}`)),
            `${type.id}.${field.id} lights a chip it does not offer`).toBe(false);

          const built = new Set<string>();
          for (let seed = 0; seed < 240; seed += 1) {
            const exercise = type.generate({ seed, settings }) as {
              keyId?: string; root?: { } };
            if (typeof exercise.keyId === 'string') built.add(exercise.keyId.split('_')[0]);
            else if (exercise.root) built.add(pitchName(exercise.root as never, false));
          }
          expect([...built].sort(),
            `${type.id} with only ${stale.join(' ')} chosen under ${other.id}=${JSON.stringify(value)}`)
            .toEqual([...lit].sort());
          asked += 1;
        }
      }
    }
    expect(asked, 'no control narrows the tonics, so nothing above was tested')
      .toBeGreaterThan(0);
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
