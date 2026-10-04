import { describe, expect, it } from 'vitest';
import { TONICS, signatureKey, tonicOptions } from './options';
import { SCALE_TYPES, spellScale } from '../../theory/scale';
import { keyScaleType } from '../../theory/key';
import { pitchName } from '../../theory/pitch';

/**
 * What the reference screens may claim about a key signature.
 *
 * The Scales screen used to pick a *key* and a scale separately and draw the
 * key's signature over the scale's notes. Choosing A♭ minor with the major
 * scale engraved seven flats and then three naturals cancelling them, which
 * is not how anyone writes A♭ major — and the picker offered A♭ twice, once
 * as each mode, where the two produced identical notes.
 *
 * So the rule is that a signature is drawn only when it is the signature of
 * the thing on the stave, and `undefined` is a real answer: most scales have
 * none. `Chords` already drew its staves that way.
 */

const scaleIds = SCALE_TYPES.map((s) => s.id);

describe('the tonics a scale can be built on', () => {
  it('lists each spelling once', () => {
    const names = TONICS.map((t) => pitchName(t, false));
    expect(names).toHaveLength(new Set(names).size);
  });

  it('is shorter than the key list it replaced, which is the point', () => {
    // Thirty keys, eighteen tonics: twelve of them appeared twice, and under
    // a separately-chosen scale the duplicate pair drew the same notes.
    expect(TONICS.length).toBeLessThan(30);
    expect(TONICS.length).toBeGreaterThan(11);
  });
});

describe('the signature a scale is written in', () => {
  it('is only ever the one the notes are actually in', () => {
    // The whole claim, over every tonic and every scale type. Where a key is
    // offered, the scale it spells must be that key's own scale — note for
    // note, spelling included. Anything else is a signature the notes then
    // have to argue with.
    for (const tonic of TONICS) {
      for (const id of scaleIds) {
        const key = signatureKey(tonic, id);
        if (key === undefined) continue;

        const type = SCALE_TYPES.find((s) => s.id === id)!;
        const shown = spellScale({ ...tonic, octave: 4 }, type).map((p) => pitchName(p, false));
        const implied = spellScale({ ...key.tonic, octave: 4 }, keyScaleType(key))
          .map((p) => pitchName(p, false));

        expect(shown).toEqual(implied);
      }
    }
  });

  it('is offered for the two scales that have one, and withheld for the rest', () => {
    // From a tonic that has a key in both modes — C♭ has only a major one,
    // and asking there would measure the tonic rather than the scale.
    const c = TONICS.find((t) => pitchName(t, false) === 'C')!;
    const withSignature = scaleIds.filter((id) => signatureKey(c, id) !== undefined);

    // Named rather than counted, so adding a scale type that genuinely has a
    // signature is a deliberate edit here rather than a silent change.
    expect(withSignature).toEqual(['major', 'natural_minor']);
  });

  it('withholds one where the tonic has no key in that mode', () => {
    // C♭ major exists; C♭ minor does not. The lookup must come back empty
    // rather than fall through to some other key with the same name.
    const cFlat = TONICS.find((t) => pitchName(t, false) === 'Cb');
    expect(cFlat).toBeDefined();
    expect(signatureKey(cFlat!, 'major')).toBeDefined();
    expect(signatureKey(cFlat!, 'natural_minor')).toBeUndefined();
  });
});

describe('the tonic picker labels', () => {
  it('quotes the signature this scale actually gives, not a fixed one', () => {
    // The same tonic reads differently under a different scale, because it
    // is. A label that did not move with the scale is how the old picker
    // came to say "7 flats" over a stave with four.
    const under = (scaleId: string) =>
      tonicOptions(scaleId).find((o) => o.value === 'Ab')!.label;

    expect(under('major')).toBe('Ab (4 flats)');
    expect(under('natural_minor')).toBe('Ab (7 flats)');
    expect(under('blues')).toBe('Ab');
  });

  it('offers one entry per tonic, whatever the scale', () => {
    for (const id of scaleIds) {
      const values = tonicOptions(id).map((o) => o.value);
      expect(values).toHaveLength(TONICS.length);
      expect(new Set(values).size).toBe(TONICS.length);
    }
  });
});
