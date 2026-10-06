import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyse } from './listen';
import { decodeWav } from '../testing/wav';

/**
 * The capture path against recorded piano, rather than against a model.
 *
 * ADR 0008's tiers, and this is the second one: synthesised signals are
 * committed and always run, real recordings are fetched and skip with the
 * remedial command when absent. A fresh checkout is green without them.
 *
 * **What this tier is for.** A Karplus–Strong pluck has an attack and a
 * decay, which is why it finds defects a sine cannot. It still has no
 * room, no soundboard and no hammer, and those are exactly the parts of a
 * real note that mislead a pitch detector. A claim that holds on the model
 * and fails here is the claim worth knowing about.
 */

const DIR = 'fixtures/audio';
const REMEDY = 'tools/fetch-test-audio.sh';

/**
 * File name to the fundamental actually recorded in it.
 *
 * **The library numbers octaves one below scientific pitch**, so its `A3`
 * is A4 and sounds 440 Hz. Its own range gives this away — it runs from
 * `A-1` to `C7`, which is a piano's A0 to C8 — and so did the first run
 * of this test: all six notes came back out by almost exactly +1200
 * cents, which is far too consistent to be a detector failing and is the
 * signature of a table that is wrong by an octave.
 *
 * Worth the paragraph because the wrong reading was the plausible one. A
 * uniform octave error is also what YIN does on a weak fundamental, and a
 * piano's bottom notes have weak fundamentals — so the obvious conclusion
 * was "the detector octave-errors on real piano", which would have sent
 * someone tuning a detector that was right all along.
 */
const HZ: Record<string, number> = {
  A1: 110, F2: 174.614, 'C#3': 277.183, A3: 440, 'D#4': 622.254, A5: 1760,
};

function recordings(): { note: string; path: string }[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.startsWith('piano_') && f.endsWith('.wav'))
    .map((f) => ({ note: f.slice('piano_'.length, -'.wav'.length), path: `${DIR}/${f}` }))
    .filter((r) => HZ[r.note] !== undefined)
    .sort((a, b) => HZ[a.note] - HZ[b.note]);
}

const found = recordings();

describe.skipIf(found.length === 0)('a recorded piano note', () => {
  it('is read as audio at all, whatever the file says it is', () => {
    // The decoder refuses rather than returning silence for a format it
    // does not know, so this failing means the fetch brought something
    // other than PCM — which would otherwise surface as "the detector
    // heard nothing", a much more expensive thing to chase.
    for (const { note, path } of found) {
      const wav = decodeWav(toArrayBuffer(readFileSync(path)));
      expect(wav.sampleRate, note).toBeGreaterThan(8000);
      expect(wav.samples.length, note).toBeGreaterThan(wav.sampleRate / 10);
      const peak = wav.samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
      expect(peak, `${note} decoded to silence`).toBeGreaterThan(0.01);
    }
  });

  it('is named correctly, which is the claim the model cannot make', () => {
    /*
      A semitone of tolerance rather than a quarter tone. A real piano is
      stretch-tuned — the octaves are deliberately wide — and a single
      struck note contains an inharmonic partial series the model does
      not produce. Half a semitone would be asserting something about
      this instrument's tuning rather than about the detector.
    */
    const wrong: string[] = [];
    for (const { note, path } of found) {
      const wav = decodeWav(toArrayBuffer(readFileSync(path)));
      const heard = analyse(wav.samples, wav.sampleRate);
      const first = heard.notes[0];
      if (!first || first.frequencyHz === null) { wrong.push(`${note}: nothing heard`); continue; }
      const cents = 1200 * Math.log2(first.frequencyHz / HZ[note]);
      if (Math.abs(cents) > 100) wrong.push(`${note}: out by ${cents.toFixed(0)} cents`);
    }
    expect(wrong).toEqual([]);
  });

  it.fails('is one note, not several — known defect, see the comment', () => {
    /*
      **A known defect, recorded as failing rather than softened.**
      `it.fails` so the suite is honest: this goes red the day it starts
      passing, which is what a fixed defect should do.

      Measured, one struck note per file:

          A1  24 onsets, first five at 0.02 0.09 0.20 0.28 0.35
          F2   7
          A3   2            (the second at 7.5s — the damper)
          A5   4

      So a single piano note is heard as up to twenty-four. The attack is
      not one spectral-flux event: a hammer strike spreads energy over
      roughly a third of a second and the flux peaks repeatedly, 70 to
      110 ms apart.

      **`MIN_SEPARATION_SECONDS` is 0.05 and its own comment states the
      conflict without knowing it.** It argues 50 ms cannot swallow a
      real note because "at 200 bpm a sixteenth note is 75 ms" — and 75
      ms is precisely the spacing of a piano's attack cluster. The window
      that would merge these is the window that would swallow a fast
      note. That is a genuine tension, not a mistuned number, and
      widening it unilaterally would change rhythm grading, which is the
      one place onsets are already trusted.

      Nothing downstream is wrong meanwhile: the pitch cases above pass,
      because every fragment of one note reports that note. What is wrong
      is the count, which is exactly what rhythm grading reads.

      This is ADR 0008's argument arriving: the synthetic tier passes
      this comfortably, because a Karplus–Strong pluck has a single clean
      attack and a real hammer does not.
    */
    for (const { note, path } of found) {
      const wav = decodeWav(toArrayBuffer(readFileSync(path)));
      const heard = analyse(wav.samples, wav.sampleRate);
      expect(heard.notes.length, `${note} heard as ${heard.notes.length} notes`).toBe(1);
    }
  });
});

describe.skipIf(found.length > 0)('the recorded tier', () => {
  it('is absent, and says how to get it', () => {
    // Not a silent skip: a tier nobody knows is missing is a tier that
    // stays missing. This case exists so the run says so out loud.
    expect(found).toEqual([]);
    console.log(`\n  No recordings in ${DIR}. Run ${REMEDY} to enable the recorded-audio tests.\n`);
  });
});

/** Node's Buffer is a view into a pooled ArrayBuffer; the slice is its own. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset, buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}
