import { TICKS_PER_QUARTER, timeSignature } from '../theory/meter';

/**
 * Named whole-bar rhythms that exist in the world.
 *
 * The cell library in `cells.ts` is the stock a bar is *built* from — beat by
 * beat, a figure at a time. This is the other half of the reference: complete
 * bars that players already know by name, in the metre they belong to. A
 * learner meeting 6/8 wants to see a tarantella and a jig, not only the three
 * ways a dotted quarter can be divided.
 *
 * Every one of these is a pattern that is actually used, which is the whole
 * point — a reference full of inventions would teach nothing.
 */

const Q = TICKS_PER_QUARTER;
const E = Q / 2;
const S = Q / 4;

export interface RhythmPattern {
  id: string;
  name: string;
  /** Where it is from, so the reference can say rather than merely show. */
  origin: string;
  /** The time signature id it belongs in. */
  meter: string;
  /** Durations in ticks, in order. Negative means a rest of that length. */
  durations: readonly number[];
}

function pattern(
  id: string, name: string, origin: string, meter: string, durations: number[],
): RhythmPattern {
  const want = timeSignature(meter).barTicks;
  const got = durations.reduce((sum, d) => sum + Math.abs(d), 0);
  if (got !== want) throw new Error(`pattern ${id}: ${got} ticks in a ${meter} bar of ${want}`);
  return { id, name, origin, meter, durations };
}

export const PATTERNS: readonly RhythmPattern[] = [
  // --- 4/4 ---------------------------------------------------------------
  pattern('four-on-the-floor', 'Four on the floor', 'disco, house', '4/4',
    [Q, Q, Q, Q]),
  pattern('tresillo', 'Tresillo', 'Cuban; the 3 side of the clave', '4/4',
    [Q + E, Q + E, Q]),
  pattern('charleston', 'Charleston', '1920s jazz', '4/4',
    [Q + E, E, -Q * 2]),
  pattern('anticipation', 'Anticipated downbeat', 'pop and rock, everywhere', '4/4',
    [E, Q, Q, Q, E]),
  pattern('gallop', 'Gallop', 'heavy metal, and the baroque before it', '4/4',
    [Q, E + S, S, Q, E + S, S]),
  pattern('dotted-pair', 'Dotted pair', 'march and hornpipe', '4/4',
    [E + S, S, E + S, S, E + S, S, E + S, S]),
  pattern('backbeat-rest', 'Rest on one', 'funk', '4/4',
    [-Q, Q, -E, E, E, E]),

  // --- 3/4 ---------------------------------------------------------------
  pattern('waltz', 'Waltz', 'Viennese waltz', '3/4', [Q, Q, Q]),
  pattern('mazurka', 'Mazurka', 'Polish; the accent falls on two or three', '3/4',
    [E, E, Q, Q]),
  pattern('hemiola', 'Hemiola', 'baroque and Spanish dance; two against three', '3/4',
    [Q + E, Q + E]),
  pattern('sarabande', 'Sarabande', 'baroque; the second beat is held', '3/4',
    [Q, Q + E, E]),

  // --- 2/4 ---------------------------------------------------------------
  pattern('polka', 'Polka', 'Bohemian dance', '2/4', [E, E, E, E]),
  pattern('habanera', 'Habanera', 'Cuban; Bizet borrowed it for Carmen', '2/4',
    [E + S, S, E, E]),
  pattern('march', 'March', 'military two-step', '2/4', [Q, Q]),

  // --- 6/8 ---------------------------------------------------------------
  pattern('six-eight-basic', 'Compound duple', 'the pulse itself', '6/8',
    [Q + E, Q + E]),
  pattern('tarantella', 'Tarantella', 'southern Italian dance', '6/8',
    [E, E, E, E, E, E]),
  pattern('jig', 'Jig', 'Irish double jig', '6/8', [Q, E, Q, E]),
  pattern('siciliana', 'Siciliana', 'baroque pastoral', '6/8',
    [E + S, S, E, E + S, S, E]),

  // --- 9/8 and 12/8 ------------------------------------------------------
  pattern('slip-jig', 'Slip jig', 'Irish; compound triple', '9/8',
    [Q, E, Q, E, Q, E]),
  pattern('shuffle', 'Shuffle', 'blues and swing', '12/8',
    [Q, E, Q, E, Q, E, Q, E]),
  pattern('twelve-eight-ballad', 'Compound quadruple', 'doo-wop and soul ballads', '12/8',
    [Q + E, Q + E, Q + E, Q + E]),

  // --- asymmetric --------------------------------------------------------
  pattern('five-four-32', 'Five in three and two', 'Take Five', '5/4',
    [Q, Q, Q, Q, Q]),
  pattern('seven-eight-223', 'Seven as two-two-three', 'Balkan dance', '7/8',
    [Q, Q, Q + E]),
  pattern('five-eight-32', 'Five as three-two', 'Balkan paidushko', '5/8',
    [Q + E, Q]),

  // --- 2/2 and 3/8 -------------------------------------------------------
  pattern('cut-common', 'Cut common', 'alla breve; a march counted in two', '2/2',
    [Q * 2, Q * 2]),
  pattern('three-eight', 'Compound-feel triple', 'a fast minuet or scherzo', '3/8',
    [E, E, E]),
];

/** The patterns belonging to one metre, in the order they are listed. */
export function patternsFor(meterId: string): RhythmPattern[] {
  return PATTERNS.filter((p) => p.meter === meterId);
}
