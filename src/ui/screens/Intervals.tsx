import { useMemo, useState } from 'react';
import { Score } from '../notation/Score';
import { DiagramPicker, InstrumentDiagram } from '../notation/InstrumentDiagram';
import { entryFor } from '../menu';
import type { Clef } from '../../exercises/render/toVexflow';
import { Actions, Panel, Picker, Readout } from '../controls';
import { usePlayer } from '../sound';
import { pitchName } from '../../theory/pitch';
import { SIMPLE_INTERVAL_NAMES, intervalBetween, intervalName } from '../../theory/interval';
import { noteValue } from '../../theory/meter';
import {
  INTERVAL_SLUGS, intervalItemId, spellInterval, type IntervalDirection,
} from '../../exercises/interval-id/intervals';
import { TRADITIONAL, songsFor } from '../../exercises/songs';
import { CLEFS, OCTAVES, TONICS, tonicFor } from './options';

/** Title and lede come from the menu, so the card and this page cannot drift. */
const entry = entryFor('intervals');

const DIRECTIONS: ReadonlyArray<{ value: IntervalDirection; label: string }> = [
  { value: 'up', label: 'Ascending' },
  { value: 'down', label: 'Descending' },
  { value: 'harmonic', label: 'Together' },
];

/**
 * Where the page opens, from a `focus` of `m3:up` or `unison`.
 *
 * Anything it does not recognise opens the page as it would open bare, rather
 * than on a guess: `ui/reference.ts` only sends ids it has checked, so a miss
 * here is a page reached some other way.
 */
function opening(focus: string | undefined): { semitones: number; direction: IntervalDirection } {
  const [slug, direction] = (focus ?? '').split(':');
  const semitones = INTERVAL_SLUGS.indexOf(slug);
  const known = DIRECTIONS.find((d) => d.value === direction)?.value;
  return semitones < 0
    ? { semitones: 4, direction: 'up' }
    : { semitones, direction: known ?? 'up' };
}

export function Intervals({ focus }: { focus?: string }) {
  const [start] = useState(() => opening(focus));
  const [rootName, setRootName] = useState('C');
  const [semitones, setSemitones] = useState(start.semitones);
  const [direction, setDirection] = useState<IntervalDirection>(start.direction);
  const [clef, setClef] = useState<Clef>('treble');
  const [octave, setOctave] = useState(4);
  const play = usePlayer();

  const pitches = useMemo(() => {
    const root = { ...tonicFor(rootName), octave };
    return [root, spellInterval(root, semitones, direction)] as const;
  }, [rootName, octave, semitones, direction]);

  // Together is one chord; apart is two notes in the order they are heard.
  const notes = useMemo(() => direction === 'harmonic'
    ? [{ pitches: [...pitches], value: noteValue('w') }]
    : pitches.map((p) => ({ pitches: [p], value: noteValue('h') })), [pitches, direction]);
  const spec = useMemo(() => ({ notes, clef }), [notes, clef]);

  const name = SIMPLE_INTERVAL_NAMES[semitones];
  const short = intervalName(intervalBetween(pitches[0], pitches[1]));
  const songs = songsFor(intervalItemId(semitones, direction));
  const heard = semitones === 0 ? name
    : `${name}, ${DIRECTIONS.find((d) => d.value === direction)!.label.toLowerCase()}`;

  return (
    <>
      <header>
        <h1>{entry.name}</h1>
        <p className="lede">{entry.lede}</p>
      </header>

      <Panel>
        <Picker label="From" value={rootName} onChange={setRootName}
                options={TONICS.map((t) => ({ value: pitchName(t, false), label: pitchName(t, false) }))} />
        <Picker
          label="Interval"
          value={semitones}
          onChange={setSemitones}
          options={INTERVAL_SLUGS.map((_, i) => ({ value: i, label: SIMPLE_INTERVAL_NAMES[i] }))}
        />
        <Picker label="Direction" value={direction} onChange={setDirection} options={DIRECTIONS} />
        <Picker label="Clef" value={clef} onChange={setClef} options={CLEFS} />
        <Picker label="Octave" value={octave} onChange={setOctave} options={OCTAVES} />
        <DiagramPicker />
      </Panel>

      <Score spec={spec} />
      <InstrumentDiagram pitches={pitches} root={pitches[0]} label={heard} />

      <Actions>
        <button onClick={() => play(notes)}>Play the interval</button>
      </Actions>

      <Readout
        title={heard}
        items={[
          { primary: short, secondary: 'written' },
          { primary: String(semitones), secondary: semitones === 1 ? 'semitone' : 'semitones' },
          ...pitches.map((p, i) => ({ primary: pitchName(p), secondary: i === 0 ? 'from' : 'to' })),
        ]}
      />

      {/*
        The same songs a wrong answer offers two of, all of them, with where
        in the song when it is not the opening. A falling interval lists the
        falling tunes, because the rising ones put the wrong contour in the
        ear; together reads the rising row, as the hint does.
      */}
      <h2 className="section">Songs that have it</h2>
      {songs.length === 0
        ? <p className="count">No song catalogued for this one yet.</p>
        : (
          <ul className="songs">
            {songs.map((song) => (
              <li key={song.title}>
                <span className="primary">{song.title}</span>
                <span className="secondary">
                  {[song.by === TRADITIONAL ? 'Traditional' : song.by,
                    song.at === undefined ? undefined : `at ${song.at}`]
                    .filter(Boolean).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}
