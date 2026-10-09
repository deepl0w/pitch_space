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

  it('is one note, not a cluster of them', () => {
    /*
      **This was the defect that justified the whole tier**, and it is
      fixed. Before note assembly existed, one struck note was heard as:

          A1  24 notes    F2  7    C#3  8    A5  4

      A hammer strike is not one spectral-flux event. It spreads energy
      over roughly a third of a second and the flux peaks repeatedly,
      70 to 110 ms apart — which `MIN_SEPARATION_SECONDS` cannot merge,
      because the 50 ms window that would is the window that swallows a
      sixteenth at 200 bpm. ADR 0035 moved the decision to note assembly
      for that reason, and ADR 0012's distinction is the same one: an
      onset is a measurement, a note is a conclusion.

      Asserted as *the attack cluster*, not as "one note per file",
      because those are different claims and only the first is settled.
      Nothing may begin in the first second except the first thing —
      which is precisely what twenty-four peaks across 350 ms violated,
      and what no amount of tuning a separation window could have fixed.
    */
    const wrong: string[] = [];
    for (const { note, path } of found) {
      const wav = decodeWav(toArrayBuffer(readFileSync(path)));
      const heard = analyse(wav.samples, wav.sampleRate);
      const early = heard.notes.filter((n) => n.startSeconds < 1);
      if (early.length !== 1) {
        wrong.push(`${note}: ${early.length} notes began in the first second`
          + ` (${heard.onsets.length} onsets)`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it.fails('is one note for its whole length — A3 is not, and why is unresolved', () => {
    /*
      The part that is *not* settled, kept failing rather than dropped.

      Five of six recordings are now heard as exactly one note. A3 is
      heard as two: the second begins at 7.51 s in a 12.1 s file, is
      pitched at 439.4 Hz against the first's 440.1, and runs for the
      remaining 4.6 s. So it is the same string — but something there
      raises the level enough to read as a new attack, and the rise test
      is what separates a real repeat from a decaying tail.

      **I do not know what that event is, and have not claimed to.** It
      could be a second articulation in the recording, a pedal, or an
      edit; it cannot be told apart from a genuine repeat without
      listening, which is not a thing a test does. Deciding it is noise
      and widening the rule until A3 passes would be fitting the rule to
      six files, which is the fifth convention's warning.

      So it stays here, named, with the numbers, owned by nobody.
    */
    for (const { note, path } of found) {
      const wav = decodeWav(toArrayBuffer(readFileSync(path)));
      const heard = analyse(wav.samples, wav.sampleRate);
      expect(heard.notes.length, `${note} heard as ${heard.notes.length}`).toBe(1);
    }
  });
});

describe.skipIf(found.length > 0)('the recorded tier', () => {
  it('is absent, and names a remedy that is actually there', () => {
    /*
      The message is the whole point of this case, and a message naming a
      script that has moved is worse than no message: the reader runs it,
      gets nothing, and concludes the tier is broken rather than absent.
      Asserting the remedy exists is the one claim available in a checkout
      that has no recordings to say anything else about.

      The drift check that used to be here has moved outside both gates —
      see below. It belonged there: inside this block it only ran when
      *nothing* matched, so it caught a wholesale rename and missed the
      likelier shape, one file the table does not know about.
    */
    expect(existsSync(REMEDY), `${REMEDY} is gone, so the message below is a lie`).toBe(true);
    console.log(`\n  No recordings in ${DIR}. Run ${REMEDY} to enable the recorded-audio tests.\n`);
  });
});

/** Node's Buffer is a view into a pooled ArrayBuffer; the slice is its own. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset, buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/**
 * Outside both gates, because the question is the same in either state.
 *
 * A recording in the directory that no case reads is the tier being quietly
 * short: the fetch script gains a note and `HZ` does not, or a download is
 * renamed upstream, and the run goes green over five files where it used to
 * read six. Nothing in the two blocks above can see that — one only runs
 * when every file matched is none of them, the other asserts about the
 * files it did match and cannot miss what it never saw.
 *
 * Vacuous where there are no recordings at all, which is honest: a checkout
 * without the fixtures has nothing to be wrong about, and the case above
 * says so out loud.
 */
describe('the recordings this tier reads', () => {
  it('leaves nothing in the directory unread', () => {
    const wavs = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.wav')) : [];
    const read = new Set(found.map((r) => r.path.slice(DIR.length + 1)));
    expect(wavs.filter((f) => !read.has(f)),
      `in ${DIR} and read by nothing — the file names and the HZ table have drifted apart`)
      .toEqual([]);
  });
});
