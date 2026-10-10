import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { installAudioContext, resetAudio } from './audioContext';

/**
 * The fake answers everything the real one is asked for, or says it does not.
 *
 * **Written after a missing method hid a branch for as long as it existed.**
 * `Synth.scheduleNote` chooses per note between a recording and a synthesised
 * tone; the sampled half calls `createBufferSource`, the fake had no such
 * method, and so that half could not run under vitest at all. Nothing failed
 * — the branch was simply never entered — and `withinReach` passing its own
 * unit tests made the gap look like coverage.
 *
 * **That is a different fault from a fixture with a wrong value in it, and
 * harder to see.** A wrong value shows up as a wrong assertion. A *missing
 * capability* shows up as a path never taken, and there is nothing in the
 * test file to read: you cannot grep for a method that is not called. The
 * only thing that can notice it is a comparison against what the real
 * subject actually asks for, which is what this is.
 *
 * Derived from the source rather than from a list, so a method added to the
 * audio layer tomorrow is compared tomorrow.
 */

/** Every `context.<method>(` the shipped audio and UI code calls. */
function methodsCalled(): string[] {
  const roots = [join(process.cwd(), 'src', 'audio'), join(process.cwd(), 'src', 'ui')];
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        for (const match of readFileSync(path, 'utf8').matchAll(/\bcontext\.([a-zA-Z]+)\s*\(/g)) {
          found.add(match[1]);
        }
      }
    }
  };
  roots.forEach(walk);
  return [...found].sort();
}

/**
 * What the fake knowingly does not answer.
 *
 * A named exception with a reason rather than a quiet omission, because the
 * omission is the defect this file is about. `createMediaStreamSource` is
 * the microphone's entry point, and nothing drives the microphone through
 * this fake yet — when something does, this is the first thing it needs, and
 * removing the line here is how it will find that out.
 */
const NOT_ANSWERED: Record<string, string> = {
  createMediaStreamSource: 'no test drives a live microphone through this fake yet',
};

describe('the fake audio context', () => {
  it('is asked for something, or this compares two empty lists', () => {
    // The population: a regex that stopped matching would otherwise make
    // the case below pass by having nothing to compare.
    expect(methodsCalled().length, 'no context calls found in the audio layer')
      .toBeGreaterThan(3);
  });

  it('answers every method the shipped code calls on a context', () => {
    resetAudio();
    installAudioContext();
    const context = new (globalThis as { AudioContext: new () => object }).AudioContext();

    const missing = methodsCalled()
      .filter((method) => !(method in NOT_ANSWERED))
      .filter((method) => typeof (context as Record<string, unknown>)[method] !== 'function');

    expect(missing, 'the fake cannot answer these, so any path through them is untestable')
      .toEqual([]);
  });

  /**
   * And the excuses are for methods that are really missing. An exception
   * left behind after the fake grew the method reads as a known gap that
   * is no longer a gap, which is the same wrong map as the omission.
   */
  it('excuses only what it really does not answer', () => {
    resetAudio();
    installAudioContext();
    const context = new (globalThis as { AudioContext: new () => object }).AudioContext();

    const stale = Object.keys(NOT_ANSWERED)
      .filter((method) => typeof (context as Record<string, unknown>)[method] === 'function');
    expect(stale, 'excused, but the fake answers it').toEqual([]);

    const unused = Object.keys(NOT_ANSWERED).filter((m) => !methodsCalled().includes(m));
    expect(unused, 'excused, but nothing calls it any more').toEqual([]);
  });
});
