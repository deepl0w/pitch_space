import { beforeEach, describe, expect, it } from 'vitest';
import { Synth, type Voice } from './synth';
import {
  advanceAudioClock, audioClock, audioClosed, contextCount, gains, installAudioContext,
  masterGain, oscillators, resetAudio, soundingAfter,
} from '../../testing/audioContext';

/**
 * The synth, against an AudioContext that records rather than sounds.
 *
 * `stopAll` is the fix for a user-visible defect — notes are scheduled into
 * the future against the audio clock, so leaving a screen left the rest of
 * the passage playing over whatever came next — and until there was something
 * to observe, it was asserted by nothing. "Is anything still due to sound
 * after this moment" is a question about numbers, which is why it can be
 * asked here without listening.
 */

let synth: Synth;

beforeEach(() => {
  resetAudio();
  installAudioContext();
  synth = new Synth();
});

const notes = (count: number, gap = 0.5): Voice[] =>
  Array.from({ length: count }, (_, i) => ({ midi: 60 + i, start: i * gap, duration: 0.4 }));

describe('playing', () => {
  it('waits for a gesture before it opens an AudioContext', () => {
    // Browsers refuse to start one otherwise, so building it at module load
    // would get a suspended context and no sound.
    expect(contextCount()).toBe(0);
    expect(synth.currentTime).toBe(0);
    synth.play(notes(1));
    expect(contextCount()).toBe(1);
  });

  it('keeps one context however many times it plays', () => {
    synth.play(notes(1));
    synth.play(notes(1));
    synth.play(notes(1));
    expect(contextCount()).toBe(1);
  });

  it('gives every voice a distinct attack, in the order asked for', () => {
    synth.play(notes(4));
    const attacks = [...new Set(oscillators().map((o) => o.startedAt))];
    expect(attacks).toHaveLength(4);
    expect(attacks).toEqual([...attacks].sort((a, b) => a! - b!));
  });

  it('schedules a chord as one attack, so it does not arpeggiate itself', () => {
    synth.play([
      { midi: 60, start: 0, duration: 1 },
      { midi: 64, start: 0, duration: 1 },
      { midi: 67, start: 0, duration: 1 },
    ]);
    expect(new Set(oscillators().map((o) => o.startedAt)).size).toBe(1);
  });

  it('never schedules a note in the past', () => {
    // A start time already gone is played immediately or not at all, and
    // either way the rhythm is not the one that was written.
    advanceAudioClock(12.5);
    synth.play(notes(6, 0.25));
    for (const oscillator of oscillators()) {
      expect(oscillator.startedAt, 'scheduled behind the clock')
        .toBeGreaterThan(audioClock());
    }
  });

  it('stops each voice after it has had its duration', () => {
    synth.play([{ midi: 60, start: 0, duration: 0.4 }]);
    for (const oscillator of oscillators()) {
      expect(oscillator.stoppedAt!).toBeGreaterThan(oscillator.startedAt! + 0.4);
    }
  });
});

describe('the envelope', () => {
  /**
   * An envelope is a sequence of automation calls, and the Web Audio rules it
   * has to obey are not type errors: an exponential ramp from zero never
   * leaves zero, one to zero is invalid outright, and two events at the same
   * time make the result depend on order. Any of those silences a note while
   * every other note around it sounds — which is the shape a listener reports
   * as "one note is missing" rather than as "the audio is broken".
   */
  const envelopes = () => gains().slice(1).filter((g) => g.events.length > 1);

  it('rises, decays and fades, in that order, for every voice', () => {
    synth.play(notes(5, 0.2));
    expect(envelopes().length).toBe(5);
    for (const [i, envelope] of envelopes().entries()) {
      const times = envelope.events.map((e) => e.time);
      expect(times, `voice ${i}: times not strictly increasing`)
        .toEqual([...new Set(times)].sort((a, b) => a - b));
      expect(Math.max(...envelope.events.map((e) => e.value)), `voice ${i}: silent`)
        .toBeGreaterThan(0);
    }
  });

  it('never ramps exponentially from or to zero', () => {
    synth.play(notes(4, 0.2));
    for (const envelope of envelopes()) {
      envelope.events.forEach((event, i) => {
        if (event.kind !== 'exponential') return;
        expect(event.value, 'exponential ramp to zero').toBeGreaterThan(0);
        expect(envelope.events[i - 1]?.value, 'exponential ramp from zero').toBeGreaterThan(0);
      });
    }
  });

  it('shapes the last voice exactly like the first', () => {
    // The last note of a passage has nothing after it to mask a fault in its
    // tail, so it is the one a listener notices.
    synth.play([
      { midi: 60, start: 0, duration: 0.4 },
      { midi: 62, start: 0.4, duration: 0.08 },
    ]);
    const shapes = envelopes().map((g) => g.events.map((e) => e.kind).join(','));
    expect(new Set(shapes).size, `envelopes differ: ${shapes.join(' | ')}`).toBe(1);
  });

  it('gives even the shortest voice an audible tail', () => {
    synth.play([{ midi: 60, start: 0, duration: 0.01 }]);
    const envelope = envelopes()[0];
    const rings = envelope.events[envelope.events.length - 1].time - envelope.events[0].time;
    expect(rings).toBeGreaterThan(0.1);
  });
});

describe('stopAll', () => {
  it('leaves nothing sounding after it is called', () => {
    // The defect: a passage scheduled into the future outlives the screen
    // that asked for it. Everything already scheduled has to be cut, not just
    // whatever happens to be audible at this instant.
    synth.play(notes(8, 0.5));
    expect(soundingAfter(audioClock() + 0.1).length).toBeGreaterThan(0);

    synth.stopAll();
    expect(soundingAfter(audioClock() + 0.1)).toEqual([]);
  });

  it('cuts a voice that had not started yet', () => {
    synth.play(notes(4, 1));
    const last = oscillators()[oscillators().length - 1];
    expect(last.startedAt!).toBeGreaterThan(audioClock() + 2);

    synth.stopAll();
    expect(last.stoppedAt!).toBeLessThan(last.startedAt!);
  });

  it('ramps the master down before cutting, rather than clipping', () => {
    // Stopping a ringing oscillator dead is an audible click.
    synth.play(notes(2));
    synth.stopAll();
    const events = masterGain()!.events;
    const ramp = events.find((e) => e.kind === 'linear' && e.value === 0);
    const cut = Math.min(...oscillators().map((o) => o.stoppedAt!));
    expect(ramp, 'no ramp to silence').toBeDefined();
    expect(ramp!.time).toBeLessThanOrEqual(cut);
  });

  it('puts the master back, so the next passage is not silent', () => {
    synth.play(notes(2));
    synth.stopAll();
    const events = masterGain()!.events;
    const restore = events[events.length - 1];
    expect(restore.kind).toBe('set');
    expect(restore.value).toBeGreaterThan(0);
  });

  it('is audible again after being stopped', () => {
    synth.play(notes(3));
    synth.stopAll();
    const before = oscillators().length;

    advanceAudioClock(1);
    synth.play(notes(3));
    const fresh = oscillators().slice(before);
    expect(fresh.length).toBeGreaterThan(0);
    for (const oscillator of fresh) {
      expect(oscillator.startedAt!).toBeGreaterThan(audioClock());
      expect(oscillator.stoppedAt!).toBeGreaterThan(oscillator.startedAt!);
    }
  });

  it('does nothing at all before anything has played', () => {
    // Called on every route change, including the ones before a note sounds.
    expect(() => synth.stopAll()).not.toThrow();
    expect(contextCount()).toBe(0);
  });

  it('can be called twice without reopening anything', () => {
    synth.play(notes(2));
    synth.stopAll();
    synth.stopAll();
    expect(contextCount()).toBe(1);
    expect(soundingAfter(audioClock() + 0.1)).toEqual([]);
  });
});

describe('close', () => {
  it('releases the hardware and forgets the context', () => {
    synth.play(notes(1));
    synth.close();
    expect(audioClosed()).toBe(true);
    synth.play(notes(1));
    expect(contextCount()).toBe(2);
  });
});
