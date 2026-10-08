import {
  DEFAULT_INSTRUMENT_ID, instrument, isInstrumentId, type Instrument,
} from './instruments';
/**
 * A small synthesised instrument.
 *
 * Deliberately not a sampler and deliberately not Tone.js: a sample pack is
 * megabytes that have to be precached for offline use, and Tone's ~40-60 kB
 * is mostly a Transport, which is the one piece of timing logic this app's
 * correctness depends on and so the last thing worth handing away.
 *
 * Notes are scheduled against the AudioContext clock rather than setTimeout,
 * because a metronome driven by a timer drifts audibly within a few bars.
 */

export interface Voice {
  midi: number;
  /** Seconds from the start of the sequence. */
  start: number;
  duration: number;
  gain?: number;
}

/**
 * The level a chord sits at without clipping, measured rather than picked.
 * The user's volume scales this; it is not a ceiling the user can raise.
 */
const MASTER_GAIN = 0.22;

/** A few partials with a little inharmonicity reads as struck rather than buzzy. */
/* The piano's stack now lives in the catalogue; see `instruments.ts`. */

/**
 * How long a device may take to open before the first sample plays.
 *
 * The figure the cold-start headroom below is derived from, named because
 * it was prose in two comments and a number in a third — three copies of
 * one decision, and nothing relating them. 200 ms is unremarkable for a
 * device opening, and it is the quantity that would be revised by a
 * measurement on slower hardware; the headroom follows from it rather
 * than being revised beside it.
 */
export const DEVICE_OPEN_SECONDS = 0.2;

/**
 * How far ahead to schedule when the audio clock has not started.
 *
 * Measured rather than chosen: a context reports `running` with
 * `currentTime` at 0 and begins advancing a few milliseconds later, but
 * the *device* behind it can take far longer to open, and every attack
 * inside that window is behind the clock before a sample is played. This
 * is only ever paid once per page, on a play that is already the first
 * thing the user hears, where a quarter second of delay is not noticeable
 * and a missing first note is.
 *
 * Wider than {@link DEVICE_OPEN_SECONDS} rather than equal to it: a note
 * scheduled at the exact instant the device finishes opening is a note
 * whose attack has no margin at all, and the margin is what the warm path
 * spends 60 ms on for the same reason.
 */
export const CLOCKLESS_HEADROOM = DEVICE_OPEN_SECONDS + 0.05;

/**
 * The floor an exponential ramp fades to.
 *
 * `exponentialRampToValueAtTime` cannot reach zero — it throws — so
 * every fade ends just below hearing instead. One constant rather than
 * the literal repeated, because it appears at both ends of the envelope
 * and the two have to agree.
 */
const SILENT = 0.0001;

export class Synth {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Everything scheduled and not yet finished, so it can be cut short. */
  private scheduled: OscillatorNode[] = [];
  /**
   * Which intention is current, so a passage waiting on a cold context can be
   * told it has been superseded. Bumped by every play and by every stop.
   */
  private generation = 0;

  /**
   * The user's level, 0 to 1, multiplying {@link MASTER_GAIN}.
   *
   * Held here rather than read from the settings store, because this class
   * is in `audio/output/` and the store is state — the layer rule is what
   * lets the whole engine run under vitest. The composition root pushes it
   * in; nothing here reaches out for it.
   */
  private volume = 1;
  /**
   * Which voice to speak in, pushed in by the composition root for the
   * same reason the volume is: this class must not reach into a store.
   *
   * Held as an id rather than an `Instrument` so an unknown one coming
   * back from storage fails at the boundary that read it rather than
   * here, and so the default survives a release that retires a voice.
   */
  private voice = instrument(DEFAULT_INSTRUMENT_ID);

  /**
   * Choose the instrument. Takes effect on the next note, not this one.
   *
   * Notes already scheduled keep the voice they were scheduled with,
   * because their oscillators and envelope are already laid down against
   * the audio clock. Changing instrument mid-passage therefore changes
   * the next passage, which is also what a listener expects — a piano
   * does not become an organ halfway through a chord.
   */
  setInstrument(id: string): void {
    this.voice = isInstrumentId(id) ? instrument(id) : instrument(DEFAULT_INSTRUMENT_ID);
  }

  /** The voice the next note will be scheduled with. */
  private instrument(): Instrument {
    return this.voice;
  }

  /** Set the output level. Takes effect immediately, mid-passage included. */
  setVolume(fraction: number): void {
    this.volume = Math.min(1, Math.max(0, fraction));
    // Applied directly rather than ramped: a user dragging a slider wants
    // the level they are dragging to, and a ramp on every input event
    // queues automation faster than it drains.
    if (this.master) this.master.gain.value = this.level();
  }

  /** The gain actually applied: the engine's level scaled by the user's. */
  private level(): number {
    return MASTER_GAIN * this.volume;
  }

  /**
   * Browsers refuse to start an AudioContext until a gesture, so this is
   * called from the click that wants sound rather than at module load.
   */
  private ensure(): { context: AudioContext; master: GainNode; waking: Promise<void> | null } {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.level();
      this.master.connect(this.context.destination);
    }
    /*
      Handed back rather than dropped. `currentTime` does not move while a
      context is still starting and jumps when it does, so a caller that
      schedules across the gap times the passage against a clock reading
      that is about to be wrong.

      **`suspended` is not the whole of the cold case**, and the rest of it
      is handled in `lay` rather than here, because it needs no waiting. A
      context constructed inside a click reports `running` *immediately* —
      measured in Chrome, `state` is `running` and `currentTime` is exactly
      0 at the moment of construction — so this branch is not taken on the
      one play that most needed protecting.
    */
    const waking = this.context.state === 'suspended'
      ? this.context.resume().catch(() => {})
      : null;
    return { context: this.context, master: this.master!, waking };
  }

  /**
   * Create the context if it does not exist, wake it, and hand it over.
   *
   * For a caller that needs the audio graph *before* it has anything to
   * play — calibration records the room before it hears anything back, so
   * reading {@link audioContext} gave it null and the measurement reported
   * the browser as incapable of recording. On a page where nothing has
   * sounded yet, that is every first attempt.
   *
   * Safe to call from a click, which is the only place it is called: a
   * context created outside a user gesture starts suspended and some
   * browsers never resume it.
   */
  async prepare(): Promise<AudioContext> {
    const { context, waking } = this.ensure();
    if (waking) await waking;
    return context;
  }

  /**
   * The one `AudioContext`, for the capture layer.
   *
   * Not a widening of the containment but the reason for it. ADR 0005 says
   * there is one context, and ADR 0014 says input and output have to be on
   * one clock or a measured round trip means nothing — so capture cannot
   * mint its own, and the only way for it to share this one is to be handed
   * it. Null before the first sound, because the context is created lazily
   * on a user gesture.
   *
   * Read, never owned: closing or suspending it from outside would silence
   * the app, and nothing outside this class may do that.
   */
  get audioContext(): AudioContext | null {
    return this.context;
  }

  get currentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  /** Play a set of voices, all timed from one `now` so a chord stays together. */
  play(voices: readonly Voice[]): void {
    const { context, master, waking } = this.ensure();
    /*
      A new passage replaces the one sounding; it does not join it.

      A user reported that pressing "play it again" quickly a few times
      layers the sounds over each other. Notes are scheduled into the
      future against the audio clock, so a second press used to lay a
      second passage beside the first rather than instead of it — and
      the faster the presses, the more voices stacked. What they expect,
      and said so, is that pressing play again stops what is sounding
      and starts from the beginning.

      `stopAll` already does exactly this and was only wired to leaving a
      screen. Its ramp reaches silence at +0.012 and restores the level
      at +0.02, both comfortably inside the 60 ms of headroom below, so
      a restart does not fade out its own opening note.

      It also bumps the generation, which cancels a passage still
      waiting on a cold context — the same intention the ticket below
      enforces, arriving from the other direction.
    */
    this.stopAll();
    // On the very first play of a page the hardware is still opening, and the
    // 60 ms below is not enough to cover it — see `DEVICE_OPEN_SECONDS` for
    // how long that is and where the figure comes from. Every attack inside
    // it is behind the clock before a sample is played, so the cold case
    // waits for the clock it is about to
    // read rather than guessing at a larger headroom, which would only move
    // the question to how large. Warm plays, which is all of them after the
    // first, are unchanged and still schedule synchronously.
    if (waking) {
      // Ticketed, because deferring re-opens the hole `stopAll` was written
      // to close: a passage laid down after the user has navigated away, or
      // after a second press meant to replace it, is the "notes playing over
      // the next screen" defect with a wake-up in front of it. Only the
      // newest intention survives the wait.
      const ticket = ++this.generation;
      void waking.then(() => {
        if (ticket === this.generation) this.lay(context, master, voices);
      });
      return;
    }
    this.generation += 1;
    this.lay(context, master, voices);
  }

  private lay(context: AudioContext, master: GainNode, voices: readonly Voice[]): void {
    /*
      A beat of headroom to schedule into, and the whole device-opening
      budget when the clock has not started.

      **This is the first-note defect.** A user reported that the first
      sound a page makes loses its first note — the second note of an
      interval plays, the first does not, and pressing "play it again"
      fixes it. The cause is that a context built inside a click reports
      `running` with `currentTime` at exactly 0, so the suspended branch
      above does not fire, and 60 ms ahead of a clock that has not
      started is a moment that passes while the device is still opening.
      Later attacks are far enough out to survive, which is why only the
      first goes missing.

      Keyed on the clock rather than on a "have we played yet" flag
      because the clock is the thing that matters: a context whose clock
      is at zero has not begun whatever the rest of the object believes.
      Late is recoverable; missing is not.
    */
    const headroom = context.currentTime === 0 ? CLOCKLESS_HEADROOM : 0.06;
    const now = context.currentTime + headroom;
    for (const voice of voices) {
      this.scheduleNote(context, master, voice, now + voice.start);
    }
  }

  /**
   * Cut every scheduled note short.
   *
   * Notes are scheduled into the future against the audio clock, so simply
   * navigating away leaves the rest of the passage to play out over whatever
   * screen comes next. Stopping the oscillators is not enough on its own —
   * cutting a ringing note dead produces a click — so the master gain is
   * ramped down over a few milliseconds first and restored once they are
   * gone.
   */
  stopAll(): void {
    // Before the early return: a context still waking has nothing scheduled
    // to cut, but it may have a passage queued behind it, and that is exactly
    // what must not arrive after the screen it belonged to has gone.
    this.generation += 1;
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.012);
    for (const oscillator of this.scheduled) {
      try { oscillator.stop(now + 0.015); } catch { /* already stopped */ }
    }
    this.scheduled = [];
    this.master.gain.setValueAtTime(this.level(), now + 0.02);
  }

  /** Release the audio hardware entirely. */
  close(): void {
    if (!this.context) return;
    void this.context.close();
    this.context = null;
    this.master = null;
    this.scheduled = [];
  }

  private scheduleNote(
    context: AudioContext, destination: GainNode, voice: Voice, at: number,
  ): void {
    const voiceOf = this.instrument();
    const frequency = 440 * Math.pow(2, (voice.midi - 69) / 12);
    const envelope = context.createGain();
    envelope.connect(destination);

    /*
      Attack, decay to a sustain level, then release — one shape covering
      both kinds of instrument rather than a branch. A struck string has
      a sustain near zero and reaches it quickly, which is the same curve
      as an organ's with different numbers in it; writing them as two
      cases would make "is this plucked" a thing the synth decides rather
      than a thing the instrument says.

      Exponential ramps throughout because loudness is perceived that
      way, and they cannot reach zero — hence the floor rather than a
      ramp to silence.
    */
    const peak = Math.max((voice.gain ?? 1) * voiceOf.trim / voiceOf.partials.length, SILENT);
    const decayed = Math.max(peak * voiceOf.decayTo, SILENT);
    const decayedBy = at + voiceOf.attack + voiceOf.decay;
    const ends = Math.max(at + voice.duration, decayedBy);

    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(peak, at + voiceOf.attack);
    envelope.gain.exponentialRampToValueAtTime(decayed, decayedBy);
    if (voiceOf.holds) {
      // Held there while the note lasts, then let go.
      envelope.gain.setValueAtTime(decayed, ends);
    } else {
      /*
        Struck, so it never stops falling. The first version of this
        held every voice at its decay level, which gave the piano a
        sustain it does not have — a long note stayed at a third of its
        peak until it ended rather than dying away. Falling throughout
        is what makes a struck string sound struck, and it is also most
        of why a held voice measured far louder than a struck one over
        the same note.
      */
      envelope.gain.exponentialRampToValueAtTime(decayed * 0.25, ends);
    }
    envelope.gain.exponentialRampToValueAtTime(SILENT, ends + voiceOf.release);

    for (const [index, amplitude] of voiceOf.partials.entries()) {
      const partial = index + 1;
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      // Real strings are slightly sharp in their upper partials; without
      // this a stack of exact harmonics sounds like an organ rather than
      // a piano — which is why the organ's coefficient is honestly zero.
      /*
        The fundamental is exact and only the partials above it are
        stretched. The stiffness term used to apply to every partial
        including the first, which put the note itself 0.7 cents sharp —
        inaudible, and still the wrong number for an app whose subject is
        pitch: a learner matching a played A against this one was matching
        something that was not quite A. The comment above always said
        *upper* partials; the code did not.
      */
      oscillator.frequency.value = partial === 1
        ? frequency
        : frequency * partial * (1 + voiceOf.inharmonicity * partial * partial);
      const partialGain = context.createGain();
      partialGain.gain.value = amplitude;
      oscillator.connect(partialGain).connect(envelope);
      oscillator.start(at);
      // Past the release rather than at it: stopping an oscillator while
      // its envelope is still above silence is an audible click.
      oscillator.stop(ends + voiceOf.release + 0.05);
      this.scheduled.push(oscillator);
      oscillator.addEventListener('ended', () => {
        this.scheduled = this.scheduled.filter((o) => o !== oscillator);
      });
    }
  }
}
