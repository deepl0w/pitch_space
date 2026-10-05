import {
  type NoteValue, type TimeSignature, beamSpanIndex, metricWeight, beatLevel,
} from '../theory/meter';
import { type Rng, weightedPick } from '../theory/rng';
import {
  CELLS, COMPOUND_BEAT, SIMPLE_BEAT, type CellEvent, type RhythmCell,
  cellsOfKind, scaleCell, valueForEvent,
} from './cells';

/**
 * Rhythm generation.
 *
 * A bar is filled beat by beat from the cell library, left to right, with
 * backtracking when a choice leaves no legal continuation. The rules below are
 * what separate a bar that scans from a legal sequence of durations: without
 * them the generator writes syncopations with nothing to syncopate against and
 * tuplets stacked on tuplets, which are correct arithmetic and unreadable
 * music.
 */

export interface RhythmEvent {
  /** Absolute tick from the start of the exercise. */
  startTick: number;
  durationTicks: number;
  value: NoteValue;
  isRest: boolean;
  tiedFromPrevious: boolean;
  tiedToNext: boolean;
  /** Shared by the members of one tuplet bracket. */
  tupletId?: number;
  tupletRatio?: { count: number; inTheTimeOf: number };
  /** Shared by the members of one beam. */
  beamGroup?: number;
}

export interface RhythmBar {
  index: number;
  startTick: number;
  ticks: number;
  events: RhythmEvent[];
  /**
   * The cells this bar was built from, in the order they were placed.
   *
   * Carried out of the generator because the cell is what a learner
   * practises: "the syncopated beat" is a figure you get better at, and
   * the bar it landed in is not. Without it an attempt can only be
   * credited to the bar as a whole, which teaches a schedule nothing
   * about which figure went wrong.
   *
   * `events` cannot recover it. Two sixteenths and an eighth look the
   * same whether they came from one cell or two, and a tie across a
   * beat erases the boundary entirely.
   */
  cellIds: string[];
}

export interface RhythmOptions {
  timeSignature: TimeSignature;
  bars: number;
  allowRests?: boolean;
  allowTuplets?: boolean;
  /**
   * How many syncopated cells one bar may carry. Zero bars them.
   *
   * A number because that is what it always was: a `grade` chose between
   * 0, 1 and 3 through a `syncopationBudget` table, so the dial was
   * spelling a quantity it could have simply named. Asking for two was
   * impossible, and asking for one meant also asking for everything else
   * grade 7 turned on.
   */
  syncopationsPerBar?: number;
  /**
   * Whether two tuplets may run back to back.
   *
   * Its own option rather than a consequence, because two tuplets
   * running is a texture rather than a figure and whether you want it is
   * a question about what you are practising, not about how far along
   * you are.
   */
  allowAdjacentTuplets?: boolean;
}

/**
 * Which cell kind a beat of this length is written for.
 *
 * A beat is simple or compound by its own length, not by the meter's name,
 * which is what lets 7/8 as 2+2+3 take simple cells for its two-eighth beats
 * and compound cells for its three-eighth one.
 */
export function kindForBeat(beatTicks: number): RhythmCell['kind'] | null {
  const isPowerOfTwo = (x: number) => x > 0 && Number.isInteger(Math.log2(x));
  if (isPowerOfTwo(beatTicks / SIMPLE_BEAT)) return 'simple';
  if (isPowerOfTwo(beatTicks / COMPOUND_BEAT)) return 'compound';
  return null;
}

interface Placement { cell: RhythmCell; beat: number }

function isAllowed(
  cell: RhythmCell, beat: number, chosen: Placement[], options: RhythmOptions,
  totalBeats: number,
): boolean {
  const syncopated = cell.tags.includes('syncopated');
  const tupletCell = cell.tags.includes('tuplet');

  if (cell.tags.includes('rest') && options.allowRests === false) return false;
  if (tupletCell && options.allowTuplets === false) return false;

  // The downbeat has to be articulated before anything pushes against it. A
  // bar that opens off the beat reads as a mistake, not as syncopation.
  if (syncopated && beat === 0) return false;

  if (syncopated) {
    const used = chosen.filter((p) => p.cell.tags.includes('syncopated')).length;
    if (used >= (options.syncopationsPerBar ?? 0)) return false;
  }

  if (tupletCell && options.allowAdjacentTuplets !== true) {
    const previous = chosen[chosen.length - 1];
    if (previous?.cell.tags.includes('tuplet')) return false;
  }

  // A bar of nothing but rests is not an exercise. Only the cell that would
  // complete such a bar is refused, so rests remain free everywhere else and
  // the search does not have to backtrack out of a silent bar it already
  // committed to.
  const silent = (c: RhythmCell) => c.events.every((e) => e.rest);
  if (silent(cell) && beat + cell.beats >= totalBeats && !chosen.some((p) => !silent(p.cell))) {
    return false;
  }
  return true;
}

/**
 * Every admissible cell is as likely as every other.
 *
 * There was a weighting here that favoured "the newest material at a
 * grade" — cells whose own grade equalled the one asked for got three
 * times the weight, tapering below. It was a reasonable thing to want
 * out of a dial and it cannot survive the dial: with the library
 * selected by what it *is* rather than by a tier, there is no "newest"
 * to favour, and inventing one would be the ordering coming back under
 * another name. A user who wants fewer even quarters unticks them.
 */

/**
 * Choose cells filling one bar, beat by beat, backtracking on a dead end.
 *
 * Returns null when the bar cannot be filled at all, which happens when the
 * constraints exclude everything — no cells of the kind this meter's beats
 * need, for instance. The caller reports that rather than looping.
 */
export function chooseCells(rng: Rng, options: RhythmOptions): Placement[] | null {
  const ts = options.timeSignature;
  const chosen: Placement[] = [];
  const excluded: Array<Set<string>> = [];

  let beat = 0;
  while (beat < ts.beatStarts.length) {
    const kind = kindForBeat(ts.beatDurations[beat]);
    const banned = excluded[chosen.length] ?? new Set<string>();
    const candidates = kind === null ? [] : cellsOfKind(kind).filter((cell) => {
      if (banned.has(cell.id)) return false;
      if (beat + cell.beats > ts.beatStarts.length) return false;
      // A two-beat cell needs the next beat to be the same length, which is
      // not true across the join of an irregular meter.
      if (cell.beats === 2 && ts.beatDurations[beat + 1] !== ts.beatDurations[beat]) return false;
      return isAllowed(cell, beat, chosen, options, ts.beatStarts.length);
    });

    if (candidates.length === 0) {
      if (chosen.length === 0) return null;
      const undone = chosen.pop()!;
      excluded.length = chosen.length + 1;
      const set = excluded[chosen.length] ?? new Set<string>();
      set.add(undone.cell.id);
      excluded[chosen.length] = set;
      beat = undone.beat;
      continue;
    }

    excluded[chosen.length] = banned;
    const cell = weightedPick(rng, candidates.map((value) => ({
      value, weight: 1,
    })));
    chosen.push({ cell, beat });
    beat += cell.beats;
  }
  return chosen;
}

/**
 * Turn chosen cells into events with absolute ticks, values and beams.
 *
 * `nextId` is passed in rather than held in a module-level counter.
 * It was one — `let nextTupletId = 1` beside this function, incremented
 * and never reset — so the same seed produced the same rhythm with
 * *different* tuplet ids on a second call, and a progression reported by
 * its seed did not reproduce. The determinism test could not see it
 * because the settings it used never reached a tuplet; widening that
 * sweep is what surfaced it.
 *
 * Ids are per-generation and start at 1, so the identity of a tuplet is
 * a fact about the rhythm it is in rather than about how many rhythms
 * the process happened to make first.
 */
function layOut(
  placements: Placement[], ts: TimeSignature, barStart: number, nextId: () => number,
): RhythmEvent[] {
  const events: RhythmEvent[] = [];
  for (const { cell, beat } of placements) {
    const beatTicks = ts.beatDurations[beat];
    const scaled: CellEvent[] = scaleCell(cell, beatTicks);
    let tupletId: number | undefined;
    let at = barStart + ts.beatStarts[beat];
    for (const event of scaled) {
      const value = valueForEvent(event);
      if (value === null) throw new Error(`cell ${cell.id} produced an unnotatable duration`);
      if (event.tuplet && tupletId === undefined) tupletId = nextId();
      events.push({
        startTick: at,
        durationTicks: event.ticks,
        value,
        isRest: event.rest,
        tiedFromPrevious: false,
        tiedToNext: false,
        tupletId: event.tuplet ? tupletId : undefined,
        tupletRatio: event.tuplet,
      });
      at += event.ticks;
    }
  }
  return addBeams(events, ts, barStart);
}

/**
 * Beam runs of short notes that share a beam span.
 *
 * Cells are beat-aligned by construction, so this never has to decide where a
 * beam *should* break — the meter's own spans already say. A rest, or anything
 * a quarter or longer, ends the run.
 */
function addBeams(events: RhythmEvent[], ts: TimeSignature, barStart: number): RhythmEvent[] {
  const beamable = (e: RhythmEvent) => !e.isRest && e.durationTicks < ts.beatDurations[0]
    && e.durationTicks <= SIMPLE_BEAT / 2;
  let group = 0;
  let run: RhythmEvent[] = [];
  const flush = () => {
    if (run.length >= 2) { group += 1; for (const e of run) e.beamGroup = group; }
    run = [];
  };
  let span = -1;
  for (const event of events) {
    const here = beamSpanIndex(ts, event.startTick - barStart);
    if (!beamable(event) || here !== span) { flush(); span = here; }
    if (beamable(event)) run.push(event); else span = -1;
  }
  flush();
  return events;
}

export function generateRhythm(rng: Rng, options: RhythmOptions): RhythmBar[] {
  const ts = options.timeSignature;
  const bars: RhythmBar[] = [];
  // Per call, so two generations from one seed agree. See `layOut`.
  let tupletCount = 0;
  const nextTupletId = () => (tupletCount += 1);
  for (let index = 0; index < options.bars; index++) {
    const placements = chooseCells(rng, options);
    if (placements === null) {
      throw new Error(
        `No rhythm fits ${ts.id} with these constraints`,
      );
    }
    const startTick = index * ts.barTicks;
    bars.push({
      index,
      startTick,
      ticks: ts.barTicks,
      events: layOut(placements, ts, startTick, nextTupletId),
      cellIds: placements.map((p) => p.cell.id),
    });
  }
  return bars;
}

/**
 * Re-lay a known list of cells as a bar at a given position.
 *
 * The motif layer's one need from here, and the reason it is a function
 * rather than the caller copying a bar: an event carries an absolute tick,
 * a tuplet id and a beam group, all of which are properties of *where the
 * bar is*. A restatement in bar 4 that cloned bar 1's events would carry
 * bar 1's ticks, and the two would collide in the same score.
 *
 * Throws on a cell id the catalogue does not have, rather than skipping it
 * and producing a bar that does not fill its meter.
 */
export function barFromCells(
  cellIds: readonly string[], ts: TimeSignature, index: number,
): RhythmBar {
  const placements: Placement[] = [];
  let beat = 0;
  for (const id of cellIds) {
    const found = CELLS.find((c) => c.id === id);
    if (!found) throw new Error(`No rhythm cell called ${id}`);
    placements.push({ cell: found, beat });
    beat += found.beats;
  }
  const startTick = index * ts.barTicks;
  let tupletCount = 0;
  return {
    index,
    startTick,
    ticks: ts.barTicks,
    events: layOut(placements, ts, startTick, () => (tupletCount += 1)),
    cellIds: [...cellIds],
  };
}

/** Strong-beat positions a melody generator should target, for convenience. */
export function strongBeats(ts: TimeSignature, bar: RhythmBar): RhythmEvent[] {
  return bar.events.filter(
    (e) => !e.isRest && metricWeight(ts, e.startTick - bar.startTick) >= beatLevel(ts),
  );
}
