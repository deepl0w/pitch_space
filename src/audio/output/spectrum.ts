/**
 * The shape of the output's level report, and nothing else.
 *
 * **A leaf on purpose: this file imports nothing.** The numbers are agreed
 * between the output, which sizes an `AnalyserNode` from them, and whatever
 * draws the result, which sizes its buffer from them — and those two live on
 * opposite sides of the exercise layer's boundary.
 *
 * They were declared in `synth.ts` beside the analyser that uses them, which
 * read as the obvious home and quietly broke the boundary: every other import
 * the exercise layer takes from `audio/output/synth` is `import type`, erased
 * at compile time, and a value import is not. One `import { SPECTRUM_BANDS }`
 * put the module that constructs the `AudioContext` into the runtime graph of
 * a prompt — which is the thing ADR 0029 exists to prevent, arriving as a
 * convenience rather than as a decision. Nothing failed; `architecture.test.ts`
 * guards `theory/`, `generate/` and `audio/dsp/`, and the exercise layer was
 * not in the list.
 *
 * So the contract lives where both sides can take it without taking anything
 * with it. A constant shared between two layers is not a detail of either.
 */

/**
 * How many bands the output is reported in, for anything drawing it.
 *
 * Small on purpose. This is read to draw a few dozen bars a few inches wide,
 * not to analyse anything — at 2048 bins almost all of them would fall in the
 * top four octaves, where an instrument has nothing but harmonics, and the
 * picture would be a flat line with a bump at the left edge. 64 bands over a
 * 48 kHz context puts each at about 375 Hz, which is coarse for pitch and
 * right for a shape that has to read at a glance.
 */
export const SPECTRUM_BANDS = 64;

/**
 * How much of each band is carried from the previous frame.
 *
 * The analyser's own smoothing is what makes a visualiser look like it is
 * responding rather than flickering; without it a bar drawn at 60 Hz from an
 * unsmoothed FFT jitters every frame and reads as noise.
 */
export const SPECTRUM_SMOOTHING = 0.75;
