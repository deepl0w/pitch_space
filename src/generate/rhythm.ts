import {
  type NoteValue, type TimeSignature, beamSpanIndex, metricWeight, beatLevel,
} from '../theory/meter';
import { type Rng, weightedPick } from '../theory/rng';
import {
  COMPOUND_BEAT, SIMPLE_BEAT, type CellEvent, type RhythmCell,
  cellsAtGrade, scaleCell, valueForEvent,
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
}

export interface RhythmOptions {
  timeSignature: TimeSignature;
  bars: number;
  /** 1-10. Selects the slice of the cell library in play. */
  grade: number;
  allowRests?: boolean;
  allowTuplets?: boolean;
  allowSyncopation?: boolean;
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

/** How many syncopated cells a bar may carry, by grade. */
function syncopationBudget(grade: number): number {
  if (grade < 7) return 0;
  return grade >= 9 ? 3 : 1;
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
  if (syncopated && options.allowSyncopation === false) return false;

  // The downbeat has to be articulated before anything pushes against it. A
  // bar that opens off the beat reads as a mistake, not as syncopation.
  if (syncopated && beat === 0) return false;

  if (syncopated) {
    const used = chosen.filter((p) => p.cell.tags.includes('syncopated')).length;
    if (used >= syncopationBudget(options.grade)) return false;
  }

  // Two tuplets running is a texture, not a figure, until the grade where
  // cross-rhythm is the point.
  if (tupletCell && options.grade < 9) {
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

/** Weight the choice so the newest material at a grade is actually heard. */
function weightFor(cell: RhythmCell, grade: number): number {
  const distance = grade - cell.grade;
  return cell.grade === grade ? 3 : Math.max(1, 6 - distance);
}

/**
 * Choose cells filling one bar, beat by beat, backtracking on a dead end.
 *
 * Returns null when the bar cannot be filled at all, which happens when the
 * constraints exclude everything — a grade with no cells of the kind this
 * meter's beats need, for instance. The caller reports that rather than
 * looping.
 */
export function chooseCells(rng: Rng, options: RhythmOptions): Placement[] | null {
  const ts = options.timeSignature;
  const chosen: Placement[] = [];
  const excluded: Array<Set<string>> = [];

  let beat = 0;
  while (beat < ts.beatStarts.length) {
    const kind = kindForBeat(ts.beatDurations[beat]);
    const banned = excluded[chosen.length] ?? new Set<string>();
    const candidates = kind === null ? [] : cellsAtGrade(options.grade, kind).filter((cell) => {
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
      value, weight: weightFor(value, options.grade),
    })));
    chosen.push({ cell, beat });
    beat += cell.beats;
  }
  return chosen;
}

let nextTupletId = 1;

/** Turn chosen cells into events with absolute ticks, values and beams. */
function layOut(placements: Placement[], ts: TimeSignature, barStart: number): RhythmEvent[] {
  const events: RhythmEvent[] = [];
  for (const { cell, beat } of placements) {
    const beatTicks = ts.beatDurations[beat];
    const scaled: CellEvent[] = scaleCell(cell, beatTicks);
    let tupletId: number | undefined;
    let at = barStart + ts.beatStarts[beat];
    for (const event of scaled) {
      const value = valueForEvent(event);
      if (value === null) throw new Error(`cell ${cell.id} produced an unnotatable duration`);
      if (event.tuplet && tupletId === undefined) tupletId = nextTupletId++;
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
  for (let index = 0; index < options.bars; index++) {
    const placements = chooseCells(rng, options);
    if (placements === null) {
      throw new Error(
        `No rhythm fits ${ts.id} at grade ${options.grade} with these constraints`,
      );
    }
    const startTick = index * ts.barTicks;
    bars.push({ index, startTick, ticks: ts.barTicks, events: layOut(placements, ts, startTick) });
  }
  return bars;
}

/** Strong-beat positions a melody generator should target, for convenience. */
export function strongBeats(ts: TimeSignature, bar: RhythmBar): RhythmEvent[] {
  return bar.events.filter(
    (e) => !e.isRest && metricWeight(ts, e.startTick - bar.startTick) >= beatLevel(ts),
  );
}
