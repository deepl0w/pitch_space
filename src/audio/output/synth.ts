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

const MASTER_GAIN = 0.22;

/** A few partials with a little inharmonicity reads as struck rather than buzzy. */
const PARTIALS = [1, 0.5, 0.28, 0.16, 0.09, 0.05, 0.03];

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
   * Browsers refuse to start an AudioContext until a gesture, so this is
   * called from the click that wants sound rather than at module load.
   */
  private ensure(): { context: AudioContext; master: GainNode; waking: Promise<void> | null } {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(this.context.destination);
    }
    // Handed back rather than dropped. `currentTime` does not move while a
    // context is still starting and jumps when it does, so a caller that
    // schedules across the gap times the passage against a clock reading
    // that is about to be wrong.
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
    // On the very first play of a page the hardware is still opening, and the
    // 60 ms below is not enough to cover it — 200 ms to open a device is
    // unremarkable, and every attack inside that is behind the clock before a
    // sample is played. So the cold case waits for the clock it is about to
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
    const now = context.currentTime + 0.06; // a beat of headroom to schedule into
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
    this.master.gain.setValueAtTime(MASTER_GAIN, now + 0.02);
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
    const frequency = 440 * Math.pow(2, (voice.midi - 69) / 12);
    const envelope = context.createGain();
    envelope.connect(destination);

    // A struck string decays throughout rather than holding a level, so the
    // envelope is attack-and-decay with no sustain segment.
    const peak = (voice.gain ?? 1) / PARTIALS.length;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(peak, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(peak * 0.3, at + 0.18);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + voice.duration + 0.25);

    for (const [index, amplitude] of PARTIALS.entries()) {
      const partial = index + 1;
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      // Real strings are slightly sharp in their upper partials; without this
      // a stack of exact harmonics sounds like an organ rather than a piano.
      oscillator.frequency.value = frequency * partial * (1 + 0.0004 * partial * partial);
      const partialGain = context.createGain();
      partialGain.gain.value = amplitude;
      oscillator.connect(partialGain).connect(envelope);
      oscillator.start(at);
      oscillator.stop(at + voice.duration + 0.4);
      this.scheduled.push(oscillator);
      oscillator.addEventListener('ended', () => {
        this.scheduled = this.scheduled.filter((o) => o !== oscillator);
      });
    }
  }
}
