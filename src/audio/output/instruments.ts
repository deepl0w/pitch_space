/**
 * The voices the synth can speak in.
 *
 * Synthesised rather than sampled, which is a decision about shipping
 * rather than about sound: the app is installable and works offline, and
 * a sample pack large enough to be convincing is the largest thing it
 * would ever download. Samples remain planned behind this same seam —
 * an `Instrument` is a description of a sound, not of how it is made, so
 * a sampled pack can satisfy it later without the exercises knowing.
 *
 * Each one is an additive stack plus an envelope. That is a modest
 * synthesis technique and it is enough for the job here, which is not to
 * be mistaken for a real instrument but to be **told apart from the
 * others** — a learner choosing an organ over a piano wants the sustain,
 * and one choosing a flute wants the near-sine tone that makes a tritone
 * easier to hear than a piano's clangour does.
 */

export interface Instrument {
  /** Stored in settings, so a compatibility commitment once written. */
  readonly id: string;
  readonly name: string;
  /**
   * Relative amplitude of each harmonic, fundamental first.
   *
   * Length is the number of oscillators per note, so it is also the cost:
   * a six-note chord on a seven-partial instrument is forty-two
   * oscillators. The organ is deliberately short for that reason.
   */
  readonly partials: readonly number[];
  /**
   * How sharp the upper partials run, as a coefficient on `n²`.
   *
   * Real strings are stiff and their overtones are not exact multiples;
   * without this a stack of perfect harmonics sounds like an organ
   * whatever envelope it is given. Zero is the honest value for
   * instruments that really are harmonic — pipes and air columns.
   */
  readonly inharmonicity: number;
  /** Seconds from silence to peak. A pluck is immediate; a bow is not. */
  readonly attack: number;
  /** Seconds from peak to {@link sustain}. */
  readonly decay: number;
  /** The fraction of peak the note has fallen to after {@link decay}. */
  readonly decayTo: number;
  /**
   * Whether the note then *stays* there while it is held.
   *
   * This is what separates struck from blown, and it is a fact about the
   * instrument rather than a level. A piano cannot hold a note: it falls
   * past {@link decayTo} and keeps falling until it is silent, which is
   * why a long note on a piano is quiet by the end. An organ holds
   * exactly as long as the key is down.
   *
   * Written as a flag and not inferred from a low `decayTo`, because the
   * first version did infer it — every voice held at its decay level —
   * and that made the piano sustain like a bad sample. The two
   * behaviours are different curves, not two ends of one.
   */
  readonly holds: boolean;
  /**
   * A level trim, measured rather than chosen.
   *
   * Dividing by the partial count does not equalise loudness: a held
   * voice delivers its level for the whole note where a struck one is
   * already decaying, and a bright stack carries more energy than a
   * plain one at the same peak. Measured through an analyser on the live
   * graph, the organ came out about 15 dB above the piano — a
   * loud-versus-quiet jump rather than a difference in timbre, so
   * switching instrument felt like moving the volume slider.
   *
   * These bring the six within a few dB of each other. They are
   * measurements of *this* synthesis and have to be re-measured if a
   * voice's partials or envelope change; the suite cannot check them,
   * because loudness is the one thing it has no instrument for.
   */
  readonly trim: number;
  /** Seconds from the note ending to silence. */
  readonly release: number;
}

/**
 * Listed explicitly rather than generated, and in the order a picker
 * shows them: the two a learner is most likely to want first.
 */
export const INSTRUMENTS: readonly Instrument[] = Object.freeze([
  {
    id: 'piano',
    name: 'Piano',
    // The original timbre, kept exactly: it is what every recording and
    // every listening test in this repository was made against.
    partials: [1, 0.5, 0.28, 0.16, 0.09, 0.05, 0.03],
    inharmonicity: 0.0004,
    attack: 0.008,
    decay: 0.18,
    decayTo: 0.3,
    holds: false,
    trim: 1,
    release: 0.25,
  },
  {
    id: 'electric-piano',
    name: 'Electric piano',
    // A bell, roughly: a strong fundamental with a loud high partial and
    // little between, which is what gives a Rhodes its tine.
    partials: [1, 0.12, 0.06, 0.4, 0.04, 0.02],
    inharmonicity: 0.0009,
    attack: 0.004,
    decay: 0.35,
    decayTo: 0.22,
    holds: false,
    trim: 0.5,
    release: 0.4,
  },
  {
    id: 'guitar',
    name: 'Guitar',
    // Plucked: brighter than the piano at the attack and shorter-lived,
    // with the odd partials a little stronger.
    partials: [1, 0.6, 0.45, 0.2, 0.16, 0.08, 0.05, 0.03],
    inharmonicity: 0.0002,
    attack: 0.003,
    decay: 0.12,
    decayTo: 0.18,
    holds: false,
    trim: 0.75,
    release: 0.3,
  },
  {
    id: 'organ',
    name: 'Organ',
    /*
      Drawbar-ish: the octave and the twelfth, which is the sound those
      stops make together. Harmonic on purpose — a pipe is an air column
      and has no stiffness to be sharp about — and short, because a
      sustained instrument holds every partial for the whole note and
      this is the one that would cost the most.
    */
    partials: [1, 0.7, 0.35, 0.5, 0.12],
    inharmonicity: 0,
    attack: 0.02,
    decay: 0.04,
    decayTo: 1,
    holds: true,
    trim: 0.2,
    release: 0.08,
  },
  {
    id: 'strings',
    name: 'Strings',
    // Bowed: the attack is the whole character, and a slow one is what
    // stops it sounding like an organ with a different partial stack.
    partials: [1, 0.8, 0.5, 0.4, 0.25, 0.18, 0.1, 0.06],
    inharmonicity: 0.0001,
    attack: 0.12,
    decay: 0.25,
    decayTo: 0.85,
    holds: true,
    trim: 0.3,
    release: 0.35,
  },
  {
    id: 'flute',
    name: 'Flute',
    /*
      Nearly a sine, which is the point rather than a simplification: an
      interval played on something this plain is the easiest version of
      the ear-training question, and a learner who cannot hear a tritone
      through a piano's upper partials can often hear it here.
    */
    partials: [1, 0.08, 0.04, 0.02],
    inharmonicity: 0,
    attack: 0.06,
    decay: 0.1,
    decayTo: 0.9,
    holds: true,
    trim: 0.22,
    release: 0.12,
  },
]);

const BY_ID = new Map(INSTRUMENTS.map((i) => [i.id, i]));

/** The one every setting falls back to, and the sound the app had before it had a choice. */
export const DEFAULT_INSTRUMENT_ID = 'piano';

/**
 * Throws on an unknown id rather than falling back.
 *
 * A caller holding an id that is not in the catalogue has a bug, and
 * silently playing a piano would hide it. Settings coercion is where an
 * unreadable *stored* value becomes the default — repair belongs at the
 * boundary with the user's device, not here.
 */
export function instrument(id: string): Instrument {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown instrument: ${id}`);
  return found;
}

export function isInstrumentId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}
