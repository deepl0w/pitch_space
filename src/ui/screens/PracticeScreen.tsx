import { useEffect, useMemo, useState } from 'react';
import { Score } from '../notation/Score';
import { SettingsPanel } from '../components/SettingsPanel';
import { ExerciseBoundary } from '../components/ExerciseBoundary';
import { EXERCISE_FAMILIES, findFamily, memberOr } from '../../exercises/registry';
import { itemLabel } from '../../exercises/itemLabel';
import { newAttemptId, newSeed } from '../../exercises/seed';
import type { AnyExerciseDefinition, AudioOut, ExerciseBase, Result } from '../../exercises/types';
import { appSynth } from '../sound';
import { settingsStore, useSettings } from '../../state/settingsStore';
import {
  progressStore, tallyItems, tallyKey, useProgress,
  type ItemTally, type TallyKey,
} from '../../state/progressStore';
import type { Attempt } from '../../state/schema';

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
// Navigation belongs to the router, which already puts a back control above
// every screen; a second one here was two ways out of the same page.
export function PracticeScreen({ exerciseId, onSwitch, audio = defaultSynth }: {
  /**
   * Which exercise to run. The route decides, so the menu card and the URL
   * both mean something; the stored `lastExercise` is only the fallback for
   * arriving here without one.
   */
  exerciseId?: string;
  /** Change which exercise is running. The router owns that, not this screen. */
  onSwitch?: (exerciseId: string) => void;
  audio?: AudioOut;
}) {
  const lastExercise = useSettings((s) => s.doc.lastExercise);
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

  const status = useProgress((s) => s.status);
  const unreadable = useProgress((s) => s.unreadable);
  const fromNewerRelease = useProgress((s) => s.fromNewerRelease);
  const attempts = useProgress((s) => s.attempts);
  const tally = useMemo(() => tallyItems(attempts), [attempts]);

  useEffect(() => { void progressStore.getState().load(); }, []);

  return (
    <main>
      <header>
        <h1>{family.name} <span className="tag">practice</span></h1>
        <p className="lede">{definition.description}</p>
        <div className="nav">
          {/*
            The family's own ways of asking, and nothing else. A selector
            listing every exercise in the app would make this a second
            navigation to somewhere the home screen already goes, and would
            put "name the key" beside "name the degree" as though choosing
            between them were part of practising either.

            Hidden for a family of one: a control with a single option is a
            label pretending to be a choice.
          */}
          {family.members.length > 1 && (
            <select
              aria-label={`How to practise ${family.name.toLowerCase()}`}
              value={definition.id}
              onChange={(e) => {
                // Both: the route is what decides which exercise runs, and
                // the stored preference is what a later visit with no route
                // falls back to. Setting only the preference left the control
                // snapping back to the routed id, which read as broken.
                settingsStore.getState().setLastExercise(e.target.value);
                onSwitch?.(e.target.value);
              }}
            >
              {family.members.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/*
        Keyed by type, which is the whole fix: a change of type builds a new
        component rather than handing this one a question it did not generate.
        Nothing below has to remember to reset, now or when it grows.
      */}
      <ExerciseRound key={definition.id} definition={definition} audio={audio} tally={tally} />

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
    </main>
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
function ExerciseRound({ definition, audio, tally }: {
  definition: AnyExerciseDefinition;
  audio: AudioOut;
  tally: Map<TallyKey, ItemTally>;
}) {
  const stored = useSettings((s) => s.doc.exercises[definition.id]);
  // Coerced rather than trusted: what comes back from storage was written by
  // whichever release the user last ran.
  const settings = useMemo(() => definition.settings.coerce(stored), [definition, stored]);

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

    const attempt: Attempt = {
      id: round.id,
      exerciseType: definition.id,
      seed: round.exercise.seed,
      settings: round.settings,
      // From the exercise, not from the live settings: the exercise carries
      // how it was actually asked, and the setting may have been changed
      // since it was generated.
      presentation: round.exercise.presentation,
      startedAt: round.startedAt,
      answeredAt: Date.now(),
      items: [...round.exercise.items],
      outcomes: result.outcomes.map((o) => ({ ...o })),
      correct: result.correct,
    };
    void progressStore.getState().record(attempt);
  }

  return (
    <>
      <SettingsPanel
        fields={definition.settings.fields}
        settings={settings}
        onChange={(next) => settingsStore.getState().setExerciseSettings(definition.id, next)}
      />

      <div className="actions">
        <button type="button" onClick={start}>
          {round === null ? 'Start' : round.result ? 'Next' : 'Skip to the next'}
        </button>
        {session.asked > 0 && (
          <span className="secondary">
            {session.right} of {session.asked} this session
          </span>
        )}
      </div>

      {round === null
        ? <p className="lede">Nothing yet. Start, and two notes will sound.</p>
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
            />
          </ExerciseBoundary>
        )}

      {round?.result && (
        <section className="readout">
          <h2>How this has gone</h2>
          <ol className="items">
            {/*
              Distinct items, because a progression names the same chord
              twice as often as not: ii–V–V–I exercises `progression:major:V`
              in two of its four slots. Both belong in `exercise.items` —
              the schedule is counting chords, not kinds — but the readout
              is a list of what was practised, and the same card printed
              twice says nothing the first one did not, under a React key
              that is no longer unique.
            */}
            {[...new Set(round.exercise.items)].map((item) => {
              // Counted per sense (ADR 0010), so the figure shown is for the
              // way this exercise was actually asked.
              const counts = tally.get(tallyKey(item, round.exercise.presentation));
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
          <p className="secondary">Seed {round.exercise.seed}</p>
        </section>
      )}
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
function RoundView({ definition, round, settings, onRespond, audio }: {
  definition: AnyExerciseDefinition;
  round: Round;
  settings: unknown;
  onRespond: (response: unknown) => void;
  audio: AudioOut;
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
      />
      {questionScore && <Score spec={questionScore} />}
      {answerScore && <Score spec={answerScore} />}
    </>
  );
}
