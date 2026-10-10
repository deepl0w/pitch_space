import { pitchFromMidi, pitchName } from '../theory/pitch';
import type { PlayedNote } from './types';

/**
 * What a learner actually played, out of what the microphone reported.
 *
 * **Between the capture chain and an exercise's reading of it**, because the
 * two want different things. `listen.ts` reports every attack it can defend,
 * which is right for a detector and wrong for a grader: a hammer click, a
 * fret buzz, a breath before a sung note and the detector momentarily
 * reading an octave are all real events and none of them is a note the
 * learner meant.
 *
 * **Written because the strict reading did not survive contact.** The rules
 * in `intervalPlayed` and `scalePlayed` turn on how many notes arrived, and
 * the first report from a real instrument was that more than two arrive
 * every time — so a refusal meant to catch a fumble was catching everything
 * and the feature was unusable. Tightening the detector is the wrong lever:
 * what it reports is defensible, and it has no idea an exercise is counting.
 *
 * **Nothing here guesses which notes were meant.** It drops events too brief
 * to be a note and joins readings of one sustained pitch; it never discards
 * a distinct pitch to make a count come out, which would be the app deciding
 * it knows better than its own input — the move ADR 0047 refuses. If a
 * learner really played three pitches, three is what the exercise sees, and
 * refusing is still its answer.
 */

/**
 * Shorter than this and it was not a note.
 *
 * A piano hammer, a pick scrape and the consonant in front of a sung note
 * are all tens of milliseconds; the shortest thing a learner plays on
 * purpose is a semiquaver at a brisk tempo, which is about 125 ms. Fifty is
 * well under that and well over the artefacts, which is the gap worth
 * sitting in rather than a figure tuned to any one recording.
 */
export const BRIEFEST_NOTE_SECONDS = 0.05;

/** The notes an exercise should grade, in the order they were played. */
export function steadyNotes(notes: readonly PlayedNote[]): readonly PlayedNote[] {
  return notes.filter((note) => (
    note.frequencyHz !== null
    && note.frequencyHz > 0
    && note.durationSeconds >= BRIEFEST_NOTE_SECONDS
  ));
}

/*
  **Two readings at one pitch are not merged here, and the first version of
  this did merge them.**

  It is the obvious tolerance to add — a note read twice is the commonest
  spurious extra — and it destroys the unison, which a learner answers by
  striking one pitch twice. Pitch alone cannot tell a re-attack from a
  wobble inside one note, so a rule written on pitch alone removes an
  interval from the exercise to make a count come out.

  The signal that does separate them is loudness, and it is already used:
  `assemble` in `audio/capture/listen.ts` joins attacks that agree about
  pitch *and did not get louder*, which keeps the unison because the second
  strike is louder. Duplicating that here without its second half was the
  mistake. If the merge needs to be more generous, it belongs there, where
  the samples are.
*/

/**
 * What was heard, named, so a refusal can say it.
 *
 * **The message is also the only instrument anyone has here.** Nothing in
 * this repository can hear a real instrument — the suite plays synthesised
 * strings and headless Chrome has no microphone — so when a learner reports
 * that their playing reads as four notes, the app saying *which four* is the
 * difference between a bug report and a diagnosis. Naming them costs a line
 * and tells the player something useful at the same time.
 */
export function namePlayed(notes: readonly PlayedNote[]): string {
  return notes
    .map((note) => pitchName(pitchFromMidi(midiOfHz(note.frequencyHz as number)), true))
    .join(' ');
}

function midiOfHz(hz: number): number {
  return Math.round(69 + 12 * Math.log2(hz / 440));
}
