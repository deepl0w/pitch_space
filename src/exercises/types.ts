import type { ComponentType } from 'react';
import type { Voice } from '../audio/output/synth';
import type { ScoreSpec } from './render/toVexflow';
import type { Key, Mode } from '../theory/key';
import { pitchName } from '../theory/pitch';

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
export type Presentation = 'read' | 'listen' | 'play';

/**
 * What the two senses are called on screen.
 *
 * "Listening" and "Reading", and the pair is deliberately not
 * "By ear" / "By eye" — which is what five exercises said, in three
 * different wordings, because each had written the control out again.
 * Hearing and seeing are what your body does; listening and reading are
 * what a musician practises, and they are the words a teacher uses.
 *
 * The *stored* values stay `listen` and `read`. They key every recorded
 * attempt and are a compatibility commitment (ADR 0010); a label is not.
 */
export const PRESENTATION_LABELS: Record<Presentation, string> = {
  listen: 'Listening',
  read: 'Reading',
  play: 'Playing',
};

/**
 * The presentation control, written once.
 *
 * Every exercise that can be asked both ways needs exactly this field,
 * and five of them had hand-rolled it — which is how three of them came
 * to disagree about what to call it ("Asked", "How") and two about what
 * to call its options. The settings schema is data, so a shared field is
 * just a shared value, and the sixth exercise gets it for nothing.
 *
 * An exercise with a single presentation does not call this. A control
 * with one option cannot change the question, and this app has a rule
 * about those.
 *
 * **Which presentations are offered is the exercise's to say**, since
 * "Playing" is only honest where the exercise can actually take an answer
 * from an instrument. Passing the list rather than hard-coding it is what
 * stopped this field offering a mode two of the six could not serve — and
 * the list it is given must be the same one the definition declares, which
 * `registry.test.ts` holds rather than trusting.
 */
export function presentationField<S extends BaseSettings>(
  offered: readonly Presentation[],
): SettingField<S> {
  return {
    kind: 'choice',
    id: 'presentation',
    label: 'Mode',
    options: offered.map((id) => ({ id, label: PRESENTATION_LABELS[id] })),
    selected: (settings) => settings.presentation,
    apply: (settings, option) => ({
      ...settings,
      // Narrowed against what this field actually offers, so a stored or
      // stale value cannot put an exercise into a mode it cannot serve.
      presentation: offered.includes(option as Presentation)
        ? (option as Presentation)
        : offered[0],
    }),
  };
}

/**
 * How a played answer is taken, which is a preference rather than part of
 * any question.
 *
 * **Press** opens the microphone when the learner asks, for a fixed take.
 * **Continuous** leaves it open and reads an answer out of what arrives,
 * which is what an instrument in your hands actually feels like — you play,
 * rather than reaching for the screen first.
 *
 * Not part of a line's identity, by 0039's test: it changes how an answer
 * is given and not which items the settings make askable, so a learner who
 * switches keeps one history. Stored with the app's preferences beside the
 * instrument rather than per exercise, for the same reason the instrument
 * is — it is a fact about how this person plays, not about the question.
 */
export type CaptureStyle = 'press' | 'continuous';

/**
 * A stored presentation, narrowed to what this exercise can serve.
 *
 * Five exercises each wrote `raw.presentation === 'read' ? 'read' :
 * 'listen'`, which was correct while there were two modes and silently
 * wrong the moment there were three: a learner whose settings said
 * `play` would have been put into Listening with no indication, and an
 * exercise that cannot take a played answer would have accepted the
 * value if the expression had merely been widened.
 *
 * Falling back to the first offered mode rather than to `listen`, since
 * an exercise is not obliged to offer that either.
 */
export function coercePresentation(
  raw: unknown, offered: readonly Presentation[],
): Presentation {
  return offered.find((mode) => mode === raw) ?? offered[0];
}

/**
 * The slice every exercise type shares, which is one field.
 *
 * It used to carry a `difficulty: 1 | 2 | 3 | 4 | 5` as well, and the
 * ordinal was the problem rather than the vector it was a placeholder for.
 * Nothing shared ever read it: each of the four exercises using it kept a
 * private table and used the number as a row index, so "level 3" meant
 * four accidentals here, a twelve-semitone register there, and grade five
 * somewhere else. A user who wanted three accidentals could not ask for
 * three accidentals, and the tables between them left grades 1, 3, 6, 8
 * and 10 unreachable from the app at all.
 *
 * Each exercise now names the quantity it was hiding — `maxAccidentals`,
 * `window`, `grade` — and `degree-id`, whose table duplicated a control it
 * already had, names nothing. That is the app's direction, not a tidy-up:
 * the exercises are meant to be configurable, and a preset is only
 * configuration if you can also set what it presets.
 *
 * `presentation` stays shared because it genuinely is: every exercise can
 * be asked by eye or by ear, and an attempt is only comparable with
 * another attempt asked the same way.
 */
export interface BaseSettings {
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
  /**
   * The item the schedule would like asked, if the generator can oblige.
   *
   * **A wish and not a command**, which is the whole design. The obvious
   * seam was `focus(settings, item)` returning narrowed settings, and four
   * of the seven exercises cannot meet that contract: a roman numeral is an
   * *outcome* of harmony generation and a rhythm cell an outcome of the
   * filler, so there is no setting meaning "ask me a `viio`" and there
   * could not be one without the generator becoming a search.
   *
   * Worse, `focus` would not fail loudly. A progression asked to aim at
   * `viio` would return settings making it slightly likelier, the schedule
   * would record that it aimed, and nothing downstream could tell the
   * difference. So the generator answers honestly instead: it aims if it
   * can, ignores the wish if it cannot, and the caller reconciles against
   * `exercise.items`, which already exists and is already trusted.
   *
   * See {@link ExerciseDefinition.aims} for what a definition promises.
   */
  prefer?: ItemId;
}

/**
 * What a definition can do about a {@link ExerciseSpec.prefer}.
 *
 * Three values rather than two, and the third is the point. A boolean
 * invites the exercises that cannot aim exactly to implement something
 * plausible, which is precisely the silent failure this seam exists to
 * avoid.
 */
export type Aiming =
  /** The item asked for is the item asked. The askable set is a projection of a setting. */
  | 'exact'
  /** The wish narrows the field and cannot close it. */
  | 'lossy'
  /** Not expressible as an input. The wish is ignored, and that is honest. */
  | 'none';

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
    relevant?: FieldRelevance<S>;
    selected(settings: S): string;
    apply(settings: S, option: string): S;
  }
  | {
    kind: 'multi'; id: string; label: string;
    /**
     * The chips to offer, which may depend on the other settings.
     *
     * A function where one control's choices are constrained by another's.
     * Tonics are the case: within four accidentals A♭ exists in major and
     * not in minor, so offering all twelve beside a mode switch lets a
     * learner pick a combination that cannot be built — and the app then
     * has to either ignore the tonic or ignore the mode, silently, while
     * both controls still show what was asked for. The user role found
     * exactly that and called it a bug rather than a surprise: "Minor
     * stays visually selected the whole time with nothing indicating the
     * override."
     *
     * Not offering it is the only answer that does not lie. A static list
     * is still a list, so a field with no such coupling passes one.
     */
    options: readonly SettingOption[] | ((settings: S) => readonly SettingOption[]);
    relevant?: FieldRelevance<S>;
    selected(settings: S): readonly string[];
    /** May refuse: an empty pool is not a setting, it is a broken generator. */
    apply(settings: S, options: readonly string[]): S;
  }
  | {
    kind: 'toggle'; id: string; label: string;
    /**
     * A caption for the run of toggles this one opens.
     *
     * Set on the first toggle of a run and left off the rest. The panel
     * draws consecutive toggles as one row of chips, and that row was
     * the only group on the screen with no caption over it — no
     * heading, and no labelled group for a screen reader either, where
     * the clef picker directly above had both. Found by the user role,
     * twice: once as a gap in the layout and once as a gap in the
     * markup.
     *
     * Optional because the caption has to come from the exercise. The
     * panel cannot write one: "Sevenths, diminished triads, borrowed
     * chords" is a harmonic vocabulary and "re-establish the key each
     * time" is how the question is put, and a generic word covering
     * both would be filler.
     */
    group?: string;
    relevant?: FieldRelevance<S>;
    selected(settings: S): boolean;
    apply(settings: S, on: boolean): S;
  };

/**
 * Whether a field applies, given the rest of the settings.
 *
 * A control that cannot affect the next question is worse than a missing
 * one: it invites the user to set something and then ignores them. Key
 * identification asked by ear left its clef and its read-source sitting
 * there enabled, both inert the moment the question stopped being seen.
 *
 * A predicate rather than a flag on the definition, because what makes a
 * field irrelevant is usually another field — and absent means relevant,
 * so a field that never needs to say nothing says nothing.
 */
export type FieldRelevance<S> = (settings: S) => boolean;

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

/**
 * One note the microphone heard, as much of it as grading can use.
 *
 * A structural subset of `HeardNote` in `audio/capture/listen.ts`, declared
 * here rather than imported for the same reason {@link AudioOut} is just
 * enough of `Synth`: the exercise layer does not import the platform, so a
 * prompt still renders under jsdom and the screen owns the one capture
 * source rather than every exercise type opening its own microphone.
 *
 * The subset is the contract. A real `ListenResult` must be handable to a
 * prompt unchanged, so anything added here has to exist there — and the
 * adapter in the screen is the single place the two meet, which is where a
 * drift would show.
 */
export interface PlayedNote {
  /** Seconds from the start of listening. */
  startSeconds: number;
  /** Until the next attack, or the end of the take. */
  durationSeconds: number;
  /**
   * Null when no stable pitch could be read.
   *
   * Not an error and not silence: a struck chord, a muted string and a
   * cough all arrive this way. What an exercise does about it is the
   * exercise's business, which is why this is nullable here rather than
   * filtered out before it arrives.
   */
  frequencyHz: number | null;
}

/**
 * What a take produced: an answer, or no hearing at all.
 *
 * **The two are different answers and no value may mean both**
 * ([0047](../../docs/adr/0047-hearing-nothing-and-not-hearing-are-different-answers.md)).
 * A learner who played nothing has answered — silence is a response, and
 * a wrong one. A learner whose microphone was refused has not been heard,
 * and [0041](../../docs/adr/0041-practice-that-counts-towards-nothing.md)
 * is explicit that an outcome claims the user was asked *and that the
 * answer counts*.
 *
 * The cost of conflating them is not a wrong pixel. A refusal scored as a
 * wrong answer resets the item's streak, drops it down the ladder, and
 * drags the figure on the home card — so one session with a blocked
 * microphone would quietly undo a fortnight of a line's progress with
 * nothing on screen connecting the two. The same purchase as
 * `ProgressStatus` having three states rather than two, at the other end
 * of the same pipeline, and that one has cost almost nothing to carry.
 */
export type Heard =
  | {
    heard: true;
    /** Empty means a silent take, which is an answer. */
    notes: readonly PlayedNote[];
  }
  | {
    heard: false;
    /**
     * Why there was no hearing, for a screen to explain.
     *
     * The exercise layer does not branch on this — it only needs the
     * bit above — but the screen that offered the microphone is the one
     * placed to say what went wrong, and it cannot say it without being
     * told.
     */
    reason: 'refused' | 'unavailable';
  };

/**
 * Just enough of `listen` for a prompt to take an answer that was played.
 *
 * The other half of {@link AudioOut}, and the thing that makes the brief's
 * promise — exercises answered on a real instrument — reachable from an
 * exercise without the exercise knowing a microphone exists.
 *
 * Resolves when the take is over rather than rejecting, because a refused
 * microphone is an ordinary outcome of asking for one and not an
 * exceptional condition; what it must never do is resolve in a way that
 * reads as a silent room.
 */
export interface AudioIn {
  listen(seconds: number): Promise<Heard>;
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
  /**
   * The microphone, for a prompt that can be answered by playing.
   *
   * Required rather than optional, and beside `audio` rather than behind a
   * capability flag, because which exercises can be answered by playing is
   * not a fact about the plumbing — the screen can always supply one, and an
   * exercise that has no use for it simply does not destructure it. Making
   * it optional would mean every prompt that *does* use it has to handle the
   * case where the screen forgot, which is a branch no user can reach and
   * nothing can test honestly.
   */
  audioIn: AudioIn;
  /**
   * Set only when the definition sets `promptDrawsScores`; see
   * {@link PromptDrawnScores}.
   */
  scores?: PromptDrawnScores;
}

/**
 * An exercise whose prompt draws its own stave.
 *
 * The screen draws the question and the answer staves itself for every
 * exercise, which is right while the stave is something to look at. Rhythm
 * needs it to be something that *moves*: a cursor following the audio clock
 * and the written notes coloured by how they were played. That wants the
 * stave inside the component holding the clock and the taps, not beside it.
 *
 * So a definition can take it over. When it does, the screen draws neither
 * stave and hands both specs to the prompt instead — rather than the prompt
 * recomputing them, which would be two callers deciding separately what the
 * question looks like.
 */
/**
 * Which tonics an exercise may build on, as a multi-select of note names.
 *
 * Tonics rather than keys, and that is the whole design. These exercises
 * already have a **Modes** control, so offering "C major, C minor, D
 * major, …" beside it lists every combination twice and — worse — leaves
 * minor keys lit while the mode is major, where they change nothing. A
 * chip that is on and has no effect is the defect this project keeps
 * finding. Tonic and mode compose instead: twelve chips and two, rather
 * than eighteen that half-contradict two.
 *
 * **Empty means every tonic the exercise would otherwise have used**, not
 * none. A stored or hand-edited list can arrive empty and the generator
 * has to keep working; the panel never produces one, because it refuses
 * to unselect the last.
 *
 * **It narrows, it does not widen.** An exercise that only ever used keys
 * within four accidentals still does, so asking for a tonic it cannot
 * build that mode on selects nothing there rather than reaching further
 * than the exercise meant to — and falls back rather than breaking,
 * because "A♭, minor only" is a reasonable thing to click your way into
 * and an empty pool is not an answer to it.
 */
export function keysIn(
  all: readonly Key[], chosenTonics: readonly string[], modes: readonly Mode[],
): readonly Key[] {
  const inMode = all.filter((k) => modes.includes(k.mode));
  const pool = inMode.length > 0 ? inMode : all;

  // The stored ids are prefixed; bare names are accepted too, because a
  // settings blob written before the prefix existed is a real thing a
  // browser can hand back.
  const wanted = new Set(chosenTonics.map((t) => t.replace(/^tonic:/, '')));
  if (wanted.size === 0) return pool;

  const narrowed = pool.filter((k) => wanted.has(pitchName(k.tonic, false)));
  if (narrowed.length > 0) return narrowed;

  /*
    The chosen tonics name nothing this mode can build, so they are
    ignored and the mode stands.

    **The mode wins, and this is the second answer to that question.** It
    first returned the whole unnarrowed pool, which meant ticking one
    tonic handed you every key — the opposite of the request. Then the
    tonic won and the mode gave way, which traded that for a mode control
    showing "Minor" while every question came out major, and the user role
    called it a bug: nothing on screen indicated the override.

    What changed is that neither override is now reachable. `keysField`
    only offers tonics the chosen modes can build, and its `selected`
    ignores stored ones that are no longer offered — so a chip and the
    generator cannot disagree. This branch is left for a settings blob
    written before the mode changed, or edited by hand, and it resolves
    the way the panel displays it: no tonic chosen, so no tonic filter.
  */
  return pool;
}

/** The field itself, so the three panels read identically. */
export function keysField<S extends { keys: readonly string[]; modes: readonly Mode[] }>(
  pool: readonly Key[],
): SettingField<S> {
  /*
    Only the tonics the chosen modes can actually build.

    Within four accidentals A♭ exists in major and not in minor, so a fixed
    list of twelve beside a mode switch lets a learner ask for A♭ *and*
    minor-only — a pair with no key in it. The app then had to drop one of
    them silently while both controls still showed what was asked, and the
    user role called that a bug rather than a surprise: "Minor stays
    visually selected the whole time with nothing indicating the override."

    Not offering the combination is the only answer that does not lie. The
    chips change when the mode does, which is visible and explains itself.
  */
  const tonicsFor = (settings: S) => {
    const modes = settings.modes.length > 0 ? settings.modes : (['major', 'minor'] as const);
    const usable = pool.filter((k) => modes.includes(k.mode));
    const names = (usable.length > 0 ? usable : pool).map((k) => pitchName(k.tonic, false));
    return names.filter((t, i) => names.indexOf(t) === i);
  };
  return {
    kind: 'multi',
    id: 'keys',
    label: 'Tonics',
    /*
      The id is prefixed and the label is the engraved note name. They have
      to differ: the registry guard refuses an option labelled with its own
      id, on the grounds that a label is for a reader and an id is for the
      parser — and `F` would otherwise be both, while `Db` would be an id
      shown to a musician who writes `D♭`.
    */
    options: (settings: S) => tonicsFor(settings).map((t) => ({
      id: `tonic:${t}`,
      label: t.replace('b', '♭').replace('#', '♯'),
    })),
    // Stored empty means "all", and the panel must never show it that way:
    // a row with none lit cannot say whether it means everything or nothing.
    /*
      Intersected with what is on offer, so the chips and the generator
      never disagree. A tonic stored before the mode changed is no longer
      shown, so it must not still be steering generation — and if that
      leaves nothing, the honest reading is "no tonic chosen", which is
      every tonic lit rather than a hidden selection of one.
    */
    selected: (s) => {
      const offered = tonicsFor(s).map((t) => `tonic:${t}`);
      const kept = s.keys.filter((k) => offered.includes(k.startsWith('tonic:') ? k : `tonic:${k}`));
      return kept.length > 0 ? kept : offered;
    },
    apply: (s, options) => (options.length === 0 ? s : { ...s, keys: [...options] }),
  };
}

export interface PromptDrawnScores {
  /** The question's stave, or null once it has been answered. */
  questionScore: ScoreSpec | null;
  /** The answer's stave, or null until there is one. */
  answerScore: ScoreSpec | null;
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
  /**
   * What this exercise promises about {@link ExerciseSpec.prefer}.
   *
   * Absent means `none`. The failure worth guarding is not a definition
   * that declines to aim — it is one that claims `exact` and returns
   * something else, because the schedule records that it aimed and is then
   * confidently wrong about what it taught. `aiming.test.ts` holds each
   * definition to whichever it declares.
   */
  aims?: Aiming;
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

  /**
   * The prompt draws both staves itself; the screen draws neither and
   * passes the specs down. See {@link PromptDrawnScores}.
   */
  promptDrawsScores?: boolean;
  /**
   * Every item these settings make askable, whether or not it has ever
   * been asked.
   *
   * The denominator the schedule needs, and it cannot be recovered from
   * the attempt log: the log says what *has* been asked, and the whole
   * first session is the gap between that and this. "Three intervals due"
   * is a different claim from "three intervals you have already met are
   * due", and only the second is computable from history alone.
   *
   * Settings-dependent on purpose. A user who has unticked everything but
   * the fourth degree has one askable item however much history sits
   * behind the others, and a count that ignored that would promise work
   * the exercise cannot set.
   *
   * **What it owes is containment, not exactness**: every item
   * `generate` can produce under these settings must appear here. Listing
   * something unreachable overstates the work remaining, and
   * `registry.test.ts` checks both directions against the generator
   * rather than against a copy of this list — the same pairing that
   * caught a missing numeral in the progression palette.
   */
  items(settings: S): readonly ItemId[];
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
