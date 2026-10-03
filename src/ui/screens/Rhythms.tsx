import { useMemo, useState } from 'react';
import { Score } from '../notation/Score';
import type { ScoreNote } from '../../exercises/render/toVexflow';
import { Panel, Picker } from '../controls';
import { usePulsePlayer } from '../sound';
import { parsePitch } from '../../theory/pitch';
import { TICKS_PER_QUARTER, tiedValues, timeSignature } from '../../theory/meter';
import { CELLS, type RhythmCell, cellsAtGrade, scaleCell, valueForEvent } from '../../generate/cells';

/**
 * The rhythm reference: the figures themselves, named.
 *
 * Nothing here is generated. The other reference screens show what the engine
 * knows — every scale, every chord — and this is the same catalogue for
 * rhythm: the stock of figures that bars are built out of. Showing randomly
 * generated bars instead would teach nothing, because there would be nothing
 * to learn the *name* of. Generated rhythm belongs in the exercises.
 */

/** Rhythm is read on one pitch; the middle line is the convention. */
const RHYTHM_PITCH = parsePitch('B4');

const GRADES = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: `Up to grade ${i + 1}` }));

const KINDS = [
  { value: 'simple' as const, label: 'Simple time (2/4, 3/4, 4/4)' },
  { value: 'compound' as const, label: 'Compound time (6/8, 9/8, 12/8)' },
];

export function Rhythms() {
  const [kind, setKind] = useState<'simple' | 'compound'>('simple');
  const [grade, setGrade] = useState(10);
  const play = usePulsePlayer();

  const figures = useMemo(
    () => cellsAtGrade(grade, kind).slice().sort((a, b) => a.grade - b.grade || a.beats - b.beats),
    [grade, kind],
  );

  return (
    <>
      <header>
        <h1>Rhythms</h1>
        <p className="lede">
          The figures bars are built from, in the order a method book meets
          them. Nothing here is generated — this is the stock itself, and the
          exercises draw on it.
        </p>
      </header>

      <Panel>
        <Picker label="Division" value={kind} onChange={setKind} options={KINDS} />
        <Picker label="Difficulty" value={grade} onChange={setGrade} options={GRADES} />
      </Panel>

      <p className="count">{figures.length} of {CELLS.filter((c) => c.kind === kind).length} figures</p>

      <ul className="figures">
        {figures.map((figure) => (
          <Figure key={figure.id} cell={figure} play={play} />
        ))}
      </ul>
    </>
  );
}

function Figure({ cell, play }: {
  cell: RhythmCell;
  play: (events: ReadonlyArray<{ pitches: ReturnType<typeof parsePitch>[]; seconds: number }>) => void;
}) {
  // Each figure is shown in a bar of its own, padded to the barline — which is
  // how a method book presents one, and keeps the staff honest about length.
  const ts = timeSignature(cell.kind === 'compound' ? '6/8' : '4/4');
  const beatTicks = ts.beatDurations[0];

  const { notes, seconds } = useMemo(() => {
    const scaled = scaleCell(cell, beatTicks);
    const used = scaled.reduce((sum, e) => sum + e.ticks, 0);
    const notes: ScoreNote[] = [];
    for (const event of scaled) {
      const value = valueForEvent(event);
      if (!value) continue;
      notes.push({
        pitches: event.rest ? [] : [RHYTHM_PITCH],
        value,
        tuplet: event.tuplet ? { id: 1, ...event.tuplet } : undefined,
      });
    }
    // Fill the rest of the bar with rests so the figure sits in a real bar.
    const remainder = ts.barTicks - used;
    if (remainder > 0) {
      for (const value of tiedValues(remainder)) notes.push({ pitches: [], value });
    }
    const perTick = 60 / 84 / TICKS_PER_QUARTER;
    return {
      notes,
      seconds: scaled.map((e) => ({
        pitches: e.rest ? [] : [RHYTHM_PITCH],
        seconds: e.ticks * perTick,
      })),
    };
  }, [cell, beatTicks, ts]);

  const spec = useMemo(() => ({ notes, clef: 'treble' as const, timeSignature: ts }), [notes, ts]);

  return (
    <li className="figure">
      <div className="figure-head">
        <span className="figure-name">{cell.name}</span>
        <span className="figure-meta">
          grade {cell.grade} · {cell.beats} beat{cell.beats > 1 ? 's' : ''}
          {cell.tags.length > 0 && ` · ${cell.tags.join(', ')}`}
        </span>
        <button className="figure-play" onClick={() => play(seconds)}>Play</button>
      </div>
      <Score spec={spec} height={120} />
    </li>
  );
}
