import { useEffect, useMemo, useState } from 'react';
import { Score } from '../notation/Score';
import { SettingsPanel } from '../components/SettingsPanel';
import { EXERCISE_TYPES, exerciseTypeOr } from '../../exercises/registry';
import { newAttemptId, newSeed } from '../../exercises/seed';
import type { AudioOut, ExerciseBase, Result } from '../../exercises/types';
import { appSynth } from '../sound';
import { settingsStore, useSettings } from '../../state/settingsStore';
import { progressStore, tallyItems, useProgress } from '../../state/progressStore';
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
  const definition = useMemo(
    () => exerciseTypeOr(exerciseId ?? lastExercise),
    [exerciseId, lastExercise],
  );

  const stored = useSettings((s) => s.doc.exercises[definition.id]);
  // Coerced rather than trusted: what comes back from storage was written by
  // whichever release the user last ran.
  const settings = useMemo(() => definition.settings.coerce(stored), [definition, stored]);

  const [round, setRound] = useState<Round | null>(null);
  const [session, setSession] = useState({ asked: 0, right: 0 });

  const status = useProgress((s) => s.status);
  const unreadable = useProgress((s) => s.unreadable);
  const attempts = useProgress((s) => s.attempts);
  const tally = useMemo(() => tallyItems(attempts), [attempts]);

  useEffect(() => { void progressStore.getState().load(); }, []);

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
      startedAt: round.startedAt,
      answeredAt: Date.now(),
      items: [...round.exercise.items],
      outcomes: result.outcomes.map((o) => ({ ...o })),
      correct: result.correct,
    };
    void progressStore.getState().record(attempt);
  }

  /**
   * The question on the staff, for an exercise being read rather than heard.
   *
   * Shown before the answer and replaced by it afterwards, so a reading
   * exercise has exactly one stave on screen at a time rather than the
   * question and its answer stacked.
   */
  const questionScore = useMemo(
    () => (round && !round.result && definition.questionScore
      ? definition.questionScore(round.exercise)
      : null),
    [round, definition],
  );

  const answerScore = useMemo(
    () => (round?.result && definition.answerScore
      ? definition.answerScore(round.exercise)
      : null),
    [round, definition],
  );

  const Prompt = definition.Prompt;

  return (
    <main>
      <header>
        <h1>{definition.name} <span className="tag">practice</span></h1>
        <p className="lede">{definition.description}</p>
        <div className="nav">
          {EXERCISE_TYPES.length > 1 && (
            <select
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
              {EXERCISE_TYPES.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          )}
        </div>
      </header>

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
          <Prompt
            // A fresh exercise is a fresh component: remounting is what
            // clears the prompt's own state without a reset path that has to
            // be kept in step with it.
            key={round.id}
            exercise={round.exercise}
            settings={settings}
            result={round.result}
            onRespond={respond}
            audio={audio}
          />
        )}

      {questionScore && <Score spec={questionScore} />}
      {answerScore && <Score spec={answerScore} />}

      {round?.result && (
        <section className="readout">
          <h2>How this has gone</h2>
          <ol className="items">
            {round.exercise.items.map((item) => {
              const counts = tally.get(item);
              return (
                <li key={item}>
                  <span className="primary">{item}</span>
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
    </main>
  );
}
