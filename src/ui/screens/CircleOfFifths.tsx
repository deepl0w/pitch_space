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
 * One or two names centred in a wedge, stacked when there are two.
 *
 * `dy` on the first tspan rather than on the text element, because shifting
 * the text shifts the anchor too and the pair ends up off-centre.
 */
function WedgeNames({ x, y, names, className }: {
  x: number; y: number; names: string[]; className: string;
}) {
  if (names.length === 1) {
    return <text x={x} y={y} className={className}>{names[0]}</text>;
  }
  return (
    <text x={x} y={y} className={className}>
      {names.map((name, i) => (
        <tspan key={name} x={x} dy={i === 0 ? -5.5 : 11}>{name}</tspan>
      ))}
    </text>
  );
}

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
            const [sx, sy] = polar(OUTER - 11, position.index * WEDGE);
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
                    positions carry two spellings, and "B / C♭" is wider than a
                    thirty-degree wedge at this radius however small the type
                    gets — so the enharmonic twin goes on its own line. */}
                <WedgeNames x={mx} y={my} className="wedge-label"
                            names={position.major.map((k) => keyName(k).replace(' major', ''))} />
                <WedgeNames x={nx} y={ny} className="wedge-label wedge-label-minor"
                            names={position.minor.map((k) => `${keyName(k).replace(' minor', '')}m`)} />
                <text x={sx} y={sy} className="wedge-signature">{signatureText(major)}</text>
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
