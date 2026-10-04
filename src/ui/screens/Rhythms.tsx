import { useMemo, useState } from 'react';
import { Score } from '../notation/Score';
import { entryFor } from '../menu';
import type { ScoreNote } from '../../exercises/render/toVexflow';
import { Panel, Picker } from '../controls';
import { usePulsePlayer } from '../sound';
import { parsePitch, type Pitch } from '../../theory/pitch';
import {
  TICKS_PER_QUARTER, TIME_SIGNATURES, type TimeSignature, tiedValues, timeSignature, valueOfTicks,
} from '../../theory/meter';
import { CELLS, type RhythmCell, scaleCell, valueForEvent } from '../../generate/cells';
import { kindForBeat } from '../../generate/rhythm';
import { patternsFor } from '../../generate/patterns';

/**
 * The rhythm reference, per metre.
 *
 * Nothing here is generated. The other reference screens show what the engine
 * knows — every scale, every chord — and this is the same for rhythm, in two
 * halves: complete bars that players know by name, and the beat-level figures
 * bars are built out of.
 *
 * Organised by time signature rather than by simple-versus-compound, because
 * a 7/8 bar and a 6/8 bar are not the same thing to a reader even though both
 * contain a dotted-quarter beat — and because the question anybody actually
 * has is "what does this metre sound like", not "what is in the library".
 *
 * There is no grade control. A grade is how an exercise chooses what to set
 * you; a reference has nothing to grade and showing a figure as locked would
 * be withholding information for no reason.
 */

/** Rhythm is read on one pitch; the middle line is the convention. */
const RHYTHM_PITCH = parsePitch('B4');
const TEMPO = 84;

export function Rhythms() {
  const entry = entryFor('rhythms');
  const [meter, setMeter] = useState('4/4');
  const play = usePulsePlayer();
  const ts = timeSignature(meter);

  const patterns = useMemo(() => patternsFor(meter), [meter]);
  const figures = useMemo(() => figuresFor(ts), [ts]);

  return (
    <>
      <header>
        <h1>{entry.name}</h1>
        <p className="lede">{entry.lede}</p>
      </header>

      <Panel>
        <Picker
          label="Time signature"
          value={meter}
          onChange={setMeter}
          options={TIME_SIGNATURES.map((t) => ({
            value: t.id,
            label: `${t.id} — ${describe(t)}`,
          }))}
        />
      </Panel>

      <h2 className="section">Patterns in {ts.id}</h2>
      {patterns.length === 0
        ? <p className="count">No named patterns catalogued for this metre yet.</p>
        : (
          <ul className="figures">
            {patterns.map((p) => (
              <Card
                key={p.id}
                title={p.name}
                meta={p.origin}
                ts={ts}
                events={p.durations.map((d) => ({ ticks: Math.abs(d), rest: d < 0 }))}
                play={play}
              />
            ))}
          </ul>
        )}

      <h2 className="section">Figures a {ts.id} bar is built from</h2>
      <p className="count">{figures.length} figures fit this metre's beats</p>
      <ul className="figures">
        {figures.map(({ cell, events }) => (
          <Card
            key={cell.id}
            title={cell.name}
            meta={cell.tags.join(', ')}
            ts={ts}
            events={events}
            play={play}
          />
        ))}
      </ul>
    </>
  );
}

function describe(ts: TimeSignature): string {
  const beats = ts.beatStarts.length;
  const kind = ts.kind === 'compound' ? 'compound' : ts.kind === 'irregular' ? 'irregular' : 'simple';
  const counted = ['', 'one', 'two', 'three', 'four', 'five', 'six'][beats] ?? String(beats);
  return `${counted} ${kind} beat${beats === 1 ? '' : 's'}`;
}

interface Timed { ticks: number; rest: boolean }

/**
 * The figures that fit this metre, each laid against the first beat it suits.
 *
 * A metre's beats are not all alike — 7/8 as 2+2+3 has two quarter beats and
 * one dotted-quarter — so a figure is offered if any beat of the bar can take
 * it, and shown scaled to that beat.
 */
function figuresFor(ts: TimeSignature): Array<{ cell: RhythmCell; events: Timed[] }> {
  const out: Array<{ cell: RhythmCell; events: Timed[] }> = [];
  const seen = new Set<string>();
  ts.beatDurations.forEach((beatTicks, beat) => {
    const kind = kindForBeat(beatTicks);
    if (kind === null) return;
    for (const cell of CELLS) {
      if (cell.kind !== kind || seen.has(cell.id)) continue;
      // A two-beat figure needs a second beat of the same length after it.
      if (cell.beats === 2 && ts.beatDurations[beat + 1] !== beatTicks) continue;
      if (beat + cell.beats > ts.beatStarts.length) continue;
      try {
        seen.add(cell.id);
        out.push({ cell, events: scaleCell(cell, beatTicks).map((e) => ({ ticks: e.ticks, rest: e.rest })) });
      } catch {
        // The figure does not scale onto this beat without a fractional
        // tick; it simply is not available here.
        seen.delete(cell.id);
      }
    }
  });
  // Ordered by how much is in the figure, then by its length. This sorted
  // by `cell.grade` — somebody's judgement of how advanced each figure
  // was — which is exactly the ordering that left this page and the
  // settings panels. Counting the events says the same thing about a
  // reference page without claiming a tier: a held note before a divided
  // one, and a plain beat before a syncopated one.
  return out.sort((a, b) => a.cell.events.length - b.cell.events.length
    || a.cell.beats - b.cell.beats
    || (a.cell.id < b.cell.id ? -1 : 1));
}

function Card({ title, meta, ts, events, play }: {
  title: string;
  meta: string;
  ts: TimeSignature;
  events: readonly Timed[];
  play: (e: ReadonlyArray<{ pitches: readonly Pitch[]; seconds: number }>) => void;
}) {
  const { notes, sounded } = useMemo(() => {
    const notes: ScoreNote[] = [];
    for (const event of events) {
      const value = valueOfTicks(event.ticks) ?? valueForEvent({ ticks: event.ticks, rest: event.rest });
      if (!value) continue;
      notes.push({ pitches: event.rest ? [] : [RHYTHM_PITCH], value });
    }
    // Pad a part-bar figure out to the barline, which is how a method book
    // shows one and keeps the stave honest about length.
    const used = events.reduce((sum, e) => sum + e.ticks, 0);
    if (used < ts.barTicks) {
      for (const value of tiedValues(ts.barTicks - used)) notes.push({ pitches: [], value });
    }
    const perTick = 60 / TEMPO / TICKS_PER_QUARTER;
    return {
      notes,
      sounded: events.map((e) => ({
        pitches: e.rest ? [] : [RHYTHM_PITCH],
        seconds: e.ticks * perTick,
      })),
    };
  }, [events, ts]);

  const spec = useMemo(() => ({ notes, clef: 'treble' as const, timeSignature: ts }), [notes, ts]);

  return (
    <li className="figure">
      <div className="figure-head">
        <span className="figure-name">{title}</span>
        <span className="figure-meta">{meta}</span>
        <button className="figure-play" onClick={() => play(sounded)}>Play</button>
      </div>
      <Score spec={spec} height={120} />
    </li>
  );
}
