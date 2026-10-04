import { useMemo, useState } from 'react';
import { entryFor } from '../menu';
import { Actions, Panel, Picker, Readout } from '../controls';
import { usePlayer } from '../sound';
import { Score } from '../notation/Score';
import {
  CIRCLE, RELATION_LABELS, type Relation, neighboursOf, relationBetween,
} from '../../theory/circle';
import { ALL_KEYS, type Key, keyId, keyName, signatureLetters } from '../../theory/key';
import { chordSymbol, spellChord } from '../../theory/chord';
import {
  DIATONIC_SEVENTHS, DIATONIC_TRIADS, type Degree, numeral, numeralText, realizeNumeral,
} from '../../theory/roman';
import { noteValue } from '../../theory/meter';

const entry = entryFor('circle');
const DEGREES: Degree[] = [1, 2, 3, 4, 5, 6, 7];

/** Geometry. Index 0 sits at twelve o'clock and the wheel runs clockwise. */
const OUTER = 150;
const MIDDLE = 103;
const INNER = 58;
const WEDGE = 30;

function polar(radius: number, degrees: number): [number, number] {
  const rad = ((degrees - 90) * Math.PI) / 180;
  return [radius * Math.cos(rad), radius * Math.sin(rad)];
}

/** One ring segment, as an annulus sector. */
function wedgePath(index: number, rOuter: number, rInner: number): string {
  const from = index * WEDGE - WEDGE / 2;
  const to = index * WEDGE + WEDGE / 2;
  const [ax, ay] = polar(rOuter, from);
  const [bx, by] = polar(rOuter, to);
  const [cx, cy] = polar(rInner, to);
  const [dx, dy] = polar(rInner, from);
  return `M${ax} ${ay} A${rOuter} ${rOuter} 0 0 1 ${bx} ${by} `
    + `L${cx} ${cy} A${rInner} ${rInner} 0 0 0 ${dx} ${dy} Z`;
}

function signatureText(key: Key): string {
  if (key.accidentals === 0) return '—';
  return `${Math.abs(key.accidentals)}${key.accidentals > 0 ? '♯' : '♭'}`;
}

/**
 * The one or two spellings a wedge names, stacked when there are two.
 *
 * **A signature rides on the same line as the name it belongs to.** It used
 * to be its own ring at `OUTER - 11`, a small superscript outside the names,
 * which works perfectly while every wedge names one key and collides the
 * moment one names two: stacking the names doubled their height and nothing
 * moved the ring. Measured on the three enharmonic wedges, the name block
 * and the signature block overlapped by 8 to 10 pixels at 0 to 6 pixels of
 * horizontal separation — D♭ printed through 5♭, C♯ through 7♯.
 *
 * The geometry forbids the obvious repair. The major annulus is 47px deep;
 * two stacked rows of 11px names need 24 of it and two stacked 8px
 * signatures another 18, so two separately-centred stacks cannot both sit
 * inside the ring with clearance. Pairing each signature with its own name
 * is not the cheaper fix, it is the only one that fits — and it is also the
 * one that says what the screen means, since the whole reason this row
 * exists is that D♭'s five flats are not C♯'s seven sharps.
 *
 * Laid out as one text run with a `tspan`, so the browser centres the pair
 * and no code computes a glyph width. That is what makes the collision
 * impossible rather than guarded: a name and its signature are the same
 * line of text, and a line of text does not overlap itself.
 *
 * Three attempts went the other way, two of them shipped as fixed. A
 * hardcoded 11px gap collided under 11px type; `em` on a `dy` attribute
 * replaced it and changed nothing on the page; separate `text` elements at
 * explicit `y` fixed the names and left this. Each one tested the thing it
 * changed instead of the thing that had to be true, which is why the test
 * beside this now checks every pair of labels in a wedge for overlap rather
 * than checking that the pair it just moved has different coordinates.
 */
const ROW_SIZE = { major: 11, minor: 9.5 } as const;

/**
 * How tall a line of this type actually draws, as a multiple of its size.
 *
 * Measured, not assumed: `getBBox().height / font-size` in Chrome is 1.4
 * for every label on this screen, at both sizes. The obvious guess is 1.0,
 * and a 1.25em gap built on that guess left the three stacked pairs
 * touching by 1.7px — invisible to a test that used the same wrong
 * constant, visible in the browser. Exported so the test models the glyph
 * the way the browser draws it rather than the way the gap hopes it does.
 */
export const GLYPH_HEIGHT = 1.4;

export type WedgeRow = keyof typeof ROW_SIZE;

/** A line of a wedge: what it names, and the signature that name carries. */
export interface WedgeLine {
  text: string;
  signature?: string;
}

function WedgeLabel({ x, y, lines, row, className }: {
  x: number; y: number; lines: WedgeLine[]; row: WedgeRow; className: string;
}) {
  const size = ROW_SIZE[row];
  // Centred on `y` as a block: a single line sits on it, a pair straddles
  // it, so growing a twin does not shift the wedges that have none.
  const gap = size * (GLYPH_HEIGHT + 0.15);
  const offset = (i: number) => (lines.length === 1 ? 0 : (i === 0 ? -gap / 2 : gap / 2));
  return (
    <>
      {lines.map((line, i) => (
        <text key={i} x={x} y={y + offset(i)} fontSize={size} className={className}>
          {line.text}
          {line.signature !== undefined && (
            <tspan className="wedge-signature" fontSize={SIGNATURE_SIZE}>
              {'\u2009'}{line.signature}
            </tspan>
          )}
        </text>
      ))}
    </>
  );
}

/** Small enough to read as an annotation, large enough to read at all. */
const SIGNATURE_SIZE = 8;

export function CircleOfFifths() {
  const [selectedId, setSelectedId] = useState('C_major');
  const [sevenths, setSevenths] = useState(false);
  const play = usePlayer();

  const selected = ALL_KEYS.find((k) => keyId(k) === selectedId)!;

  const chords = useMemo(() => {
    const table = selected.mode === 'major'
      ? (sevenths ? DIATONIC_SEVENTHS.major : DIATONIC_TRIADS.major)
      : (sevenths ? DIATONIC_SEVENTHS.minor : DIATONIC_TRIADS.minor);
    const tonic = { ...selected.tonic, octave: 4 };
    return DEGREES.map((d) => {
      const n = numeral(d, table[d - 1]);
      return { numeral: n, chord: realizeNumeral({ ...selected, tonic }, n) };
    });
  }, [selected, sevenths]);

  const notes = useMemo(
    () => chords.map(({ chord }) => ({ pitches: spellChord(chord), value: noteValue('h') })),
    [chords],
  );
  const spec = useMemo(() => ({ notes, clef: 'treble' as const, key: selected }), [notes, selected]);
  const related = useMemo(() => neighboursOf(selected), [selected]);

  function classFor(key: Key): string {
    const relation: Relation = relationBetween(selected, key);
    return `wedge wedge-${relation}`;
  }

  return (
    <>
      <header>
        <h1>{entry.name}</h1>
        <p className="lede">{entry.lede}</p>
      </header>

      <div className="circle-layout">
        <svg viewBox="-168 -168 336 336" className="circle" role="img"
             aria-label="The circle of fifths. Major keys outside, their relative minors inside.">
          {CIRCLE.map((position) => {
            const major = position.major[0];
            const minor = position.minor[0];
            const [mx, my] = polar((OUTER + MIDDLE) / 2, position.index * WEDGE);
            const [nx, ny] = polar((MIDDLE + INNER) / 2, position.index * WEDGE);
            return (
              <g key={position.index}>
                <path
                  className={classFor(major)}
                  d={wedgePath(position.index, OUTER, MIDDLE)}
                  onClick={() => setSelectedId(keyId(major))}
                />
                <path
                  className={classFor(minor)}
                  d={wedgePath(position.index, MIDDLE, INNER)}
                  onClick={() => setSelectedId(keyId(minor))}
                />
                {/* Stacked rather than joined by a slash. Three of the twelve
                    positions carry two spellings, and "B♭ / C♭ 7♭" is wider
                    than a thirty-degree wedge at this radius however small
                    the type gets — so the enharmonic twin goes on its own
                    line, with its own signature beside it.

                    One signature per spelling, and on the spelling's own
                    line. A wedge is a position, but a position is not a
                    signature where two keys share it: D♭ has five flats and
                    C♯ seven sharps, and printing only the first taught the
                    second as a fact about the first. On a screen whose job
                    is teaching key signatures, that is the one thing it must
                    not do. */}
                <WedgeLabel x={mx} y={my} row="major" className="wedge-label"
                            lines={position.major.map((k) => ({
                              text: keyName(k).replace(' major', ''),
                              signature: signatureText(k),
                            }))} />
                <WedgeLabel x={nx} y={ny} row="minor" className="wedge-label wedge-label-minor"
                            lines={position.minor.map((k) => ({
                              text: `${keyName(k).replace(' minor', '')}m`,
                            }))} />
              </g>
            );
          })}
          <text x={0} y={-4} className="circle-centre">{keyName(selected)}</text>
          <text x={0} y={12} className="circle-centre circle-centre-small">
            {signatureLetters(selected).length === 0
              ? 'no sharps or flats'
              : signatureLetters(selected).join(' ')}
          </text>
        </svg>

        <div className="circle-side">
          <h2>Related keys</h2>
          <ul className="relations">
            {related.map(({ key, relation }) => (
              <li key={keyId(key)}>
                <button className={`relation relation-${relation}`} onClick={() => setSelectedId(keyId(key))}>
                  <span className="relation-name">{keyName(key)}</span>
                  <span className="relation-kind">{RELATION_LABELS[relation]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Panel>
        <Picker
          label="Chords"
          value={sevenths ? 'sevenths' : 'triads'}
          onChange={(v) => setSevenths(v === 'sevenths')}
          options={[{ value: 'triads', label: 'Triads' }, { value: 'sevenths', label: 'Sevenths' }]}
        />
      </Panel>

      <Score spec={spec} />

      <Actions>
        <button onClick={() => play(notes)}>Play each chord</button>
        <button onClick={() => play(notes, { rolled: true })}>Roll each chord</button>
      </Actions>

      <Readout
        title={`Chords in ${keyName(selected)}`}
        items={chords.map(({ numeral: n, chord }) => ({
          primary: numeralText(n),
          secondary: chordSymbol(chord),
        }))}
      />
    </>
  );
}
