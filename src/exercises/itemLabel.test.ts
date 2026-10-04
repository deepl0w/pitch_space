import { describe, expect, it } from 'vitest';
import { itemLabel } from './itemLabel';
import { EXERCISE_TYPES } from './registry';
import type { ItemId } from './types';

/**
 * The readout under "How this has gone" is the one place the app tells a
 * learner what they know, and it was printing the storage key: `interval:m3:up`,
 * `progression:major:ii`, `signature:-3`.
 *
 * The claim worth testing is not that any particular item reads a particular
 * way — the wording is a judgement and will be revised — but that **no item
 * the app can generate reaches the user as its id**. That stays true as item
 * kinds are added, which a list of examples would not.
 */

/**
 * Every item id the shipped exercises can actually produce.
 *
 * `widen` is false for the measurement below that has to know what the
 * defaults alone reach; everything else wants the whole ground.
 */
function everyItem(widen = true): ItemId[] {
  const items = new Set<ItemId>();
  for (const type of EXERCISE_TYPES) {
    const { defaults } = type.settings;
    /*
      Across the settings that change which items are drawn, not only the
      defaults: a kind only reachable at the widest setting, or with a
      cadence asked for, is still a kind a user sees.

      One object carrying every exercise's widening field, because each
      exercise's `generate` reads the fields it declares and ignores the
      rest. This used to spread `difficulty: 1` and `difficulty: 5`, which
      was one shared ordinal every exercise read; when that field was
      removed the three variants silently became three copies of
      `defaults` and this sweep went on passing over a third of the
      ground. Naming the fields is what stops that happening again — a
      field that disappears takes its line with it rather than becoming an
      ignored key.
    */
    const NARROWEST = { maxAccidentals: 0, window: 6, grade: 1 };
    const WIDEST = {
      maxAccidentals: 7, window: 24, grade: 10,
      modes: ['major', 'minor'], varyCadence: true, appliedDominants: true,
      degrees: [1, 2, 3, 4, 5, 6, 7], directions: ['up', 'down'],
    };
    const variants = widen
      ? [defaults, { ...defaults, ...NARROWEST }, { ...defaults, ...WIDEST }]
      : [defaults];
    for (const settings of variants) {
      for (let seed = 0; seed < 150; seed += 1) {
        for (const item of type.generate({ seed, settings }).items) items.add(item);
      }
    }
  }
  return [...items];
}

describe('naming an item for the user', () => {
  it('sweeps well past what the default settings reach', () => {
    /*
      The guard the guard needed.

      The sweep widens each exercise past its defaults so that items only
      a configured user sees — a minor degree, a descending interval, a
      key with seven flats — are labelled too. It used to widen by
      spreading a shared `difficulty` ordinal, and when that field was
      removed the three variants became three copies of `defaults`. Every
      case below went on passing, over a third of the ground, because the
      only thing checking the widening was that it produced every *kind*
      of item — and the defaults alone already do that.

      So the kinds guard cannot be the guard. This is: the widened sweep
      must reach substantially more ids than the defaults, and 'twice' is
      a floor well under the 37-to-106 it actually reaches, chosen so
      tuning a default does not move it but a collapse does.
    */
    const narrow = everyItem(false);
    const wide = everyItem(true);
    expect(narrow.length).toBeGreaterThan(0);
    expect(wide.length).toBeGreaterThan(narrow.length * 2);
  });

  it('finds every kind of item the shipped exercises produce', () => {
    // Guards the sweep below: if generation stops producing one of these the
    // coverage quietly shrinks and the real test passes vacuously.
    const kinds = new Set(everyItem().map((item) => item.split(':')[0]));
    expect([...kinds].sort())
      .toEqual([
        'cadence', 'chord', 'degree', 'interval', 'key', 'progression', 'scale', 'signature',
      ]);
  });

  it('never shows a storage key to the user', () => {
    const raw = everyItem().filter((item) => itemLabel(item) === item);
    expect(raw).toEqual([]);
  });

  it('says every item in words rather than punctuation', () => {
    for (const item of everyItem()) {
      // A label that kept the colons would be the slug with extra steps.
      expect(itemLabel(item)).not.toContain(':');
      expect(itemLabel(item).trim()).not.toBe('');
    }
  });

  it('names an interval as the button that answers it names it, with its direction', () => {
    expect(itemLabel('interval:m3:up')).toBe('Minor 3rd, ascending');
    expect(itemLabel('interval:P5:down')).toBe('Perfect 5th, descending');
    // Stored without a direction, because up and down are the same sound.
    expect(itemLabel('interval:unison')).toBe('Unison');
  });

  it('names a key and a signature the way the feedback does', () => {
    expect(itemLabel('key:Eb_major')).toBe('Eb major');
    expect(itemLabel('key:F#_minor')).toBe('F# minor');
    expect(itemLabel('signature:0')).toBe('No sharps or flats');
    expect(itemLabel('signature:1')).toBe('1 sharp');
    expect(itemLabel('signature:-3')).toBe('3 flats');
  });

  it('names a degree, a chord in a progression and a cadence', () => {
    expect(itemLabel('degree:3:major')).toBe('Degree 3 in major');
    expect(itemLabel('progression:minor:iv')).toBe('iv in minor');
    expect(itemLabel('cadence:PAC')).toBe('perfect authentic cadence');
  });

  it('shows an id it does not recognise rather than losing the row', () => {
    // An item kind from a later release is still in this user's history.
    // `chord:m7b5` stood here until the chord exercise shipped and made it
    // a real id, which is the hazard with using a *planned* kind as the
    // unknown example — these are kinds nothing is ever going to claim.
    expect(itemLabel('tablature:fret-7')).toBe('tablature:fret-7');
    expect(itemLabel('chord:not-a-chord')).toBe('chord:not-a-chord');
    expect(itemLabel('scale:not-a-scale')).toBe('scale:not-a-scale');
    expect(itemLabel('interval:not-an-interval:up')).toBe('interval:not-an-interval:up');
    expect(itemLabel('key:H_major')).toBe('key:H_major');
    expect(itemLabel('signature:many')).toBe('signature:many');
  });
});
