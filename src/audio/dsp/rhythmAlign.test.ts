import { describe, expect, it } from 'vitest';
import { DEFAULT_SAMPLE_RATE, pluckSequence, seeded } from '../testing/signals';
import { detectOnsets } from './onsetDetector';
import { type RhythmAlignment, alignRhythm, toleranceFor } from './rhythmAlign';

/** A grid of `count` notes a beat apart, starting at `from`. */
function grid(count: number, beatSeconds: number, from = 0): number[] {
  return Array.from({ length: count }, (_, i) => from + i * beatSeconds);
}

/** The pairs an alignment claims, as `expectedIndex→playedIndex`. */
function pairs(alignment: RhythmAlignment): string[] {
  return alignment.matched.map((m) => `${m.expectedIndex}→${m.playedIndex}`);
}

describe('the window a note may land in', () => {
  it('is a quarter of the beat where that is the smaller', () => {
    expect(toleranceFor(60 / 200)).toBeCloseTo(0.075, 10);
    expect(toleranceFor(60 / 160)).toBeCloseTo(0.09375, 10);
  });

  it('stops widening at 100 ms however slow the music gets', () => {
    expect(toleranceFor(60 / 60)).toBeCloseTo(0.1, 10);
    expect(toleranceFor(60 / 40)).toBeCloseTo(0.1, 10);
    expect(toleranceFor(60 / 10)).toBeCloseTo(0.1, 10);
  });

  // A quarter of a beat is the right window because it is exactly half the
  // gap between adjacent eighth notes, and so the widest one that cannot put
  // an attack within range of two of them at once. The ceiling only ever
  // makes it narrower, so the property holds at every tempo.
  it('is never wider than half the gap between adjacent eighths', () => {
    for (let bpm = 20; bpm <= 240; bpm += 1) {
      const beat = 60 / bpm;
      expect(toleranceFor(beat)).toBeLessThanOrEqual(beat / 2 / 2 + 1e-12);
    }
  });

  it('refuses a tempo that cannot be one', () => {
    expect(() => toleranceFor(0)).toThrow(/positive/);
    expect(() => toleranceFor(-1)).toThrow(/positive/);
    expect(() => toleranceFor(Number.NaN)).toThrow(/positive/);
  });
});

describe('a performance that is simply right', () => {
  it('matches every note, misses none and invents none', () => {
    const written = grid(8, 0.5);
    const alignment = alignRhythm(written, written, { beatSeconds: 0.5 });
    expect(alignment.matched).toHaveLength(8);
    expect(alignment.missed).toEqual([]);
    expect(alignment.extra).toEqual([]);
    expect(alignment.matched.every((m) => m.score === 1)).toBe(true);
    expect(alignment.meanErrorSeconds).toBe(0);
  });
});

/**
 * The reason this is dynamic programming.
 *
 * Nearest neighbour would answer each of the eight written notes with
 * whichever attack was closest, and four attacks would answer eight notes —
 * a performance with half the notes missing reported as a performance with
 * none missing. The one-to-one constraint is the whole defence.
 */
describe('one attack cannot answer two written notes', () => {
  it('reports four notes missing when only the downbeats were played', () => {
    const eighths = grid(8, 0.25);
    const downbeats = grid(4, 0.5);
    const alignment = alignRhythm(eighths, downbeats, { beatSeconds: 0.5 });
    expect(alignment.matched).toHaveLength(4);
    expect(alignment.missed).toEqual([1, 3, 5, 7]);
    expect(alignment.extra).toEqual([]);
    expect(pairs(alignment)).toEqual(['0→0', '2→1', '4→2', '6→3']);
  });

  it('reports four attacks spare when the player doubled every note', () => {
    const written = grid(4, 0.5);
    const doubled = grid(8, 0.25);
    const alignment = alignRhythm(written, doubled, { beatSeconds: 0.5 });
    expect(alignment.matched).toHaveLength(4);
    expect(alignment.missed).toEqual([]);
    expect(alignment.extra).toEqual([1, 3, 5, 7]);
  });
});

describe('what went wrong, note by note', () => {
  const beat = 0.5;

  it('names the one note that was dropped and leaves the rest exact', () => {
    const written = grid(5, beat);
    const played = [written[0], written[1], written[3], written[4]];
    const alignment = alignRhythm(written, played, { beatSeconds: beat });
    expect(alignment.missed).toEqual([2]);
    expect(alignment.extra).toEqual([]);
    expect(pairs(alignment)).toEqual(['0→0', '1→1', '3→2', '4→3']);
    expect(alignment.matched.every((m) => m.errorSeconds === 0)).toBe(true);
  });

  it('names the one attack that was not written and leaves the rest exact', () => {
    const written = grid(5, beat);
    const played = [written[0], written[1], 0.75, written[2], written[3], written[4]];
    const alignment = alignRhythm(written, played, { beatSeconds: beat });
    expect(alignment.extra).toEqual([2]);
    expect(alignment.missed).toEqual([]);
    expect(pairs(alignment)).toEqual(['0→0', '1→1', '2→3', '3→4', '4→5']);
  });

  // A dropped note in the middle must not drag the rest of the phrase out of
  // alignment with it. One deletion explains the whole tail; describing the
  // tail as four badly-placed notes instead is the failure mode.
  it('re-aligns the tail behind a dropped note rather than smearing it', () => {
    const written = grid(9, beat);
    const played = written.filter((_, i) => i !== 3);
    const alignment = alignRhythm(written, played, { beatSeconds: beat });
    expect(alignment.missed).toEqual([3]);
    expect(alignment.extra).toEqual([]);
    expect(alignment.matched.every((m) => m.errorSeconds === 0)).toBe(true);
  });

  // The other side of the same decision. A single attack nowhere near the
  // grid is still that note played badly, because one note played badly is a
  // smaller claim than a note missing plus a different note added.
  it('keeps a lone wild attack as the note it was nearest, scoring it zero', () => {
    const written = grid(3, 1);
    const alignment = alignRhythm(written, [0, 1.7, 2], { beatSeconds: 1 });
    expect(alignment.missed).toEqual([]);
    expect(alignment.extra).toEqual([]);
    expect(pairs(alignment)).toEqual(['0→0', '1→1', '2→2']);
    expect(alignment.matched[1].score).toBe(0);
    expect(alignment.matched[1].errorSeconds).toBeCloseTo(0.7, 10);
  });

  // …and the limit of that indulgence, which is two. Here the last two
  // written notes could each be called badly played, or the third could be
  // called missing and the last attack spare. The second explains the same
  // two notes with one missing note and one stray, so it is the one reported.
  it('stops indulging a wild attack once a second one would need the same excuse', () => {
    const alignment = alignRhythm([0, 1, 2, 3], [0, 1, 3, 3.9], { beatSeconds: 1 });
    expect(alignment.missed).toEqual([2]);
    expect(alignment.extra).toEqual([3]);
    expect(pairs(alignment)).toEqual(['0→0', '1→1', '3→2']);
  });

  it('reports a missed note and a spare attack separately when both happened', () => {
    const written = grid(5, beat);
    const played = [written[0], written[1], written[3], written[4], 2.4];
    const alignment = alignRhythm(written, played, { beatSeconds: beat });
    expect(alignment.missed).toEqual([2]);
    expect(alignment.extra).toEqual([4]);
  });
});

describe('lag and drift, which are different faults', () => {
  it('reports a consistent lag as a lag, with every note equally late', () => {
    const beat = 0.5;
    const written = grid(8, beat);
    const lag = 0.04;
    const alignment = alignRhythm(written, written.map((t) => t + lag), { beatSeconds: beat });
    expect(alignment.matched).toHaveLength(8);
    expect(alignment.missed).toEqual([]);
    expect(alignment.extra).toEqual([]);
    expect(alignment.meanErrorSeconds).toBeCloseTo(lag, 10);
    for (const m of alignment.matched) expect(m.errorSeconds).toBeCloseTo(lag, 10);
    // Late, not wrong: still scoring, because the window is graded.
    for (const m of alignment.matched) {
      expect(m.score).toBeGreaterThan(0);
      expect(m.score).toBeLessThan(1);
    }
  });

  it('signs the error, so rushing and dragging are told apart', () => {
    const written = grid(4, 1);
    const dragging = alignRhythm(written, written.map((t) => t + 0.03), { beatSeconds: 1 });
    const rushing = alignRhythm(written, written.map((t) => t - 0.03), { beatSeconds: 1 });
    expect(dragging.meanErrorSeconds).toBeGreaterThan(0);
    expect(rushing.meanErrorSeconds).toBeLessThan(0);
    // The same amount wrong either way, so the score cannot tell them apart.
    expect(rushing.matched[0].score).toBeCloseTo(dragging.matched[0].score, 12);
  });

  // Drift is not lag: the first notes are right and the error accumulates.
  // Every note still answers the note it was written as — the player is late,
  // not playing different notes — so nothing is missed and nothing is spare.
  it('reports a drifting performance as one growing error, not as missed notes', () => {
    const beat = 0.5;
    const written = grid(8, beat);
    // Each note 2% later into the phrase than the last: a player gradually
    // slowing, which is the commonest way a performance comes apart.
    const played = written.map((t, i) => t + 0.02 * i * i / 2);
    const alignment = alignRhythm(written, played, { beatSeconds: beat });
    expect(alignment.matched).toHaveLength(8);
    expect(alignment.missed).toEqual([]);
    expect(alignment.extra).toEqual([]);
    for (let i = 1; i < 8; i++) {
      expect(alignment.matched[i].errorSeconds)
        .toBeGreaterThan(alignment.matched[i - 1].errorSeconds);
    }
    // And it stops scoring once the drift passes the window, rather than
    // scoring a little for the rest of the phrase.
    expect(alignment.matched[0].score).toBe(1);
    expect(alignment.matched[7].score).toBe(0);
  });

  it('tells a drifting performance from an evenly late one by the spread', () => {
    const beat = 0.5;
    const written = grid(8, beat);
    const spread = (a: RhythmAlignment) => Math.max(...a.matched.map((m) =>
      Math.abs(m.errorSeconds - a.meanErrorSeconds)));
    const lagging = alignRhythm(written, written.map((t) => t + 0.04), { beatSeconds: beat });
    const drifting = alignRhythm(written, written.map((t, i) => t + 0.01 * i), { beatSeconds: beat });
    expect(spread(lagging)).toBeLessThan(1e-12);
    expect(spread(drifting)).toBeGreaterThan(0.02);
  });
});

describe('the score inside the window', () => {
  const written = [1];

  it('is 1 dead on and 0 at the edge and beyond', () => {
    const at = (t: number) =>
      alignRhythm(written, [t], { beatSeconds: 1, toleranceSeconds: 0.1 }).matched[0].score;
    expect(at(1)).toBe(1);
    expect(at(1.1)).toBeCloseTo(0, 12);
    expect(at(0.9)).toBeCloseTo(0, 12);
    expect(at(5)).toBe(0);
  });

  // Graded, not pass/fail: a note 99 ms late and a note 101 ms late were
  // played the same way, and a score that jumps between them is reporting
  // the threshold rather than the playing.
  it('falls off continuously rather than stepping at the edge', () => {
    const at = (t: number) =>
      alignRhythm(written, [t], { beatSeconds: 1, toleranceSeconds: 0.1 }).matched[0].score;
    let previous = at(1);
    for (let step = 1; step <= 20; step++) {
      const now = at(1 + (step * 0.1) / 20);
      expect(now).toBeLessThan(previous);
      previous = now;
    }
    expect(previous).toBeCloseTo(0, 12);
  });

  it('takes the window it is given over the one the tempo implies', () => {
    const wide = alignRhythm(written, [1.05], { beatSeconds: 0.2, toleranceSeconds: 0.5 });
    expect(wide.toleranceSeconds).toBe(0.5);
    expect(wide.matched[0].score).toBeGreaterThan(0.8);
    const narrow = alignRhythm(written, [1.05], { beatSeconds: 0.2 });
    expect(narrow.toleranceSeconds).toBeCloseTo(0.05, 10);
    expect(narrow.matched[0].score).toBe(0);
  });
});

describe('the alignment is an alignment', () => {
  /**
   * The three invariants that make the report a correspondence rather than a
   * pile of guesses, asserted over seeded performances rather than over the
   * handful of cases anyone thinks to write by hand. Each written note is
   * accounted for exactly once, each attack is accounted for exactly once,
   * and the matches run in the same order through both lists.
   */
  it('accounts for every note exactly once, in order, whatever was played', () => {
    const rng = seeded(0x51d3);
    for (let trial = 0; trial < 300; trial++) {
      const beat = 0.2 + rng.next() * 0.8;
      const written = grid(2 + Math.floor(rng.next() * 12), beat);
      const played: number[] = [];
      for (const t of written) {
        if (rng.next() < 0.2) continue; // dropped
        played.push(t + (rng.next() - 0.5) * beat * 0.8);
        if (rng.next() < 0.15) played.push(t + beat * (0.2 + rng.next() * 0.5)); // doubled
      }
      played.sort((a, b) => a - b);

      const alignment = alignRhythm(written, played, { beatSeconds: beat });
      const expectedSeen = [
        ...alignment.matched.map((m) => m.expectedIndex), ...alignment.missed,
      ].sort((a, b) => a - b);
      const playedSeen = [
        ...alignment.matched.map((m) => m.playedIndex), ...alignment.extra,
      ].sort((a, b) => a - b);
      expect(expectedSeen).toEqual(written.map((_, i) => i));
      expect(playedSeen).toEqual(played.map((_, i) => i));
      for (let i = 1; i < alignment.matched.length; i++) {
        expect(alignment.matched[i].expectedIndex)
          .toBeGreaterThan(alignment.matched[i - 1].expectedIndex);
        expect(alignment.matched[i].playedIndex)
          .toBeGreaterThan(alignment.matched[i - 1].playedIndex);
      }
    }
  });

  it('reports the times it was given, not times of its own', () => {
    const alignment = alignRhythm([0, 0.5], [0.02, 0.47], { beatSeconds: 0.5 });
    expect(alignment.matched.map((m) => m.expectedSeconds)).toEqual([0, 0.5]);
    expect(alignment.matched.map((m) => m.playedSeconds)).toEqual([0.02, 0.47]);
    expect(alignment.matched[0].errorSeconds).toBeCloseTo(0.02, 10);
    expect(alignment.matched[1].errorSeconds).toBeCloseTo(-0.03, 10);
  });
});

describe('performances with nothing in them', () => {
  it('calls every written note missed when nothing was played', () => {
    const alignment = alignRhythm(grid(4, 0.5), [], { beatSeconds: 0.5 });
    expect(alignment.missed).toEqual([0, 1, 2, 3]);
    expect(alignment.matched).toEqual([]);
    expect(alignment.extra).toEqual([]);
    expect(alignment.meanErrorSeconds).toBe(0);
  });

  it('calls every attack spare when nothing was written', () => {
    const alignment = alignRhythm([], grid(3, 0.5), { beatSeconds: 0.5 });
    expect(alignment.extra).toEqual([0, 1, 2]);
    expect(alignment.matched).toEqual([]);
    expect(alignment.missed).toEqual([]);
  });

  it('says nothing about nothing', () => {
    const alignment = alignRhythm([], [], { beatSeconds: 0.5 });
    expect(alignment.matched).toEqual([]);
    expect(alignment.missed).toEqual([]);
    expect(alignment.extra).toEqual([]);
  });
});

describe('inputs that cannot be a performance', () => {
  it('refuses times that run backwards, which would silently mis-align', () => {
    expect(() => alignRhythm([0, 1, 0.5], [0], { beatSeconds: 1 }))
      .toThrow(/ascending/);
    expect(() => alignRhythm([0, 1], [1, 0.5], { beatSeconds: 1 }))
      .toThrow(/ascending/);
  });

  it('refuses a time that is not a number', () => {
    expect(() => alignRhythm([0, Number.NaN], [0], { beatSeconds: 1 })).toThrow(/not a time/);
    expect(() => alignRhythm([0], [Number.POSITIVE_INFINITY], { beatSeconds: 1 }))
      .toThrow(/not a time/);
  });

  it('refuses a window that cannot be one', () => {
    expect(() => alignRhythm([0], [0], { beatSeconds: 1, toleranceSeconds: 0 }))
      .toThrow(/positive/);
    expect(() => alignRhythm([0], [0], { beatSeconds: 0 })).toThrow(/positive/);
  });
});

/**
 * The two halves of the chain, joined. Everything above feeds the aligner
 * times someone typed; this feeds it times the detector found in a signal,
 * which is the only way to know the two agree about what a time is — the
 * detector reports the centre of a frame, and a half-frame disagreement
 * would pass every test above and fail every real performance.
 */
describe('against onsets the detector actually found', () => {
  it('matches a played sequence to the grid it was synthesised from', () => {
    const beat = 60 / 120;
    const written = grid(6, beat, 0.2);
    const signal = pluckSequence({
      atSeconds: written, frequencyHz: 220, seed: 1301, seconds: 3.4, decaySeconds: 1.5,
    });
    const played = detectOnsets(signal, { sampleRate: DEFAULT_SAMPLE_RATE })
      .onsets.map((o) => o.timeSeconds);

    const alignment = alignRhythm(written, played, { beatSeconds: beat });
    expect(alignment.missed).toEqual([]);
    expect(alignment.extra).toEqual([]);
    expect(alignment.matched).toHaveLength(written.length);
    for (const m of alignment.matched) {
      expect(Math.abs(m.errorSeconds)).toBeLessThan(0.02);
      expect(m.score).toBeGreaterThan(0.75);
    }
  });

  it('calls a note the player left out missed, from the signal alone', () => {
    const beat = 60 / 120;
    const written = grid(6, beat, 0.2);
    const signal = pluckSequence({
      atSeconds: written.filter((_, i) => i !== 3),
      frequencyHz: 220, seed: 1303, seconds: 3.4, decaySeconds: 1.5,
    });
    const played = detectOnsets(signal, { sampleRate: DEFAULT_SAMPLE_RATE })
      .onsets.map((o) => o.timeSeconds);

    const alignment = alignRhythm(written, played, { beatSeconds: beat });
    expect(alignment.missed).toEqual([3]);
    expect(alignment.extra).toEqual([]);
  });
});
