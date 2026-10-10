import { describe, expect, it } from 'vitest';
import { BRIEFEST_NOTE_SECONDS, namePlayed, steadyNotes } from './played';
import type { PlayedNote } from './types';

/**
 * What a learner played, out of what the microphone reported.
 *
 * Written after the first report from a real instrument: more than two notes
 * arrive every time, so a rule that refuses on a count refused everything.
 * The care is that nothing here may discard a *pitch* to make a count come
 * out — that is the app deciding it knows better than its own input, which
 * ADR 0047 refuses.
 */
describe('the notes a learner actually played', () => {
  const note = (frequencyHz: number | null, over = 0.3, at = 0): PlayedNote =>
    ({ startSeconds: at, durationSeconds: over, frequencyHz });

  it('drops what had no readable pitch', () => {
    expect(steadyNotes([note(440), note(null), note(554)])).toHaveLength(2);
  });

  it('drops what was too brief to be a note', () => {
    // A hammer click, a pick scrape, the consonant before a sung note.
    const take = [note(440, BRIEFEST_NOTE_SECONDS / 2), note(440), note(554)];
    expect(steadyNotes(take)).toHaveLength(2);
  });

  it('keeps a note held exactly as long as the floor', () => {
    // The boundary, which an inequality is easy to get the wrong way round.
    expect(steadyNotes([note(440, BRIEFEST_NOTE_SECONDS)])).toHaveLength(1);
  });

  /**
   * **Two attacks at one pitch stay two notes, and this is the case the
   * obvious tolerance breaks.**
   *
   * Merging same-pitch neighbours is the first thing anyone reaches for
   * against spurious repeats, and a unison is answered by striking one pitch
   * twice — so that merge removes an interval from the exercise. The signal
   * that separates a re-attack from a wobble is loudness, and it is already
   * applied where the samples are.
   */
  it('does not merge two attacks at one pitch', () => {
    expect(steadyNotes([note(440, 0.3, 0), note(440, 0.3, 1)])).toHaveLength(2);
  });

  it('never drops a distinct pitch, however many there are', () => {
    // The rule that must not be weakened to make a count fit.
    const five = [note(440), note(466), note(494), note(523), note(554)];
    expect(steadyNotes(five)).toHaveLength(5);
  });

  it('keeps them in the order they were played', () => {
    const take = [note(554, 0.3, 0), note(440, 0.3, 1)];
    expect(steadyNotes(take).map((n) => n.frequencyHz)).toEqual([554, 440]);
  });
});

describe('naming what was heard, so a refusal can say it', () => {
  it('names the notes a learner played', () => {
    const take: PlayedNote[] = [
      { startSeconds: 0, durationSeconds: 0.3, frequencyHz: 440 },
      { startSeconds: 1, durationSeconds: 0.3, frequencyHz: 523.25 },
    ];
    expect(namePlayed(take)).toBe('A4 C5');
  });

  it('names a pitch that is not quite in tune as the note it is nearest', () => {
    // A learner reading "A4 C5" for playing A and C slightly flat has been
    // told something useful; one reading "440.0Hz 519.1Hz" has not.
    const flat: PlayedNote[] = [
      { startSeconds: 0, durationSeconds: 0.3, frequencyHz: 440 * 2 ** (-0.3 / 12) },
    ];
    expect(namePlayed(flat)).toBe('A4');
  });
});
