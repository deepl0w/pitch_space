import { useMemo, useState } from 'react';
import { Score } from '../notation/Score';
import { DiagramPicker, InstrumentDiagram } from '../notation/InstrumentDiagram';
import { entryFor } from '../menu';
import type { Clef } from '../../exercises/render/toVexflow';
import { Actions, Panel, Picker, Readout } from '../controls';
import { usePlayer } from '../sound';
import { midiOf, pitchName, simplifySpelling } from '../../theory/pitch';
import { ALL_KEYS, keyId } from '../../theory/key';
import { CHORD_TYPES, INVERSION_LABELS, chord, chordSymbol, voiceChord } from '../../theory/chord';
import { noteValue } from '../../theory/meter';
import { CLEFS, OCTAVES, keyOptions } from './options';

const FAMILIES = ['triad', 'seventh', 'sixth', 'sus', 'extended', 'altered'] as const;

/** Title and lede come from the menu, so the card and this page cannot drift. */
const entry = entryFor('chords');

function opening(focus: string | undefined): { chordId: string; inversion: number } {
  const [id, inv] = (focus ?? '').split(':');
  const type = CHORD_TYPES.find((c) => c.id === id);
  if (!type) return { chordId: 'maj7', inversion: 0 };
  const n = inv?.startsWith('inv') ? Number(inv.slice(3)) : 0;
  return { chordId: type.id, inversion: n > 0 && n < type.semitones.length ? n : 0 };
}

/**
 * `focus` is a chord id with its inversion if it has one — `dom7:inv2` — from
 * `ui/reference.ts`; it decides where the page starts and nothing after.
 */
export function Chords({ focus }: { focus?: string }) {
  const [start] = useState(() => opening(focus));
  const [rootKey, setRootKey] = useState('C_major');
  const [chordId, setChordId] = useState(start.chordId);
  const [inversion, setInversion] = useState(start.inversion);
  const [open, setOpen] = useState(false);
  const [clef, setClef] = useState<Clef>('treble');
  const [octave, setOctave] = useState(4);
  const play = usePlayer();

  const type = CHORD_TYPES.find((c) => c.id === chordId)!;
  const built = useMemo(() => {
    const root = { ...ALL_KEYS.find((k) => keyId(k) === rootKey)!.tonic, octave };
    return chord(root, type, Math.min(inversion, type.semitones.length - 1));
  }, [rootKey, octave, type, inversion]);

  const pitches = useMemo(() => voiceChord(built, { open }), [built, open]);
  const notes = useMemo(() => [{ pitches, value: noteValue('w') }], [pitches]);
  const spec = useMemo(() => ({ notes, clef }), [notes, clef]);

  return (
    <>
      <header>
        <h1>{entry.name}</h1>
        <p className="lede">{entry.lede}</p>
      </header>

      <Panel>
        <Picker label="Root" value={rootKey} onChange={setRootKey} options={keyOptions()} />
        <Picker
          label="Chord"
          value={chordId}
          onChange={setChordId}
          options={FAMILIES.flatMap((family) =>
            CHORD_TYPES.filter((c) => c.family === family)
              .map((c) => ({ value: c.id, label: c.name })))}
        />
        <Picker
          label="Inversion"
          value={inversion}
          onChange={setInversion}
          options={type.semitones.map((_, i) => ({ value: i, label: INVERSION_LABELS[i] }))}
        />
        <Picker
          label="Spacing"
          value={open ? 'open' : 'close'}
          onChange={(v) => setOpen(v === 'open')}
          options={[
            { value: 'close', label: 'Close' },
            { value: 'open', label: 'Open (drop 2)' },
          ]}
        />
        <Picker label="Clef" value={clef} onChange={setClef} options={CLEFS} />
        <Picker label="Octave" value={octave} onChange={setOctave} options={OCTAVES} />
        <DiagramPicker />
      </Panel>

      <Score spec={spec} />
      <InstrumentDiagram pitches={pitches} root={built.root} label={chordSymbol(built)} marking="map" />

      <Actions>
        <button onClick={() => play(notes)}>Play as a chord</button>
        <button onClick={() => play(notes, { rolled: true })}>Arpeggiate it</button>
        <button onClick={() => play(pitches.map((p) => ({ pitches: [p] })), { gap: 0.45 })}>
          One note at a time
        </button>
      </Actions>

      <Readout
        title={chordSymbol(built)}
        items={pitches.map((p, i) => {
          const engraved = simplifySpelling(p);
          return {
            primary: pitchName(p),
            secondary: engraved.alter !== p.alter
              ? `engraved ${pitchName(engraved)}`
              : i === 0 ? 'bass' : `+${midiOf(p) - midiOf(pitches[0])} semitones`,
          };
        })}
      />
    </>
  );
}
