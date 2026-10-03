import { useMemo, useRef, useState } from 'react';
import { Score } from './ui/notation/Score';
import type { ScoreNote, Clef } from './exercises/render/toVexflow';
import { Synth, type Voice } from './audio/output/synth';
import { midiOf, pitchName, simplifySpelling } from './theory/pitch';
import { ALL_KEYS, type Key, keyId, keyName } from './theory/key';
import { SCALE_TYPES, degreeLabel, spellScale } from './theory/scale';
import { CHORD_TYPES, chord, chordSymbol, spellChord, voiceChord } from './theory/chord';
import { DIATONIC_SEVENTHS, DIATONIC_TRIADS, type Degree, numeral, numeralText, realizeNumeral } from './theory/roman';
import { noteValue } from './theory/meter';

type Subject = 'scale' | 'chord' | 'diatonic';

const DEGREES: Degree[] = [1, 2, 3, 4, 5, 6, 7];
const synth = new Synth();

export default function App() {
  const [keyIdValue, setKeyIdValue] = useState('C_major');
  const [subject, setSubject] = useState<Subject>('scale');
  const [scaleId, setScaleId] = useState('major');
  const [chordId, setChordId] = useState('maj7');
  const [inversion, setInversion] = useState(0);
  const [sevenths, setSevenths] = useState(false);
  const [clef, setClef] = useState<Clef>('treble');
  const [octave, setOctave] = useState(4);
  const playing = useRef(false);

  const key: Key = useMemo(
    () => ALL_KEYS.find((k) => keyId(k) === keyIdValue)!,
    [keyIdValue],
  );

  const view = useMemo(
    () => buildView({ key, subject, scaleId, chordId, inversion, sevenths, octave }),
    [key, subject, scaleId, chordId, inversion, sevenths, octave],
  );

  // Score redraws when the spec's identity changes, so building it inline in
  // the JSX would re-engrave the whole staff on every render of this
  // component — including the ones caused by opening a select.
  const scoreSpec = useMemo(
    () => ({ notes: view.notes, clef, key }),
    [view, clef, key],
  );

  function play(mode: 'together' | 'spread') {
    if (playing.current) return;
    playing.current = true;
    setTimeout(() => { playing.current = false; }, 300);
    const step = mode === 'together' ? 0 : 0.42;
    const voices: Voice[] = [];
    view.notes.forEach((note, index) => {
      for (const pitch of note.pitches) {
        voices.push({
          midi: midiOf(pitch),
          start: index * (step || 0.9),
          duration: step ? 0.5 : 1.6,
        });
      }
    });
    synth.play(voices);
  }

  return (
    <main>
      <header>
        <h1>Music Practice <span className="tag">workbench</span></h1>
        <p className="lede">
          The theory core, rendered and sounded. Nothing here is an exercise yet —
          this is the bench the generator gets built against.
        </p>
      </header>

      <section className="panel">
        <Field label="Key">
          <select value={keyIdValue} onChange={(e) => setKeyIdValue(e.target.value)}>
            {ALL_KEYS.map((k) => (
              <option key={keyId(k)} value={keyId(k)}>
                {keyName(k)} ({signature(k)})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Show">
          <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
            <option value="scale">A scale</option>
            <option value="chord">One chord</option>
            <option value="diatonic">Every chord in the key</option>
          </select>
        </Field>

        {subject === 'scale' && (
          <Field label="Scale">
            <select value={scaleId} onChange={(e) => setScaleId(e.target.value)}>
              {SCALE_TYPES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}

        {subject === 'chord' && (
          <>
            <Field label="Chord">
              <select value={chordId} onChange={(e) => setChordId(e.target.value)}>
                {CHORD_TYPES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Inversion">
              <select value={inversion} onChange={(e) => setInversion(Number(e.target.value))}>
                {[0, 1, 2, 3, 4].map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </Field>
          </>
        )}

        {subject === 'diatonic' && (
          <Field label="Chords">
            <select value={String(sevenths)} onChange={(e) => setSevenths(e.target.value === 'true')}>
              <option value="false">Triads</option>
              <option value="true">Sevenths</option>
            </select>
          </Field>
        )}

        <Field label="Clef">
          <select value={clef} onChange={(e) => setClef(e.target.value as Clef)}>
            {['treble', 'bass', 'alto', 'tenor'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <Field label="Octave">
          <select value={octave} onChange={(e) => setOctave(Number(e.target.value))}>
            {[2, 3, 4, 5].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
      </section>

      <Score spec={scoreSpec} />

      <div className="actions">
        <button onClick={() => play('spread')}>Play one at a time</button>
        <button onClick={() => play('together')}>Play together</button>
      </div>

      <section className="readout">
        <h2>{view.title}</h2>
        <ol className="items">
          {view.labels.map((label, i) => (
            <li key={i}>
              <span className="primary">{label.primary}</span>
              <span className="secondary">{label.secondary}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function signature(key: Key): string {
  if (key.accidentals === 0) return 'no accidentals';
  const n = Math.abs(key.accidentals);
  return `${n} ${key.accidentals > 0 ? 'sharp' : 'flat'}${n > 1 ? 's' : ''}`;
}

interface ViewLabel { primary: string; secondary: string }
interface View { notes: ScoreNote[]; labels: ViewLabel[]; title: string }

function buildView(o: {
  key: Key; subject: Subject; scaleId: string; chordId: string;
  inversion: number; sevenths: boolean; octave: number;
}): View {
  const tonic = { ...o.key.tonic, octave: o.octave };

  if (o.subject === 'scale') {
    const type = SCALE_TYPES.find((s) => s.id === o.scaleId)!;
    const pitches = spellScale(tonic, type);
    // Close the octave so the scale sounds finished rather than cut off.
    const withOctave = [...pitches, { ...pitches[0], octave: pitches[0].octave + 1 }];
    return {
      title: `${pitchName(tonic, false)} ${type.name}`,
      notes: withOctave.map((p) => ({ pitches: [p], value: noteValue('q') })),
      labels: withOctave.map((p, i) => ({
        primary: pitchName(p),
        secondary: i === withOctave.length - 1 ? '8' : degreeLabel(type, i),
      })),
    };
  }

  if (o.subject === 'chord') {
    const type = CHORD_TYPES.find((c) => c.id === o.chordId)!;
    const built = chord(tonic, type, o.inversion);
    const pitches = voiceChord(built);
    return {
      title: chordSymbol(built),
      notes: [{ pitches, value: noteValue('w') }],
      labels: pitches.map((p, i) => {
        const engraved = simplifySpelling(p);
        const respelt = engraved.alter !== p.alter;
        return {
          primary: pitchName(p),
          secondary: respelt
            ? `engraved ${pitchName(engraved)}`
            : i === 0 ? 'bass' : `+${midiOf(p) - midiOf(pitches[0])} semitones`,
        };
      }),
    };
  }

  const table = o.key.mode === 'major'
    ? (o.sevenths ? DIATONIC_SEVENTHS.major : DIATONIC_TRIADS.major)
    : (o.sevenths ? DIATONIC_SEVENTHS.minor : DIATONIC_TRIADS.minor);
  const numerals = DEGREES.map((d) => numeral(d, table[d - 1]));
  return {
    title: `${keyName(o.key)} — ${o.sevenths ? 'diatonic sevenths' : 'diatonic triads'}`,
    notes: numerals.map((n) => ({
      pitches: spellChord(realizeNumeral({ ...o.key, tonic }, n)),
      value: noteValue('h'),
    })),
    labels: numerals.map((n) => ({
      primary: numeralText(n),
      secondary: chordSymbol(realizeNumeral({ ...o.key, tonic }, n)),
    })),
  };
}
