import { useMemo, useState } from 'react';
import { Score } from '../notation/Score';
import { entryFor } from '../menu';
import type { Clef } from '../../exercises/render/toVexflow';
import { Actions, Panel, Picker, Readout } from '../controls';
import { usePlayer } from '../sound';
import { pitchName } from '../../theory/pitch';
import { SCALE_TYPES, degreeLabel, spellScale } from '../../theory/scale';
import { noteValue } from '../../theory/meter';
import { CLEFS, OCTAVES, signatureKey, tonicFor, tonicOptions } from './options';

const FAMILIES = ['common', 'mode', 'pentatonic', 'symmetric', 'exotic'] as const;

/** Title and lede come from the menu, so the card and this page cannot drift. */
const entry = entryFor('scales');

export function Scales() {
  const [tonicName, setTonicName] = useState('C');
  const [scaleId, setScaleId] = useState('major');
  const [clef, setClef] = useState<Clef>('treble');
  const [octave, setOctave] = useState(4);
  const play = usePlayer();

  const tonicPitch = tonicFor(tonicName);
  const type = SCALE_TYPES.find((s) => s.id === scaleId)!;
  /*
    The signature of the scale on screen, not of a key chosen beside it.
    Picking a *key* here and a scale separately let the two disagree: A♭
    minor with the major scale drew seven flats over A♭ major and then three
    naturals to take them back, which is not how anyone writes A♭ major.
    Most scales have no signature at all, and `undefined` says so.
  */
  const key = signatureKey(tonicPitch, scaleId);

  const pitches = useMemo(() => {
    const tonic = { ...tonicPitch, octave };
    const one = spellScale(tonic, type);
    // Close the octave, so it sounds finished rather than cut off.
    return [...one, { ...one[0], octave: one[0].octave + 1 }];
  }, [tonicPitch, type, octave]);

  const notes = useMemo(
    () => pitches.map((p) => ({ pitches: [p], value: noteValue('q') })),
    [pitches],
  );
  const spec = useMemo(() => ({ notes, clef, key }), [notes, clef, key]);

  return (
    <>
      <header>
        <h1>{entry.name}</h1>
        <p className="lede">{entry.lede}</p>
      </header>

      <Panel>
        {/* Annotated with the signature this tonic gives *this* scale, so the
            number beside the name is the number on the stave. */}
        <Picker label="Tonic" value={tonicName} onChange={setTonicName}
                options={tonicOptions(scaleId)} />
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
        title={`${tonicName} ${type.name}`}
        items={pitches.map((p, i) => ({
          primary: pitchName(p),
          secondary: i === pitches.length - 1 ? '8' : degreeLabel(type, i),
        }))}
      />
    </>
  );
}
