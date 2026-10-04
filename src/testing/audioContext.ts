/**
 * An AudioContext that records instead of sounding.
 *
 * Neither node nor jsdom implements Web Audio, so the one piece of the app
 * whose whole job is to stop making noise could not be asked whether it had.
 * Notes are scheduled into the future against the audio clock, which is what
 * makes leaving a screen leave sound behind — and also what makes it checkable
 * without listening, because "is anything still due to sound after this
 * moment" is a question about numbers.
 *
 * The clock is a test's to move. A real context's clock does not advance while
 * it is suspended and does advance once the hardware starts, and the gap
 * between those two is where notes scheduled against a stale `currentTime` go
 * missing — so `resumeCost` exists to reproduce exactly that.
 *
 * Only the surface `Synth` uses is implemented, and `connect` returns its
 * destination so the chaining in `scheduleNote` works.
 */

export interface RecordedOscillator {
  frequency: number;
  type: string;
  /** Seconds on the context clock, or null if it was never started. */
  startedAt: number | null;
  /** The earliest stop asked for, or null if it was never told to stop. */
  stoppedAt: number | null;
  /** The clock reading when `start` was called, for spotting a stale schedule. */
  scheduledAt: number;
  /** Fires the node's `ended` listeners, as the real one would. */
  end(): void;
}

export interface ParamEvent {
  kind: 'set' | 'linear' | 'exponential' | 'cancel';
  value: number;
  time: number;
}

export interface RecordedGain {
  events: ParamEvent[];
  value: number;
}

interface Recording {
  oscillators: RecordedOscillator[];
  gains: RecordedGain[];
  closed: boolean;
  resumed: number;
}

let recording: Recording = fresh();
let clock = 0;
let contexts = 0;
let startSuspended = false;
let resumeCost = 0;

function fresh(): Recording {
  return { oscillators: [], gains: [], closed: false, resumed: 0 };
}

function makeParam(gain: RecordedGain) {
  return {
    get value() { return gain.value; },
    set value(next: number) { gain.value = next; },
    setValueAtTime(value: number, time: number) {
      gain.events.push({ kind: 'set', value, time });
      return this;
    },
    linearRampToValueAtTime(value: number, time: number) {
      gain.events.push({ kind: 'linear', value, time });
      return this;
    },
    exponentialRampToValueAtTime(value: number, time: number) {
      gain.events.push({ kind: 'exponential', value, time });
      return this;
    },
    cancelScheduledValues(time: number) {
      gain.events.push({ kind: 'cancel', value: 0, time });
      return this;
    },
  };
}

function makeGain() {
  const record: RecordedGain = { events: [], value: 1 };
  recording.gains.push(record);
  return { gain: makeParam(record), connect: <T>(destination: T) => destination, record };
}

function makeOscillator() {
  const listeners = new Set<() => void>();
  const record: RecordedOscillator = {
    frequency: 0,
    type: 'sine',
    startedAt: null,
    stoppedAt: null,
    scheduledAt: clock,
    end() { for (const listener of [...listeners]) listener(); },
  };
  recording.oscillators.push(record);
  return {
    get type() { return record.type; },
    set type(next: string) { record.type = next; },
    frequency: {
      get value() { return record.frequency; },
      set value(next: number) { record.frequency = next; },
    },
    connect: <T>(destination: T) => destination,
    start(time: number) {
      record.startedAt = time;
      record.scheduledAt = clock;
    },
    stop(time: number) {
      // A real node keeps the earliest stop it is given.
      record.stoppedAt = record.stoppedAt === null ? time : Math.min(record.stoppedAt, time);
    },
    addEventListener(_type: string, listener: () => void) { listeners.add(listener); },
    removeEventListener(_type: string, listener: () => void) { listeners.delete(listener); },
  };
}

class FakeAudioContext {
  state: string;
  destination = { kind: 'destination' };

  constructor() {
    contexts += 1;
    this.state = startSuspended ? 'suspended' : 'running';
  }

  get currentTime() { return clock; }

  createGain() { return makeGain(); }

  createOscillator() { return makeOscillator(); }

  resume() {
    recording.resumed += 1;
    this.state = 'running';
    // Starting the hardware takes real time, and the clock has moved on by
    // the time the first sample is played.
    clock += resumeCost;
    return Promise.resolve();
  }

  close() {
    recording.closed = true;
    return Promise.resolve();
  }
}

export function installAudioContext(): void {
  (globalThis as { AudioContext?: unknown }).AudioContext =
    FakeAudioContext as unknown as typeof AudioContext;
}

export function resetAudio(): void {
  recording = fresh();
  clock = 0;
  contexts = 0;
  startSuspended = false;
  resumeCost = 0;
}

/**
 * Make the next context start suspended, as a browser does before a gesture,
 * and charge `cost` seconds of clock to starting it.
 */
export function suspendUntilResumed(cost = 0): void {
  startSuspended = true;
  resumeCost = cost;
}

export function advanceAudioClock(seconds: number): void {
  clock += seconds;
}

export function audioClock(): number {
  return clock;
}

export function oscillators(): RecordedOscillator[] {
  return recording.oscillators;
}

/** The first gain made is the master; `Synth` creates it before any envelope. */
export function masterGain(): RecordedGain | undefined {
  return recording.gains[0];
}

export function contextCount(): number {
  return contexts;
}

export function audioClosed(): boolean {
  return recording.closed;
}

/**
 * Oscillators still due to sound after `time`.
 *
 * One that was never told to stop counts, because that is the exact shape of
 * the leak: a note scheduled into the future outlives the screen that asked
 * for it.
 */
export function soundingAfter(time: number): RecordedOscillator[] {
  return recording.oscillators.filter((o) => o.stoppedAt === null || o.stoppedAt > time);
}

/**
 * Oscillators whose start time had already passed when they were scheduled.
 *
 * A real context plays these immediately or not at all; either way the
 * rhythm they were part of is not what was written.
 */
export function scheduledInThePast(): RecordedOscillator[] {
  return recording.oscillators.filter(
    (o) => o.startedAt !== null && o.startedAt < o.scheduledAt,
  );
}

/** Distinct attack times, which is what a listener hears as separate notes. */
export function attackTimes(): number[] {
  return [...new Set(recording.oscillators.map((o) => o.startedAt ?? -1))].sort((a, b) => a - b);
}
