import {
  Accidental, BarNote, Beam, Dot, Formatter, Renderer, Stave, StaveNote, Tuplet, Voice,
} from 'vexflow/bravura';
import { type Pitch, simplifySpelling, vexKey } from '../../theory/pitch';
import { type Key, vexKeySignature } from '../../theory/key';
import { type NoteValue, type TimeSignature, ticksOf } from '../../theory/meter';

/**
 * The only file in the project that imports the notation library (ADR 0003).
 *
 * Everything above it speaks in spelled pitches and integer ticks; everything
 * below is VexFlow's imperative drawing API. Keeping the boundary at one file
 * is what lets the engine be tested without a DOM and the library be replaced
 * without touching the engine — and a second importer is how that quietly
 * stops being true, so a test watches for one.
 *
 * `vexflow/bravura` rather than `vexflow`: the default entry carries every
 * font and measures about 690 kB gzipped, against roughly 91 kB for the core
 * plus a single font. The core entry alone would need the font loaded
 * asynchronously before the first draw, which buys nothing here.
 */

export type Clef = 'treble' | 'bass' | 'alto' | 'tenor';

/** One notated event: a rest, a single note, or a chord sounding together. */
export interface ScoreNote {
  /** Empty for a rest. */
  pitches: readonly Pitch[];
  value: NoteValue;
  /** Drawn in colour, for marking a performance against the score. */
  colour?: string;
  /**
   * Shared by the members of one tuplet bracket, with the ratio it is written
   * at. Without this a triplet is drawn as three plain eighths and the bar
   * looks over-full — the notes are right and the notation is a lie.
   */
  tuplet?: { id: number; count: number; inTheTimeOf: number };
}

export interface ScoreSpec {
  notes: readonly ScoreNote[];
  clef: Clef;
  key?: Key;
  timeSignature?: TimeSignature;
  /**
   * Where barlines fall, in ticks. Supplied by `timeSignature` when there
   * is one.
   *
   * Separate because printing a meter and grouping into bars are two
   * statements and a caller may want the second without the first: a
   * chord progression is barred like any other music and does not
   * conventionally print `4/4` above itself. Giving it a time signature
   * to get the lines would have put a meter on every chord chart.
   */
  barTicks?: number;
}

/** The one default. Score passes `height` through, so it must not have its own. */
export const DEFAULT_SCORE_HEIGHT = 170;

/** Where one note ended up, so something can be drawn over it. */
export interface NotePlacement {
  /** Index into the spec's `notes`, so a caller can match without counting. */
  index: number;
  /** Centre of the notehead, in pixels from the left of the drawn SVG. */
  x: number;
}

/**
 * Where the engraver put things.
 *
 * Returned rather than measured off the SVG afterwards. The alternative is
 * querying the DOM for noteheads and trusting their document order to match
 * the spec, which is the same mistake as recolouring the output from
 * outside: it works until a rest, a tuplet bracket or a beam adds elements
 * that are not notes, and then it is quietly off by one.
 */
export interface ScoreLayout {
  /** One per spec note, in spec order, left to right. */
  notes: readonly NotePlacement[];
  /** The drawn stave, for placing a cursor that spans it. */
  stave: { x: number; top: number; bottom: number; width: number; notesStartX: number };
}

export interface DrawOptions {
  width: number;
  /** Drawn at this many pixels; defaults to DEFAULT_SCORE_HEIGHT. */
  height?: number;
  /**
   * Ink colour, as a CSS colour string.
   *
   * Passed into VexFlow rather than applied to its output with CSS. The
   * output cannot be recoloured reliably from outside: a staff line is a
   * zero-area path that is stroked and carries no `stroke` attribute, so an
   * attribute selector misses it and it keeps the default black, while a
   * `fill` rule broad enough to catch the glyphs also overrides the
   * `fill="none"` those same paths rely on. The result is some marks
   * recoloured and some not.
   */
  colour?: string;
}

const BASE_TO_VEX: Record<NoteValue['base'], string> = {
  w: 'w', h: 'h', q: 'q', '8': '8', '16': '16', '32': '32', '64': '64',
};

/**
 * A rest needs a staff position or VexFlow puts it in the wrong place. These
 * are the conventional ones — middle of the staff for each clef.
 */
const REST_KEY: Record<Clef, string> = {
  treble: 'b/4', bass: 'd/3', alto: 'c/4', tenor: 'a/3',
};

/**
 * VexFlow's key parser accepts at most a double accidental — `bbb/4` is a
 * B double-flat and `bbbb/4` is rejected outright — so a pitch spelled past
 * that is respelled before it reaches the staff. The analysis keeps the true
 * spelling; only the engraving is simplified, which is what a copyist does
 * with the same chord.
 */
function engravable(pitch: Pitch): string {
  return vexKey(simplifySpelling(pitch));
}

function toStaveNote(note: ScoreNote, clef: Clef, ink: string): StaveNote {
  const isRest = note.pitches.length === 0;
  const staveNote = new StaveNote({
    keys: isRest ? [REST_KEY[clef]] : note.pitches.map(engravable),
    duration: BASE_TO_VEX[note.value.base] + (isRest ? 'r' : ''),
    clef,
  });
  for (let i = 0; i < note.value.dots; i++) Dot.buildAndAttach([staveNote], { all: true });
  // A note's own colour wins, so marking a performance against the score
  // works the same way the default ink does.
  const colour = note.colour ?? ink;
  staveNote.setStyle({ fillStyle: colour, strokeStyle: colour });
  // A ledger line is styled separately from the note it belongs to and keeps
  // VexFlow's own grey otherwise. Middle C in the treble clef is the commonest
  // ledger-line note there is, and against a dark background that grey is
  // nearly invisible. Merged rather than replaced so the line width survives.
  staveNote.setLedgerLineStyle({
    ...staveNote.getLedgerLineStyle(),
    fillStyle: colour,
    strokeStyle: colour,
  });
  return staveNote;
}

/** Total ticks, so the voice can be told how much music it is holding. */
function totalTicks(notes: readonly ScoreNote[]): number {
  return notes.reduce((sum, n) => sum + ticksOf(n.value), 0);
}

/**
 * Draw a single stave into `container`, replacing whatever was there.
 *
 * The caller decides the height. An earlier version claimed to return the
 * height actually used, and returned the height it had been handed — which is
 * the caller's guess echoed back, and worse than no answer because it reads
 * like a measurement. Reporting a real one needs the laid-out bounding box,
 * and will matter when a score breaks across systems rather than sitting on
 * one stave; until then there is nothing to report.
 */
export function drawScore(
  container: HTMLDivElement, spec: ScoreSpec, options: DrawOptions,
): ScoreLayout {
  container.replaceChildren();

  const height = options.height ?? DEFAULT_SCORE_HEIGHT;
  const ink = options.colour ?? '#000000';
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(options.width, height);
  const context = renderer.getContext();
  context.setFillStyle(ink);
  context.setStrokeStyle(ink);

  const stave = new Stave(10, 20, options.width - 20);
  stave.setStyle({ fillStyle: ink, strokeStyle: ink });
  stave.addClef(spec.clef);
  if (spec.key) stave.addKeySignature(vexKeySignature(spec.key));
  if (spec.timeSignature) {
    stave.addTimeSignature(`${spec.timeSignature.numerator}/${spec.timeSignature.denominator}`);
  }
  stave.setContext(context).draw();

  // A stave with a signature and nothing on it is a legitimate thing to
  // draw — it is the whole question a key-signature exercise asks — so an
  // empty note list gets the clef, the signature and the barlines rather than
  // an early return and a blank box.
  const staveGeometry = {
    x: stave.getX(),
    top: stave.getYForLine(0),
    bottom: stave.getYForLine(4),
    width: stave.getWidth(),
    notesStartX: stave.getNoteStartX(),
  };
  if (spec.notes.length === 0) return { notes: [], stave: staveGeometry };

  const staveNotes = spec.notes.map((n) => toStaveNote(n, spec.clef, ink));

  // VexFlow is told how many beats it is holding rather than being allowed to
  // infer it, so a deliberately partial bar — a scale, an interval pair — draws
  // instead of being rejected as the wrong length.
  const voice = new Voice({
    numBeats: totalTicks(spec.notes),
    beatValue: ticksOf({ base: 'q', dots: 0 }) * 4,
  }).setStrict(false);
  /*
    Barlines, where the spec says how long a bar is.

    A progression's chords were drawn as an unbroken row of whole
    notes, so four bars of harmony read as four chords floating on one
    stave with nothing to say where a bar ended — and a bar holding two
    chords looked exactly like two bars holding one each. The user asked
    for the lines; the information was already here in `timeSignature`
    and nothing drew it.

    Inserted as tickables between the notes rather than by splitting
    into several staves: one stave is what every caller expects back,
    and `NotePlacement` indices are read by the cursor and the per-note
    marking, so the notes must stay a single countable sequence.
    `BarNote` takes no time, which is why the voice's beat count below
    is unaffected.

    Only between bars, never before the first note or after the last:
    the stave draws its own ends.
  */
  const tickables: Array<StaveNote | BarNote> = [];
  const barTicks = spec.barTicks ?? spec.timeSignature?.barTicks;
  let intoBar = 0;
  spec.notes.forEach((note, i) => {
    if (barTicks !== undefined && i > 0 && intoBar % barTicks === 0) {
      tickables.push(new BarNote());
    }
    tickables.push(staveNotes[i]);
    intoBar += ticksOf(note.value);
  });
  voice.addTickables(tickables);

  // Accidentals come from the key signature, so a note already carried by the
  // signature is not marked again and a departure from it is.
  Accidental.applyAccidentals([voice], spec.key ? vexKeySignature(spec.key) : 'C');

  // Tuplets are built before formatting, because the bracket participates in
  // the layout rather than being drawn over it afterwards.
  const tuplets: Tuplet[] = [];
  const groups = new Map<number, StaveNote[]>();
  spec.notes.forEach((note, i) => {
    if (!note.tuplet) return;
    const list = groups.get(note.tuplet.id) ?? [];
    list.push(staveNotes[i]);
    groups.set(note.tuplet.id, list);
  });
  for (const [id, members] of [...groups].sort((a, b) => a[0] - b[0])) {
    const ratio = spec.notes.find((n) => n.tuplet?.id === id)!.tuplet!;
    tuplets.push(new Tuplet(members, {
      numNotes: ratio.count,
      notesOccupied: ratio.inTheTimeOf,
    }));
  }

  const beams = Beam.generateBeams(staveNotes.filter((n) => !n.isRest()));
  new Formatter().joinVoices([voice]).format([voice], options.width - 90);
  voice.draw(context, stave);
  for (const beam of beams) {
    beam.setStyle({ fillStyle: ink, strokeStyle: ink });
    beam.setContext(context).draw();
  }
  for (const tuplet of tuplets) {
    tuplet.setStyle({ fillStyle: ink, strokeStyle: ink });
    tuplet.setContext(context).draw();
  }

  // Read after drawing, because formatting is what decides these and it has
  // only just run.
  return {
    notes: staveNotes.map((note, index) => ({ index, x: note.getAbsoluteX() })),
    stave: staveGeometry,
  };
}
