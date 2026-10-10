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

/**
 * A note played from a recording rather than synthesised.
 *
 * Recorded separately from oscillators because the thing worth asserting is
 * *which* of the two sounded: the scheduler chooses per note, so a passage
 * that crosses the edge of a pack's range is partly sampled and partly
 * synthesised, and no count of oscillators alone can say so.
 */
export interface RecordedSample {
  /**
   * The MIDI number of the recording that was played, from its buffer, or
   * null for a buffer the engine made rather than decoded — the silence it
   * warms the output stream with. `samples()` filters those out.
   */
  midi: number | null;
  /** The rate it was played at, which is how it reaches another semitone. */
  playbackRate: number;
  startedAt: number | null;
  stoppedAt: number | null;
  end(): void;
}

interface Recording {
  oscillators: RecordedOscillator[];
  samples: RecordedSample[];
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
  return { oscillators: [], samples: [], gains: [], closed: false, resumed: 0 };
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

/**
 * A decoded buffer, carrying only what a test needs to recognise it.
 *
 * `decodeAudioData` is handed the encoded bytes of one note and returns
 * this; the `midi` is stamped on by `decodeAudioData` from a counter the
 * caller sets, because a fake has no decoder and the identity of the note
 * is the only property any assertion here is about.
 */
/**
 * `midi` is null for a buffer the engine made rather than decoded — the
 * silence it warms the output with. A decoded buffer always knows which
 * note it is, which is what makes "which voice sounded" assertable.
 */
interface FakeBuffer {
  midi: number | null; duration: number; sampleRate: number; length: number;
}

/** Every buffer the engine asked this context to make, newest last. */
const buffersMade: { channels: number; length: number; sampleRate: number }[] = [];

/** What the engine allocated, for a test of the output warm-up. */
export function buffersAllocated(): readonly { length: number; sampleRate: number }[] {
  return buffersMade;
}

let nextDecodedMidi = 0;

/**
 * What the next `decodeAudioData` will call itself.
 *
 * `loadPack` decodes a pack's notes in table order, so a test that sets
 * this to the table's first MIDI number gets buffers that identify
 * themselves correctly without the fake having to decode anything.
 */
export function decodeAs(midis: readonly number[]): void {
  decodeQueue = [...midis];
}

let decodeQueue: number[] = [];

function makeBufferSource() {
  const listeners = new Set<() => void>();
  const record: RecordedSample = {
    midi: -1,
    playbackRate: 1,
    startedAt: null,
    stoppedAt: null,
    end() { for (const listener of [...listeners]) listener(); },
  };
  recording.samples.push(record);
  let buffer: FakeBuffer | null = null;
  return {
    get buffer() { return buffer; },
    set buffer(next: FakeBuffer | null) {
      buffer = next;
      // `null` is a buffer the engine made rather than decoded — the warm-up
      // silence — and `-1` is a source that was never given one at all. The
      // two are different states and only the first is filtered from
      // `samples()`, so a source with no buffer still shows up as a fault.
      record.midi = next === null ? -1 : next.midi;
    },
    playbackRate: {
      get value() { return record.playbackRate; },
      set value(next: number) { record.playbackRate = next; },
    },
    connect: <T>(destination: T) => destination,
    start(time: number) { record.startedAt = time; },
    stop(time: number) {
      record.stoppedAt = record.stoppedAt === null ? time : Math.min(record.stoppedAt, time);
    },
    addEventListener(_type: string, listener: () => void) { listeners.add(listener); },
    removeEventListener(_type: string, listener: () => void) { listeners.delete(listener); },
    set onended(listener: () => void) { listeners.add(listener); },
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

  /*
    A real rate, because the engine computes buffer lengths from it and a
    missing one turns those into `NaN` — which allocates a zero-length
    buffer and warms nothing, silently. 48 kHz is what Chrome reports on
    the machines this was measured on.
  */
  readonly sampleRate = 48_000;

  createGain() { return makeGain(); }

  createOscillator() { return makeOscillator(); }

  createBufferSource() { return makeBufferSource(); }

  /*
    Empty rather than allocated: nothing reads these samples. The engine
    uses it for one thing — a buffer of silence handed to the output so the
    stream is carrying something before the first note needs it — and what
    a test can check about that is that it was made and started, not what
    was in it.
  */
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer {
    buffersMade.push({ channels, length, sampleRate });
    return { midi: null, duration: length / sampleRate, sampleRate, length };
  }

  /*
    No decoder: the bytes are not examined. What comes back identifies
    itself as the next note in the queue a test set with `decodeAs`,
    which is the only thing an assertion about *which voice sounded*
    needs. A fake that pretended to decode would be a second audio
    codec in the test suite.
  */
  decodeAudioData(_bytes: ArrayBuffer): Promise<FakeBuffer> {
    const midi = decodeQueue.length > 0 ? decodeQueue.shift()! : nextDecodedMidi++;
    return Promise.resolve({ midi, duration: 3, sampleRate: 44_100, length: 132_300 });
  }

  resume() {
    recording.resumed += 1;
    // Settled on a later turn, because a real one is. Advancing the clock
    // here instead would close the very gap this exists to model: the caller
    // that does not await `resume` reads `currentTime` *before* the hardware
    // starts, and a synchronous fake would hand it the post-start reading no
    // real browser could have given it.
    return Promise.resolve().then(() => {
      this.state = 'running';
      // Starting the hardware takes real time, and the clock has moved on by
      // the time the first sample is played.
      clock += resumeCost;
    });
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
  decodeQueue = [];
  nextDecodedMidi = 0;
  recording = fresh();
  clock = 0;
  contexts = 0;
  startSuspended = false;
  resumeCost = 0;
  buffersMade.length = 0;
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

/**
 * The recorded notes that sounded — never the silence the engine warms the
 * output with.
 *
 * That warm-up is a buffer source like any other and would be counted as a
 * note by every case that asks what was played, which is most of them. It
 * is told apart by having no `midi`: the engine *made* it rather than
 * decoding it from a pack, and a decoded buffer always knows which note it
 * is. Filtered here rather than in each case, because a test about the
 * warm-up should be the only one that has to know it exists.
 */
export function samples(): RecordedSample[] {
  return recording.samples.filter((sample) => sample.midi !== null);
}

/** Including the warm-up, for the one test that is about it. */
export function allBufferSources(): RecordedSample[] {
  return recording.samples;
}

export function oscillators(): RecordedOscillator[] {
  return recording.oscillators;
}

/** Every gain node made, master first and then one envelope per note. */
export function gains(): RecordedGain[] {
  return recording.gains;
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
