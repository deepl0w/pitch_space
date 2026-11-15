import { useMemo, useState } from 'react';
import { Score } from '../notation/Score';
import { usePlayAlong } from '../notation/follow';
import { DiagramPicker, InstrumentDiagram } from '../notation/InstrumentDiagram';
import { useSettings } from '../../state/settingsStore';
import { entryFor } from '../menu';
import type { Clef } from '../../exercises/render/toVexflow';
import { Actions, Panel, Picker, Readout } from '../controls';
import { followSynth, usePlayer } from '../sound';
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
 * `focus` is a key id and `mark` a numeral, from `ui/reference.ts` when this
 * page is opened from an answer: the key the question was in, and the chord
 * it was about. They decide where the page starts and nothing after.
 */
export function KeyChords({ focus, mark }: { focus?: string; mark?: string }) {
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
  const follow = usePlayAlong(followSynth);

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

  /*
    The chord the question was about, among the seven, or none.

    Matched as the numeral is written, so a numeral the key does not
    supply — V/V, bVII, the harmonic minor's V — marks nothing rather than
    the diatonic chord on its degree, which would be a different chord
    claiming to be the one asked. Seventh chords are written differently
    from triads, so switching to sevenths takes the mark off; it is a
    triad that was asked.
  */
  const marked = chords.findIndex(({ numeral: n }) => numeralText(n) === mark);
  const markedAt = marked < 0 ? null : marked;
  // Shown on the instrument from the start, once, when there is one.
  const [shownSeeded, setShownSeeded] = useState(false);
  if (!shownSeeded && markedAt !== null) {
    setShownSeeded(true);
    setShown(markedAt);
  }

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

      <Score spec={spec} lit={follow.lit ?? markedAt} cursorX={follow.cursorX} onLayout={follow.onLayout} />
      <InstrumentDiagram
        pitches={spellChord(chords[shown].chord)}
        root={chords[shown].chord.root}
        label={chordSymbol(chords[shown].chord)}
        marking="map"
      />

      <Actions>
        <button onClick={() => follow.along(play(notes), notes.map((_, i) => i))}>
          Play each chord
        </button>
        <button onClick={() => follow.along(play(notes, { rolled: true }), notes.map((_, i) => i))}>
          Roll each chord
        </button>
      </Actions>

      <Readout
        title={`${keyName(key)} — ${sevenths ? 'diatonic sevenths' : 'diatonic triads'}`}
        items={chords.map(({ numeral: n, chord }, i) => ({
          primary: numeralText(n),
          secondary: i === markedAt ? `${chordSymbol(chord)} · the one asked` : chordSymbol(chord),
        }))}
      />
    </>
  );
}
