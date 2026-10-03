import { useMemo, useState } from 'react';
import { Score } from '../notation/Score';
import type { Clef } from '../../exercises/render/toVexflow';
import { Actions, Panel, Picker, Readout } from '../controls';
import { usePlayer } from '../sound';
import { pitchName } from '../../theory/pitch';
import { ALL_KEYS, keyId } from '../../theory/key';
import { SCALE_TYPES, degreeLabel, spellScale } from '../../theory/scale';
import { noteValue } from '../../theory/meter';
import { CLEFS, OCTAVES, keyOptions } from './options';

const FAMILIES = ['common', 'mode', 'pentatonic', 'symmetric', 'exotic'] as const;

export function Scales() {
  const [keyIdValue, setKeyIdValue] = useState('C_major');
  const [scaleId, setScaleId] = useState('major');
  const [clef, setClef] = useState<Clef>('treble');
  const [octave, setOctave] = useState(4);
  const play = usePlayer();

  const key = ALL_KEYS.find((k) => keyId(k) === keyIdValue)!;
  const type = SCALE_TYPES.find((s) => s.id === scaleId)!;

  const pitches = useMemo(() => {
    const tonic = { ...key.tonic, octave };
    const one = spellScale(tonic, type);
    // Close the octave, so it sounds finished rather than cut off.
    return [...one, { ...one[0], octave: one[0].octave + 1 }];
  }, [key, type, octave]);

  const notes = useMemo(
    () => pitches.map((p) => ({ pitches: [p], value: noteValue('q') })),
    [pitches],
  );
  const spec = useMemo(() => ({ notes, clef, key }), [notes, clef, key]);

  return (
    <>
      <header>
        <h1>Scales</h1>
        <p className="lede">
          Twenty scale types in every key, spelled the way the scale requires
          rather than by whichever accidental is nearer.
        </p>
      </header>

      <Panel>
        <Picker label="Key" value={keyIdValue} onChange={setKeyIdValue} options={keyOptions()} />
        <Picker
          label="Scale"
          value={scaleId}
          onChange={setScaleId}
          options={FAMILIES.flatMap((family) =>
            SCALE_TYPES.filter((s) => s.family === family)
              .map((s) => ({ value: s.id, label: s.name })))}
        />
        <Picker label="Clef" value={clef} onChange={setClef} options={CLEFS} />
        <Picker label="Octave" value={octave} onChange={setOctave} options={OCTAVES} />
      </Panel>

      <Score spec={spec} />

      <Actions>
        <button onClick={() => play(notes)}>Play the scale</button>
        <button onClick={() => play([...notes].reverse())}>Play it descending</button>
      </Actions>

      <Readout
        title={`${pitchName(key.tonic, false)} ${type.name}`}
        items={pitches.map((p, i) => ({
          primary: pitchName(p),
          secondary: i === pitches.length - 1 ? '8' : degreeLabel(type, i),
        }))}
      />
    </>
  );
}
