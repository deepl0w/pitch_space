import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICE_OPEN_SECONDS, Synth, type Voice } from './synth';
import {
  advanceAudioClock, audioClock, audioClosed, contextCount, gains, installAudioContext,
  attackTimes, masterGain, oscillators, resetAudio, soundingAfter, suspendUntilResumed,
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
    expect(soundingAfter(audioClock() + 0.1).length).toBeGreaterThan(0);

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

/**
 * The first play of the page, when the context has to be woken first.
 *
 * `ensure` fires `resume()` without awaiting it and `play` then times the
 * passage from `currentTime + 0.06`. On a context that is already running
 * that is a beat of headroom; on one that is still starting, the clock it
 * read is about to jump by however long the hardware takes to open, and
 * anything inside that jump is already behind by the time a sample is played.
 *
 * Measured on Chrome 126 for the Rhythms "first play loses a note" report: a
 * context created under a user gesture comes up `running` with `currentTime`
 * 0, and its clock then sits at 0 for 30–40 ms before advancing. That clears
 * the 60 ms of headroom, which is why Chrome does not lose a note — by 20–30
 * ms. Where a context starts *suspended* instead, as one does without a
 * gesture and as iOS Safari is strict about, the cost is a device opening
 * rather than a clock settling and there is no reason it fits inside 60 ms.
 *
 * So the margin is real, it is at the *front* of the bar rather than the end,
 * and nothing was asserting it: `suspendUntilResumed` was built for exactly
 * this and had no callers.
 */
describe('the first play, on a context that is still waking up', () => {
  /**
   * Let the context finish starting, as the hardware would.
   *
   * A turn of the task queue rather than a microtask or two: the resume
   * settles, and only then does the passage get laid down against the clock
   * it uncovered. Counting the exact number of ticks between those would be
   * asserting how the fix is spelled rather than that it works.
   */
  const woken = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** A bar of even quavers at about 112bpm, as the Rhythms screen plays one. */
  const bar = (): Voice[] =>
    Array.from({ length: 8 }, (_, i) => ({ midi: 72, start: i * 0.268, duration: 0.24 }));

  /**
   * Attacks the clock has already passed once the context is running.
   *
   * Counted as notes rather than as oscillators, because one note is seven of
   * them — `PARTIALS` stacks a struck-string timbre — and "seven lost" where
   * a listener heard one note go missing is a failure message that sends the
   * next reader looking in the wrong place.
   *
   * Deliberately not `scheduledInThePast`, which asks whether a note was
   * behind *at the moment it was scheduled*. Nothing ever is: the jump
   * happens afterwards. The question an ear asks is this one — when the first
   * sample finally plays, is this attack still ahead of the clock?
   */
  const missed = () => attackTimes().filter((at) => at < audioClock());

  it('keeps every note ahead of the clock when waking is quick', async () => {
    suspendUntilResumed(0.02);
    synth.play(bar());
    await woken();

    // The count first, because `missed` is a filter: a double that recorded
    // no attacks at all reports none behind the clock, and the two readings
    // are indistinguishable from the assertion alone.
    expect(attackTimes()).toHaveLength(8);
    expect(missed()).toEqual([]);
  });

  it('keeps every note ahead of the clock when waking is slow', async () => {
    // 200 ms to open an audio device is unremarkable, and it is more than the
    // 60 ms of headroom the passage was timed with.
    suspendUntilResumed(0.2);
    synth.play(bar());
    await woken();

    // The front of the bar is what goes: the later attacks are far enough out
    // to survive, so the defect is a passage that starts clipped rather than
    // one that fails outright — which is why it reads as "a note went
    // missing" rather than as "play is broken".
    expect(missed()).toEqual([]);
    // And all eight are still there to be heard, rather than merely not late.
    expect(attackTimes()).toHaveLength(8);
  });

  it('is not charging for a wake-up that never happened', async () => {
    // The guard against the pair above passing vacuously: with no suspension
    // there is no jump, so a bug that lost notes for some other reason would
    // show here too rather than hiding behind the knob.
    synth.play(bar());
    await woken();

    expect(audioClock()).toBe(0);
    expect(attackTimes()).toHaveLength(8);
    expect(missed()).toEqual([]);
  });
});

/**
 * Deferring the first passage re-opens a hole that was already closed once.
 *
 * `stopAll` exists because notes are scheduled into the future and leaving a
 * screen left the rest of the passage playing over whatever came next. A
 * passage that waits for the hardware is a passage that can arrive *after*
 * that stop, or after a second press meant to replace it — the same defect
 * with a wake-up in front of it.
 */
describe('a passage waiting on a cold context', () => {
  const woken = () => new Promise((resolve) => setTimeout(resolve, 0));
  const bar = (): Voice[] =>
    Array.from({ length: 8 }, (_, i) => ({ midi: 72, start: i * 0.268, duration: 0.24 }));

  it('never arrives if the screen went away while it was waking', async () => {
    /*
      The control runs first, and it has to be a whole passage rather than a
      reading taken before `woken`. A deferred passage builds nothing until
      the context wakes, so `oscillators()` is empty at every point before
      that whether or not anything was cut — which makes the obvious control
      the one reading that proves nothing.
    */
    suspendUntilResumed(0.2);
    synth.play(bar());
    await woken();
    expect(oscillators().length, 'the bar sounds nothing even when it is left alone')
      .toBeGreaterThan(0);

    resetAudio();
    installAudioContext();
    synth = new Synth();

    suspendUntilResumed(0.2);
    synth.play(bar());
    synth.stopAll(); // the user navigates before a sample has played
    await woken();

    expect(oscillators()).toEqual([]);
  });

  it('is replaced by a second press rather than layered under it', async () => {
    // Calibrated against one bar rather than against a literal, because two
    // bars laid on the same clock share their attack *times* — counting those
    // would pass whether or not they were stacked. The oscillators are what
    // doubles, and how many of them a note costs is the timbre's business.
    suspendUntilResumed(0.2);
    synth.play(bar());
    await woken();
    const oneBar = oscillators().length;
    expect(oneBar).toBeGreaterThan(0);

    resetAudio();
    installAudioContext();
    synth = new Synth();

    suspendUntilResumed(0.2);
    synth.play(bar());
    synth.play(bar());
    await woken();

    // Pressing play again cuts what is already sounding; waiting for the
    // hardware must not turn it into a way to double it instead.
    expect(oscillators()).toHaveLength(oneBar);
    expect(attackTimes()).toHaveLength(8);
  });
});


/**
 * The first sound a page makes.
 *
 * A user reported the first note of an interval missing, the second
 * sounding, and "play it again" fixing it. The cold path existed and
 * keyed on `state === 'suspended'`, which a context built inside a click
 * never is: measured in Chrome, `state` is `running` and `currentTime` is
 * exactly 0 at construction. The guard was written for the right hazard
 * and watched the wrong signal.
 */
describe('the first play, before the audio clock has started', () => {
  it('schedules clear of a device that is still opening', () => {
    /*
      Stated as the defect rather than as the fix: with the clock at 0,
      the old 60 ms put the first attack at 0.06, which passes while the
      hardware opens. Anything at or below that reproduces the missing
      note. The bound is the behaviour; 0.25 is a measurement and may be
      retuned without this failing.
    */
    expect(audioClock()).toBe(0);
    synth.play(notes(2));

    const attacks = [...new Set(oscillators().map((o) => o.startedAt))].sort((a, b) => a! - b!);
    expect(attacks, 'nothing was scheduled, so nothing below is asserted').toHaveLength(2);
    expect(attacks[0], 'the first attack lands where an opening device will miss it')
      .toBeGreaterThan(0.06);
  });

  it('keeps the small headroom once the clock is running', () => {
    /*
      The control, and the reason the fix is keyed on the clock rather
      than applied to everything. Widening the headroom for every play
      would pass the case above and put a quarter second of lag on every
      sound in the app, which no test would have noticed.
    */
    synth.play(notes(1));
    const first = oscillators()[0].startedAt!;
    resetAudio();
    installAudioContext();
    advanceAudioClock(5);
    const warm = new Synth();

    warm.play(notes(1));
    const second = oscillators()[0].startedAt!;
    expect(second - audioClock()).toBeLessThan(first);
    expect(second - audioClock()).toBeCloseTo(0.06, 5);
  });
});

/**
 * The figure the cold-start headroom is for, asserted as behaviour.
 *
 * The cases above pin a bound — the first attack must land past the 60 ms
 * that was losing it — which is right, and which **nothing would fail if
 * the headroom were too small for a real device.** 0.25 came from a comment
 * claiming 200 ms to open a device is unremarkable, and that claim was
 * prose in two places and a number in a third with nothing relating them.
 *
 * It is now `DEVICE_OPEN_SECONDS` with the headroom derived from it, so the
 * quantity that a measurement on slower hardware would revise is the one
 * that gets revised. These ask the question behaviourally rather than
 * arithmetically: a device that takes the whole budget to open must still
 * find the first note ahead of it.
 */
describe('a device that takes the full budget to open', () => {
  it('has not missed the first attack by the time it is ready', () => {
    /*
      The clock at zero is the device still opening. Advancing it by the
      budget is that device finishing — and the first attack has to be
      still in the future at that moment, or the sample it needed was
      never played.

      Asserted against `DEVICE_OPEN_SECONDS` rather than against 0.25, so
      raising the budget for slower hardware fails here unless the
      headroom follows it. That is the coupling the three copies of this
      figure did not have.
    */
    expect(audioClock()).toBe(0);
    synth.play(notes(2));
    const first = oscillators()[0].startedAt!;

    advanceAudioClock(DEVICE_OPEN_SECONDS);
    expect(first, 'the device finished opening after the first note was due')
      .toBeGreaterThan(audioClock());
  });

  it('is not paying that budget on every sound afterwards', () => {
    // The other side, and the reason the budget is not simply the headroom
    // everywhere: a quarter second of lag on every note is a worse app than
    // one missing note on the first play, and only the first play is cold.
    advanceAudioClock(5);
    const warm = new Synth();
    warm.play(notes(1));

    expect(oscillators()[0].startedAt! - audioClock(),
      'a warm play is waiting out the device-opening budget')
      .toBeLessThan(DEVICE_OPEN_SECONDS);
  });
});

/**
 * Pressing play again, before the last press has finished sounding.
 *
 * A user reported that a few quick presses layer the passages over each
 * other, and said what they expected: play again stops what is sounding
 * and starts from the beginning. `stopAll` already did that and was
 * wired only to leaving a screen.
 */
describe('playing again while something is still sounding', () => {
  it('replaces the passage rather than joining it', () => {
    advanceAudioClock(5);
    synth.play(notes(4));
    const first = oscillators().length;
    expect(first, 'nothing was sounding, so nothing below is asserted')
      .toBeGreaterThan(0);

    synth.play(notes(4));

    /*
      Counted as "still due to sound", not as "ever created". The old
      oscillators exist either way; what the user hears is whether they
      are still going to play, which is what `soundingAfter` asks.
    */
    const stillDue = soundingAfter(audioClock() + 0.03).length;
    expect(stillDue, 'the first passage is still queued behind the second')
      .toBe(first);
  });

  it('does not silence the passage it just started', () => {
    /*
      The control, and the risk of the fix: `stopAll` ramps the master to
      zero and back, so a restart that scheduled inside that ramp would
      fade out its own opening note. The ramp restores the level at
      +0.02 and the new attack lands at +0.06.
    */
    advanceAudioClock(5);
    synth.play(notes(1));
    synth.play(notes(1));

    const events = masterGain()!.events;
    expect(events.length, 'the ramp never ran, so nothing below is asserted')
      .toBeGreaterThan(0);

    const silenced = Math.max(...events.filter((e) => e.value === 0).map((e) => e.time));
    const last = events.reduce((a, b) => (b.time >= a.time ? b : a));
    expect(last.value, 'the master is left silent').toBeGreaterThan(0);
    expect(last.time, 'the level is restored only after it is dropped')
      .toBeGreaterThan(silenced);

    const attack = Math.min(...soundingAfter(audioClock()).map((o) => o.startedAt!));
    expect(attack, 'the new passage attacks while the master is still down')
      .toBeGreaterThan(last.time);
  });
});

/**
 * The voice a note is played in.
 *
 * The envelope used to be the piano's, written into `scheduleNote`. It
 * now comes from the chosen instrument, which is the whole of what makes
 * a picker worth having — so the claims are that the choice reaches the
 * oscillators, and that it reaches them differently for different
 * instruments.
 */
describe('choosing an instrument', () => {
  it('changes how many oscillators a note costs', () => {
    /*
      Observable from outside without listening: the partial count is
      the oscillator count, and the organ's stack is deliberately
      shorter than the strings'. If the choice were ignored, both would
      produce the piano's seven.
    */
    advanceAudioClock(5);
    synth.setInstrument('organ');
    synth.play(notes(1));
    const organ = oscillators().length;

    resetAudio();
    installAudioContext();
    advanceAudioClock(5);
    const other = new Synth();
    other.setInstrument('strings');
    other.play(notes(1));

    expect(organ, 'no oscillators, so nothing below is asserted').toBeGreaterThan(0);
    expect(oscillators().length).not.toBe(organ);
  });

  it('holds a sustained voice and lets a struck one decay', () => {
    /*
      The behavioural half, and the reason the envelope was generalised
      rather than branched. An organ's note is still near its peak when
      a piano's has fallen away, which is a fact about the gain curve
      and needs no ear to check.
    */
    advanceAudioClock(5);
    synth.setInstrument('piano');
    synth.play([{ midi: 60, start: 0, duration: 1 }]);
    // The envelope is the gain with automation on it: partial gains get a
    // plain `.value` and the master is set once, so neither has a curve.
    const envelopeOf = () => gains()
      .reduce((a, b) => (b.events.length > a.events.length ? b : a)).events.map((e) => e.value);
    const struck = envelopeOf();

    resetAudio();
    installAudioContext();
    advanceAudioClock(5);
    const held = new Synth();
    held.setInstrument('organ');
    held.play([{ midi: 60, start: 0, duration: 1 }]);
    const sustained = envelopeOf();

    const floor = (vs: number[]) => Math.min(...vs.filter((v) => v > 0.0002));
    const peak = (vs: number[]) => Math.max(...vs);
    expect(peak(struck), 'the envelope never rose').toBeGreaterThan(0);
    expect(floor(struck) / peak(struck), 'a struck note did not decay')
      .toBeLessThan(floor(sustained) / peak(sustained));
  });

  it('runs a stiff instrument sharp in its upper partials and a pipe true', () => {
    /*
      Inharmonicity is what stops a stack of exact harmonics sounding
      like an organ whatever envelope it is given, so the organ's value
      being honestly zero is a claim about the sound and not a rounding.

      Asserted against the exact multiple rather than against a figure:
      the coefficient is tunable and this stays true while it is, which
      is the difference between pinning a constant and pinning that the
      constant is used at all.
    */
    advanceAudioClock(5);
    synth.setInstrument('piano');
    synth.play([{ midi: 69, start: 0, duration: 1 }]);
    const stiff = oscillators().map((o) => o.frequency).sort((a, b) => a - b);

    resetAudio();
    installAudioContext();
    advanceAudioClock(5);
    const pipe = new Synth();
    pipe.setInstrument('organ');
    pipe.play([{ midi: 69, start: 0, duration: 1 }]);
    const true_ = oscillators().map((o) => o.frequency).sort((a, b) => a - b);

    expect(stiff.length, 'nothing sounded, so nothing below is asserted')
      .toBeGreaterThan(2);
    // A440, so the nth partial is exactly 440n if nothing bends it.
    expect(stiff[0]).toBeCloseTo(440, 3);
    expect(stiff[2], 'the piano’s third partial is not sharp').toBeGreaterThan(440 * 3);
    expect(true_[2], 'the organ’s third partial is not true').toBeCloseTo(440 * 3, 3);
  });

  it('falls back to the default rather than throwing on an unknown id', () => {
    // The store repairs, but the engine is also handed ids by a caller
    // and must not take the app down over one.
    advanceAudioClock(5);
    expect(() => synth.setInstrument('tuba')).not.toThrow();
    synth.play(notes(1));
    expect(oscillators().length).toBeGreaterThan(0);
  });
});
