import { describe, expect, it } from 'vitest';
import { Fft, hannWindow, isPow2, nextPow2 } from './fft';

/**
 * The reference the fast transform is held to.
 *
 * O(N²) and written straight from the definition, so it has nowhere to hide a
 * bug that the butterfly version could share. Every agreement test below runs
 * at a size small enough that the quadratic cost does not matter.
 */
function naiveDft(re: readonly number[], im: readonly number[]): { re: number[]; im: number[] } {
  const n = re.length;
  const outRe = new Array<number>(n).fill(0);
  const outIm = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < n; j++) {
      const angle = (-2 * Math.PI * k * j) / n;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      outRe[k] += re[j] * c - im[j] * s;
      outIm[k] += re[j] * s + im[j] * c;
    }
  }
  return { re: outRe, im: outIm };
}

/** A deterministic, non-musical signal: nothing here may read entropy. */
function lumpySignal(n: number): number[] {
  return Array.from({ length: n }, (_, i) =>
    Math.sin(i * 0.7) + 0.4 * Math.cos(i * 2.3 + 1) - 0.15 * i / n + (i % 7 === 0 ? 0.6 : 0));
}

describe('sizing a transform', () => {
  it('rounds a sample count up to the next power of two and leaves one alone', () => {
    expect(nextPow2(5715)).toBe(8192);
    expect(nextPow2(8192)).toBe(8192);
    expect(nextPow2(8193)).toBe(16384);
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(0)).toBe(1);
  });

  it('agrees with itself about what a power of two is', () => {
    for (let n = 2; n <= 4096; n++) {
      expect(isPow2(n)).toBe(nextPow2(n) === n);
    }
  });

  it('refuses a size that is not a power of two rather than rounding it quietly', () => {
    expect(() => new Fft(1000)).toThrow(/power of two/);
    expect(() => new Fft(1)).toThrow(/power of two/);
  });
});

describe('the fast transform against the definition', () => {
  it('matches a naive DFT on an arbitrary complex signal', () => {
    for (const n of [2, 4, 8, 16, 64, 256]) {
      const re = lumpySignal(n);
      const im = lumpySignal(n).map((v, i) => v * 0.3 - Math.cos(i * 1.1));
      const expected = naiveDft(re, im);

      const gotRe = Float64Array.from(re);
      const gotIm = Float64Array.from(im);
      new Fft(n).forward(gotRe, gotIm);

      for (let k = 0; k < n; k++) {
        expect(gotRe[k]).toBeCloseTo(expected.re[k], 8);
        expect(gotIm[k]).toBeCloseTo(expected.im[k], 8);
      }
    }
  });

  it('matches a naive DFT on a real signal, where the imaginary half starts empty', () => {
    const n = 128;
    const re = lumpySignal(n);
    const expected = naiveDft(re, new Array<number>(n).fill(0));

    const gotRe = new Float64Array(n);
    const gotIm = new Float64Array(n);
    new Fft(n).forwardReal(Float64Array.from(re), gotRe, gotIm);

    for (let k = 0; k < n; k++) {
      expect(gotRe[k]).toBeCloseTo(expected.re[k], 8);
      expect(gotIm[k]).toBeCloseTo(expected.im[k], 8);
    }
  });

  it('returns a real signal unchanged after a round trip through the inverse', () => {
    const n = 512;
    const original = lumpySignal(n);
    const re = Float64Array.from(original);
    const im = new Float64Array(n);
    const fft = new Fft(n);
    fft.forward(re, im);
    fft.inverse(re, im);
    for (let i = 0; i < n; i++) {
      expect(re[i]).toBeCloseTo(original[i], 10);
      expect(im[i]).toBeCloseTo(0, 10);
    }
  });

  it('mirrors a real signal around Nyquist, which is why only half the bins are read', () => {
    const n = 64;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    new Fft(n).forwardReal(Float64Array.from(lumpySignal(n)), re, im);
    for (let k = 1; k < n / 2; k++) {
      expect(re[n - k]).toBeCloseTo(re[k], 10);
      expect(im[n - k]).toBeCloseTo(-im[k], 10);
    }
  });
});

describe('a pure tone', () => {
  // A tone at exactly bin k completes a whole number of cycles in the frame,
  // so there is nothing for it to leak into. Anything the transform gets wrong
  // about phase or ordering shows up here as energy somewhere else.
  it('lands in a single bin when its period divides the frame exactly', () => {
    const n = 1024;
    const bin = 37;
    const samples = new Float64Array(n);
    for (let i = 0; i < n; i++) samples[i] = Math.sin((2 * Math.PI * bin * i) / n);

    const mags = new Fft(n).magnitudes(samples);
    expect(mags[bin]).toBeCloseTo(n / 2, 6);
    for (let k = 0; k < mags.length; k++) {
      if (k !== bin) expect(mags[k]).toBeLessThan(1e-9);
    }
  });

  it('reports one magnitude per bin from DC to Nyquist inclusive', () => {
    expect(new Fft(1024).magnitudes(new Float64Array(1024)).length).toBe(513);
  });

  it('puts a constant signal entirely in the DC bin', () => {
    const n = 256;
    const mags = new Fft(n).magnitudes(new Float64Array(n).fill(0.5));
    expect(mags[0]).toBeCloseTo(n * 0.5, 9);
    for (let k = 1; k < mags.length; k++) expect(mags[k]).toBeLessThan(1e-9);
  });

  it('refuses a frame shorter than the transform rather than reading past its end', () => {
    expect(() => new Fft(256).magnitudes(new Float64Array(255))).toThrow(/Need 256 samples/);
  });
});

describe('the Hann window', () => {
  it('starts at zero and peaks in the middle', () => {
    const w = hannWindow(1024);
    expect(w[0]).toBe(0);
    expect(w[512]).toBeCloseTo(1, 12);
  });

  // The whole reason it divides by N rather than N-1. Without this property a
  // spectral flux reading would partly measure the window rather than the
  // signal, and an onset detector would find transients in a steady tone.
  it('sums to one under half-frame overlap, so overlapping frames do not beat', () => {
    const n = 64;
    const w = hannWindow(n);
    for (let i = 0; i < n / 2; i++) {
      expect(w[i] + w[i + n / 2]).toBeCloseTo(1, 12);
    }
  });

  it('is symmetric about its peak, with the dropped last point implied by the first', () => {
    const n = 32;
    const w = hannWindow(n);
    for (let i = 1; i < n / 2; i++) expect(w[i]).toBeCloseTo(w[n - i], 12);
  });
});
