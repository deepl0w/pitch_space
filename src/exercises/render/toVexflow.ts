import {
  Accidental, Beam, Dot, Formatter, Renderer, Stave, StaveNote, Voice,
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
}

export interface ScoreSpec {
  notes: readonly ScoreNote[];
  clef: Clef;
  key?: Key;
  timeSignature?: TimeSignature;
}

export interface DrawOptions {
  width: number;
  /** Drawn at this many pixels; the caller scales for device pixel ratio. */
  height?: number;
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

function toStaveNote(note: ScoreNote, clef: Clef): StaveNote {
  const isRest = note.pitches.length === 0;
  const staveNote = new StaveNote({
    keys: isRest ? [REST_KEY[clef]] : note.pitches.map(engravable),
    duration: BASE_TO_VEX[note.value.base] + (isRest ? 'r' : ''),
    clef,
  });
  for (let i = 0; i < note.value.dots; i++) Dot.buildAndAttach([staveNote], { all: true });
  if (note.colour) {
    staveNote.setStyle({ fillStyle: note.colour, strokeStyle: note.colour });
  }
  return staveNote;
}

/** Total ticks, so the voice can be told how much music it is holding. */
function totalTicks(notes: readonly ScoreNote[]): number {
  return notes.reduce((sum, n) => sum + ticksOf(n.value), 0);
}

/**
 * Draw a single stave into `container`, replacing whatever was there.
 *
 * Returns the height actually used, because the caller cannot know it until
 * the stave has been laid out and a notation view that guesses leaves either a
 * clipped staff or a gap.
 */
export function drawScore(container: HTMLDivElement, spec: ScoreSpec, options: DrawOptions): number {
  container.replaceChildren();
  if (spec.notes.length === 0) return 0;

  const height = options.height ?? 160;
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(options.width, height);
  const context = renderer.getContext();

  const stave = new Stave(10, 20, options.width - 20);
  stave.addClef(spec.clef);
  if (spec.key) stave.addKeySignature(vexKeySignature(spec.key));
  if (spec.timeSignature) {
    stave.addTimeSignature(`${spec.timeSignature.numerator}/${spec.timeSignature.denominator}`);
  }
  stave.setContext(context).draw();

  const staveNotes = spec.notes.map((n) => toStaveNote(n, spec.clef));

  // VexFlow is told how many beats it is holding rather than being allowed to
  // infer it, so a deliberately partial bar — a scale, an interval pair — draws
  // instead of being rejected as the wrong length.
  const voice = new Voice({
    numBeats: totalTicks(spec.notes),
    beatValue: ticksOf({ base: 'q', dots: 0 }) * 4,
  }).setStrict(false);
  voice.addTickables(staveNotes);

  // Accidentals come from the key signature, so a note already carried by the
  // signature is not marked again and a departure from it is.
  Accidental.applyAccidentals([voice], spec.key ? vexKeySignature(spec.key) : 'C');

  const beams = Beam.generateBeams(staveNotes.filter((n) => !n.isRest()));
  new Formatter().joinVoices([voice]).format([voice], options.width - 90);
  voice.draw(context, stave);
  for (const beam of beams) beam.setContext(context).draw();

  return height;
}
