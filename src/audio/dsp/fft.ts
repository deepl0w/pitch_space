/**
 * The one transform the analysis chain runs on, and the windowing it needs.
 *
 * Ported from the sibling tuner's `Fft.kt`, which ADR 0001 there describes as
 * the thing that makes YIN affordable at all: its difference function is
 * O(W·τmax) evaluated naively, and a cross-correlation through three
 * transforms brings a frame down to O(N log N).
 *
 * Twiddle factors and the bit-reversal permutation are precomputed per
 * instance, so a transform allocates nothing. That matters because the browser
 * runs this on an audio-rate hop inside a worker, where a garbage collection is
 * a dropped frame rather than a slow one.
 *
 * Everything here is arithmetic over typed arrays and nothing else (ADR 0001).
 */

/**
 * What the chain accepts as audio. `Float32Array` is what the platform hands
 * over; `Float64Array` is what the synthesised fixtures and the internals use,
 * and refusing one of them at the boundary would mean a copy per call.
 */
export type Samples = Float32Array | Float64Array;

/**
 * Smallest power of two at or above `n`.
 *
 * Written as a doubling loop rather than `2 ** Math.ceil(Math.log2(n))`
 * because the latter is a float round-trip: for an `n` that is already a power
 * of two, the answer depends on `Math.log2` landing exactly on an integer,
 * which is true on every engine today and is not something the frame size
 * should rest on.
 */
export function nextPow2(n: number): number {
  if (!Number.isFinite(n) || n <= 1) return 1;
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/**
 * Power of two nearest `n` on a log scale, which is the one that matters when
 * the size stands for a duration: at 48 kHz a 23 ms frame wants 1114 samples,
 * and 1024 is 9% short of it where 2048 is 84% over.
 */
export function nearestPow2(n: number): number {
  const above = nextPow2(n);
  const below = above / 2;
  return above / n < n / below ? above : below;
}

export function isPow2(n: number): boolean {
  return Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;
}

/**
 * Periodic Hann window — `0.5·(1 − cos(2πi/N))`, dividing by `N` rather than
 * by `N − 1`.
 *
 * The symmetric form is the one in most textbooks and the wrong one for an
 * STFT. Only the periodic form satisfies constant overlap-add at a half-frame
 * hop: successive windows sum to exactly 1, so the spectral flux between two
 * frames measures a change in the signal rather than a change in how much of
 * the window each sample happened to sit under.
 */
export function hannWindow(size: number): Float64Array {
  const w = new Float64Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / size));
  return w;
}

/** In-place iterative radix-2 Cooley–Tukey FFT. */
export class Fft {
  readonly size: number;

  private readonly cosTable: Float64Array;
  private readonly sinTable: Float64Array;
  private readonly bitReverse: Int32Array;

  // Scratch for the real-input entry points, so repeated calls allocate nothing.
  private readonly scratchRe: Float64Array;
  private readonly scratchIm: Float64Array;

  constructor(size: number) {
    if (!isPow2(size)) throw new Error(`FFT size must be a power of two, got ${size}`);
    this.size = size;
    this.cosTable = new Float64Array(size / 2);
    this.sinTable = new Float64Array(size / 2);
    this.bitReverse = new Int32Array(size);
    this.scratchRe = new Float64Array(size);
    this.scratchIm = new Float64Array(size);

    for (let i = 0; i < size / 2; i++) {
      const angle = (-2 * Math.PI * i) / size;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }
    let bits = 0;
    while (1 << bits < size) bits++;
    for (let i = 0; i < size; i++) {
      let remaining = i;
      let reversed = 0;
      for (let b = 0; b < bits; b++) {
        reversed = (reversed << 1) | (remaining & 1);
        remaining >>>= 1;
      }
      this.bitReverse[i] = reversed;
    }
  }

  /** Forward transform of `re`/`im`, both of length `size`, in place. */
  forward(re: Float64Array, im: Float64Array): void {
    const { size, cosTable, sinTable, bitReverse } = this;
    if (re.length !== size || im.length !== size) {
      throw new Error(`Arrays must be of length ${size}`);
    }

    for (let i = 0; i < size; i++) {
      const j = bitReverse[i];
      if (j > i) {
        let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
        tmp = im[i]; im[i] = im[j]; im[j] = tmp;
      }
    }

    for (let blockSize = 2; blockSize <= size; blockSize <<= 1) {
      const half = blockSize / 2;
      const tableStep = size / blockSize;
      for (let blockStart = 0; blockStart < size; blockStart += blockSize) {
        for (let i = blockStart, t = 0; i < blockStart + half; i++, t += tableStep) {
          const pair = i + half;
          const c = cosTable[t];
          const s = sinTable[t];
          const tre = re[pair] * c - im[pair] * s;
          const tim = re[pair] * s + im[pair] * c;
          re[pair] = re[i] - tre;
          im[pair] = im[i] - tim;
          re[i] += tre;
          im[i] += tim;
        }
      }
    }
  }

  /** Inverse transform, normalised by `1/size`, in place. */
  inverse(re: Float64Array, im: Float64Array): void {
    const { size } = this;
    for (let i = 0; i < size; i++) im[i] = -im[i];
    this.forward(re, im);
    const scale = 1 / size;
    for (let i = 0; i < size; i++) {
      re[i] *= scale;
      im[i] *= -scale;
    }
  }

  /**
   * Transform of a real frame, written into the caller's `re`/`im`.
   *
   * This is the complex engine with a zeroed imaginary part rather than the
   * packed half-size real transform. The packed form is about twice as fast
   * and is worth having the day the chain is the bottleneck; today a frame
   * costs three transforms inside a 46 ms hop and the simpler code is the one
   * that is obviously correct.
   */
  forwardReal(samples: Samples, re: Float64Array, im: Float64Array): void {
    const { size } = this;
    if (samples.length < size) throw new Error(`Need ${size} samples, got ${samples.length}`);
    for (let i = 0; i < size; i++) {
      re[i] = samples[i];
      im[i] = 0;
    }
    this.forward(re, im);
  }

  /**
   * Magnitude of each bin from DC to Nyquist inclusive — `size/2 + 1` of them.
   *
   * A real signal's spectrum is conjugate-symmetric, so the bins above Nyquist
   * are the ones below it mirrored and carry no information. Returning only
   * the half spares every caller from deciding where to stop, which is the
   * sort of off-by-one that shows up as an onset detector counting every
   * change twice.
   */
  magnitudes(samples: Samples, out?: Float64Array): Float64Array {
    const bins = this.size / 2 + 1;
    const result = out ?? new Float64Array(bins);
    if (result.length < bins) throw new Error(`Output needs ${bins} bins, got ${result.length}`);
    this.forwardReal(samples, this.scratchRe, this.scratchIm);
    for (let i = 0; i < bins; i++) {
      result[i] = Math.hypot(this.scratchRe[i], this.scratchIm[i]);
    }
    return result;
  }
}
