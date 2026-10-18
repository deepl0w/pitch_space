import { describe, expect, it } from 'vitest';
import { referenceFor } from './reference';
import { REFERENCE_MENU } from './menu';
import { EXERCISE_TYPES } from '../exercises/registry';
import { widestSettings } from '../testing/settingsSpace';
import type { ItemId } from '../exercises/types';

/**
 * Every item an exercise can grade, from the exercises' own code at their
 * widest settings — not a list typed here, which could share a guess with
 * the map it is checking. The song table's tritone was keyed under a slug
 * no exercise writes, and nothing said so; this is the same check for the
 * other table keyed on item ids.
 */
function askable(): ItemId[] {
  const ids = new Set<ItemId>();
  for (const type of EXERCISE_TYPES) {
    for (const item of type.items(widestSettings(type))) ids.add(item);
  }
  return [...ids];
}

describe('the way from an answer to the reference', () => {
  it('reaches enough items to mean something', () => {
    // Every interval, scale and chord type alone is well over a hundred; a
    // walk that came back with a handful would pass the case below by
    // checking almost nothing.
    expect(askable().length).toBeGreaterThan(100);
  });

  it('has a page for everything an exercise can ask', () => {
    /*
      An item with no page shows no button, which is honest and is also
      exactly how a gap would hide: nothing on screen is broken, the
      button is simply never there. So the gap is a failing case rather
      than a silence. None is excused today; one that should be has to be
      argued for here, by name.
    */
    const bare = askable().filter((item) => referenceFor(item) === null);
    expect(bare, 'an item a learner can answer with no page to look it up on').toEqual([]);
  });

  it('only sends a learner to a page the reference has', () => {
    const routes = new Set(REFERENCE_MENU.map((entry) => entry.route));
    const nowhere = askable()
      .map((item) => ({ item, route: referenceFor(item)?.route }))
      .filter(({ route }) => route !== undefined && !routes.has(route));
    expect(nowhere).toEqual([]);
  });

  it('opens the page on the thing asked, not on its default', () => {
    expect(referenceFor('interval:m6:down')).toEqual({ route: 'intervals', focus: 'm6:down' });
    expect(referenceFor('interval:unison')).toEqual({ route: 'intervals', focus: 'unison' });
    expect(referenceFor('scale:harmonic_minor')).toEqual({ route: 'scales', focus: 'harmonic_minor' });
    expect(referenceFor('chord:dom7:inv2')).toEqual({ route: 'chords', focus: 'dom7:inv2' });
    expect(referenceFor('key:Eb_major')).toEqual({ route: 'circle', focus: 'Eb_major' });
    // A signature names no mode; the major key that carries it is on the
    // circle beside its relative minor, so either would be one glance away.
    expect(referenceFor('signature:-3')).toEqual({ route: 'circle', focus: 'Eb_major' });
    expect(referenceFor('degree:5:minor')).toEqual({ route: 'scales', focus: 'natural_minor' });
    expect(referenceFor('progression:minor:iv')).toEqual({ route: 'key-chords', focus: 'A_minor' });
  });

  it('opens on the key the question was asked in, when the caller has it', () => {
    expect(referenceFor('progression:minor:iv', 'F#_minor'))
      .toEqual({ route: 'key-chords', focus: 'F#_minor' });
    expect(referenceFor('degree:5:major', 'Ab_major'))
      .toEqual({ route: 'scales', focus: 'major', tonic: 'Ab' });
    // A key that is not one, or is in the other mode, is no better than
    // none: the plainest key of the item's own mode, as without it.
    expect(referenceFor('progression:major:V', 'A_minor'))
      .toEqual({ route: 'key-chords', focus: 'C_major' });
    expect(referenceFor('degree:5:major', 'H_major')).toEqual({ route: 'scales', focus: 'major' });
  });

  it('is handed a key every exercise asked in one actually used', () => {
    /*
      The second argument is only as good as the exercises filling it: an
      exercise that asked in A♭ and left `keyId` off, or wrote one in the
      other mode, sends the learner to C major with nothing on screen to
      say so. Asked of what the generators produce, not of a fixture.
    */
    let checked = 0;
    for (const type of EXERCISE_TYPES) {
      const settings = widestSettings(type);
      for (let seed = 1; seed <= 40; seed += 1) {
        const exercise = type.generate({ seed, settings });
        for (const item of exercise.items) {
          if (!/^(progression|degree):/.test(item)) continue;
          const target = referenceFor(item, exercise.keyId);
          const opened = target?.route === 'key-chords' ? target.focus
            : target?.tonic === undefined ? undefined
              : `${target.tonic}_${item.split(':')[2]}`;
          expect(opened, `${type.id} seed ${seed}: ${item}`).toBe(exercise.keyId);
          checked += 1;
        }
      }
    }
    expect(checked, 'no exercise asked in a key, so this checked nothing').toBeGreaterThan(40);
  });

  it('offers nothing for an id it does not recognise, rather than a page about something else', () => {
    // History outlives the code that wrote it (ADR 0007), so an id from a
    // later or earlier release is a real input here.
    for (const item of [
      'interval:TT:up', 'interval:m3:sideways', 'scale:nonesuch', 'chord:nonesuch',
      'key:H_major', 'signature:9', 'degree:5:dorian', 'progression:lydian:I',
      'cell:nonesuch', 'cadence:PAC', 'nonesuch',
    ] as ItemId[]) {
      expect(referenceFor(item), item).toBeNull();
    }
  });
});
