import { describe, expect, it } from 'vitest';
import {
  CHORD_DEFAULTS, chordItemId, chordItems, chordScoreSpec, chordVoicesFor,
  coerceChordSettings, generateChord, gradeChord, inversionsOf, type ChordSettings,
} from './chords';
import { CHORD_TYPES, chordType, identifyChord } from '../../theory/chord';
import { midiOf } from '../../theory/pitch';

/**
 * What this exercise owes beyond the registry contract.
 *
 * Two claims carry it. The chord that sounds is the chord the buttons can
 * name — checked against `identifyChord`, the theory layer's own reader,
 * rather than against a restatement of how the chord was built. And the
 * bass question is a *separate* question: a listener who names the quality
 * and misses the bass has done most of it, and the exercise has to say so
 * rather than mark the whole thing wrong in silence.
 */

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const ALL = CHORD_TYPES.map((t) => t.id);

function settings(over: Partial<ChordSettings> = {}): ChordSettings {
  return { ...CHORD_DEFAULTS, ...over };
}

/**
 * Whether the chord maps onto itself under transposition.
 *
 * True of the diminished seventh (every three semitones) and the
 * augmented triad (every four), which is why neither has one root that a
 * reader could prefer.
 */
function isSymmetric(type: { semitones: readonly number[] }): boolean {
  const pcs = new Set(type.semitones.map((s) => ((s % 12) + 12) % 12));
  for (let shift = 1; shift < 12; shift += 1) {
    const moved = new Set([...pcs].map((p) => (p + shift) % 12));
    if (moved.size === pcs.size && [...moved].every((p) => pcs.has(p))) return true;
  }
  return false;
}

describe('the chord a question is built from', () => {
  it('sounds as the quality it claims, read back by the theory layer', () => {
    /*
      Cross-validated rather than restated. Building the pitches and then
      asserting they are the pitches you built proves nothing; handing
      them to `identifyChord` asks a reader that knows nothing about how
      they were made whether it agrees.

      Second or better, not first, because a voicing genuinely can be
      ambiguous — an inverted minor seventh and a major sixth are the
      same four notes, and insisting on first place would be asserting a
      tie-break nobody decided.

      Except where the chord is *symmetric*, and that exception is
      derived rather than listed. A diminished seventh maps onto itself
      every three semitones, so its four inversions are four diminished
      sevenths on four different roots and all four readings are equally
      true; the augmented triad does the same every four. For those the
      only honest claim is that the intended reading is in the list at
      all — ranking it would be asserting a preference the music does
      not have. Deriving the predicate rather than naming `dim7` and
      `aug` means a symmetric chord added later is covered by the reason
      instead of failing on the list.
    */
    for (const seed of SEEDS) {
      const e = generateChord({ seed, settings: settings({ types: ALL, inversions: true }) });
      const readings = identifyChord(e.pitches);
      const where = readings.findIndex(
        (r) => r.type.id === e.typeId && r.rootPc === ((midiOf(e.root) % 12) + 12) % 12,
      );
      expect(where, `${e.typeId} on ${midiOf(e.root)} is not read back at all`)
        .toBeGreaterThanOrEqual(0);
      if (!isSymmetric(chordType(e.typeId))) {
        expect(where, `${e.typeId} read back only in position ${where}`).toBeLessThan(2);
      }
    }
  });

  it('has symmetric chords in the catalogue, or the exception above is idle', () => {
    // The guard on the carve-out: if nothing were symmetric, the branch
    // would never be taken and the looser claim would be dead code
    // pretending to be a decision.
    const symmetric = CHORD_TYPES.filter(isSymmetric).map((t) => t.id);
    expect(symmetric).toContain('dim7');
    expect(symmetric).toContain('aug');
    expect(CHORD_TYPES.filter((t) => !isSymmetric(t)).length).toBeGreaterThan(15);
  });

  it('puts the tone the inversion names in the bass', () => {
    // The whole content of the bass question. Asserted against the
    // chord's own tones rather than a computed interval, so a change to
    // how voicing spaces the upper notes cannot quietly move it.
    for (const seed of SEEDS.slice(0, 120)) {
      const e = generateChord({ seed, settings: settings({ types: ALL, inversions: true }) });
      const lowest = e.pitches.reduce((a, b) => (midiOf(a) <= midiOf(b) ? a : b));
      const type = chordType(e.typeId);
      const expectedPc = (((midiOf(e.root) + type.semitones[e.inversion]) % 12) + 12) % 12;
      expect(((midiOf(lowest) % 12) + 12) % 12, `${e.typeId} inv ${e.inversion}`).toBe(expectedPc);
    }
  });

  it('sounds every note it draws, together or one at a time', () => {
    for (const sounding of ['block', 'arpeggio'] as const) {
      const e = generateChord({ seed: 13, settings: settings({ types: ALL, sounding }) });
      const drawn = chordScoreSpec(e).notes.flatMap((n) => n.pitches.map(midiOf));
      const heard = chordVoicesFor(e).map((v) => v.midi);
      expect([...heard].sort((a, b) => a - b)).toEqual([...drawn].sort((a, b) => a - b));
    }
  });

  it('strikes a block chord together and an arpeggio apart', () => {
    // The difference between the two settings, and the only thing that
    // distinguishes them: a block chord with a roll is an arpeggio, and
    // the question stops being "what is this chord" and becomes "what
    // were those notes".
    const block = chordVoicesFor(generateChord({
      seed: 21, settings: settings({ types: ALL, sounding: 'block' }),
    }));
    expect(new Set(block.map((v) => v.start)).size).toBe(1);

    const arp = chordVoicesFor(generateChord({
      seed: 21, settings: settings({ types: ALL, sounding: 'arpeggio' }),
    }));
    expect(new Set(arp.map((v) => v.start)).size).toBe(arp.length);
    expect([...arp].sort((a, b) => a.start - b.start).map((v) => v.midi))
      .toEqual([...arp].sort((a, b) => a.midi - b.midi).map((v) => v.midi));
  });
});

describe('asking about the bass, or not', () => {
  it('keeps the quality and the quality-with-bass as different items', () => {
    /*
      `chord:dom7` and `chord:dom7:inv2` are different skills with
      different curves, and folding them into one id would mean a
      listener who has mastered the quality never sees the item settle.
      Root position keeps the plain id, so turning the setting on does
      not orphan the history already recorded against it.
    */
    expect(chordItemId('dom7', null)).toBe('chord:dom7');
    expect(chordItemId('dom7', 0)).toBe('chord:dom7');
    expect(chordItemId('dom7', 2)).toBe('chord:dom7:inv2');
  });

  it('asks one item per quality when the bass is not in question', () => {
    const items = chordItems(settings({ types: ['maj', 'dom7'] }));
    expect([...items].sort()).toEqual(['chord:dom7', 'chord:maj']);
  });

  it('asks one item per inversion when it is', () => {
    const items = chordItems(settings({ types: ['maj', 'dom7'], inversions: true }));
    expect([...items].sort()).toEqual([
      'chord:dom7', 'chord:dom7:inv1', 'chord:dom7:inv2', 'chord:dom7:inv3',
      'chord:maj', 'chord:maj:inv1', 'chord:maj:inv2',
    ]);
  });

  it('offers exactly the inversions the quality has', () => {
    // A triad has three and a ninth chord has five, so a fixed list of
    // buttons would offer a fourth inversion of a major triad.
    for (const type of CHORD_TYPES) {
      expect(inversionsOf(type).length, type.id).toBe(type.semitones.length);
      const e = generateChord({ seed: 5, settings: settings({ types: [type.id], inversions: true }) });
      expect(e.inversionChoices.length, type.id).toBe(type.semitones.length);
      expect(e.inversionChoices).toContain(e.inversion);
    }
  });

  it('offers no bass buttons at all when the setting is off', () => {
    const e = generateChord({ seed: 5, settings: settings({ types: ALL }) });
    expect(e.inversionChoices).toEqual([]);
    expect(e.inversion).toBe(0);
  });

  it('never asks for a bass it did not offer', () => {
    for (const seed of SEEDS.slice(0, 80)) {
      const e = generateChord({ seed, settings: settings({ types: ALL, inversions: true }) });
      expect(e.inversionChoices).toContain(e.inversion);
    }
  });
});

describe('what the answer says', () => {
  const inverted = () => {
    for (const seed of SEEDS) {
      const e = generateChord({ seed, settings: settings({ types: ['min'], inversions: true }) });
      if (e.inversion > 0) return e;
    }
    throw new Error('no inverted chord in the sweep');
  };

  it('names the bass in the symbol, not only in the words', () => {
    // "Am" for a second-inversion A minor is the answer with the
    // interesting half left out; `chordSymbol` writes "Am/E".
    const e = inverted();
    const feedback = gradeChord(e, { typeId: 'min', inversion: e.inversion }).feedback;
    expect(feedback).toContain('/');
  });

  it('says the quality was right when only the bass was missed', () => {
    const e = inverted();
    const wrongBass = e.inversionChoices.find((i) => i !== e.inversion)!;
    const r = gradeChord(e, { typeId: e.typeId, inversion: wrongBass });
    expect(r.correct).toBe(false);
    expect(r.feedback).toContain('was right');
  });

  it('does not claim the quality was right when it was not', () => {
    const e = inverted();
    const r = gradeChord(e, { typeId: 'maj', inversion: e.inversion });
    expect(r.correct).toBe(false);
    expect(r.feedback).not.toContain('was right');
  });

  it('survives a response naming an inversion the chord does not have', () => {
    // From a stored answer or a malformed one. Naming it "undefined"
    // would be worse than not naming it.
    const e = inverted();
    const r = gradeChord(e, { typeId: e.typeId, inversion: 99 });
    expect(r.feedback).not.toContain('undefined');
    expect(r.correct).toBe(false);
  });

  it('credits the item it asked about, right or wrong', () => {
    const e = generateChord({ seed: 3, settings: settings({ types: ['maj', 'min'] }) });
    for (const typeId of ['maj', 'min']) {
      const r = gradeChord(e, { typeId });
      expect(r.outcomes).toHaveLength(1);
      expect(r.outcomes[0].item).toBe(`chord:${e.typeId}`);
      expect(r.outcomes[0].correct).toBe(typeId === e.typeId);
    }
  });
});

describe('settings arriving from storage', () => {
  it('drops a quality this build has never heard of and keeps the rest', () => {
    expect(coerceChordSettings({ types: ['maj', 'bebop-thing', 'dim7'] }).types)
      .toEqual(['maj', 'dim7']);
  });

  it('falls back rather than leaving the generator with nothing to pick', () => {
    for (const stored of [{}, { types: [] }, { types: ['nope'] }, { types: 'maj' }, null, 7]) {
      const got = coerceChordSettings(stored);
      expect(got.types.length, JSON.stringify(stored)).toBeGreaterThan(0);
      expect(() => generateChord({ seed: 1, settings: got })).not.toThrow();
    }
  });

  it('keeps the catalogue order rather than the order a setting was stored in', () => {
    const backwards = coerceChordSettings({ types: [...ALL].reverse() });
    expect(backwards.types).toEqual(ALL);
  });
});
