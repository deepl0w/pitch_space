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

/** Note name to its fundamental, equal-tempered from A4 = 440. */
const HZ: Record<string, number> = {
  A1: 55, A2: 110, C3: 130.813, E3: 164.814, A3: 220, C5: 523.251,
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

  it('is one note, not several', () => {
    // A long piano decay is where a spectral-flux detector is most likely
    // to re-trigger: the sound is still changing after the attack. The
    // model decays smoothly and cannot test this.
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
