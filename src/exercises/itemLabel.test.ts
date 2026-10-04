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

/** Every item id the shipped exercises can actually produce. */
function everyItem(): ItemId[] {
  const items = new Set<ItemId>();
  for (const type of EXERCISE_TYPES) {
    const { defaults } = type.settings;
    // Across the settings that change which items are drawn, not only the
    // defaults: a kind only reachable at difficulty 5, or with a cadence
    // asked for, is still a kind a user sees.
    const variants = [
      defaults,
      { ...defaults, difficulty: 1 },
      { ...defaults, difficulty: 5 },
      { ...defaults, difficulty: 5, modes: ['major', 'minor'], varyCadence: true,
        appliedDominants: true, degrees: [1, 2, 3, 4, 5, 6, 7] },
    ];
    for (const settings of variants) {
      for (let seed = 0; seed < 150; seed += 1) {
        for (const item of type.generate({ seed, settings }).items) items.add(item);
      }
    }
  }
  return [...items];
}

describe('naming an item for the user', () => {
  it('finds every kind of item the shipped exercises produce', () => {
    // Guards the sweep below: if generation stops producing one of these the
    // coverage quietly shrinks and the real test passes vacuously.
    const kinds = new Set(everyItem().map((item) => item.split(':')[0]));
    expect([...kinds].sort())
      .toEqual(['cadence', 'degree', 'interval', 'key', 'progression', 'signature']);
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
    expect(itemLabel('chord:m7b5')).toBe('chord:m7b5');
    expect(itemLabel('interval:not-an-interval:up')).toBe('interval:not-an-interval:up');
    expect(itemLabel('key:H_major')).toBe('key:H_major');
    expect(itemLabel('signature:many')).toBe('signature:many');
  });
});
