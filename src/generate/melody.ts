import { midiOf, type Pitch } from '../theory/pitch';
import { keyScaleType } from '../theory/key';
import { scaleLadder } from '../theory/scale';
import { spellChord } from '../theory/chord';
import { beatLevel, metricWeight, type TimeSignature } from '../theory/meter';
import { weightedPick, type Rng } from '../theory/rng';
import type { Harmony, HarmonyEvent } from './harmony';

/**
 * A line over a given harmony and rhythm.
 *
 * The brief's requirement is that exercises "follow real patterns that
 * exist, not random", and this is the file that claim rests on. A walk
 * over a scale produces something legal and characterless; what makes a
 * melody is that every note can be accounted for.
 *
 * **So every note carries its own justification, and that is the
 * decision the rest of the design follows from.** The search has to
 * compute a note's role to enforce the constraint anyway — is this a
 * passing note, a suspension, a chord tone — so emitting it is free,
 * and it buys three things. A test can assert the analysis is true of
 * the notes rather than re-deriving it. The app can tell a learner why
 * a B♮ worked. And a bug surfaces as a mislabelled role rather than as
 * "it sounds off", which is not a thing a test can see.
 *
 * Beam search rather than a constrained random walk, because the
 * binding constraints are global: a single clear high point, and a line
 * that arrives where the cadence needs it. A walk cannot see far enough
 * to honour either, and rejection-sampling whole phrases degrades badly
 * as constraints stack.
 */

/**
 * What a note is doing against the chord under it.
 *
 * Every non-chord tone has to be one of these. A candidate that cannot
 * be classified is pruned rather than scored down — an unaccountable
 * note is the thing this exercise exists not to produce.
 */
export type NoteRole =
  | 'chord-tone'
  | 'passing'
  | 'neighbour'
  | 'suspension'
  | 'appoggiatura'
  | 'escape'
  | 'anticipation';

export interface MelodyNote {
  pitch: Pitch;
  startTick: number;
  durationTicks: number;
  role: NoteRole;
  /** Index into `harmony.events`: the chord sounding under this note. */
  chord: number;
}

/** One onset the melody has to fill, from the rhythm. */
export interface MelodySlot {
  startTick: number;
  durationTicks: number;
}

export interface MelodyOptions {
  harmony: Harmony;
  /** The rhythm's attacks, in order. Rests are not slots. */
  slots: readonly MelodySlot[];
  /** Inclusive MIDI bounds the line stays inside. */
  range: readonly [number, number];
  /** Survivors kept at each step. */
  beam?: number;
  /**
   * How much the search is allowed to prefer a worse line.
   *
   * A pure argmin beam search is deterministic and boring: every seed
   * in C major yields the same melody, because nothing about the score
   * depends on the seed. Sampling survivors on `exp(-score / T)` keeps
   * it fully reproducible from the seed while letting the second-best
   * line win sometimes, which is the difference between a generator and
   * a lookup table.
   */
  temperature?: number;
}

/** Widest interval the line may leap, in semitones. A ninth is not a leap. */
const MAX_LEAP = 12;

/** How far a candidate may sit from the previous note before it is not a line. */
const CANDIDATE_SPAN = MAX_LEAP;

const DEFAULT_BEAM = 24;
const DEFAULT_TEMPERATURE = 0.6;

/**
 * Soft weights, in one table because they are a tuning problem.
 *
 * None of these is a fact about music and a test that pinned them would
 * make tuning impossible — the project says so about the harmony
 * weights and it is no less true here. They are the knobs; the hard
 * constraints below are the claims.
 */
const PENALTY = {
  /** Per semitone of leap beyond a third, so steps are the default motion. */
  leap: 0.12,
  /** A leap not answered by a step the other way. */
  unfilledGap: 1.4,
  /** Repeating the same pitch. Some is natural; a line of it is not. */
  repeat: 0.5,
  /** Reaching the planned high point more than once, which un-peaks it. */
  duplicateClimax: 3,
  /** Distance from the register the phrase is meant to sit in. */
  drift: 0.05,
  /** A non-chord tone at all, so they are seasoning rather than staple. */
  nonChordTone: 0.3,
  /**
   * Coming back to the pitch two notes ago: A–B–A.
   *
   * The plan names blandness rather than illegality as this
   * generator's real failure mode, and oscillation is what blandness
   * looks like here. Every hard constraint was satisfied by lines
   * reading `E5 C5 E5 C5 E5 C5 E5` — two chord tones traded back and
   * forth for a whole phrase, legal and characterless, and `repeat`
   * did not catch it because no pitch repeats *consecutively*.
   *
   * A penalty and not a rule: A–B–A is a neighbour figure and
   * perfectly good once. What is wrong is a phrase made of them, and
   * a cost per occurrence is what distinguishes those without
   * forbidding either.
   */
  oscillation: 0.55,
} as const;

/**
 * The line, with every note accounted for.
 *
 * Deterministic given `rng`: nothing here reads the clock, and no
 * `Set` or `Map` iteration order decides a musical choice.
 */
export function generateMelody(rng: Rng, options: MelodyOptions): MelodyNote[] {
  const { harmony, slots, range } = options;
  if (slots.length === 0) return [];

  const ladder = scaleLadder(harmony.key.tonic, keyScaleType(harmony.key), range[0], range[1]);
  if (ladder.length === 0) {
    throw new Error(`No scale notes between MIDI ${range[0]} and ${range[1]}`);
  }

  const chordAt = slots.map((slot) => chordIndexFor(harmony.events, slot.startTick));
  const tones = harmony.events.map((event) => new Set(spellChord(event.chord).map(pitchClass)));
  const climax = plan(slots, ladder, rng);

  const beamWidth = options.beam ?? DEFAULT_BEAM;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;

  let states: State[] = startingStates(ladder, chordAt, tones, climax, beamWidth);

  for (let i = 1; i < slots.length; i += 1) {
    const next: State[] = [];
    for (const state of states) {
      for (const pitch of candidates(ladder, state.pitch)) {
        const extended = extend(state, pitch, i, {
          harmony, slots, chordAt, tones, ladder, climax,
        });
        if (extended !== null) next.push(extended);
      }
    }
    if (next.length === 0) {
      // Relaxation, in one documented place and one documented order, so
      // a seed stays reproducible: drop the strong-beat rule before the
      // classification rule, because a chord tone missing from a strong
      // beat is a weaker line and an unaccountable note is a wrong one.
      states = relax(states, i, { harmony, slots, chordAt, tones, ladder, climax });
      if (states.length === 0) throw new Error(`No line fits slot ${i}`);
      continue;
    }
    states = prune(rng, next, beamWidth, temperature);
  }

  const best = states.reduce((a, b) => (a.score <= b.score ? a : b));
  return finish(best, slots, chordAt, tones);
}

/* -- the plan, decided before any note exists ----------------------------- */

interface Climax {
  /** Index of the slot that should hold the line's single high point. */
  at: number;
  midi: number;
}

/**
 * Where the line peaks.
 *
 * Two thirds to three quarters of the way through, which is where a
 * phrase's high point sits in most of the music this app generates
 * from, and never in the first or last bar — a line that peaks on its
 * first note has not gone anywhere and one that peaks on its last has
 * not come back.
 */
function plan(slots: readonly MelodySlot[], ladder: readonly Pitch[], rng: Rng): Climax {
  const first = Math.max(1, Math.floor(slots.length * 0.6));
  const last = Math.max(first, Math.floor(slots.length * 0.8));
  const at = first + Math.floor(rng.next() * (last - first + 1));
  // Near the top of the range but not at it, so the line has somewhere
  // to be without spending the whole phrase at the ceiling.
  const index = Math.max(0, Math.min(ladder.length - 1, Math.floor(ladder.length * 0.78)));
  return { at: Math.min(at, slots.length - 1), midi: midiOf(ladder[index]) };
}

/* -- the search ----------------------------------------------------------- */

interface State {
  /** Pitches chosen so far, newest last. */
  pitches: Pitch[];
  /** Roles for every note *except* the last, which needs its successor. */
  roles: NoteRole[];
  pitch: Pitch;
  score: number;
  reachedClimax: boolean;
}

interface Context {
  harmony: Harmony;
  slots: readonly MelodySlot[];
  chordAt: readonly number[];
  tones: ReadonlyArray<ReadonlySet<number>>;
  ladder: readonly Pitch[];
  climax: Climax;
}

function startingStates(
  ladder: readonly Pitch[], chordAt: readonly number[],
  tones: ReadonlyArray<ReadonlySet<number>>, climax: Climax, beamWidth: number,
): State[] {
  // The first note is a chord tone, always. A phrase that opens on a
  // dissonance has nothing to be dissonant against yet.
  const opening = ladder.filter((p) => tones[chordAt[0]].has(pitchClass(p)));
  const from = opening.length > 0 ? opening : ladder;
  return from
    .map((pitch): State => ({
      pitches: [pitch],
      roles: [],
      pitch,
      score: PENALTY.drift * Math.abs(midiOf(pitch) - climax.midi) * 0.3,
      reachedClimax: midiOf(pitch) >= climax.midi,
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, beamWidth);
}

/** Scale notes within a leap of where the line is. */
function candidates(ladder: readonly Pitch[], from: Pitch): Pitch[] {
  const here = midiOf(from);
  return ladder.filter((p) => Math.abs(midiOf(p) - here) <= CANDIDATE_SPAN);
}

/**
 * Add one note, classifying the note *before* it now that its
 * neighbours are known.
 *
 * Returns null when the previous note cannot be accounted for, which is
 * the hard constraint: a non-chord tone has to be a recognised figure,
 * not merely an interval that happened.
 */
function extend(
  state: State, pitch: Pitch, index: number, ctx: Context, relaxed = false,
): State | null {
  const previousIndex = index - 1;
  const role = classify(state, pitch, previousIndex, ctx);
  if (role === null) return null;

  /*
    The last note is a chord tone, always.

    A phrase arrives somewhere, and where it arrives is decided by the
    cadence rather than by the search. Without this the line could end
    on a dissonance with nothing after it to resolve into — which
    `finish` then had to name, and the only honest name for it was
    "appoggiatura whose resolution never comes". The strong-beat
    sweep caught that: a final note usually lands on a strong beat,
    so the fallback label broke the invariant the search is for.
  */
  if (!relaxed && index === ctx.slots.length - 1
    && !ctx.tones[ctx.chordAt[index]].has(pitchClass(pitch))) {
    return null;
  }

  const strong = isStrong(ctx, previousIndex);
  if (!relaxed && strong && role !== 'chord-tone' && role !== 'suspension') {
    // On a strong beat the harmony has to be audible. A suspension is
    // the licensed exception, because it is a dissonance prepared by
    // the chord before it and resolved by the chord it is over.
    return null;
  }

  const midi = midiOf(pitch);
  const previousMidi = midiOf(state.pitch);
  const step = Math.abs(midi - previousMidi);

  let score = state.score;
  if (step > 4) score += (step - 4) * PENALTY.leap;
  if (step === 0) score += PENALTY.repeat;
  if (role !== 'chord-tone') score += PENALTY.nonChordTone;

  // Gap fill: a leap wants a step back the other way. Checked against
  // the note before the leap, so it is the leap being answered and not
  // merely two notes in a row.
  if (state.pitches.length >= 2) {
    const beforeMidi = midiOf(state.pitches[state.pitches.length - 2]);
    const leap = previousMidi - beforeMidi;
    if (Math.abs(leap) > 4) {
      const answer = midi - previousMidi;
      const answered = Math.sign(answer) === -Math.sign(leap) && Math.abs(answer) <= 2;
      if (!answered) score += PENALTY.unfilledGap;
    }
  }

  if (state.pitches.length >= 2
    && midi === midiOf(state.pitches[state.pitches.length - 2])) {
    score += PENALTY.oscillation;
  }

  const reachedClimax = state.reachedClimax || midi >= ctx.climax.midi;
  if (state.reachedClimax && midi >= ctx.climax.midi) score += PENALTY.duplicateClimax;
  score += PENALTY.drift * Math.abs(midi - ctx.climax.midi) * (index === ctx.climax.at ? 1 : 0.1);

  return {
    pitches: [...state.pitches, pitch],
    roles: [...state.roles, role],
    pitch,
    score,
    reachedClimax,
  };
}

/**
 * What the note at `index` is doing, given what surrounds it.
 *
 * Null means it cannot be accounted for. The order matters only in that
 * a chord tone is checked first; the rest are mutually exclusive by
 * their own shapes.
 */
function classify(state: State, next: Pitch, index: number, ctx: Context): NoteRole | null {
  const pitch = state.pitches[index];
  const chord = ctx.tones[ctx.chordAt[index]];
  if (chord.has(pitchClass(pitch))) return 'chord-tone';

  const here = midiOf(pitch);
  const after = midiOf(next);
  const before = index > 0 ? midiOf(state.pitches[index - 1]) : null;

  const stepTo = Math.abs(after - here) <= 2 && after !== here;
  const stepFrom = before !== null && Math.abs(here - before) <= 2 && here !== before;
  const sameDirection = before !== null && Math.sign(here - before) === Math.sign(after - here);

  // Passing: stepped into and out of, the same way.
  if (stepFrom && stepTo && sameDirection) return 'passing';
  // Neighbour: stepped away and back to where it came from.
  if (stepFrom && stepTo && before === after) return 'neighbour';
  // Suspension: the pitch is held over from the previous chord, and
  // resolves down by step.
  if (before === here && after < here && here - after <= 2) {
    const previousChord = ctx.chordAt[index - 1];
    if (previousChord !== ctx.chordAt[index] && ctx.tones[previousChord].has(pitchClass(pitch))) {
      return 'suspension';
    }
  }
  // Appoggiatura: leapt into, resolved by step the other way.
  if (before !== null && Math.abs(here - before) > 2 && stepTo
    && Math.sign(after - here) === -Math.sign(here - before)) {
    return 'appoggiatura';
  }
  // Escape: stepped into, left by leap the other way.
  if (stepFrom && Math.abs(after - here) > 2
    && Math.sign(after - here) === -Math.sign(here - before!)) {
    return 'escape';
  }
  // Anticipation: it belongs to the *next* chord and is simply early.
  const nextChord = ctx.chordAt[index + 1];
  if (nextChord !== undefined && nextChord !== ctx.chordAt[index]
    && ctx.tones[nextChord].has(pitchClass(pitch))) {
    return 'anticipation';
  }
  return null;
}

/**
 * When nothing fits, drop one rule and try again.
 *
 * A fixed, documented order, so a seed stays reproducible: the
 * strong-beat rule goes before the classification rule, because a
 * strong beat without a chord tone is a weaker line and an
 * unaccountable note is a wrong one.
 */
function relax(states: readonly State[], index: number, ctx: Context): State[] {
  const out: State[] = [];
  for (const state of states) {
    for (const pitch of candidates(ctx.ladder, state.pitch)) {
      const extended = extend(state, pitch, index, ctx, true);
      if (extended !== null) out.push(extended);
    }
  }
  return out.sort((a, b) => a.score - b.score).slice(0, 8);
}

/**
 * Keep the best, but not only the best.
 *
 * Sampled without replacement on `exp(-score / T)`, which is
 * reproducible from the seed and lets a slightly worse line survive —
 * the difference between a generator and a lookup table.
 */
function prune(rng: Rng, states: State[], beamWidth: number, temperature: number): State[] {
  if (states.length <= beamWidth) return states;
  const best = Math.min(...states.map((s) => s.score));
  const pool = states.map((value) => ({
    value,
    weight: Math.exp(-(value.score - best) / Math.max(temperature, 0.01)),
  }));
  const kept: State[] = [];
  const taken = new Set<State>();
  while (kept.length < beamWidth && taken.size < pool.length) {
    const left = pool.filter((entry) => !taken.has(entry.value));
    if (left.every((entry) => entry.weight <= 0)) break;
    const chosen = weightedPick(rng, left);
    taken.add(chosen);
    kept.push(chosen);
  }
  return kept;
}

/** The last note has no successor, so it is classified against itself. */
function finish(
  state: State, slots: readonly MelodySlot[], chordAt: readonly number[],
  tones: ReadonlyArray<ReadonlySet<number>>,
): MelodyNote[] {
  const lastIndex = state.pitches.length - 1;
  // Normally a chord tone, because the search requires it of the last
  // slot. The other branch is reachable only through relaxation, where
  // every rule is already being bent to find any line at all, and
  // "appoggiatura" is the nearest true name for a note leaning on the
  // chord with nothing after it to resolve into.
  const lastRole: NoteRole = tones[chordAt[lastIndex]].has(pitchClass(state.pitches[lastIndex]))
    ? 'chord-tone'
    : 'appoggiatura';
  const roles = [...state.roles, lastRole];

  return state.pitches.map((pitch, i) => ({
    pitch,
    startTick: slots[i].startTick,
    durationTicks: slots[i].durationTicks,
    role: roles[i],
    chord: chordAt[i],
  }));
}

/* -- small shared things -------------------------------------------------- */

function pitchClass(pitch: Pitch): number {
  return ((midiOf(pitch) % 12) + 12) % 12;
}

function isStrong(ctx: Context, index: number): boolean {
  const ts: TimeSignature = ctx.harmony.timeSignature;
  const tick = ctx.slots[index].startTick;
  return metricWeight(ts, tick % ts.barTicks) >= beatLevel(ts);
}

/** The chord sounding at a tick; the last one that has started. */
function chordIndexFor(events: readonly HarmonyEvent[], tick: number): number {
  let at = 0;
  for (const [i, event] of events.entries()) {
    if (event.startTick <= tick) at = i;
  }
  return at;
}
