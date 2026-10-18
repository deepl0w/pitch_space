import { useMemo, useState } from 'react';
import { Score } from '../notation/Score';
import { DiagramPicker, InstrumentDiagram } from '../notation/InstrumentDiagram';
import { useSettings } from '../../state/settingsStore';
import { entryFor } from '../menu';
import type { Clef } from '../../exercises/render/toVexflow';
import { Actions, Panel, Picker, Readout } from '../controls';
import { usePlayer } from '../sound';
import { ALL_KEYS, keyId, keyName } from '../../theory/key';
import { chordSymbol, spellChord } from '../../theory/chord';
import {
  DIATONIC_SEVENTHS, DIATONIC_TRIADS, type Degree, numeral, numeralText, realizeNumeral,
} from '../../theory/roman';
import { noteValue } from '../../theory/meter';
import { CLEFS, OCTAVES, keyOptions } from './options';

const DEGREES: Degree[] = [1, 2, 3, 4, 5, 6, 7];

/** Title and lede come from the menu, so the card and this page cannot drift. */
const entry = entryFor('key-chords');

/**
 * `focus` is a key id, from `ui/reference.ts` when this page is opened from
 * an answer; it decides where the page starts and nothing after.
 */
export function KeyChords({ focus }: { focus?: string }) {
  const [keyIdValue, setKeyIdValue] = useState(
    () => ALL_KEYS.some((k) => keyId(k) === focus) ? focus! : 'C_major',
  );
  const [sevenths, setSevenths] = useState(false);
  // Which of the seven the instrument shows: one neck is readable, seven are not.
  const [shown, setShown] = useState(0);
  const diagram = useSettings((s) => s.doc.appearance.diagram);
  const [clef, setClef] = useState<Clef>('treble');
  const [octave, setOctave] = useState(4);
  const play = usePlayer();

  const key = ALL_KEYS.find((k) => keyId(k) === keyIdValue)!;
  const table = key.mode === 'major'
    ? (sevenths ? DIATONIC_SEVENTHS.major : DIATONIC_TRIADS.major)
    : (sevenths ? DIATONIC_SEVENTHS.minor : DIATONIC_TRIADS.minor);

  const chords = useMemo(() => {
    const tonic = { ...key.tonic, octave };
    return DEGREES.map((d) => {
      const n = numeral(d, table[d - 1]);
      return { numeral: n, chord: realizeNumeral({ ...key, tonic }, n) };
    });
  }, [key, table, octave]);

  const notes = useMemo(
    () => chords.map(({ chord }) => ({ pitches: spellChord(chord), value: noteValue('h') })),
    [chords],
  );
  const spec = useMemo(() => ({ notes, clef, key }), [notes, clef, key]);

  return (
    <>
      <header>
        <h1>{entry.name}</h1>
        <p className="lede">{entry.lede}</p>
      </header>

      <Panel>
        <Picker label="Key" value={keyIdValue} onChange={setKeyIdValue} options={keyOptions()} />
        <Picker
          label="Chords"
          value={sevenths ? 'sevenths' : 'triads'}
          onChange={(v) => setSevenths(v === 'sevenths')}
          options={[
            { value: 'triads', label: 'Triads' },
            { value: 'sevenths', label: 'Sevenths' },
          ]}
        />
        <Picker label="Clef" value={clef} onChange={setClef} options={CLEFS} />
        <Picker label="Octave" value={octave} onChange={setOctave} options={OCTAVES} />
        <DiagramPicker />
        {diagram !== 'none' && (
          <Picker
            label="Chord shown"
            value={shown}
            onChange={setShown}
            options={chords.map(({ numeral: n, chord }, i) => ({
              value: i, label: `${numeralText(n)} — ${chordSymbol(chord)}`,
            }))}
          />
        )}
      </Panel>

      <Score spec={spec} />
      <InstrumentDiagram
        pitches={spellChord(chords[shown].chord)}
        root={chords[shown].chord.root}
        label={chordSymbol(chords[shown].chord)}
      />

      <Actions>
        <button onClick={() => play(notes)}>Play each chord</button>
        <button onClick={() => play(notes, { rolled: true })}>Roll each chord</button>
      </Actions>

      <Readout
        title={`${keyName(key)} — ${sevenths ? 'diatonic sevenths' : 'diatonic triads'}`}
        items={chords.map(({ numeral: n, chord }) => ({
          primary: numeralText(n),
          secondary: chordSymbol(chord),
        }))}
      />
    </>
  );
}
