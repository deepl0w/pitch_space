import { useEffect, useMemo, useState } from 'react';
import { Score } from '../notation/Score';
import { SettingsPanel } from '../components/SettingsPanel';
import { Field, OneOf } from '../controls';
import { ExerciseBoundary } from '../components/ExerciseBoundary';
import { EXERCISE_FAMILIES, findFamily, memberOr } from '../../exercises/registry';
import { itemLabel } from '../../exercises/itemLabel';
import { newAttemptId, newSeed } from '../../exercises/seed';
import type {
  AnyExerciseDefinition, AudioIn, AudioOut, CaptureStyle, ExerciseBase, ItemId, Result,
} from '../../exercises/types';
import { appSynth } from '../sound';
import { appMicrophone } from '../microphone';
import { settingsStore, useSettings } from '../../state/settingsStore';
import { lineOfRound } from '../../state/line';
import {
  progressStore, tallyItems, tallyKey, useProgress,
  type ItemTally, type TallyKey,
} from '../../state/progressStore';
import { attemptFrom } from '../../state/attempt';

/**
 * One screen for every exercise type.
 *
 * It knows the registry, the `ExerciseDefinition` contract and the two
 * stores, and nothing about intervals — so the sixth exercise type does not
 * touch this file. What it owns is the loop: mint a seed, generate, show the
 * prompt, grade what comes back, record the attempt, show the answer.
 */

/**
 * The app's one synth, not a second of its own.
 *
 * Building one here gave the exercise path an audio graph that `stopSound`
 * could not reach, so an interval played on over the home screen after the
 * user pressed back.
 */
const defaultSynth = appSynth;

/**
 * The app's microphone, defaulted in the same way and for the same reason.
 *
 * A test renders this screen under jsdom, which has no `getUserMedia`, so
 * the real one has to be replaceable from outside — and the exercise layer
 * must not reach for it directly, which is what `AudioIn` being declared in
 * `exercises/types.ts` is for. `ui/microphone.ts` is the only file that
 * knows a microphone is involved at all.
 */
const defaultMicrophone = appMicrophone;

interface Round {
  /** Also the attempt's id, so a recorded attempt is the round it came from. */
  id: string;
  exercise: ExerciseBase;
  /**
   * Frozen at generation.
   *
   * Changing the settings mid-exercise must not change the exercise or the
   * answers on offer — narrowing the interval list could otherwise take the
   * correct answer off the screen — and it is also what the attempt records,
   * so it has to be what was actually used.
   */
  settings: unknown;
  /**
   * Everything those settings could have asked, frozen with them.
   *
   * Computed here rather than at answering time so there is no live
   * `settings` in scope to reach for by mistake. ADR 0039 keys a
   * progression line on this set, and taking it from the panel after the
   * learner has changed something would file the attempt under a line
   * they were never practising — which is the stale-settings defect
   * again, in the one place it would corrupt stored history rather than
   * a drawing.
   */
  askable: readonly ItemId[];
  startedAt: number;
  result: Result | null;
}

/**
 * The chrome, which outlives any one exercise type.
 *
 * The heading and the type selector live here and the round lives in
 * {@link ExerciseRound} below, keyed by type, so changing type *remounts*
 * rather than reassigns. That split is the fix for a defect that shipped
 * twice over: the round and the session tally both used to survive a change
 * of type, so the incoming exercise's code ran against the outgoing
 * exercise's question — four of the six ordered pairs threw, from four
 * different files — and the tally silently blended two exercises' answers
 * into one "7 of 9 this session".
 *
 * Discarding by remount rather than by a reset path is deliberate (ADR 0015).
 * A reset path is a list of fields that has to be kept in step with the state
 * it clears, and the evidence here is that such a list is not kept in step:
 * the crash and the tally were the same defect, and only the loud half was
 * noticed. A key cannot fall behind, so the type that adds state next gets
 * this for free — which is what the registry's "one import and one array
 * entry" promise needs in order to be true of the screen as well.
 */
// The back control lives in this screen's own sidebar rather than above it.
// Every other route keeps the router's, which is still the only one on the
// page — the shell moved it, it did not add a second.
export function PracticeScreen({
  exerciseId, onSwitch, onBack, audio = defaultSynth, audioIn = defaultMicrophone,
}: {
  /**
   * Which exercise to run. The route decides, so the menu card and the URL
   * both mean something; the stored `lastExercise` is only the fallback for
   * arriving here without one.
   */
  exerciseId?: string;
  /** Change which exercise is running. The router owns that, not this screen. */
  onSwitch?: (exerciseId: string) => void;
  /** Leave for the home screen. The router owns that too. */
  onBack?: () => void;
  audio?: AudioOut;
  audioIn?: AudioIn;
}) {
  const lastExercise = useSettings((s) => s.doc.lastExercise);
  // Subscribed rather than read once: a learner who changes how answers
  // are taken while a round is open should have the next one taken that
  // way, not the next session.
  const capture = useSettings((s) => s.doc.appearance.capture);
  /**
   * The family the route names, and the member within it.
   *
   * The route may name either — a family id is what the menu links to now,
   * and a member id is what older links and bookmarks carry — so both
   * resolve. Within the family the stored preference decides, which is what
   * makes "the way I practise this" stick without making it a separate
   * route.
   */
  const family = useMemo(
    () => findFamily(exerciseId ?? '') ?? findFamily(lastExercise ?? '') ?? EXERCISE_FAMILIES[0],
    [exerciseId, lastExercise],
  );
  const definition = useMemo(
    () => memberOr(family, exerciseId && family.members.some((m) => m.id === exerciseId)
      ? exerciseId
      : lastExercise),
    [family, exerciseId, lastExercise],
  );

  /*
    Coerced here rather than in `ExerciseRound`, because the panel that
    writes these and the round that reads them are now in different
    columns and both need the same value. Coerced rather than trusted:
    what comes back from storage was written by whichever release the
    user last ran.
  */
  const stored = useSettings((s) => s.doc.exercises[definition.id]);
  const settings = useMemo(() => definition.settings.coerce(stored), [definition, stored]);

  const status = useProgress((s) => s.status);
  const unreadable = useProgress((s) => s.unreadable);
  const fromNewerRelease = useProgress((s) => s.fromNewerRelease);
  const attempts = useProgress((s) => s.attempts);
  const tally = useMemo(() => tallyItems(attempts), [attempts]);

  useEffect(() => { void progressStore.getState().load(); }, []);

  return (
    /*
      No `main` of its own. This rendered one while `App` was already
      rendering one around it, which is two `main` elements on every
      practice page — invalid, and the reason the shell below could not
      own the viewport until it was noticed.
    */
    <div className="practice-layout">
      {/*
        The sidebar: where you are, and what you are being asked. The
        panel is rendered here rather than inside `ExerciseRound` so the
        column can be the height of the window — inside, it began below
        the heading and the grid could only be as tall as what was left.
        Both read the same store, so hoisting it drills no props.
      */}
      <aside className="practice-settings">
        <button className="back" onClick={onBack}>&larr; Everything</button>
        {/*
          Which way to practise this family, in the sidebar with every
          other thing you set about the exercise — and as bubbles, like
          them. It was a dropdown under the heading, which made it look
          like part of the title rather than a setting, and made it the
          one control on the screen you had to open to see your options.

          Hidden for a family of one: a control with a single option is a
          label pretending to be a choice.
        */}
        {family.members.length > 1 && (
          <Field label="Exercise" group>
            <OneOf
              options={family.members.map((type) => ({ id: type.id, label: type.name }))}
              chosen={definition.id}
              onChange={(id) => {
                // Both: the route decides which exercise runs, and the
                // stored preference is what a later visit with no route
                // falls back to. Setting only the preference left the
                // control snapping back to the routed id.
                settingsStore.getState().setLastExercise(id);
                onSwitch?.(id);
              }}
            />
          </Field>
        )}

        <SettingsPanel
          fields={definition.settings.fields}
          settings={settings}
          onChange={(next) => settingsStore.getState().setExerciseSettings(definition.id, next)}
        />
      </aside>

      <div className="practice-main">
      <header>
        {/* No "practice" tag. You are on the practice screen; saying so
            is the heading telling you where you already are. */}
        <h1>{family.name}</h1>
        <p className="lede">{definition.description}</p>
      </header>

      <div className="practice-body">
      {/*
        Keyed by type, which is the whole fix: a change of type builds a new
        component rather than handing this one a question it did not generate.
        Nothing below has to remember to reset, now or when it grows.
      */}
      <ExerciseRound
        key={definition.id}
        definition={definition}
        audio={audio}
        audioIn={audioIn}
        capture={capture}
        tally={tally}
        settings={settings}
      />

      {status === 'unavailable' && (
        <p className="warning">
          Progress is not being saved — this device would not let the app open its
          database. Practice still works; the history will not outlast the tab.
        </p>
      )}
      {unreadable > 0 && (
        <p className="warning">
          {unreadable} stored {unreadable === 1 ? 'attempt' : 'attempts'} could not be
          read back and {unreadable === 1 ? 'is' : 'are'} being ignored.
        </p>
      )}
      {/*
        Said separately from the one above, and deliberately not as a warning
        about the data: these rows are intact. This build is older than they
        are, which happens between two tabs on different deploys or after a
        downgrade. Telling the user it "could not be read" invites them to
        clear the history, which is the only thing here that would really lose
        it.
      */}
      {fromNewerRelease > 0 && (
        <p className="note">
          {fromNewerRelease} stored {fromNewerRelease === 1 ? 'attempt was' : 'attempts were'} written
          by a newer version of the app, so {fromNewerRelease === 1 ? 'it is' : 'they are'} not shown
          here. Nothing has been lost — {fromNewerRelease === 1 ? 'it' : 'they'} will read again once
          this device is up to date. Clearing the history would delete
          {fromNewerRelease === 1 ? ' it' : ' them'}.
        </p>
      )}
      </div>
      </div>
    </div>
  );
}

/**
 * One exercise type's round, and everything scoped to it.
 *
 * Separate from the chrome above so that it can be keyed by type. Everything
 * here — the round, the session tally, and whatever a later exercise type
 * needs — is discarded wholesale when the type changes, because this
 * component stops existing rather than being told to tidy up.
 */
function ExerciseRound({ definition, audio, audioIn, capture, tally, settings }: {
  definition: AnyExerciseDefinition;
  audio: AudioOut;
  audioIn: AudioIn;
  capture: CaptureStyle;
  tally: Map<TallyKey, ItemTally>;
  /** Coerced once by the screen, which also renders the panel that sets it. */
  settings: unknown;
}) {

  const [round, setRound] = useState<Round | null>(null);
  // Per type, because that is what the number means. It used to be one
  // counter for the screen, so answering three intervals and switching to
  // keys kept counting into the same "of" — two exercises blended under one
  // name, with nothing on screen to say so.
  const [session, setSession] = useState({ asked: 0, right: 0 });

  function start() {
    // Minting the seed is an application event and belongs here rather than
    // in the core (ADR 0005). It is recorded with the attempt, so an
    // exercise a user complains about can be reconstructed exactly.
    const seed = newSeed();
    const fresh = definition.settings.coerce(
      settingsStore.getState().doc.exercises[definition.id],
    );
    setRound({
      id: newAttemptId(),
      exercise: definition.generate({ seed, settings: fresh }),
      settings: fresh,
      askable: definition.items(fresh),
      startedAt: Date.now(),
      result: null,
    });
  }

  function respond(response: unknown) {
    // Guarded rather than only disabled in the prompt: a second response is
    // a second attempt at an exercise the user has already seen the answer
    // to, and recording it would tell the schedule something untrue.
    if (!round || round.result) return;
    const result = definition.grade(round.exercise, response);
    setRound({ ...round, result });
    setSession((s) => ({ asked: s.asked + 1, right: s.right + (result.correct ? 1 : 0) }));

    const attempt = attemptFrom(round, definition.id, result, Date.now(), round.askable);
    void progressStore.getState().record(attempt);
  }

  return (
    <>
      <div className="actions">
        <button type="button" onClick={start}>
          {round === null ? 'Start' : round.result ? 'Next' : 'Skip to the next'}
        </button>
        {/*
          Always on the page, blank until there is a tally to put in it.

          It used to appear with the first answer, and appearing is a
          layout change: it pushed everything below it down 27px, which
          is most of what remained of the question jumping when you
          answered. The line above this one holds the question still
          against anything *below* it; nothing could hold it against a
          sibling that was not there a moment ago.

          Measured at 27px on every exercise and at both widths, which
          is what identified it — a shift that did not vary with the
          answer's height was never the answer's doing.
        */}
        <span className="secondary" aria-hidden={session.asked === 0 || undefined}>
          {session.asked > 0
            ? `${session.right} of ${session.asked} this session`
            : '\u00a0'}
        </span>
      </div>

      {/*
        Everything except the button that asks for a question.

        The button stays where it is between states and the question
        centres in the room below it. Centring the whole body instead
        moved the button as content appeared under it — "Start" and
        "Skip to the next" are the same control one press apart and
        they landed in different places, which the user noticed before
        any of us did.
      */}
      <div className="round-body">

      {round === null
        /*
          Generic, because this screen serves six exercises and the line it
          used to carry — "two notes will sound" — was true of exactly one
          of them. Found by the user role sweeping the text rather than the
          behaviour, which is the only way a sentence that is merely false
          gets noticed: nothing about it fails.

          A per-exercise line would be better still and belongs on the
          definition beside `description`, not here. This at least does not
          promise something the exercise will not do.
        */
        ? <p className="lede">Nothing yet — press Start for your first question.</p>
        : (
          /*
            Keyed by round as well as wrapped: a boundary that kept its error
            would leave the exercise broken for good, where a fresh seed
            deserves a fresh attempt. "Next" sits outside it, so a user whose
            question failed to draw can always ask for another one.
          */
          <ExerciseBoundary key={round.id} seed={round.exercise.seed}>
            <RoundView
              definition={definition}
              round={round}
              settings={settings}
              onRespond={respond}
              audio={audio}
              audioIn={audioIn}
              capture={capture}
            />
          </ExerciseBoundary>
        )}

      {round?.result && (
        <section className="readout">
          <h2>How this has gone</h2>
          <ol className="items">
            {/*
              **The outcomes, not `exercise.items`.** ADR 0024, decided on
              4 October and built now — the gap is itself the point, since
              the comment that used to sit here already said "the readout
              is a list of what was practised" while the code listed what
              was *shown*.

              The difference is a row that can never fill. An item in
              `items` and not in `outcomes` is contained-and-not-tested,
              which ADR 0007 keeps two lists to express: degree
              identification shows `key:Ab_major` and grades only the
              degree, so a learner read "Ab major — not recorded yet"
              after every attempt and reasonably concluded they were
              failing to practise something. Nothing they could do would
              clear it.

              `items` is for the scheduler and `outcomes` is for the
              learner. The scheduler wants to know what was exercised; the
              reader wants to know what was judged.

              Distinct, still, for the reason the old comment gave: a
              progression names the same chord twice as often as not —
              ii–V–V–I grades `progression:major:V` in two of its four
              slots — and the same card printed twice says nothing the
              first one did not, under a React key that is no longer
              unique.
            */}
            {[...new Set(round.result.outcomes.map((o) => o.item))].map((item) => {
              /*
                Counted per line (ADR 0039), so the figure is for the pool
                the learner was actually practising — not for this item
                across every pool they have ever had it in. The line comes
                off the round rather than the panel for the same reason
                the attempt's does: the settings may have moved since.
              */
              const counts = tally.get(tallyKey(lineOfRound(definition.id, round), item));
              return (
                <li key={item}>
                  <span className="primary">{itemLabel(item)}</span>
                  <span className="secondary">
                    {counts ? `${counts.correct} of ${counts.seen} right` : 'not recorded yet'}
                  </span>
                </li>
              );
            })}
          </ol>
          {/*
            No seed here. It was printed on every answered round for a
            reader who has no use for it — generation is reproducible
            from `(seed, settings)`, which matters when something has
            gone wrong and never otherwise. `ExerciseBoundary` still
            names it when a round fails to draw, which is the one moment
            it is worth a line, so nothing that made it worth showing has
            been lost.
          */}
        </section>
      )}
      </div>
    </>
  );
}

/**
 * The parts of a round that run an exercise type's own code.
 *
 * Separate from {@link ExerciseRound} so that all of it sits *inside* the
 * boundary. `questionScore` and `answerScore` call into the definition during
 * render, and two of the four transition crashes came from there rather than
 * from a prompt — so computing them in the parent would put the most
 * likely throw above the thing meant to catch it.
 */
function RoundView({ definition, round, settings, onRespond, audio, audioIn, capture }: {
  definition: AnyExerciseDefinition;
  round: Round;
  settings: unknown;
  onRespond: (response: unknown) => void;
  audio: AudioOut;
  audioIn: AudioIn;
  capture: CaptureStyle;
}) {
  /**
   * The question on the staff, for an exercise being read rather than heard.
   *
   * Shown before the answer and replaced by it afterwards, so a reading
   * exercise has exactly one stave on screen at a time rather than the
   * question and its answer stacked.
   */
  const questionScore = useMemo(
    () => (!round.result && definition.questionScore
      ? definition.questionScore(round.exercise)
      : null),
    [round, definition],
  );

  const answerScore = useMemo(
    () => (round.result && definition.answerScore
      ? definition.answerScore(round.exercise)
      : null),
    [round, definition],
  );

  const Prompt = definition.Prompt;

  return (
    <>
      <Prompt
        // A fresh exercise is a fresh component: remounting is what clears
        // the prompt's own state without a reset path that has to be kept in
        // step with it.
        key={round.id}
        exercise={round.exercise}
        settings={settings}
        result={round.result}
        onRespond={onRespond}
        audio={audio}
        audioIn={audioIn}
        capture={capture}
        scores={definition.promptDrawsScores ? { questionScore, answerScore } : undefined}
      />
      {!definition.promptDrawsScores && questionScore && <Score spec={questionScore} />}
      {!definition.promptDrawsScores && answerScore && <Score spec={answerScore} />}
    </>
  );
}
