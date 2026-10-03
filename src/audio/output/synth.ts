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

/** A few partials with a little inharmonicity reads as struck rather than buzzy. */
const PARTIALS = [1, 0.5, 0.28, 0.16, 0.09, 0.05, 0.03];

export class Synth {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;

  /**
   * Browsers refuse to start an AudioContext until a gesture, so this is
   * called from the click that wants sound rather than at module load.
   */
  private ensure(): { context: AudioContext; master: GainNode } {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume();
    return { context: this.context, master: this.master! };
  }

  get currentTime(): number {
    return this.context?.currentTime ?? 0;
  }

  /** Play a set of voices, all timed from one `now` so a chord stays together. */
  play(voices: readonly Voice[]): void {
    const { context, master } = this.ensure();
    const now = context.currentTime + 0.06; // a beat of headroom to schedule into
    for (const voice of voices) {
      this.scheduleNote(context, master, voice, now + voice.start);
    }
  }

  stop(): void {
    if (!this.context) return;
    void this.context.close();
    this.context = null;
    this.master = null;
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
    }
  }
}
