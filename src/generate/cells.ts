import { TICKS_PER_QUARTER, type NoteValue, type TimeSignature, valueOfTicks } from '../theory/meter';

/**
 * The rhythmic cell library.
 *
 * Real rhythm is not a random walk over note values; it is built from a stock
 * of figures that players already have in their hands. Generating from a
 * catalogue of those figures is what makes a bar scan, and it is also what
 * makes difficulty mean something — a grade is a slice of this list rather
 * than a separate mechanism.
 *
 * Cells are written against a reference beat and scaled to whatever beat the
 * meter actually has, so one `[8 8]` serves a quarter-note beat in 4/4 and a
 * half-note beat in 2/2.
 */

export type CellTag = 'even' | 'rest' | 'dotted' | 'syncopated' | 'tuplet' | 'sustained';

export interface CellEvent {
  /** Ticks at the reference beat length. */
  ticks: number;
  rest: boolean;
  /** Set when the event belongs to a tuplet bracket: n in the time of `inTheTimeOf`. */
  tuplet?: { count: number; inTheTimeOf: number };
}

export interface RhythmCell {
  id: string;
  /** How many beats the cell fills. */
  beats: 1 | 2;
  /** Which beat division the cell is written for. */
  kind: 'simple' | 'compound';
  events: readonly CellEvent[];
  /** Lowest grade at which this cell may be used. */
  grade: number;
  tags: readonly CellTag[];
}

/** A simple beat is a quarter; a compound beat is a dotted quarter. */
export const SIMPLE_BEAT = TICKS_PER_QUARTER;
export const COMPOUND_BEAT = TICKS_PER_QUARTER * 3 / 2;

const Q = TICKS_PER_QUARTER;
const E = Q / 2;
const S = Q / 4;
const T = Q / 8;

function note(ticks: number): CellEvent { return { ticks, rest: false }; }
function rest(ticks: number): CellEvent { return { ticks, rest: true }; }
function tuplet(count: number, inTheTimeOf: number, unit: number): CellEvent[] {
  return Array.from({ length: count }, () => ({
    ticks: (unit * inTheTimeOf) / count,
    rest: false,
    tuplet: { count, inTheTimeOf },
  }));
}

function cell(
  id: string, beats: 1 | 2, kind: RhythmCell['kind'],
  events: CellEvent[], grade: number, tags: CellTag[],
): RhythmCell {
  const want = (kind === 'simple' ? SIMPLE_BEAT : COMPOUND_BEAT) * beats;
  const got = events.reduce((sum, e) => sum + e.ticks, 0);
  if (got !== want) throw new Error(`cell ${id}: ${got} ticks, expected ${want}`);
  return { id, beats, kind, events, grade, tags };
}

/**
 * Grades, and what each one adds. The progression is the one a method book
 * uses: whole bars before beats, beats before divisions, divisions before
 * dots, dots before syncopation, syncopation before tuplets.
 */
export const CELLS: readonly RhythmCell[] = [
  // --- simple beat -------------------------------------------------------
  cell('q', 1, 'simple', [note(Q)], 1, ['even', 'sustained']),
  cell('qr', 1, 'simple', [rest(Q)], 2, ['rest']),
  cell('ee', 1, 'simple', [note(E), note(E)], 3, ['even']),
  cell('er_e', 1, 'simple', [rest(E), note(E)], 4, ['rest', 'syncopated']),
  cell('e_er', 1, 'simple', [note(E), rest(E)], 4, ['rest']),
  cell('ssss', 1, 'simple', [note(S), note(S), note(S), note(S)], 5, ['even']),
  cell('e_ss', 1, 'simple', [note(E), note(S), note(S)], 5, ['even']),
  cell('ss_e', 1, 'simple', [note(S), note(S), note(E)], 5, ['even', 'sustained']),
  cell('dotted_e_s', 1, 'simple', [note(E + S), note(S)], 6, ['dotted']),
  cell('s_dotted_e', 1, 'simple', [note(S), note(E + S)], 6, ['dotted', 'syncopated', 'sustained']),
  cell('s_e_s', 1, 'simple', [note(S), note(E), note(S)], 7, ['syncopated']),
  cell('sr_sss', 1, 'simple', [rest(S), note(S), note(S), note(S)], 7, ['rest', 'syncopated']),
  cell('triplet_e', 1, 'simple', tuplet(3, 2, E), 8, ['tuplet', 'even']),
  cell('s_tt', 1, 'simple', [note(S), note(S), note(T), note(T), note(S)], 9, ['even']),
  cell('quintuplet_s', 1, 'simple', tuplet(5, 4, S), 10, ['tuplet']),
  cell('septuplet_s', 1, 'simple', tuplet(7, 4, S), 10, ['tuplet']),

  // --- two simple beats --------------------------------------------------
  cell('h', 2, 'simple', [note(Q * 2)], 1, ['even', 'sustained']),
  cell('hr', 2, 'simple', [rest(Q * 2)], 2, ['rest']),
  cell('dq_e', 2, 'simple', [note(Q + E), note(E)], 4, ['dotted', 'sustained']),
  cell('q_ee', 2, 'simple', [note(Q), note(E), note(E)], 3, ['even']),
  cell('ee_q', 2, 'simple', [note(E), note(E), note(Q)], 3, ['even', 'sustained']),
  // The canonical 4/4 syncopation. It spans two beats and cannot be built
  // from two one-beat cells without inventing a tie across the beat.
  cell('e_q_e', 2, 'simple', [note(E), note(Q), note(E)], 7, ['syncopated', 'sustained']),
  cell('qr_q', 2, 'simple', [rest(Q), note(Q)], 4, ['rest', 'sustained']),
  cell('q_qr', 2, 'simple', [note(Q), rest(Q)], 3, ['rest']),

  // --- compound beat -----------------------------------------------------
  cell('dq', 1, 'compound', [note(Q + E)], 1, ['even', 'sustained']),
  cell('dqr', 1, 'compound', [rest(Q + E)], 2, ['rest']),
  cell('eee', 1, 'compound', [note(E), note(E), note(E)], 3, ['even']),
  cell('q_e', 1, 'compound', [note(Q), note(E)], 4, ['even']),
  cell('ee_er', 1, 'compound', [note(E), note(E), rest(E)], 5, ['rest']),
  cell('er_ee', 1, 'compound', [rest(E), note(E), note(E)], 6, ['rest', 'syncopated']),
  cell('e_q', 1, 'compound', [note(E), note(Q)], 7, ['syncopated', 'sustained']),
  cell('e_ss_e', 1, 'compound', [note(E), note(S), note(S), note(E)], 7, ['even']),
  cell('ssssss', 1, 'compound', [note(S), note(S), note(S), note(S), note(S), note(S)], 8, ['even']),
  cell('duplet_e', 1, 'compound', tuplet(2, 3, E), 9, ['tuplet']),
  cell('dh', 2, 'compound', [note((Q + E) * 2)], 2, ['even', 'sustained']),
  cell('dq_eee', 2, 'compound', [note(Q + E), note(E), note(E), note(E)], 4, ['even']),
  cell('eee_dq', 2, 'compound', [note(E), note(E), note(E), note(Q + E)], 4, ['even', 'sustained']),
];

/**
 * The cells available at a grade.
 *
 * Exported rather than filtered inline where the generator needs it, so the
 * subset property can be asserted directly against the real sets instead of
 * inferred from a sample of generated bars.
 */
export function cellsAtGrade(grade: number, kind?: RhythmCell['kind']): RhythmCell[] {
  return CELLS.filter((c) => c.grade <= grade && (kind === undefined || c.kind === kind));
}

/** Whether a cell's figures fit a meter's beat division. */
export function cellKindFor(ts: TimeSignature): RhythmCell['kind'] {
  return ts.kind === 'compound' ? 'compound' : 'simple';
}

/**
 * Scale a cell's events to the beat the meter actually uses. A cell written
 * for a quarter-note beat becomes half notes in 2/2 and eighths in 3/8.
 */
export function scaleCell(cell: RhythmCell, beatTicks: number): CellEvent[] {
  const reference = cell.kind === 'simple' ? SIMPLE_BEAT : COMPOUND_BEAT;
  if (beatTicks === reference) return [...cell.events];
  return cell.events.map((e) => {
    const ticks = (e.ticks * beatTicks) / reference;
    if (!Number.isInteger(ticks)) {
      throw new Error(`cell ${cell.id} does not scale to a beat of ${beatTicks} ticks`);
    }
    return { ...e, ticks };
  });
}

/**
 * The notated value for a cell event.
 *
 * Read from the event's real duration, not from the reference beat it was
 * written against: a cell scaled onto the eighth-note beat of a 7/8 bar is
 * notated in eighths, and un-scaling it first would write quarters. Only a
 * tuplet separates sounding from written, which is what the ratio is for.
 */
export function valueForEvent(event: CellEvent): NoteValue | null {
  const written = event.tuplet
    ? (event.ticks * event.tuplet.count) / event.tuplet.inTheTimeOf
    : event.ticks;
  return Number.isInteger(written) ? valueOfTicks(written) : null;
}
