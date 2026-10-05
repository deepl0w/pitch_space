import type { Rng } from '../theory/rng';
import { makeRng, pick, rngInt } from '../theory/rng';
import type { TimeSignature } from '../theory/meter';
import { barFromCells, generateRhythm, type RhythmBar, type RhythmOptions } from './rhythm';

/**
 * Motivic development, which is the difference between a legal line and a
 * line worth reading.
 *
 * The melody search already refuses what is wrong: a non-chord tone that
 * cannot be classified, a leap it does not recover from, a strong beat that
 * is not a chord tone. None of that makes a tune. **Its failure mode is
 * blandness rather than illegality**, and the plan said so before the
 * generator existed: a legal-but-characterless line is what you get from
 * constraints alone, because real melodies are mostly one short idea said
 * again.
 *
 * So the bar is not the unit. A **motif** is — a rhythm and a shape, stated,
 * repeated, varied, and answered — and the bars are filled from it rather
 * than each being a fresh draw. Two bars generated independently are two
 * bars; the same bar twice is a phrase.
 *
 * What this module decides, and what it deliberately does not:
 *
 * - It decides **the form** (which bar restates which) and **the rhythm**
 *   of each motif, and it emits a **shape** — a preferred melodic interval
 *   for each onset.
 * - It does not choose a single pitch. The shape is a *preference* the
 *   melody search weighs against harmony, range and its own constraints,
 *   and the search overrules it whenever a hard constraint says so. A motif
 *   that forced pitches would break the chord-tone rule on the first
 *   transposed restatement, which is exactly the thing that makes a
 *   repetition sound like a repetition rather than a mistake.
 */

/** A stated idea: how it moves in time, and how it moves in pitch. */
export interface Motif {
  /** `A`, `B`, … The label a form string refers to. */
  id: string;
  /** The cells its bar is built from, so a restatement is the same rhythm. */
  cellIds: readonly string[];
  /**
   * Preferred interval from the previous note, in semitones, one per onset.
   *
   * The first is null: a motif says how it *moves*, and where it starts is
   * the harmony's business. That is also what lets the same motif be
   * restated a third higher without being a different motif.
   */
  contour: readonly (number | null)[];
}

export interface MotifPlan {
  /** One motif label per bar, in order. */
  form: readonly string[];
  motifs: Readonly<Record<string, Motif>>;
  /** The bars themselves, tiled from the motifs and re-stamped in time. */
  bars: readonly RhythmBar[];
  /**
   * The preferred interval for every onset in the piece, in order, lined up
   * with the melody's slots. Null where the motif has nothing to say.
   */
  shape: readonly (number | null)[];
}

export interface MotifOptions extends RhythmOptions {
  /**
   * How many distinct ideas. Two is a period's worth — one stated and
   * answered, one that departs — and more than three in eight bars is a
   * medley rather than a phrase.
   */
  ideas?: number;
}

/**
 * Steps a motif is built from, in semitones.
 *
 * Steps and thirds, with one fourth. Weighted towards conjunct motion
 * because that is what a singable idea is made of, and the melody search
 * will punish a leap it cannot recover from anyway — but the shape should
 * not be the thing proposing them.
 */
const STEPS: readonly number[] = [-5, -4, -3, -2, -2, -1, -1, 1, 1, 2, 2, 3, 4, 5];

/**
 * The forms, by bar count.
 *
 * `'` marks a variation: same rhythm, altered shape. A letter alone is a
 * literal restatement. These are the shapes `planPhrases` already thinks
 * in — an antecedent that asks and a consequent that answers — written at
 * the bar rather than the phrase, so the two agree about where a
 * restatement falls.
 */
const FORMS: Readonly<Record<number, readonly string[]>> = {
  2: ['A', "A'"],
  4: ['A', "A'", 'B', "A''"],
  6: ['A', "A'", 'B', "A''", "B'", "A'''"],
  8: ['A', "A'", 'B', "A''", 'A', "A'", "B'", "A'''"],
};

/** The label without its variation marks: `A''` is a variation of `A`. */
export function baseOf(label: string): string {
  return label.replace(/'+$/, '');
}

/** How many marks, so a later restatement can vary further than an earlier one. */
function degreeOf(label: string): number {
  return label.length - baseOf(label).length;
}

/**
 * A form for this many bars.
 *
 * Falls back to alternating statement and variation rather than throwing,
 * because a bar count is a user setting and an unlisted one should cost the
 * shape rather than the exercise.
 */
export function formFor(bars: number): readonly string[] {
  const listed = FORMS[bars];
  if (listed) return listed;
  return Array.from({ length: bars }, (_, i) => (i % 2 === 0 ? 'A' : "A'"));
}

/**
 * Vary a contour without making it a different idea.
 *
 * The tail changes and the head does not, which is what makes a variation
 * recognisable: a listener identifies an idea by how it starts. The first
 * degree alters the last interval, the second alters the last two, and so
 * on — so `A'''` has drifted further from `A` than `A'` has, which is the
 * direction a phrase travels.
 */
function vary(rng: Rng, contour: readonly (number | null)[], degree: number): (number | null)[] {
  if (degree === 0) return [...contour];
  const out = [...contour];
  const from = Math.max(1, out.length - degree);
  for (let i = from; i < out.length; i += 1) {
    out[i] = pick(rng, STEPS);
  }
  return out;
}

/**
 * Plan the piece as motifs, and lay the bars out from them.
 *
 * Deterministic given the rng, like everything else here. The rhythm and
 * the contour draw from separate derived streams so that changing one
 * cannot silently re-roll the other — the same reasoning `deriveRng`
 * exists for.
 */
export function planMotifs(rng: Rng, options: MotifOptions): MotifPlan {
  const ts: TimeSignature = options.timeSignature;
  const form = formFor(options.bars);
  /*
    Deduplicated by scan rather than through a Set. The order of these
    decides which ideas get generated when `ideas` asks for fewer than the
    form names, so it is a musical choice — and ADR 0002 bars a Set from
    making one. Insertion order happens to be what a Set would give; the
    rule is that the code should not have to know that.
  */
  const labels = form.map(baseOf).filter((label, i, all) => all.indexOf(label) === i);
  const wanted = Math.max(1, Math.min(options.ideas ?? labels.length, labels.length));
  const used = labels.slice(0, wanted);

  /*
    Two streams off the parent, so adding a draw to one cannot silently
    re-roll the other. Seeded from the parent rather than from a constant,
    which keeps the whole thing reproducible from the caller's seed while
    letting rhythm and contour vary independently of each other's length.
  */
  const rhythmRng = makeRng(rngInt(rng, 1, 2_147_483_646));
  const contourRng = makeRng(rngInt(rng, 1, 2_147_483_646));

  // One bar of rhythm per idea, generated by the ordinary machinery so a
  // motif cannot contain a figure the rhythm generator would refuse.
  const motifs: Record<string, Motif> = {};
  for (const id of used) {
    const [bar] = generateRhythm(rhythmRng, { ...options, bars: 1 });
    const onsets = bar.events.filter((e) => !e.isRest && !e.tiedFromPrevious).length;
    motifs[id] = {
      id,
      cellIds: bar.cellIds,
      contour: Array.from({ length: onsets }, (_, i) => (i === 0 ? null : pick(contourRng, STEPS))),
    };
  }

  // Tile. Each bar is regenerated from its motif's cells rather than copied,
  // because an event carries an absolute tick and a tuplet id, and a copied
  // bar would carry the first bar's.
  const bars: RhythmBar[] = [];
  const shape: (number | null)[] = [];
  for (const [index, label] of form.entries()) {
    const motif = motifs[baseOf(label)] ?? motifs[used[0]];
    const laid = barFromCells(motif.cellIds, ts, index);
    bars.push(laid);
    const contour = vary(contourRng, motif.contour, degreeOf(label));
    const onsets = laid.events.filter((e) => !e.isRest && !e.tiedFromPrevious).length;
    for (let i = 0; i < onsets; i += 1) {
      // A bar joins the one before it, so the first onset of a restatement
      // is a step from the previous bar rather than a fresh start.
      shape.push(i === 0 && index > 0 ? null : (contour[i] ?? null));
    }
  }

  return { form, motifs, bars, shape };
}

