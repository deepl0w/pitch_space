import { makeRng, pick } from '../../theory/rng';
import {
  CHORD_TYPES, INVERSION_LABELS, chord, chordSymbol, chordType, voiceChord, type ChordType,
} from '../../theory/chord';
import { midiOf, parsePitch, type Pitch } from '../../theory/pitch';
import { noteValue } from '../../theory/meter';
import { schedule } from '../../audio/output/schedule';
import type { Voice } from '../../audio/output/synth';
import type { Clef, ScoreSpec } from '../render/toVexflow';
import { presentationField } from '../types';
import type {
  BaseSettings, ExerciseBase, ExerciseSpec, ItemId, Result, SettingsSchema,
} from '../types';

/**
 * Twenty-four chord types, named by ear or read off the staff.
 *
 * The question is the *quality* — what makes a chord minor-major seventh
 * rather than what its root is — so the root is drawn at random and the
 * buttons say "Half-diminished 7th". The same reason the scale and degree
 * exercises transpose: a learner who only ever hears chords on C has
 * learned three particular keyboards shapes.
 *
 * **Inversions are a separate question and are asked separately.** Whether
 * a chord is a dominant seventh, and which of its notes is in the bass,
 * are two skills, and the second is much harder by ear. They are one
 * setting here rather than two exercises because the *answer* stays one
 * thing — a quality, with an inversion attached when the setting is on —
 * and because the progression exercise already demonstrates what happens
 * when a palette has to carry both: it refuses inversions outright because
 * seven buttons would become thirty.
 */

export const CHORD_EXERCISE_ID = 'chord-id';

export const CLEFS: readonly Clef[] = ['treble', 'bass', 'alto', 'tenor'];

/** How the notes arrive: together, or one after another. */
export type ChordSounding = 'block' | 'arpeggio';

export const SOUNDING_LABELS: Record<ChordSounding, string> = {
  block: 'All at once',
  arpeggio: 'One note at a time',
};

/**
 * Where to start: the four triads, which is what a chord is before it is
 * anything else.
 *
 * A default and not a tier — see ADR 0027. Which qualities you practise is
 * the setting, and the twenty-four chips below are the whole of it.
 */
const STARTING_TYPES = ['maj', 'min', 'dim', 'aug'];

export interface ChordSettings extends BaseSettings {
  /** Which chord qualities may be asked. Never empty; the panel refuses that. */
  types: readonly string[];
  /**
   * Ask which note is in the bass as well as what the chord is.
   *
   * Off by default because it is a markedly harder question by ear and
   * answering it wrongly should not cost credit for a quality the
   * listener did name correctly — which it would, since the item would
   * then be the pair.
   */
  inversions: boolean;
  sounding: ChordSounding;
  /** Drop-2 rather than a bare stack: what a pianist's hand actually does. */
  openVoicing: boolean;
  clef: Clef;
}

export interface ChordExercise extends ExerciseBase {
  readonly type: typeof CHORD_EXERCISE_ID;
  readonly typeId: string;
  readonly root: Pitch;
  readonly inversion: number;
  /** The sounding voicing, which is also what the answer staff draws. */
  readonly pitches: readonly Pitch[];
  readonly sounding: ChordSounding;
  readonly clef: Clef;
  readonly choices: readonly string[];
  /** Offered only when the exercise is asking about the bass. */
  readonly inversionChoices: readonly number[];
}

export interface ChordResponse {
  typeId: string;
  /** Absent when inversions are not being asked about. */
  inversion?: number;
  latencyMs?: number;
}

export const CHORD_DEFAULTS: ChordSettings = {
  presentation: 'listen',
  types: STARTING_TYPES,
  inversions: false,
  sounding: 'block',
  openVoicing: false,
  clef: 'treble',
};

/**
 * Roots drawn from.
 *
 * One spelling per sounding root, as in the scale exercise: a chord on G♯
 * and one on A♭ are the same sound, and offering both makes two questions
 * out of one by ear while `spellChord` has to write double accidentals for
 * the altered qualities on the far side.
 */
const ROOTS: readonly Pitch[] = [
  'C3', 'Db3', 'D3', 'Eb3', 'E3', 'F3', 'F#3', 'G3', 'Ab3', 'A3', 'Bb3', 'B3',
].map(parsePitch);

export function allowedTypes(settings: ChordSettings): ChordType[] {
  const wanted = settings.types.length ? settings.types : CHORD_DEFAULTS.types;
  // Through CHORD_TYPES, so the buttons appear in the catalogue's order and
  // not in whichever order the setting happened to be stored in.
  return CHORD_TYPES.filter((t) => wanted.includes(t.id));
}

/**
 * The item is the quality, and the inversion only when it is being asked.
 *
 * `chord:dom7` and `chord:dom7:inv2` are different items on purpose. Naming
 * a dominant seventh and hearing that its fifth is in the bass are
 * different skills with different learning curves, and folding them into
 * one id would mean a listener who has mastered the quality never sees the
 * item settle.
 */
export function chordItemId(typeId: string, inversion: number | null): ItemId {
  return (inversion === null || inversion === 0
    ? `chord:${typeId}`
    : `chord:${typeId}:inv${inversion}`) as ItemId;
}

/** How many inversions a quality has: one per tone, root position included. */
export function inversionsOf(type: ChordType): number[] {
  return type.semitones.map((_, i) => i);
}

export function chordItems(settings: ChordSettings): readonly ItemId[] {
  return allowedTypes(settings).flatMap((t) => (settings.inversions
    ? inversionsOf(t).map((inv) => chordItemId(t.id, inv))
    : [chordItemId(t.id, null)]));
}

export function generateChord(spec: ExerciseSpec<ChordSettings>): ChordExercise {
  const rng = makeRng(spec.seed);
  const settings = spec.settings;
  const types = allowedTypes(settings);
  const chosen = types.length > 0 ? pick(rng, types) : chordType(CHORD_DEFAULTS.types[0]);
  const root = pick(rng, ROOTS);
  const inversions = inversionsOf(chosen);
  const inversion = settings.inversions ? pick(rng, inversions) : 0;
  const voiced = voiceChord(chord(root, chosen, inversion), { open: settings.openVoicing });

  return {
    type: CHORD_EXERCISE_ID,
    seed: spec.seed,
    presentation: settings.presentation,
    items: [chordItemId(chosen.id, settings.inversions ? inversion : null)],
    typeId: chosen.id,
    root,
    inversion,
    pitches: voiced,
    sounding: settings.sounding,
    clef: settings.clef,
    choices: types.map((t) => t.id),
    inversionChoices: settings.inversions ? inversions : [],
  };
}

export function gradeChord(exercise: ChordExercise, response: ChordResponse): Result {
  const asking = exercise.inversionChoices.length > 0;
  const rightQuality = response.typeId === exercise.typeId;
  const rightBass = !asking || response.inversion === exercise.inversion;
  const correct = rightQuality && rightBass;

  const type = chordType(exercise.typeId);
  // Through `chordSymbol` rather than built here, so an inverted chord
  // reads "Am/E" and names the bass it is being asked about. The hand-rolled
  // version said "Am" for every inversion, which is the answer with the
  // interesting half left out.
  const symbol = chordSymbol(chord(exercise.root, type, exercise.inversion));
  const position = asking ? `, ${INVERSION_LABELS[exercise.inversion]}` : '';
  // A response can carry an inversion this chord does not have, from a
  // stored answer or a malformed one; naming it as "undefined" would be
  // worse than not naming it.
  const said = INVERSION_LABELS[response.inversion ?? -1] ?? 'something else';

  return {
    correct,
    feedback: correct
      ? `Yes — ${symbol}${position}.`
      // Said apart, because getting the quality and missing the bass is
      // most of the way there and a flat "no" teaches otherwise.
      : rightQuality
        ? `${type.name} was right. It was ${INVERSION_LABELS[exercise.inversion]}, not `
          + `${said} — ${symbol}.`
        : `That was ${type.name}${position} — ${symbol}.`,
    outcomes: [
      {
        item: chordItemId(exercise.typeId, asking ? exercise.inversion : null),
        correct,
        latencyMs: response.latencyMs,
      },
    ],
  };
}

/** Seconds between onsets when arpeggiated, and how long the chord rings. */
const ARPEGGIO_GAP = 0.3;
const HOLD = 1.8;

export function chordVoicesFor(exercise: ChordExercise): Voice[] {
  const midis = exercise.pitches.map(midiOf);
  if (exercise.sounding === 'arpeggio') {
    return schedule(
      midis.map((midi) => ({ midis: [midi] })),
      { eventGap: ARPEGGIO_GAP, rollGap: 0, hold: ARPEGGIO_GAP * 2.2 },
    );
  }
  // A block chord, struck together: `rollGap` zero, or it becomes an
  // arpeggio and a different question.
  return schedule([{ midis }], { eventGap: 0, rollGap: 0, hold: HOLD });
}

/** The chord as it sounded, so what is drawn is what was heard. */
export function chordScoreSpec(exercise: ChordExercise): ScoreSpec {
  return {
    notes: [{ pitches: [...exercise.pitches], value: noteValue('w') }],
    clef: exercise.clef,
  };
}

export function chordQuestionSpec(exercise: ChordExercise): ScoreSpec | null {
  return exercise.presentation === 'read' ? chordScoreSpec(exercise) : null;
}

function coerceTypes(value: unknown, fallback: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) return fallback;
  const kept = CHORD_TYPES.filter((t) => value.includes(t.id)).map((t) => t.id);
  return kept.length ? kept : fallback;
}

export function coerceChordSettings(stored: unknown): ChordSettings {
  const raw = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>;
  const sounding = raw.sounding as ChordSounding;
  return {
    presentation: raw.presentation === 'read' ? 'read' : 'listen',
    types: coerceTypes(raw.types, CHORD_DEFAULTS.types),
    inversions: raw.inversions === true,
    sounding: sounding in SOUNDING_LABELS ? sounding : CHORD_DEFAULTS.sounding,
    openVoicing: raw.openVoicing === true,
    clef: CLEFS.includes(raw.clef as Clef) ? raw.clef as Clef : CHORD_DEFAULTS.clef,
  };
}

export const chordSettingsSchema: SettingsSchema<ChordSettings> = {
  defaults: CHORD_DEFAULTS,
  coerce: coerceChordSettings,
  fields: [
    presentationField(),
    {
      kind: 'multi', id: 'types', label: 'Chords',
      options: CHORD_TYPES.map((t) => ({ id: t.id, label: t.name })),
      selected: (s) => s.types,
      apply: (s, options) => (options.length === 0 ? s : {
        ...s, types: coerceTypes(options, s.types),
      }),
    },
    {
      kind: 'toggle', id: 'inversions', label: 'Which note is in the bass',
      // Its own caption, because it is the one toggle that changes what
      // is *asked* rather than what the generator may use — the home
      // card calls it "the harder question" and inside the panel it
      // was a pill in the middle of the chord list, styled exactly like
      // "Major" and "Dominant 7th".
      group: 'Also ask',
      selected: (s) => s.inversions,
      apply: (s, on) => ({ ...s, inversions: on }),
    },
    {
      kind: 'choice', id: 'sounding', label: 'Played',
      relevant: (s) => s.presentation === 'listen',
      options: (['block', 'arpeggio'] as ChordSounding[])
        .map((v) => ({ id: v, label: SOUNDING_LABELS[v] })),
      selected: (s) => s.sounding,
      apply: (s, option) => ({
        ...s,
        sounding: option in SOUNDING_LABELS ? option as ChordSounding : s.sounding,
      }),
    },
    {
      kind: 'toggle', id: 'openVoicing', label: 'Spread the voicing (drop-2)',
      group: 'How it sounds',
      selected: (s) => s.openVoicing,
      apply: (s, on) => ({ ...s, openVoicing: on }),
    },
    {
      kind: 'choice', id: 'clef', label: 'Clef',
      relevant: (s) => s.presentation === 'read',
      options: CLEFS.map((c) => ({ id: c, label: c[0].toUpperCase() + c.slice(1) })),
      selected: (s) => s.clef,
      apply: (s, option) => ({
        ...s, clef: CLEFS.includes(option as Clef) ? option as Clef : s.clef,
      }),
    },
  ],
};
