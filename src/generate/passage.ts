import type { Rng } from '../theory/rng';
import { makeRng, rngInt } from '../theory/rng';
import type { Key } from '../theory/key';
import type { TimeSignature } from '../theory/meter';
import { generateHarmony, type Harmony, type HarmonyOptions } from './harmony';
import { planMotifs, type MotifOptions, type MotifPlan } from './motif';
import { generateMelody, type MelodyNote, type MelodySlot } from './melody';
import type { RhythmBar } from './rhythm';

/**
 * A whole piece of generated music: harmony, rhythm and a line over them.
 *
 * The three layers each worked and **nothing joined two of them**. The
 * only place they had ever met was a path built by hand inside a test,
 * which is how an interface comes to be right by accident — the test
 * knows what it meant, so it supplies what it meant, and the seam never
 * has to say anything.
 *
 * The order is not negotiable and is the argument for this file existing.
 * Harmony is planned before a chord exists, because a phrase shape cannot
 * fall out of chord choices made one at a time. The rhythm comes from
 * motifs rather than bar by bar, because a phrase is one idea restated
 * and four independent bars are four bars. The melody comes last, because
 * it is the only layer that can be told what the other two decided —
 * which chord is sounding, and what shape the idea had the first time.
 *
 * It decides nothing an exercise should decide. There is no difficulty
 * here, no presentation and no grading: an exercise says what music it
 * wants and this says what the music is.
 */

export interface Passage {
  key: Key;
  timeSignature: TimeSignature;
  harmony: Harmony;
  /** The form, the ideas, and which bar restates which. */
  motifs: MotifPlan;
  /** Bars of rhythm, tiled from the motifs. */
  bars: readonly RhythmBar[];
  /** One note per written attack, in time order. */
  melody: readonly MelodyNote[];
}

export interface PassageOptions {
  key: Key;
  timeSignature: TimeSignature;
  bars: number;
  /** Inclusive MIDI bounds the line stays inside. */
  range: readonly [number, number];
  /** Passed through; everything optional there stays optional here. */
  harmony?: Omit<HarmonyOptions, 'key' | 'timeSignature' | 'bars'>;
  rhythm?: Omit<MotifOptions, 'timeSignature' | 'bars'>;
}

/**
 * Split the caller's stream into one per layer.
 *
 * Separate and exported so the constraint above is checkable from
 * outside: a test pins the three seeds this returns for a known parent
 * seed, and a draw inserted anywhere before it moves all three. Without
 * that the rule lives only in the comment, which is the shape of guard
 * this project has twice found could not fail.
 */
export function deriveStreams(rng: Rng): {
  harmonyRng: Rng;
  motifRng: Rng;
  melodyRng: Rng;
} {
  return {
    harmonyRng: makeRng(rngInt(rng, 1, 2_147_483_646)),
    motifRng: makeRng(rngInt(rng, 1, 2_147_483_646)),
    melodyRng: makeRng(rngInt(rng, 1, 2_147_483_646)),
  };
}

/**
 * Generate one, deterministically.
 *
 * Each layer draws from its own stream, seeded from the caller's. Without
 * that, adding a draw in harmony silently re-rolls every rhythm in the
 * app — the hazard `deriveRng` was invented for in the original plan and
 * which this does by hand, there being no such helper.
 *
 * **The three derivations are the first three statements, and nothing may
 * draw from `rng` before them.** A draw inserted above — an option that
 * wants a number, a shuffle, anything — shifts all three derived seeds at
 * once and replaces every passage the app has ever produced from every
 * seed. That is the one break no determinism guard here catches: the
 * import test looks for `Math.random`, clock reads and `Set` iteration,
 * and the seed tests check that a seed reproduces within a run and that
 * the layers vary with it. All of those stay green while the mapping from
 * seed to music is swapped wholesale, which breaks 0002's promise — an
 * exercise reported by its seed stops reproducing — without touching its
 * letter. Draw inside a layer's own stream instead; that is what they are
 * for.
 */
export function generatePassage(rng: Rng, options: PassageOptions): Passage {
  const { harmonyRng, motifRng, melodyRng } = deriveStreams(rng);

  const harmony = generateHarmony(harmonyRng, {
    ...options.harmony,
    key: options.key,
    timeSignature: options.timeSignature,
    bars: options.bars,
  });

  const motifs = planMotifs(motifRng, {
    ...options.rhythm,
    timeSignature: options.timeSignature,
    bars: options.bars,
  });

  const melody = generateMelody(melodyRng, {
    harmony,
    slots: slotsOf(motifs.bars),
    range: options.range,
    shape: motifs.shape,
  });

  return {
    key: options.key,
    timeSignature: options.timeSignature,
    harmony,
    motifs,
    bars: motifs.bars,
    melody,
  };
}

/**
 * The attacks a melody has to fill.
 *
 * A rest is not a slot and neither is a note tied from the one before it:
 * both are written events and neither is a new sound, so a line with a
 * note for each would have more notes than the rhythm has attacks. That
 * is the off-by-one this join exists to get right in one place rather
 * than in each caller.
 *
 * Takes the bars rather than the whole plan because that is all it reads,
 * and a test with bars and no form should not have to invent a form to
 * ask what the attacks are.
 */
export function slotsOf(bars: readonly RhythmBar[]): MelodySlot[] {
  return bars
    .flatMap((bar) => bar.events)
    .filter((event) => !event.isRest && !event.tiedFromPrevious)
    .map((event) => ({ startTick: event.startTick, durationTicks: event.durationTicks }));
}
