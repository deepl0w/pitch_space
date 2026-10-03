/**
 * What the player played, set against what the exercise asked for.
 *
 * Takes two ascending lists of times in seconds — the grid the exercise
 * writes and the attacks `detectOnsets` found — and says which played attack
 * answers which written note, which written notes nothing answers, and which
 * attacks answer nothing. Pure arithmetic over arrays (ADR 0001); it knows
 * nothing about notation, tempo maps or scoring policy.
 *
 * ## Why this is dynamic programming and not nearest neighbour
 *
 * The obvious implementation walks the written notes and takes the nearest
 * attack to each. It is wrong in a way that flatters the player: nothing stops
 * one attack being the nearest to two written notes, so a performance that
 * played four notes where eight were written can be reported as eight notes
 * all present and slightly off. The error it hides is the one the exercise
 * exists to catch.
 *
 * Nearest-neighbour the other way round — walk the attacks, take the nearest
 * written note — hides the mirror image of the same error, and consuming each
 * match greedily merely makes which error you get depend on the order you
 * happened to iterate in.
 *
 * What is actually wanted is the single best one-to-one, order-preserving
 * correspondence between the two lists, and that is the sequence-alignment
 * problem: every written note is matched, missed, or displaced by an attack
 * that was inserted. A Needleman–Wunsch table over the two lists finds the
 * cheapest such correspondence in O(n·m), which for a bar of music is
 * nothing, and the traceback is the report.
 *
 * Order-preserving is not an incidental property of the method, it is the
 * other half of the point. Music is a sequence: an attack cannot answer the
 * fourth written note if the attack after it answers the second.
 *
 * docs/adr/0009 records the decision, what it costs, and the mutations each
 * part of it was checked against.
 */

/**
 * Half-width of the window a played attack may land in and still be the note
 * that was written, as a fraction of the beat.
 *
 * A quarter of a beat is the gap at which a listener stops hearing a late
 * note as late and starts hearing it as the next subdivision: half of the
 * distance to the neighbouring eighth. Any wider and two adjacent eighths
 * compete for the same attack; the alignment would still be one-to-one, but
 * the grading would stop meaning anything.
 *
 * It is a window sized for eighths, and at a tempo fast enough to be reading
 * sixteenths it is as wide as a whole sixteenth. The alignment is still
 * one-to-one there, so no note is double-counted, but a sixteenth played a
 * full subdivision late would still score. A separate window keyed to the
 * shortest value the exercise actually contains would be the repair, and it
 * wants the exercise to say what that value is.
 */
const TOLERANCE_BEATS = 0.25;

/**
 * …but never wider than this, however slow the music.
 *
 * At 40 bpm a quarter of a beat is 375 ms, and nobody hears a note 375 ms
 * late as on time. 100 ms is the figure the rest of the chain is already
 * built around: it is four hops of the onset detector, comfortably more than
 * the 20 ms or so the detector itself places an attack to, and it is about
 * where two sounds stop being heard as simultaneous.
 */
const TOLERANCE_CEILING_SECONDS = 0.1;

/**
 * What an unmatched note costs the alignment, against a scale on which a
 * perfectly placed note costs nothing and one at or beyond the edge of the
 * window costs 1.
 *
 * This number decides one thing, and it is worth being explicit about which.
 * When a played attack is too far from the written note to score, the
 * alignment has two ways to describe it: call it that note, played badly, or
 * call the note missed and the attack extra. The first costs 1, the second
 * costs 2·`GAP_COST`.
 *
 * Any value strictly between 0.5 and 1 gives the same answer, which is the
 * answer wanted: a *lone* wild attack is still reported as the note it was
 * nearest to, with its error, because "one note, badly late" is a smaller
 * claim than "a note missing and a different note added"; but as soon as two
 * or more consecutive notes would have to be described that way, one dropped
 * note explains all of them at once and the alignment says so and re-aligns
 * the rest. 0.75 is the middle of that interval.
 *
 * It is not a tuned constant and there is nothing to measure it against — the
 * interval is the decision, and both of its ends are asserted. Swept against
 * the suite, 0.5 up to but not including 1 is green; 0.5 itself survives only
 * on the tie-break below, which is why the honest statement of the rule is
 * the open interval. See docs/adr/0009.
 */
const GAP_COST = 0.75;

export interface RhythmAlignOptions {
  /**
   * Seconds per beat at the tempo the exercise is set at. Sets the window,
   * which is why it is required rather than defaulted: a tolerance that
   * silently assumed 60 bpm would grade a presto exercise against a largo
   * window.
   */
  beatSeconds: number;
  /** Overrides the window the tempo would give. Seconds, half-width. */
  toleranceSeconds?: number;
}

export interface MatchedOnset {
  /** Index into the expected grid. */
  expectedIndex: number;
  /** Index into the played attacks. */
  playedIndex: number;
  expectedSeconds: number;
  playedSeconds: number;
  /** Played minus expected, so positive is late and negative is early. */
  errorSeconds: number;
  /**
   * 1 for an attack dead on the beat, falling to 0 at the edge of the window
   * and staying there. Graded rather than pass/fail because the edge of the
   * window is not a musical event: a note 99 ms late and a note 101 ms late
   * were played the same way, and a score that jumps between them is telling
   * the player about the threshold rather than about their playing.
   */
  score: number;
}

export interface RhythmAlignment {
  matched: MatchedOnset[];
  /** Indices into `expected` that no attack answered: notes not played. */
  missed: number[];
  /** Indices into `played` that answered no written note: notes not written. */
  extra: number[];
  /** The window actually used, whether derived or passed in. */
  toleranceSeconds: number;
  /**
   * Mean *signed* error over the matched notes, which separates lag from
   * scatter: a player consistently 40 ms behind the click reports +0.04 here
   * with every individual error near it, where a player who is merely untidy
   * reports something near zero with the individual errors spread either
   * side. The two want different advice.
   *
   * `0` when nothing matched, which is also what a perfectly placed
   * performance reports; `matched.length` is what distinguishes them.
   */
  meanErrorSeconds: number;
}

/**
 * The window for a tempo: a quarter of a beat, never more than 100 ms.
 *
 * Deliberately not a straight fraction of the beat. Scaling all the way down
 * is right — at 200 bpm a quarter beat is 75 ms and a sixteenth is 75 ms, so
 * the window has to shrink or adjacent notes compete — but scaling all the
 * way up is not, because human timing perception does not get looser just
 * because the music is slow.
 */
export function toleranceFor(beatSeconds: number): number {
  if (!Number.isFinite(beatSeconds) || beatSeconds <= 0) {
    throw new Error(`Beat must be a positive number of seconds, got ${beatSeconds}`);
  }
  return Math.min(TOLERANCE_CEILING_SECONDS, TOLERANCE_BEATS * beatSeconds);
}

/** 1 dead on, 0 at the edge of the window and beyond it. */
function scoreFor(errorSeconds: number, toleranceSeconds: number): number {
  return Math.max(0, 1 - Math.abs(errorSeconds) / toleranceSeconds);
}

function assertAscending(times: readonly number[], what: string): void {
  for (let i = 0; i < times.length; i++) {
    if (!Number.isFinite(times[i])) {
      throw new Error(`${what}[${i}] is not a time: ${times[i]}`);
    }
    if (i > 0 && times[i] < times[i - 1]) {
      throw new Error(`${what} must be in ascending order, but [${i}] is ${times[i]} after ${times[i - 1]}`);
    }
  }
}

/** Which of the three predecessors a cell took, kept for the traceback. */
const STEP_MATCH = 0;
const STEP_MISSED = 1;
const STEP_EXTRA = 2;

/**
 * The cheapest one-to-one, order-preserving correspondence between a written
 * grid and a set of played attacks.
 *
 * Both lists are in seconds and must be ascending; `detectOnsets` already
 * returns its onsets that way. Neither is required to be non-empty — a player
 * who played nothing reports every written note missed, which is a real
 * answer and not an error.
 */
export function alignRhythm(
  expected: readonly number[],
  played: readonly number[],
  options: RhythmAlignOptions,
): RhythmAlignment {
  assertAscending(expected, 'expected');
  assertAscending(played, 'played');
  const toleranceSeconds = options.toleranceSeconds ?? toleranceFor(options.beatSeconds);
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds <= 0) {
    throw new Error(`Tolerance must be a positive number of seconds, got ${toleranceSeconds}`);
  }

  const n = expected.length;
  const m = played.length;
  const width = m + 1;
  // What a pairing costs: 0 dead on, 1 at the edge of the window, and no more
  // than 1 however far past it — past the window the pairing scores nothing,
  // and how much nothing it scores is not a distinction worth paying for.
  const pairCost = (i: number, j: number) =>
    Math.min(1, Math.abs(played[j] - expected[i]) / toleranceSeconds);

  const cost = new Float64Array((n + 1) * width);
  const from = new Uint8Array((n + 1) * width);
  for (let i = 1; i <= n; i++) {
    cost[i * width] = i * GAP_COST;
    from[i * width] = STEP_MISSED;
  }
  for (let j = 1; j <= m; j++) {
    cost[j] = j * GAP_COST;
    from[j] = STEP_EXTRA;
  }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const match = cost[(i - 1) * width + (j - 1)] + pairCost(i - 1, j - 1);
      const missed = cost[(i - 1) * width + j] + GAP_COST;
      const extra = cost[i * width + (j - 1)] + GAP_COST;
      // Ties are resolved match, then missed, then extra. They are ties by the
      // measure above, so any of the three is as good an answer; what matters
      // is that the same two lists always give the same one.
      let best = match;
      let step = STEP_MATCH;
      if (missed < best) { best = missed; step = STEP_MISSED; }
      if (extra < best) { best = extra; step = STEP_EXTRA; }
      cost[i * width + j] = best;
      from[i * width + j] = step;
    }
  }

  const matched: MatchedOnset[] = [];
  const missed: number[] = [];
  const extra: number[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const step = i === 0 ? STEP_EXTRA : j === 0 ? STEP_MISSED : from[i * width + j];
    if (step === STEP_MATCH) {
      i--; j--;
      const errorSeconds = played[j] - expected[i];
      matched.push({
        expectedIndex: i,
        playedIndex: j,
        expectedSeconds: expected[i],
        playedSeconds: played[j],
        errorSeconds,
        score: scoreFor(errorSeconds, toleranceSeconds),
      });
    } else if (step === STEP_MISSED) {
      missed.push(--i);
    } else {
      extra.push(--j);
    }
  }
  matched.reverse();
  missed.reverse();
  extra.reverse();

  let errorTotal = 0;
  for (const match of matched) errorTotal += match.errorSeconds;

  return {
    matched,
    missed,
    extra,
    toleranceSeconds,
    meanErrorSeconds: matched.length === 0 ? 0 : errorTotal / matched.length,
  };
}
