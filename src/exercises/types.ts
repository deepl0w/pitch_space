import type { ComponentType } from 'react';
import type { Voice } from '../audio/output/synth';
import type { ScoreSpec } from './render/toVexflow';

/**
 * What an exercise type is, as a contract rather than as a convention.
 *
 * There will be six of these — sight reading, note identification, rhythm,
 * chord, chord progression, scale — and the sixth should cost almost nothing
 * to add. That only holds if the screen, the settings panel and the attempt
 * log are written against this file and never against a particular exercise.
 *
 * **The seams**, in the order they are most likely to be tested:
 *
 * - `generate` takes an {@link ExerciseSpec} and nothing else, so an exercise
 *   is reproducible from `(seed, settings)` alone (ADR 0002, ADR 0005).
 * - `grade` is a pure function of `(exercise, response)`. Every interesting
 *   claim an exercise makes is in here, which is why it is kept out of the
 *   component: a grader behind an onClick cannot be property-tested.
 * - `settings.fields` is a *description* of the settings rather than a panel
 *   that renders them, so one generic settings panel serves every exercise
 *   type and a new one contributes a list rather than a component.
 * - `Prompt` is the only part that has to be written by hand per exercise,
 *   because asking "which interval was that" and asking "play this bar" have
 *   nothing in common. It is handed audio rather than reaching for it, so a
 *   prompt can be rendered in a test with no AudioContext.
 * - `grade` returns {@link ItemOutcome}s, not a score, which is the seam the
 *   spaced-repetition scheduler attaches to later. See ADR 0007.
 */

/**
 * A practisable atom, as a colon-joined path: `interval:m3:up`,
 * `chord:dom7:inv2`, `read:treble:ledger_above:A5`.
 *
 * These key a user's review history, so they are a compatibility commitment
 * from the first release — renaming one silently orphans everything the user
 * has learned about it. The arity varies by kind deliberately; see ADR 0007.
 */
export type ItemId = string;

/**
 * What one item's worth of a response was worth.
 *
 * Per item rather than per exercise, because a sight-reading bar tests a key
 * signature, a dozen intervals and several rhythmic cells at once and the
 * user plays it once. Credit and blame have to localise or the schedule
 * punishes six things for one wrong note. See ADR 0007 and the spaced
 * repetition section of docs/ROADMAP.md.
 */
export interface ItemOutcome {
  item: ItemId;
  correct: boolean;
  /**
   * Milliseconds from the moment the item became answerable to the answer.
   *
   * Optional because not every exercise can say when that moment was, but
   * worth recording wherever it can: a musician who plays the right note
   * after two seconds of thought has not learned it, and the scheduler is
   * meant to shorten the interval for hesitation as well as for error.
   */
  latencyMs?: number;
}

/** What `grade` says about one response. */
export interface Result {
  correct: boolean;
  /** One line for the user, already phrased. */
  feedback: string;
  /**
   * Only the items this response actually tested.
   *
   * An item the exercise merely *contained* — a key signature in a bar with
   * no accidentals — belongs in `Exercise.items` and not here, because
   * crediting it would teach the schedule that the user knows something they
   * were never asked.
   */
  outcomes: readonly ItemOutcome[];
}

/**
 * The difficulty slice every exercise type shares.
 *
 * One number rather than a vector, for now. The ROADMAP's "difficulty vector"
 * is the per-exercise constraints plus this, and keeping the shared part to a
 * single ordinal is what lets one settings panel and one default-difficulty
 * preference work across every type.
 */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

/**
 * How a question is put to the user.
 *
 * Nearly every exercise here can be asked either way, and they are different
 * skills: reading a minor third off the staff and hearing one share a name
 * and almost nothing else. A learner can be fluent at one and hopeless at
 * the other, so this is a setting rather than a house style, and progress is
 * tracked against the item *and* the sense it was tested through.
 *
 * `read` means the question is on the staff and nothing sounds. `listen`
 * means it sounds and the staff stays empty until the answer is given.
 */
export type Presentation = 'read' | 'listen';

export const PRESENTATION_LABELS: Record<Presentation, string> = {
  read: 'Read it',
  listen: 'Hear it',
};

export interface BaseSettings {
  difficulty: Difficulty;
  presentation: Presentation;
}

/**
 * Everything generation is allowed to depend on.
 *
 * The seed is minted by the app layer at the moment the user asks for a new
 * exercise and spent by the core (ADR 0005), so it arrives here as an
 * ordinary number — which is also what makes an exercise shareable, loggable
 * and replayable from a bug report.
 */
export interface ExerciseSpec<S> {
  seed: number;
  settings: S;
}

/** What every generated exercise carries, whatever else it carries. */
export interface ExerciseBase {
  /** The {@link ExerciseDefinition.id} that produced it. */
  readonly type: string;
  readonly seed: number;
  /**
   * How this one was asked.
   *
   * Carried on the exercise rather than read from settings at render time,
   * because changing the setting mid-question must not change the question —
   * and because an attempt is only comparable with another attempt asked the
   * same way.
   */
  readonly presentation: Presentation;
  /**
   * Every item this rendering *contains*, tested or not.
   *
   * Distinct from the outcomes grading reports: the generator knows what it
   * put in the bar, and only the grader knows which of it the user was
   * actually asked about. Keeping both is what lets the schedule tell "never
   * shown" from "shown and not tested".
   */
  readonly items: readonly ItemId[];
}

/* -- settings schema ------------------------------------------------------ */

/**
 * A description of a setting, not a control.
 *
 * The screen renders these generically, so adding an exercise type adds a
 * list of fields rather than a settings component — which is most of why the
 * sixth exercise is cheap. Three kinds cover everything the five planned
 * types need; a fourth belongs here rather than in a bespoke panel.
 *
 * A field reads and writes the settings through `selected` and `apply`
 * rather than naming a property. The panel therefore never has to know
 * whether a stored option is a string, a number or a list — which is where
 * the generic version of this kept needing a cast — and a field is free to
 * front something derived rather than a bare property.
 */
export type SettingField<S> =
  | {
    kind: 'choice'; id: string; label: string; options: readonly SettingOption[];
    selected(settings: S): string;
    apply(settings: S, option: string): S;
  }
  | {
    kind: 'multi'; id: string; label: string; options: readonly SettingOption[];
    selected(settings: S): readonly string[];
    /** May refuse: an empty pool is not a setting, it is a broken generator. */
    apply(settings: S, options: readonly string[]): S;
  }
  | {
    kind: 'toggle'; id: string; label: string;
    selected(settings: S): boolean;
    apply(settings: S, on: boolean): S;
  };

export interface SettingOption {
  /** Stored, so it is as much of a compatibility commitment as an item id. */
  id: string;
  label: string;
}

export interface SettingsSchema<S> {
  defaults: S;
  fields: readonly SettingField<S>[];
  /**
   * Make settings of whatever came back from storage.
   *
   * Persisted settings outlive the release that wrote them: an option can be
   * withdrawn, a field can be added, and a user can hand-edit localStorage.
   * Every exercise therefore owns a total function from `unknown` to valid
   * settings rather than trusting the stored shape, which is the difference
   * between a stale preference and a screen that will not render.
   */
  coerce(stored: unknown): S;
}

/* -- the prompt ----------------------------------------------------------- */

/**
 * Just enough of {@link import('../audio/output/synth').Synth} for a prompt to
 * sound its exercise.
 *
 * Handed in rather than imported, so a prompt renders under jsdom — which has
 * no AudioContext — and so the screen owns the one Synth instance rather than
 * every exercise type minting its own.
 */
export interface AudioOut {
  play(voices: readonly Voice[]): void;
}

export interface PromptProps<S extends BaseSettings, E extends ExerciseBase, R> {
  exercise: E;
  /**
   * The settings the exercise was generated from.
   *
   * A prompt usually has to offer the same constraints the generator drew
   * from — an interval exercise limited to thirds and fifths should not put
   * eleven other buttons on the screen — and reaching into the settings store
   * from here would make the prompt untestable and the store its dependency.
   */
  settings: S;
  /** Null until the user has answered; the graded result afterwards. */
  result: Result | null;
  /** Hand the response up. The screen grades it and records the attempt. */
  onRespond(response: R): void;
  audio: AudioOut;
}

/* -- the definition ------------------------------------------------------- */

export interface ExerciseDefinition<S extends BaseSettings, E extends ExerciseBase, R> {
  /**
   * Stable across releases: it names the settings slot in localStorage and
   * the `exerciseType` on every recorded attempt.
   */
  id: string;
  name: string;
  /** One sentence, shown when the user is choosing what to practise. */
  description: string;
  /**
   * The senses this exercise can be asked through.
   *
   * Declared rather than assumed, because not every exercise has both: a key
   * signature has nothing to hear, and sight reading is reading by
   * definition. The settings panel offers only what is listed here, so an
   * exercise cannot be put into a mode it has no question for.
   */
  presentations: readonly Presentation[];
  settings: SettingsSchema<S>;
  generate(spec: ExerciseSpec<S>): E;
  grade(exercise: E, response: R): Result;
  Prompt: ComponentType<PromptProps<S, E, R>>;
  /**
   * The answer, engraved, for the screen to show once it has been given.
   *
   * Here rather than inside the prompt so that `src/ui/` stays the only
   * direction notation flows: a prompt that rendered `Score` itself would
   * have `exercises/` importing `ui/` importing `exercises/render/`, and the
   * containment in ADR 0003 is easiest to keep while that arrow points one
   * way. Optional, because a rhythm exercise answers on a staff and a
   * key-signature one does not.
   */
  answerScore?(exercise: E): ScoreSpec;
  /**
   * The question, engraved, for an exercise being read rather than heard.
   *
   * Here rather than in the prompt for the same reason `answerScore` is: a
   * prompt that rendered `Score` itself would have `exercises/` importing
   * `ui/` importing `exercises/render/`, and ADR 0003's containment is
   * easiest to keep while that arrow points one way. Returning null means
   * there is nothing to show — which is the normal case when listening.
   */
  questionScore?(exercise: E): ScoreSpec | null;
}

/**
 * A definition with its type parameters forgotten, which is what a registry
 * holds and what a screen that does not know which exercise it is showing
 * can call.
 *
 * The three parameters always agree *within* one definition and never across
 * two, and TypeScript has no way to say that about an array element. `any`
 * here is confined to this alias: everything that builds a definition does so
 * through {@link defineExercise}, which checks the three against each other
 * before they are forgotten.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export type AnyExerciseDefinition = ExerciseDefinition<any, any, any>;

/**
 * Build a definition with its parameters checked, then widen it once.
 *
 * Without this the widening happens at the registry's array literal, where
 * `any` swallows a `grade` that does not take the exercise its own `generate`
 * returns — a mismatch that would then surface as a runtime error on the one
 * exercise type nobody clicked.
 */
export function defineExercise<S extends BaseSettings, E extends ExerciseBase, R>(
  definition: ExerciseDefinition<S, E, R>,
): AnyExerciseDefinition {
  return definition;
}
