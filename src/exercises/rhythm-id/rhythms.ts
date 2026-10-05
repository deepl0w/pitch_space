import { makeRng } from '../../theory/rng';
import { TICKS_PER_QUARTER, TIME_SIGNATURES, timeSignature } from '../../theory/meter';
import { generateRhythm, type RhythmBar } from '../../generate/rhythm';
import { CELLS, cellKindFor, cellsOfKind } from '../../generate/cells';
import { alignRhythm, toleranceFor, type RhythmAlignment } from '../../audio/dsp/rhythmAlign';
import { parsePitch, midiOf } from '../../theory/pitch';
import type { Voice } from '../../audio/output/synth';
import type { ScoreNote, ScoreSpec } from '../render/toVexflow';
import type {
  BaseSettings, ExerciseBase, ExerciseSpec, ItemId, Result, SettingsSchema,
} from '../types';

/**
 * Read or hear a rhythm, then play it back in time.
 *
 * **The answer is a performance, not a choice**, and that is the whole
 * reason this exercise is shaped differently from the other five. Naming
 * a rhythm off a list tests reading a rhythm; the thing a musician
 * practises is placing it. So the user taps it, and grading is the same
 * dynamic-programming alignment the microphone path will use when it
 * exists — `alignRhythm` was written for onsets off a detector and does
 * not care where the attacks came from.
 *
 * Tapping is not a stand-in for the microphone that the brief asks for.
 * It is how rhythm is practised away from an instrument, and it stays
 * worth having after capture lands: the same exercise, a different
 * source of attacks.
 *
 * **The item is the cell**, not the bar and not the exercise. "The
 * syncopated beat" is a figure you get better at; the bar it landed in
 * is not. `generateRhythm` carries the cell ids out for this, because
 * the events cannot recover them — two sixteenths and an eighth look the
 * same whether they came from one cell or two.
 */

export const RHYTHM_EXERCISE_ID = 'rhythm-id';

/** Rhythm is read on one pitch; the middle line is the convention. */
export const RHYTHM_PITCH = parsePitch('B4');

/** The click, an octave up, so a count-in is not mistaken for the rhythm. */
const CLICK_PITCH = parsePitch('B5');

export const TEMPO_CHOICES: readonly number[] = [50, 60, 72, 84, 96, 112, 132, 160];
export const BAR_CHOICES: readonly number[] = [1, 2, 4, 8];

/** Metres the cell library can actually fill. Checked by a test, not assumed. */
export const METER_CHOICES: readonly string[] = TIME_SIGNATURES.map((ts) => ts.id);

export interface RhythmSettings extends BaseSettings {
  meter: string;
  bars: number;
  /** Quarter-notes per minute, as a tempo marking is written. */
  tempo: number;
  rests: boolean;
  tuplets: boolean;
  /** How many syncopated figures one bar may carry. Zero bars them. */
  syncopation: number;
}

export interface RhythmExercise extends ExerciseBase {
  readonly type: typeof RHYTHM_EXERCISE_ID;
  readonly meter: string;
  readonly tempo: number;
  readonly bars: readonly RhythmBar[];
  /**
   * When each written attack falls, in seconds from the first beat.
   *
   * Precomputed because both halves need it and neither should derive it
   * again: the playback schedules from it and the grader aligns against
   * it, and two derivations of "where the notes are" is how a question
   * comes to be marked against a different rhythm from the one it played.
   */
  readonly onsets: readonly number[];
  /** Which cell each onset belongs to, parallel to `onsets`. */
  readonly onsetCells: readonly string[];
  readonly countInBeats: number;
}

export interface RhythmResponse {
  /** Tap times in seconds from the first beat, ascending. */
  taps: readonly number[];
}

export const RHYTHM_DEFAULTS: RhythmSettings = {
  /*
    Read, and only read. Listening was offered until it was tried as a
    learner rather than as a test: it played a rhythm, took your taps and
    told you "you were behind the beat", and never drew the rhythm at any
    point — not while you answered, not after. There was nothing to learn
    from, because the thing you got wrong was never shown to you.

    Hearing a rhythm and playing it back is a real skill and this is not a
    judgement on it. It needs the notation revealed against your attempt to
    be worth practising, and that is a different exercise from this one.
  */
  presentation: 'read',
  meter: '4/4',
  bars: 2,
  tempo: 84,
  rests: true,
  tuplets: false,
  syncopation: 0,
};

/** Seconds per quarter note at a tempo marking. */
export function beatSeconds(tempo: number): number {
  return 60 / tempo;
}

/** Seconds from the first beat to a tick. */
export function secondsAt(tick: number, tempo: number): number {
  return (tick / TICKS_PER_QUARTER) * beatSeconds(tempo);
}

/**
 * Every figure these settings admit.
 *
 * Derived from the catalogue and the constraints, not sampled from the
 * generator. The first version ran 120 seeds and collected what came
 * back, which is a denominator that depends on how long you looked —
 * it under-listed a rare cell, and the contract test caught it as an
 * item listed-but-never-tested in the other direction the moment the
 * sweeps disagreed about the budget. A list that has to be sampled to
 * be known is not a list.
 *
 * The filters are the selector's own, in the same order `isAllowed`
 * applies them: the kind of beat the metre has, then rests, tuplets and
 * whether syncopation is allowed at all.
 */
export function rhythmItems(settings: RhythmSettings): readonly ItemId[] {
  const ts = meterOf(settings);
  return cellsOfKind(cellKindFor(ts))
    .filter((cell) => {
      if (cell.tags.includes('rest') && !settings.rests) return false;
      if (cell.tags.includes('tuplet') && !settings.tuplets) return false;
      if (cell.tags.includes('syncopated') && settings.syncopation === 0) return false;
      // A two-beat cell needs two beats of the same length beside each
      // other, which an additive metre like 7/8 does not always have.
      if (cell.beats === 2 && !ts.beatDurations.some((d, i) => ts.beatDurations[i + 1] === d)) {
        return false;
      }
      // A figure made only of rests is silence. It can be *in* the bar —
      // a bar of nothing but rests is refused, a beat of them is not —
      // but the user plays nothing for it and grading has nothing to
      // credit, so it belongs in the exercise and not in the schedule's
      // denominator. The same distinction as the key a degree question
      // happens to pick: contained, not tested.
      if (cell.events.every((e) => e.rest)) return false;
      return true;
    })
    .map((cell) => `cell:${cell.id}` as ItemId);
}

function meterOf(settings: RhythmSettings) {
  return timeSignature(
    METER_CHOICES.includes(settings.meter) ? settings.meter : RHYTHM_DEFAULTS.meter,
  );
}

function generatorOptions(settings: RhythmSettings) {
  return {
    timeSignature: meterOf(settings),
    bars: settings.bars,
    allowRests: settings.rests,
    allowTuplets: settings.tuplets,
    syncopationsPerBar: settings.syncopation,
  };
}

export function generateRhythmExercise(
  spec: ExerciseSpec<RhythmSettings>,
): RhythmExercise {
  const settings = spec.settings;
  const bars = generateRhythm(makeRng(spec.seed), generatorOptions(settings));

  const onsets: number[] = [];
  const onsetCells: string[] = [];
  for (const bar of bars) {
    for (const event of bar.events) {
      // Rests are not attacks, and a note tied from the one before it is
      // the same attack continuing — tapping it again would be wrong.
      if (event.isRest || event.tiedFromPrevious) continue;
      onsets.push(secondsAt(event.startTick, settings.tempo));
      onsetCells.push(cellAt(bar, event.startTick, settings));
    }
  }

  return {
    type: RHYTHM_EXERCISE_ID,
    seed: spec.seed,
    presentation: settings.presentation,
    items: [...new Set(bars.flatMap((b) => b.cellIds))].map((id) => `cell:${id}` as ItemId),
    meter: settings.meter,
    tempo: settings.tempo,
    bars,
    onsets,
    onsetCells,
    countInBeats: meterOf(settings).beatStarts.length,
  };
}

/**
 * Which cell an attack belongs to.
 *
 * By beat position rather than by counting events, because a cell may be
 * two beats long and a bar's cells are placed beat by beat. A tick that
 * lands past the last placement — which a tie across the bar line can
 * produce — is credited to the last cell rather than dropped.
 */
function cellAt(bar: RhythmBar, tick: number, settings: RhythmSettings): string {
  const ts = meterOf(settings);
  const within = tick - bar.startTick;
  let beat = 0;
  for (let i = 0; i < ts.beatStarts.length; i += 1) {
    if (within >= ts.beatStarts[i]) beat = i;
  }
  // `cellIds` is one per placement, and a two-beat placement covers two
  // beat slots — so walk the placements accumulating their spans rather
  // than indexing by beat.
  let at = 0;
  for (const [i, id] of bar.cellIds.entries()) {
    const span = spanOf(bar, i);
    if (beat < at + span) return id;
    at += span;
  }
  return bar.cellIds[bar.cellIds.length - 1] ?? '';
}

/**
 * How many beats a placement covers.
 *
 * Read off the catalogue rather than stored on the bar: `cellIds` is the
 * identity and `CELLS` already knows the span, so storing it would be a
 * second copy that can disagree. One for an id this build does not
 * recognise, which cannot happen today and would otherwise loop.
 */
const CELL_BEATS = new Map(CELLS.map((c) => [c.id, c.beats]));

function spanOf(bar: RhythmBar, index: number): number {
  return CELL_BEATS.get(bar.cellIds[index]) ?? 1;
}

/**
 * What the user hears: a count-in, then the rhythm.
 *
 * The count-in is the whole of what makes this answerable. Without it
 * there is no shared downbeat, and "play it back in time" has no time to
 * be in — the first tap would define the tempo and every error after it
 * would be measured against the user's own guess.
 */
export function rhythmVoices(exercise: RhythmExercise, options: { silent?: boolean } = {}): Voice[] {
  const beat = beatSeconds(exercise.tempo);
  const lead = exercise.countInBeats * beat;
  const voices: Voice[] = [];
  for (let i = 0; i < exercise.countInBeats; i += 1) {
    voices.push({
      midi: midiOf(CLICK_PITCH),
      start: i * beat,
      duration: 0.06,
      // The downbeat louder, so a count-in says where "one" is.
      gain: i === 0 ? 1 : 0.55,
    });
  }
  // Listening plays the rhythm; reading plays only the count-in, because
  // the staff is the question and sounding it would answer it.
  if (!options.silent) {
    for (const at of exercise.onsets) {
      voices.push({ midi: midiOf(RHYTHM_PITCH), start: lead + at, duration: 0.12 });
    }
  }
  return voices;
}

/** Where the count-in ends and the first written beat falls. */
export function leadInSeconds(exercise: RhythmExercise): number {
  return exercise.countInBeats * beatSeconds(exercise.tempo);
}

export function gradeRhythm(exercise: RhythmExercise, response: RhythmResponse): Result {
  const taps = [...response.taps].sort((a, b) => a - b);
  const alignment = alignRhythm(exercise.onsets, taps, {
    beatSeconds: beatSeconds(exercise.tempo),
  });

  // Every written attack placed, nothing extra. A tap inside the window
  // but poorly placed still counts as the note being there — the score
  // says how well, and the verdict says whether it was played at all.
  const correct = alignment.missed.length === 0
    && alignment.extra.length === 0
    && alignment.matched.every((m) => m.score > 0);

  return {
    correct,
    feedback: verdict(alignment, exercise),
    outcomes: creditCells(exercise, alignment),
  };
}

/**
 * One outcome per cell, credited on the attacks that belong to it.
 *
 * A cell is right when every attack in it was matched and none of them
 * was at the edge of the window. Crediting the bar instead would tell
 * the schedule that a learner who placed three figures and fluffed the
 * fourth knows none of them, which is the complaint ADR 0007 makes about
 * a single verdict for a whole exercise.
 */
function creditCells(exercise: RhythmExercise, alignment: RhythmAlignment): Result['outcomes'] {
  const scoreByOnset = new Map<number, number>();
  for (const m of alignment.matched) scoreByOnset.set(m.expectedIndex, m.score);

  const byCell = new Map<string, boolean>();
  for (const [i, cell] of exercise.onsetCells.entries()) {
    const placed = (scoreByOnset.get(i) ?? 0) > 0;
    byCell.set(cell, (byCell.get(cell) ?? true) && placed);
  }
  // An extra tap is not attributable to a cell — it answers no written
  // note — so it fails the exercise and is reported in the verdict
  // rather than being charged to whichever figure it landed nearest.
  return [...byCell].map(([cell, right]) => ({ item: `cell:${cell}` as ItemId, correct: right }));
}

function verdict(alignment: RhythmAlignment, exercise: RhythmExercise): string {
  const total = exercise.onsets.length;
  if (alignment.matched.length === 0) {
    return total === 0 ? 'Nothing to play.' : 'Nothing landed close enough to a written note.';
  }
  const parts: string[] = [`${alignment.matched.length} of ${total} placed`];
  if (alignment.missed.length > 0) parts.push(`${alignment.missed.length} missed`);
  if (alignment.extra.length > 0) {
    parts.push(`${alignment.extra.length} extra ${alignment.extra.length === 1 ? 'tap' : 'taps'}`);
  }

  /*
    Lag reported separately from scatter, which is the distinction
    `meanErrorSeconds` exists for and the one that changes the advice. A
    player consistently behind the click has a different thing to fix
    from one who is merely untidy, and "you were 40 ms out" tells
    neither of them which they are.
  */
  const ms = Math.round(alignment.meanErrorSeconds * 1000);
  const tolerance = Math.round(alignment.toleranceSeconds * 1000);
  if (Math.abs(ms) >= tolerance / 3) {
    parts.push(`${Math.abs(ms)} ms ${ms > 0 ? 'behind' : 'ahead of'} the beat throughout`);
  } else {
    const spread = Math.round(1000 * Math.sqrt(
      alignment.matched.reduce((sum, m) => sum + (m.errorSeconds - alignment.meanErrorSeconds) ** 2, 0)
      / alignment.matched.length,
    ));
    parts.push(`${spread} ms of scatter`);
  }
  return `${parts.join(', ')}.`;
}

/**
 * The rhythm on one pitch: no pitch is being asked about.
 *
 * Tuplets are carried through rather than dropped. A triplet drawn as
 * three plain eighths is a bar that does not add up — the notes are
 * right and the notation is a lie — and `ScoreNote.tuplet` exists for
 * exactly this. Ties are not carried, because this generator never
 * produces one: cells are beat-aligned and a bar is built from whole
 * cells, so nothing crosses a boundary. Swept over every metre and
 * every constraint set, 24,094 events and not one tie; the day
 * `rhythm.ts` learns to split across a bar line, this needs the other
 * half and the renderer needs to grow it.
 */
export function rhythmScoreSpec(exercise: RhythmExercise): ScoreSpec {
  const notes: ScoreNote[] = [];
  for (const bar of exercise.bars) {
    for (const event of bar.events) {
      notes.push({
        pitches: event.isRest ? [] : [RHYTHM_PITCH],
        value: event.value,
        ...(event.tupletId !== undefined && event.tupletRatio
          ? { tuplet: { id: event.tupletId, ...event.tupletRatio } }
          : {}),
      });
    }
  }
  return { notes, clef: 'treble', timeSignature: timeSignature(exercise.meter) };
}

export function rhythmQuestionSpec(exercise: RhythmExercise): ScoreSpec {
  return rhythmScoreSpec(exercise);
}

function coerceNumber(value: unknown, allowed: readonly number[], fallback: number): number {
  const n = Number(value);
  return allowed.includes(n) ? n : fallback;
}

export function coerceRhythmSettings(stored: unknown): RhythmSettings {
  const raw = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>;
  return {
    // Only one presentation exists; a stored 'listen' is from before it went.
    presentation: 'read',
    meter: METER_CHOICES.includes(raw.meter as string)
      ? raw.meter as string : RHYTHM_DEFAULTS.meter,
    bars: coerceNumber(raw.bars, BAR_CHOICES, RHYTHM_DEFAULTS.bars),
    tempo: coerceNumber(raw.tempo, TEMPO_CHOICES, RHYTHM_DEFAULTS.tempo),
    rests: raw.rests !== false,
    tuplets: raw.tuplets === true,
    syncopation: coerceNumber(raw.syncopation, SYNCOPATION_CHOICES, RHYTHM_DEFAULTS.syncopation),
  };
}

export const SYNCOPATION_CHOICES: readonly number[] = [0, 1, 2, 3];

export const rhythmSettingsSchema: SettingsSchema<RhythmSettings> = {
  defaults: RHYTHM_DEFAULTS,
  coerce: coerceRhythmSettings,
  fields: [
    {
      kind: 'choice', id: 'meter', label: 'Metre',
      options: METER_CHOICES.map((id) => ({ id, label: id })),
      selected: (s) => s.meter,
      apply: (s, option) => ({
        ...s, meter: METER_CHOICES.includes(option) ? option : s.meter,
      }),
    },
    {
      kind: 'choice', id: 'bars', label: 'Length (bars)',
      options: BAR_CHOICES.map((b) => ({ id: `${b}`, label: `${b}` })),
      selected: (s) => `${s.bars}`,
      apply: (s, option) => ({ ...s, bars: coerceNumber(option, BAR_CHOICES, s.bars) }),
    },
    {
      kind: 'choice', id: 'tempo', label: 'Tempo (bpm)',
      options: TEMPO_CHOICES.map((t) => ({ id: `${t}`, label: `${t}` })),
      selected: (s) => `${s.tempo}`,
      apply: (s, option) => ({ ...s, tempo: coerceNumber(option, TEMPO_CHOICES, s.tempo) }),
    },
    {
      kind: 'choice', id: 'syncopation', label: 'Syncopated figures per bar',
      options: SYNCOPATION_CHOICES.map((n) => ({ id: `${n}`, label: `${n}` })),
      selected: (s) => `${s.syncopation}`,
      apply: (s, option) => ({
        ...s, syncopation: coerceNumber(option, SYNCOPATION_CHOICES, s.syncopation),
      }),
    },
    {
      kind: 'toggle', id: 'rests', label: 'Rests',
      group: 'Figures in play',
      selected: (s) => s.rests,
      apply: (s, on) => ({ ...s, rests: on }),
    },
    {
      kind: 'toggle', id: 'tuplets', label: 'Tuplets',
      selected: (s) => s.tuplets,
      apply: (s, on) => ({ ...s, tuplets: on }),
    },
  ],
};

export { toleranceFor };
