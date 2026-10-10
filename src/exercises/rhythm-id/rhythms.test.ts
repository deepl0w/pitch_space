import { describe, expect, it } from 'vitest';
import {
  BAR_CHOICES, METER_CHOICES, RHYTHM_DEFAULTS, TEMPO_CHOICES, beatSeconds,
  coerceRhythmSettings, generateRhythmExercise, gradeRhythm, leadInSeconds,
  RHYTHM_PITCH, rhythmItems, rhythmScoreSpec, rhythmVoices, secondsAt,
  type RhythmSettings,
} from './rhythms';
import { midiOf } from '../../theory/pitch';
import { toleranceFor } from '../../audio/dsp/rhythmAlign';
import { timeSignature } from '../../theory/meter';

/**
 * What this exercise owes beyond the registry contract.
 *
 * It is the only one whose answer is a performance, so most of what
 * matters is in the grading: that a figure is credited on the attacks
 * that belong to it, that playing it perfectly is possible, and that
 * the two kinds of being wrong — late everywhere, or untidy — are told
 * apart rather than averaged into one number.
 */

const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 1);

function settings(over: Partial<RhythmSettings> = {}): RhythmSettings {
  return { ...RHYTHM_DEFAULTS, ...over };
}

/** Tapping it exactly as written, which must come out perfect. */
const perfect = (exercise: { onsets: readonly number[] }) => ({ taps: [...exercise.onsets] });

describe('the rhythm a question is built from', () => {
  it('fills every bar exactly, in every metre the panel offers', () => {
    for (const meter of METER_CHOICES) {
      const ts = timeSignature(meter);
      for (const seed of SEEDS.slice(0, 20)) {
        const e = generateRhythmExercise({ seed, settings: settings({ meter, bars: 2 }) });
        for (const bar of e.bars) {
          const sum = bar.events.reduce((n, ev) => n + ev.durationTicks, 0);
          expect(sum, `${meter} seed ${seed} bar ${bar.index}`).toBe(ts.barTicks);
        }
      }
    }
  });

  it('counts an attack once, and never counts a rest', () => {
    /*
      `onsets` is what both halves read — the playback schedules from it
      and the grader aligns against it — so it has to be the attacks and
      nothing else. A rest is not played, and a note tied from the one
      before it is the same attack continuing; tapping either again
      would be wrong, and counting them here would mark a correct
      performance as having missed them.
    */
    for (const seed of SEEDS.slice(0, 40)) {
      const e = generateRhythmExercise({ seed, settings: settings({ bars: 4 }) });
      const attacks = e.bars.flatMap((b) => b.events)
        .filter((ev) => !ev.isRest && !ev.tiedFromPrevious);
      expect(e.onsets).toHaveLength(attacks.length);
      expect(e.onsetCells).toHaveLength(attacks.length);
      expect(e.onsets).toEqual(attacks.map((a) => secondsAt(a.startTick, e.tempo)));
    }
  });

  it('places the onsets in time order, which the grader requires', () => {
    // `alignRhythm` throws on an unsorted list rather than quietly
    // mis-aligning, so this failing would be a crash and not a wrong mark.
    for (const seed of SEEDS.slice(0, 40)) {
      const e = generateRhythmExercise({ seed, settings: settings({ bars: 4, tuplets: true }) });
      expect([...e.onsets].sort((a, b) => a - b)).toEqual([...e.onsets]);
    }
  });

  it('puts a count-in in front of the rhythm, one click per beat', () => {
    // The whole of what makes "play it back in time" answerable. Without
    // a shared downbeat the first tap defines the tempo and every error
    // after it is measured against the user's own guess.
    for (const meter of METER_CHOICES) {
      const e = generateRhythmExercise({ seed: 3, settings: settings({ meter }) });
      const ts = timeSignature(meter);
      const voices = rhythmVoices(e);
      const clicks = voices.filter((v) => v.start < leadInSeconds(e));
      expect(clicks, meter).toHaveLength(ts.beatStarts.length);
      // The downbeat louder, or a count-in does not say where "one" is.
      expect(clicks[0].gain).toBeGreaterThan(clicks[1]?.gain ?? 0);
    }
  });

  it('plays only the count-in when the rhythm is the thing being read', () => {
    const e = generateRhythmExercise({ seed: 5, settings: settings({ presentation: 'read' }) });
    expect(rhythmVoices(e, { silent: true })).toHaveLength(e.countInBeats);
    expect(rhythmVoices(e).length).toBe(e.countInBeats + e.onsets.length);
  });

  it('sounds the clicks and the rhythm independently of each other', () => {
    /*
      Two options, and the exercise uses one corner of each: listening asks
      for the rhythm with no count-in, and answering asks for the count-in
      with no rhythm. They are a pair that drifts back together — one call
      site copied from the other is all it takes — so the four corners are
      asserted here rather than the two in use, and by **pitch** rather than
      by count.

      Count was what this file pinned before, and a count is a proxy: four
      clicks and four rhythm notes are the same length, and a path that
      sounded the wrong one of them would pass. The clicks are a different
      pitch from the rhythm, which is the thing actually being asked.
    */
    const e = generateRhythmExercise({ seed: 5, settings: settings({}) });
    const rhythm = midiOf(RHYTHM_PITCH);
    const sounds = (over: { silent?: boolean; countIn?: boolean }) => {
      const voices = rhythmVoices(e, over);
      return {
        rhythm: voices.filter((v) => v.midi === rhythm).length,
        clicks: voices.filter((v) => v.midi !== rhythm).length,
      };
    };

    expect(e.onsets.length, 'nothing to hear, so this proves nothing').toBeGreaterThan(0);
    expect(e.countInBeats, 'nothing to count, so this proves nothing').toBeGreaterThan(0);

    // Both, which is nothing the exercise asks for and is the baseline the
    // other three are read against.
    expect(sounds({})).toEqual({ rhythm: e.onsets.length, clicks: e.countInBeats });
    // Listening: the rhythm, and no three seconds of clicks in front of a
    // thing the user asked to hear.
    expect(sounds({ countIn: false })).toEqual({ rhythm: e.onsets.length, clicks: 0 });
    // Answering: the count-in alone, because sounding the rhythm would be
    // playing the answer.
    expect(sounds({ silent: true })).toEqual({ rhythm: 0, clicks: e.countInBeats });
    expect(sounds({ silent: true, countIn: false })).toEqual({ rhythm: 0, clicks: 0 });
  });

  it('starts the rhythm at zero when nothing is counted in front of it', () => {
    // The offset half of the same option. With a count-in the first onset
    // waits out the lead; without one it has nothing to wait for, and a
    // playback that still waited would be three seconds of silence.
    const e = generateRhythmExercise({ seed: 5, settings: settings({}) });
    const rhythm = midiOf(RHYTHM_PITCH);
    const firstAt = (over: { countIn?: boolean }) =>
      rhythmVoices(e, over).filter((v) => v.midi === rhythm)[0].start;

    expect(leadInSeconds(e)).toBeGreaterThan(0);
    expect(firstAt({ countIn: false })).toBeCloseTo(e.onsets[0], 6);
    expect(firstAt({})).toBeCloseTo(leadInSeconds(e) + e.onsets[0], 6);
  });

  it('draws every event, and carries tuplets so the bar adds up', () => {
    /*
      A triplet drawn as three plain eighths is a bar that does not add
      up — the notes are right and the notation is a lie. Ties are not
      carried and do not need to be: this generator builds each bar from
      whole beat-aligned cells, so nothing crosses a boundary. Swept
      below rather than asserted from the comment.
    */
    let tuplets = 0;
    for (const seed of SEEDS.slice(0, 30)) {
      const e = generateRhythmExercise({ seed, settings: settings({ bars: 2, tuplets: true }) });
      const events = e.bars.flatMap((b) => b.events);
      const notes = rhythmScoreSpec(e).notes;
      expect(notes).toHaveLength(events.length);
      for (const [i, event] of events.entries()) {
        expect(notes[i].pitches.length === 0).toBe(event.isRest);
        expect(notes[i].tuplet !== undefined).toBe(event.tupletId !== undefined);
        if (event.tupletId !== undefined) tuplets += 1;
        expect(event.tiedToNext, 'a tie appeared; the score spec drops them').toBe(false);
      }
    }
    expect(tuplets, 'no tuplet in the sweep, so the claim above is untested')
      .toBeGreaterThan(0);
  });
});

describe('grading a performance', () => {
  it('marks a perfect performance correct, at every tempo', () => {
    // The floor. If tapping exactly what is written does not pass, no
    // real performance can.
    for (const tempo of TEMPO_CHOICES) {
      for (const seed of SEEDS.slice(0, 15)) {
        const e = generateRhythmExercise({ seed, settings: settings({ tempo, bars: 2 }) });
        const r = gradeRhythm(e, perfect(e));
        expect(r.correct, `${tempo}bpm seed ${seed}: ${r.feedback}`).toBe(true);
        expect(r.outcomes.every((o) => o.correct)).toBe(true);
      }
    }
  });

  it('credits each figure on its own attacks, not on the bar', () => {
    /*
      The reason the generator carries cell ids out at all. A learner
      who places three figures and fluffs the fourth has learned three
      things; one verdict for the bar would teach the schedule they know
      none of them, which is the complaint ADR 0007 makes about a single
      verdict for a whole exercise.
    */
    const e = generateRhythmExercise({ seed: 11, settings: settings({ bars: 2 }) });
    const cells = [...new Set(e.onsetCells)];
    expect(cells.length, 'need more than one figure for this to mean anything')
      .toBeGreaterThan(1);

    // Play everything except the attacks belonging to the last figure.
    const doomed = e.onsetCells[e.onsetCells.length - 1];
    const taps = e.onsets.filter((_, i) => e.onsetCells[i] !== doomed);
    const r = gradeRhythm(e, { taps });

    expect(r.correct).toBe(false);
    const byItem = new Map(r.outcomes.map((o) => [o.item, o.correct]));
    expect(byItem.get(`cell:${doomed}`)).toBe(false);
    for (const cell of cells.filter((c) => c !== doomed)) {
      expect(byItem.get(`cell:${cell}`), `${cell} was played and marked wrong`).toBe(true);
    }
  });

  it('reports a steady lag as lag, and scatter as scatter', () => {
    /*
      `meanErrorSeconds` exists to tell these apart and the verdict is
      where that reaches the user. A player consistently behind the
      click has a different thing to fix from one who is merely untidy,
      and "you were 40ms out" tells neither of them which they are.
    */
    const e = generateRhythmExercise({ seed: 13, settings: settings({ bars: 2 }) });
    const window = toleranceFor(beatSeconds(e.tempo));

    const late = gradeRhythm(e, { taps: e.onsets.map((t) => t + window * 0.6) });
    expect(late.feedback).toContain('behind the beat');

    const early = gradeRhythm(e, { taps: e.onsets.map((t) => t - window * 0.6) });
    expect(early.feedback).toContain('ahead of the beat');

    // Alternating either side averages to nothing, which is the case a
    // mean alone would call perfect.
    const untidy = gradeRhythm(e, {
      taps: e.onsets.map((t, i) => t + (i % 2 ? 1 : -1) * window * 0.5),
    });
    expect(untidy.feedback).toContain('scatter');
    expect(untidy.feedback).not.toContain('behind the beat');
  });

  it('counts what was missed and what was never written', () => {
    const e = generateRhythmExercise({ seed: 17, settings: settings({ bars: 1 }) });
    const nothing = gradeRhythm(e, { taps: [] });
    expect(nothing.correct).toBe(false);
    expect(nothing.outcomes.every((o) => !o.correct)).toBe(true);

    // A tap answering no written note is not chargeable to a figure —
    // it landed between them — so it fails the exercise and is said in
    // the verdict rather than blamed on whichever was nearest.
    const extra = gradeRhythm(e, { taps: [...e.onsets, e.onsets[e.onsets.length - 1] + 10] });
    expect(extra.correct).toBe(false);
    expect(extra.feedback).toContain('extra');
    expect(extra.outcomes.every((o) => o.correct), 'an extra tap blamed a figure').toBe(true);
  });

  it('takes taps in any order it is handed them', () => {
    // The response comes from a UI collecting clicks and keystrokes, and
    // `alignRhythm` throws on an unsorted list. Sorting here rather than
    // trusting the caller is the guard belonging with the thing guarded.
    const e = generateRhythmExercise({ seed: 19, settings: settings({ bars: 1 }) });
    /*
      Several orders rather than the reversed one. "Any order" is what the
      name claims and one permutation is what it used to show — a reversed
      list is the strongest single case and still a single case, and a name
      is the claim a reader takes without opening the file.
    */
    const orders = [
      [...e.onsets].reverse(),
      [...e.onsets].slice(1).concat(e.onsets[0]),
      [...e.onsets].sort((a, b) => (a * 7919) % 13 - (b * 7919) % 13),
    ];
    for (const taps of orders) {
      expect(gradeRhythm(e, { taps }).correct, `taps as ${taps.join(', ')}`).toBe(true);
    }
  });
});

describe('what the exercise asks about', () => {
  it('offers no figure that makes no sound', () => {
    // A rest-only cell is in the bars and cannot be graded: the user
    // plays nothing for it. Contained, not tested.
    for (const meter of METER_CHOICES) {
      const items = rhythmItems(settings({ meter, rests: true, tuplets: true, syncopation: 3 }));
      expect(items.length, meter).toBeGreaterThan(0);
      expect(new Set(items).size).toBe(items.length);
    }
  });

  it('narrows when the settings narrow', () => {
    const plain = rhythmItems(settings({ rests: false, tuplets: false, syncopation: 0 }));
    const all = rhythmItems(settings({ rests: true, tuplets: true, syncopation: 3 }));
    expect(all.length).toBeGreaterThan(plain.length);
  });
});

describe('settings arriving from storage', () => {
  it('generates from rubbish as happily as from defaults', () => {
    for (const stored of [{}, null, 7, { meter: 'nope', bars: 99, tempo: 1 }, { tempo: '84' }]) {
      const got = coerceRhythmSettings(stored);
      expect(METER_CHOICES).toContain(got.meter);
      expect(BAR_CHOICES).toContain(got.bars);
      expect(TEMPO_CHOICES).toContain(got.tempo);
      expect(() => generateRhythmExercise({ seed: 1, settings: got })).not.toThrow();
    }
  });
});
