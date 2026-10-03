/**
 * Time, measured in integer ticks.
 *
 * Durations are never floats. A float duration accumulates drift, makes
 * `sum(bar) === barTicks` impossible to assert exactly, and turns every test of
 * the rhythm generator into an epsilon comparison. 1680 ticks to the quarter is
 * the smallest number that makes every subdivision this app needs exact:
 *
 *   64th           105      triplet 16th    280
 *   32nd           210      quintuplet 16th 336
 *   16th           420      septuplet 16th  240
 *   dotted quarter 2520     6/8 bar        5040
 *
 * 1680 = 2^4 · 3 · 5 · 7, which is where the triplets, quintuplets and
 * septuplets come from.
 */

export const TICKS_PER_QUARTER = 1680;
export const TICKS_PER_WHOLE = TICKS_PER_QUARTER * 4;

export type NoteBase = 'w' | 'h' | 'q' | '8' | '16' | '32' | '64';

/**
 * Longest first, and spelled out rather than taken from `Object.keys`, which
 * puts the integer-like keys first in numeric order: '8','16','32','64','w',
 * 'h','q'. Nothing today depends on the order, but an engine whose output can
 * turn on a JavaScript key-ordering rule is the shape ADR 0002 warns about.
 */
export const NOTE_BASES: readonly NoteBase[] = ['w', 'h', 'q', '8', '16', '32', '64'];

export const BASE_TICKS: Record<NoteBase, number> = {
  w: TICKS_PER_WHOLE,
  h: TICKS_PER_WHOLE / 2,
  q: TICKS_PER_QUARTER,
  '8': TICKS_PER_QUARTER / 2,
  '16': TICKS_PER_QUARTER / 4,
  '32': TICKS_PER_QUARTER / 8,
  '64': TICKS_PER_QUARTER / 16,
};

export interface NoteValue {
  base: NoteBase;
  dots: 0 | 1 | 2;
}

export function noteValue(base: NoteBase, dots: 0 | 1 | 2 = 0): NoteValue {
  return { base, dots };
}

/**
 * Ticks spanned by a notated value. A dot adds half again, a second dot adds a
 * quarter again. A dotted 64th would be 157.5 ticks, so it does not exist here
 * — nobody sight-reads one, and allowing it would put a float in the tick
 * space that everything else relies on being integral.
 */
export function ticksOf(v: NoteValue): number {
  const base = BASE_TICKS[v.base];
  const scaled = v.dots === 0 ? base : v.dots === 1 ? base * 3 / 2 : base * 7 / 4;
  if (!Number.isInteger(scaled)) {
    throw new Error(`${v.base} with ${v.dots} dot(s) is not an integral duration`);
  }
  return scaled;
}

/**
 * Duration to notated value. There is no tie-break here because two distinct
 * values can never measure the same: a value is its base times 1, 3/2 or 7/4,
 * the bases are all powers of two apart, and 3/2 and 7/4 are not powers of
 * two. A collision would therefore mean the note-value system had changed
 * underneath this map, which is worth failing loudly for rather than
 * resolving by whichever entry happened to be written first.
 */
const VALUE_BY_TICKS = new Map<number, NoteValue>();
for (const base of NOTE_BASES) {
  for (const dots of [0, 1, 2] as const) {
    const v = { base, dots };
    let ticks: number;
    try { ticks = ticksOf(v); } catch { continue; }
    const clash = VALUE_BY_TICKS.get(ticks);
    if (clash) {
      throw new Error(
        `${base}+${dots} and ${clash.base}+${clash.dots} both measure ${ticks} ticks`,
      );
    }
    VALUE_BY_TICKS.set(ticks, v);
  }
}

/** The notated value for an exact duration, or null if it needs a tie. */
export function valueOfTicks(ticks: number): NoteValue | null {
  return VALUE_BY_TICKS.get(ticks) ?? null;
}

/**
 * Express an arbitrary duration as notated values to be tied together,
 * longest first. Used wherever a duration is produced by arithmetic — a note
 * split at a barline, the remainder of a bar — rather than chosen from the
 * cell library.
 *
 * Tuplet members do not come through here. A triplet eighth is 560 ticks,
 * which is not a multiple of a 64th and has no tied equivalent; it carries its
 * own value plus a tuplet ratio instead.
 */
export function tiedValues(ticks: number): NoteValue[] {
  if (ticks <= 0) throw new Error(`Cannot notate ${ticks} ticks`);
  if (ticks % BASE_TICKS['64'] !== 0) {
    throw new Error(
      `${ticks} ticks is not a multiple of a 64th (${BASE_TICKS['64']}), so no ` +
      'sequence of tied values measures it — it belongs to a tuplet',
    );
  }
  const out: NoteValue[] = [];
  let left = ticks;
  const descending = [...VALUE_BY_TICKS.entries()].sort((a, b) => b[0] - a[0]);
  while (left > 0) {
    const fit = descending.find(([t]) => t <= left);
    if (!fit) throw new Error(`${ticks} ticks cannot be notated (${left} left over)`);
    out.push(fit[1]);
    left -= fit[0];
  }
  return out;
}

// ---- Time signatures -----------------------------------------------------

export type MeterKind = 'simple' | 'compound' | 'irregular';

export interface TimeSignature {
  id: string;
  numerator: number;
  denominator: number;
  kind: MeterKind;
  barTicks: number;
  /** Tick offset where each beat begins. */
  beatStarts: readonly number[];
  /** Duration of each beat. Uneven in irregular meters: 7/8 is 2+2+3. */
  beatDurations: readonly number[];
  /** Spans within which eighths and shorter may be beamed together. */
  beamSpans: readonly (readonly [number, number])[];
  /**
   * The metric hierarchy, coarsest first. levels[0] is the downbeat, levels[1]
   * the beats, then each successive division. `metricWeight` reads this.
   */
  levels: readonly (readonly number[])[];
  /** The weight `metricWeight` gives a beat. "On a beat or stronger" is `>=` this. */
  beatWeight: number;
}

/** How deep the subdivision hierarchy goes below the beat. */
const SUBDIVISION_DEPTH = 4;

/**
 * The accent level between the downbeat and the beats, which quadruple meters
 * have and triple meters do not: beat three of a 4/4 bar is heard as a
 * secondary strong beat, and a generator that treats it like beat two writes
 * bars that scan wrong.
 *
 * It comes from the beam grouping where that is coarser than the beat — 5/4 as
 * 3+2 accents beat four — and from the midpoint otherwise, which is how 12/8
 * gets one despite beaming per beat.
 */
function secondaryAccents(beatStarts: number[], beamSpans: Array<readonly [number, number]>): number[] {
  const out = new Set<number>();
  if (beamSpans.length < beatStarts.length) {
    for (const [start] of beamSpans) if (start !== 0) out.add(start);
  }
  if (beatStarts.length === 4) out.add(beatStarts[2]);
  if (beatStarts.length === 6) out.add(beatStarts[3]);
  return [...out].sort((a, b) => a - b);
}

/**
 * How a beat first divides. A beat worth several units of the denominator
 * divides into those units — a dotted quarter in 6/8 into three eighths, the
 * 3-group of a 2+2+3 seven-eight into three eighths — because that unit is
 * what the meter is counted in. A beat worth one unit halves instead.
 */
function firstDivisor(unitsInBeat: number): number {
  return unitsInBeat > 1 ? unitsInBeat : 2;
}

function buildLevels(
  beatStarts: number[], beatDurations: number[], beatUnits: number[],
  beamSpans: Array<readonly [number, number]>,
): { levels: number[][]; beatWeight: number } {
  const secondary = secondaryAccents(beatStarts, beamSpans);
  const levels: number[][] = [[0]];
  if (secondary.length) levels.push(secondary);
  const beatLevelIndex = levels.length;
  levels.push(beatStarts.slice());

  // Each beat divides by its own first divisor, which differs between beats in
  // an irregular meter. Everything below that halves.
  let spans = beatStarts.map((start, i) => ({
    start, duration: beatDurations[i], divisor: firstDivisor(beatUnits[i]),
  }));
  for (let depth = 0; depth < SUBDIVISION_DEPTH; depth++) {
    const ticks: number[] = [];
    const next: typeof spans = [];
    for (const { start, duration, divisor } of spans) {
      const step = duration / divisor;
      if (!Number.isInteger(step)) { next.push({ start, duration, divisor: 2 }); continue; }
      for (let k = 0; k < divisor; k++) {
        const t = start + k * step;
        if (k > 0) ticks.push(t);
        next.push({ start: t, duration: step, divisor: 2 });
      }
    }
    if (ticks.length) levels.push(ticks);
    spans = next;
  }
  const cleaned = levels.map((l) => [...new Set(l)].sort((a, b) => a - b));
  return { levels: cleaned, beatWeight: cleaned.length - beatLevelIndex };
}

function simple(id: string, numerator: number, denominator: number, beamGroups?: number[]): TimeSignature {
  const beat = TICKS_PER_WHOLE / denominator;
  const barTicks = beat * numerator;
  const beatStarts = Array.from({ length: numerator }, (_, i) => i * beat);
  const beatDurations = beatStarts.map(() => beat);
  // 4/4 beams in half-bars: four eighths under one beam is what a reader
  // expects, and beaming them per quarter looks fussy.
  const groups = beamGroups ?? (numerator === 4 && denominator === 4 ? [2, 2] : beatStarts.map(() => 1));
  const beamSpans = spansFromGroups(groups, beat);
  const { levels, beatWeight } = buildLevels(beatStarts, beatDurations, beatStarts.map(() => 1), beamSpans);
  return {
    id, numerator, denominator, kind: 'simple', barTicks,
    beatStarts, beatDurations, beamSpans, levels, beatWeight,
  };
}

function compound(id: string, numerator: number, denominator: number): TimeSignature {
  const unit = TICKS_PER_WHOLE / denominator;
  const beat = unit * 3;
  const beats = numerator / 3;
  const barTicks = unit * numerator;
  const beatStarts = Array.from({ length: beats }, (_, i) => i * beat);
  const beatDurations = beatStarts.map(() => beat);
  const beamSpans = beatStarts.map((s) => [s, s + beat] as const);
  const { levels, beatWeight } = buildLevels(beatStarts, beatDurations, beatStarts.map(() => 3), beamSpans);
  return {
    id, numerator, denominator, kind: 'compound', barTicks,
    beatStarts, beatDurations, beamSpans, levels, beatWeight,
  };
}

/** An irregular meter is defined by its grouping: 7/8 as 2+2+3 is not 3+2+2. */
function irregular(id: string, groups: number[], denominator: number): TimeSignature {
  const unit = TICKS_PER_WHOLE / denominator;
  const numerator = groups.reduce((a, b) => a + b, 0);
  const beatDurations = groups.map((g) => g * unit);
  const beatStarts: number[] = [];
  let t = 0;
  for (const d of beatDurations) { beatStarts.push(t); t += d; }
  const beamSpans = beatStarts.map((s, i) => [s, s + beatDurations[i]] as const);
  const { levels, beatWeight } = buildLevels(beatStarts, beatDurations, groups, beamSpans);
  return {
    id, numerator, denominator, kind: 'irregular', barTicks: t,
    beatStarts, beatDurations, beamSpans, levels, beatWeight,
  };
}

function spansFromGroups(groups: number[], beat: number): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  let t = 0;
  for (const g of groups) { out.push([t, t + g * beat] as const); t += g * beat; }
  return out;
}

export const TIME_SIGNATURES: readonly TimeSignature[] = [
  simple('4/4', 4, 4),
  simple('3/4', 3, 4),
  simple('2/4', 2, 4),
  simple('2/2', 2, 2),
  simple('3/8', 3, 8, [3]),
  simple('5/4', 5, 4, [3, 2]),
  compound('6/8', 6, 8),
  compound('9/8', 9, 8),
  compound('12/8', 12, 8),
  irregular('7/8', [2, 2, 3], 8),
  irregular('5/8', [3, 2], 8),
];

const BY_ID = new Map(TIME_SIGNATURES.map((t) => [t.id, t]));

export function timeSignature(id: string): TimeSignature {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown time signature: ${id}`);
  return found;
}

/**
 * How strong a position in the bar is. The downbeat scores highest, then the
 * beats, then each division below them; a tick that falls on no grid line at
 * all scores 0.
 *
 * The rhythm generator and the melody generator's "chord tones on strong
 * beats" rule both read this. Two definitions of a strong beat would silently
 * drift apart, and the resulting bug would sound like bad taste rather than
 * like an error.
 */
export function metricWeight(ts: TimeSignature, tick: number): number {
  const t = ((tick % ts.barTicks) + ts.barTicks) % ts.barTicks;
  for (let i = 0; i < ts.levels.length; i++) {
    if (ts.levels[i].includes(t)) return ts.levels.length - i;
  }
  return 0;
}

/** The weight a tick has when it lands on a beat. "On a beat or stronger" is `>=` this. */
export function beatLevel(ts: TimeSignature): number {
  return ts.beatWeight;
}

export function isDownbeat(ts: TimeSignature, tick: number): boolean {
  return ((tick % ts.barTicks) + ts.barTicks) % ts.barTicks === 0;
}

/** The beam span containing a tick, or null when it falls outside every one. */
export function beamSpanAt(ts: TimeSignature, tick: number): readonly [number, number] | null {
  const t = ((tick % ts.barTicks) + ts.barTicks) % ts.barTicks;
  return ts.beamSpans.find(([s, e]) => t >= s && t < e) ?? null;
}

/** Index of the beam span containing a tick, for grouping notes into beams. */
export function beamSpanIndex(ts: TimeSignature, tick: number): number {
  const t = ((tick % ts.barTicks) + ts.barTicks) % ts.barTicks;
  return ts.beamSpans.findIndex(([s, e]) => t >= s && t < e);
}
