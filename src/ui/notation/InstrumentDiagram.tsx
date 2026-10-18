import { midiOf, pitchName, type Pitch } from '../../theory/pitch';
import type { Diagram } from '../../state/schema';
import { useSettings, settingsStore } from '../../state/settingsStore';
import { Picker } from '../controls';
import {
  FRETS, GUITAR_TUNING, fretPositions, isBlack, keyboardSpan, spelledNames,
} from './instruments';

const pc = (midi: number) => ((midi % 12) + 12) % 12;

const DIAGRAMS: ReadonlyArray<{ value: Diagram; label: string }> = [
  { value: 'none', label: 'Stave only' },
  { value: 'piano', label: 'Piano' },
  { value: 'guitar', label: 'Guitar' },
];

/**
 * Which instrument to draw on, stored as an app preference so it holds on
 * every reference page — a guitarist should not have to ask on each one.
 */
export function DiagramPicker() {
  const diagram = useSettings((s) => s.doc.appearance.diagram);
  return (
    <Picker
      label="Show on"
      value={diagram}
      onChange={(value) => settingsStore.getState().setAppearance({ diagram: value })}
      options={DIAGRAMS}
    />
  );
}

/**
 * The notes on the chosen instrument, beside the stave, or nothing.
 *
 * `root` is drawn in the accent so the shape can be read from where it
 * starts, which is how either instrument is learned.
 */
/**
 * How the guitar marks the notes. `map` is every position of every note by
 * name, for a scale or chord; `sounding` marks only where these exact notes
 * are and dims the other positions, for an interval, whose subject is the
 * distance. Required, not defaulted: a default would be the next page's
 * silent choice. The keyboard always marks the exact notes.
 */
export type Marking = 'map' | 'sounding';

export function InstrumentDiagram({ pitches, root, label, marking }: {
  pitches: readonly Pitch[];
  root: Pitch;
  /** What the notes are, for a screen reader: "C major scale". */
  label: string;
  marking: Marking;
}) {
  const diagram = useSettings((s) => s.doc.appearance.diagram);
  if (diagram === 'none' || pitches.length === 0) return null;
  return diagram === 'piano'
    ? <Keyboard pitches={pitches} root={root} label={label} />
    : <Fretboard pitches={pitches} root={root} label={label} marking={marking} />;
}

const WHITE_W = 24;
const WHITE_H = 96;
const BLACK_W = 14;
const BLACK_H = 60;

/**
 * A keyboard with the exact notes marked — the octave they sound in, not
 * just their names, because on a piano that is where the hand goes.
 */
export function Keyboard({ pitches, root, label }: {
  pitches: readonly Pitch[];
  root: Pitch;
  label: string;
}) {
  const { low, high } = keyboardSpan(pitches);
  const sounding = new Set(pitches.map(midiOf));
  const names = spelledNames(pitches);
  const rootPc = pc(midiOf(root));

  const whites: number[] = [];
  for (let m = low; m <= high; m += 1) if (!isBlack(m)) whites.push(m);
  const xOfWhite = new Map(whites.map((m, i) => [m, i * WHITE_W]));
  const width = whites.length * WHITE_W;

  const dot = (midi: number, x: number, y: number) => (
    <g key={`dot-${midi}`} className={pc(midi) === rootPc ? 'diagram-root' : 'diagram-note'}>
      <circle cx={x} cy={y} r={8} />
      <text x={x} y={y + 3.5} textAnchor="middle">{names.get(pc(midi))}</text>
    </g>
  );

  return (
    <figure className="diagram">
      <svg
        viewBox={`-1 -1 ${width + 2} ${WHITE_H + 2}`}
        role="img"
        aria-label={`${label} on a piano keyboard`}
        className="diagram-keyboard"
      >
        {whites.map((m) => (
          <rect key={m} className="key-white" x={xOfWhite.get(m)} y={0}
                width={WHITE_W} height={WHITE_H} rx={2} />
        ))}
        {Array.from({ length: high - low + 1 }, (_, i) => low + i).filter(isBlack).map((m) => (
          <rect key={m} className="key-black" x={xOfWhite.get(m - 1)! + WHITE_W - BLACK_W / 2}
                y={0} width={BLACK_W} height={BLACK_H} rx={2} />
        ))}
        {[...sounding].map((m) => (isBlack(m)
          ? dot(m, xOfWhite.get(m - 1)! + WHITE_W, BLACK_H - 12)
          : dot(m, xOfWhite.get(m)! + WHITE_W / 2, WHITE_H - 14)))}
      </svg>
    </figure>
  );
}

const FRET_W = 40;
const STRING_GAP = 18;
const NUT_X = 28;
const MARKERS = [3, 5, 7, 9, 12];

/**
 * A guitar neck with every place these notes fall, to the twelfth fret.
 *
 * Highest string at the top, as a guitarist looking down at the neck sees it
 * and as tablature writes it.
 */
export function Fretboard({ pitches, root, label, marking }: {
  pitches: readonly Pitch[];
  root: Pitch;
  label: string;
  marking: Marking;
}) {
  const names = spelledNames(pitches);
  const rootPc = pc(midiOf(root));
  const sounding = new Set(pitches.map(midiOf));
  /*
    A sounding note the neck cannot reach — below the low E, or past the
    twelfth fret — has no position to mark, and a diagram with nothing
    marked reads as one that failed to draw. Said in words instead, which
    teaches something true about the instrument.
  */
  //
  // Judged by the positions themselves, not by the neck's lowest and
  // highest notes: those agree only while adjacent strings overlap, which
  // standard tuning does and a wide alternate tuning need not (architect).
  const positions = fretPositions(pitches);
  const reachable = new Set(positions.map((at) => at.midi));
  const lowest = GUITAR_TUNING[0];
  const offNeck = marking === 'sounding'
    ? [...new Map(pitches.map((p) => [midiOf(p), p])).values()]
      .filter((p) => !reachable.has(midiOf(p)))
    : [];
  const classOf = ({ pitchClass, midi }: { pitchClass: number; midi: number }) => {
    if (marking === 'map') return pitchClass === rootPc ? 'diagram-root' : 'diagram-note';
    if (!sounding.has(midi)) return 'diagram-dim';
    return midi === midiOf(root) ? 'diagram-root' : 'diagram-note';
  };
  const strings = GUITAR_TUNING.length;
  const yOf = (string: number) => 14 + (strings - 1 - string) * STRING_GAP;
  const xOfFret = (fret: number) => NUT_X + fret * FRET_W;
  const width = xOfFret(FRETS) + 8;
  const height = yOf(0) + 24;

  return (
    <figure className="diagram">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label} on a guitar neck, standard tuning, to the twelfth fret`}
        className="diagram-fretboard"
      >
        {Array.from({ length: FRETS }, (_, i) => i + 1).map((fret) => (
          <line key={`f${fret}`} className="fret" x1={xOfFret(fret)} x2={xOfFret(fret)}
                y1={yOf(strings - 1)} y2={yOf(0)} />
        ))}
        <line className="nut" x1={NUT_X} x2={NUT_X} y1={yOf(strings - 1)} y2={yOf(0)} />
        {GUITAR_TUNING.map((_, string) => (
          <line key={`s${string}`} className="string" x1={NUT_X} x2={xOfFret(FRETS)}
                y1={yOf(string)} y2={yOf(string)} />
        ))}
        {MARKERS.map((fret) => (
          <text key={`m${fret}`} className="fret-number" x={xOfFret(fret) - FRET_W / 2}
                y={height - 4} textAnchor="middle">{fret}</text>
        ))}
        {positions.map(({ string, fret, pitchClass, midi }) => {
          // An open string sits behind the nut; a fretted note between frets.
          const x = fret === 0 ? NUT_X - 14 : xOfFret(fret) - FRET_W / 2;
          return (
            <g key={`${string}-${fret}`} className={classOf({ pitchClass, midi })}
               data-at={`${string}-${fret}`}>
              <circle cx={x} cy={yOf(string)} r={8} />
              <text x={x} y={yOf(string) + 3.5} textAnchor="middle">{names.get(pitchClass)}</text>
            </g>
          );
        })}
      </svg>
      {offNeck.length > 0 && (
        <figcaption className="secondary">
          {offNeck.map((p) => `${pitchName(p)} is ${midiOf(p) < lowest
            ? 'below the lowest string'
            : midiOf(p) > GUITAR_TUNING[GUITAR_TUNING.length - 1] + FRETS
              ? 'above the twelfth fret' : 'between the strings\' reach'}`).join('; ')}
          {' '}— not on this neck, so only its other places are shown.
        </figcaption>
      )}
    </figure>
  );
}
