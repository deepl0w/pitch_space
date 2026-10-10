// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { EXERCISE_TYPES } from './registry';
import type { AnyExerciseDefinition } from './types';
import { applyValue, valuesOf, widestSettings, type AnyField } from '../testing/settingsSpace';
import { noMicrophone } from './testing/audioIn';

/**
 * Every control does something, asked of every control there is.
 *
 * Three defects in two days had one shape: a sweep that held a user-facing
 * control at its default. `V/VII` had no button in minor at sixteen bars;
 * `tupletId` did not reproduce from its seed because the determinism test's
 * settings never reached a tuplet; and turning diminished triads off did not
 * turn them off. Each time the fix was to widen a sweep by hand, and each
 * time the next control arrived without the widening following.
 *
 * **A new control is a new dimension of every sweep, and that can be
 * mechanical rather than remembered.** This file enumerates
 * `settings.fields` rather than listing anything, so a field added tomorrow
 * is swept tomorrow, and a field nothing responds to fails here by name.
 *
 * The property is deliberately weak — *something* must differ — because a
 * strong one would be a different claim per control and could only be
 * written by hand, which is the thing that keeps failing. Weak and automatic
 * beats strong and forgotten: it cannot say a control is right, only that it
 * is connected to something.
 *
 * **What it does not catch**, so nobody reads it as more than it is: a
 * control that moves the askable list without moving generation passes here,
 * because the fingerprint below is satisfied by any one of its parts
 * changing. That is the shape "turning diminished triads off did not turn
 * them off" had, and it is covered — by the containment and reachability
 * pair in `registry.test.ts`, which compares what `items` lists against what
 * the generator actually produces. Forcing `diminished` off in the context
 * fails ten cases across five files there and none here. The two guards
 * answer different questions and neither subsumes the other: that one asks
 * whether the list and the generator agree, this one asks whether the
 * control is wired to anything at all.
 */

/** Enough seeds that a rarely-taken branch is not missed by luck. */
const SEEDS = Array.from({ length: 60 }, (_, i) => (i * 2654435761) % 0xffffffff);

/** The base to judge a field from: its defaults, or the widest if it is inert there. */
function baseFor(type: AnyExerciseDefinition, field: AnyField): unknown | null {
  for (const base of [type.settings.coerce(type.settings.defaults), widestSettings(type)]) {
    if (field.relevant?.(base) !== false) return base;
  }
  return null;
}

/**
 * What the user can be asked and shown, as one string.
 *
 * Generation and the askable list over a seed sweep, plus the prompt as it
 * first renders. The prompt is included because some controls are honestly
 * about presentation and nothing else — how a scale degree is named is a
 * real choice that leaves the exercise identical — and a guard that could
 * not see those would need a list of exceptions, which is the maintenance
 * burden this file exists to remove.
 */
function fingerprint(type: AnyExerciseDefinition, settings: unknown): string {
  const parts: string[] = [];
  for (const seed of SEEDS) {
    try {
      parts.push(JSON.stringify(type.generate({ seed, settings })));
    } catch (error) {
      parts.push(`threw: ${(error as Error).message}`);
    }
  }
  parts.push([...type.items(settings)].sort().join(','));
  parts.push(promptText(type, settings));
  return parts.join('|');
}

/** The prompt's text at one seed, for the controls that only change wording. */
function promptText(type: AnyExerciseDefinition, settings: unknown): string {
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    act(() => root.render(createElement(type.Prompt, {
      exercise: type.generate({ seed: 7919, settings }),
      settings,
      result: null,
      onRespond: () => {},
      audio: { play: () => {} },
      // Not there rather than silent: this renders every exercise's prompt
      // to read its wording, and a microphone that reported a silent room
      // would be handing each of them an answer.
      audioIn: noMicrophone,
      capture: 'press' as const,
    })));
    return container.textContent ?? '';
  } catch (error) {
    return `threw: ${(error as Error).message}`;
  } finally {
    act(() => root.unmount());
  }
}

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('every setting a user can reach', () => {
  it('is enumerated from the schema rather than listed here', () => {
    // The guard that makes the sweep below automatic. If a field kind is
    // added that `valuesOf` does not understand it returns nothing for it,
    // and the sweep would quietly stop covering that control.
    expect(EXERCISE_TYPES.length).toBeGreaterThan(0);
    for (const type of EXERCISE_TYPES) {
      expect(type.settings.fields.length, `${type.id} offers no settings at all`)
        .toBeGreaterThan(0);
      for (const field of type.settings.fields as AnyField[]) {
        expect(valuesOf(field, type.settings.defaults).length,
          `${type.id}.${field.id} enumerates no values`)
          .toBeGreaterThan(1);
      }
    }
  });

  it('changes something about what the user is asked or shown', () => {
    /*
      The weak property, and the one that is worth having automatically.

      A control that moves through all its values and leaves the generated
      exercise, the askable list and the prompt identical is not a setting —
      it is a promise the app does not keep. That is what "turning diminished
      triads off did not turn them off" was, and what the Neapolitan sixth
      was until it was given the relevance it needed.

      Judged where the control is relevant, not only at the defaults: a field
      that says nothing in one configuration may be the whole question in
      another, and `relevant` is how a field declares which.
    */
    const inert: string[] = [];
    for (const type of EXERCISE_TYPES) {
      for (const field of type.settings.fields as AnyField[]) {
        const base = baseFor(type, field);
        // Irrelevant everywhere this knows how to look. `relevant` is a
        // deliberate statement that the control is not offered, so it is not
        // a broken promise — the panel does not show it.
        if (base === null) continue;

        const seen = new Set<string>();
        for (const value of valuesOf(field, base)) {
          seen.add(fingerprint(type, type.settings.coerce(applyValue(field, base, value))));
        }
        if (seen.size <= 1) inert.push(`${type.id}.${field.id}`);
      }
    }
    expect(inert).toEqual([]);
  });
});
