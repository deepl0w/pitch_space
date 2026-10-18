import { describe, expect, it } from 'vitest';
import { SONGS, songHint, songsFor } from './songs';
import {
  INTERVAL_DIRECTIONS, INTERVAL_SLUGS, intervalItemId,
} from './interval-id/intervals';

/**
 * The song table, held to what the exercises actually ask.
 *
 * **Written because the first draft got a key wrong and nothing would have
 * said so.** The tritone was keyed `interval:TT:up` from a guess at the slug;
 * the exercise writes `interval:tritone:up`. Every tritone question would
 * have carried no song at all — silently, since an empty hint is a
 * legitimate state and reads exactly like a cell with nothing in it. A key
 * that resolves to nothing is the same failure as a citation that resolves
 * to the wrong record: it passes every check that only looks at the table.
 *
 * So the ids here come from `intervalItemId`, the function the exercise
 * itself uses — not from a list typed beside it, which could share the
 * guess.
 */

/** Every interval item an exercise can ask, from the exercise's own code. */
function askableIntervalItems(): string[] {
  const ids = new Set<string>();
  for (let semitones = 0; semitones < INTERVAL_SLUGS.length; semitones += 1) {
    for (const direction of INTERVAL_DIRECTIONS) {
      ids.add(intervalItemId(semitones, direction));
    }
  }
  return [...ids];
}

describe('the song table', () => {
  it('keys nothing an exercise cannot ask', () => {
    /*
      The direction this catches is the drafting mistake: a key typed from
      memory of the slug format. An unreachable key is dead weight at best
      and, at worst, the only entry for a cell — sitting under a name no
      question will ever look up.
    */
    const askable = new Set(askableIntervalItems());
    const stray = Object.keys(SONGS).filter((key) => !askable.has(key));
    expect(stray, 'keyed under an id no exercise writes').toEqual([]);
  });

  it('has a song for every interval an exercise can ask, in every direction', () => {
    /*
      Harmonic is included and resolves through the ascending row, so this
      is asking the lookup rather than the table — which is what a learner
      meets. A cell left empty on purpose would have to be argued for here,
      and none is.
    */
    const bare = askableIntervalItems().filter((item) => songsFor(item).length === 0);
    expect(bare, 'an interval a learner can miss with no song to point them at').toEqual([]);
  });

  it('is reaching enough ids to mean something', () => {
    // Twelve intervals in three directions collapse to unison plus twelve
    // times three. A walk that produced a handful would pass both cases above
    // by checking almost nothing.
    expect(askableIntervalItems().length).toBe(1 + 12 * 3);
  });
});

describe('a descending interval', () => {
  it('never borrows a rising tune', () => {
    /*
      The defect this replaces, stated as its own case. A learner who missed
      a descending major sixth was told to think of *My Bonnie*, which rises —
      pointing their ear at the opposite contour. Up and down share no song.
    */
    for (let semitones = 1; semitones < INTERVAL_SLUGS.length; semitones += 1) {
      const up = new Set(songsFor(intervalItemId(semitones, 'up')).map((s) => s.title));
      const shared = songsFor(intervalItemId(semitones, 'down')).filter((s) => up.has(s.title));
      expect(shared.map((s) => s.title), `${INTERVAL_SLUGS[semitones]} down reuses a rising tune`)
        .toEqual([]);
    }
  });
});

describe('a harmonic interval', () => {
  it('reads the ascending row', () => {
    // Both notes at once: no contour to contradict, so the rising tune is
    // still the quickest way to the distance.
    expect(songsFor('interval:m3:harmonic')).toEqual(songsFor('interval:m3:up'));
  });
});

describe('the hint', () => {
  it('names two songs, with who wrote them, so a learner has a second chance to know one', () => {
    const hint = songHint('interval:m2:up');
    expect(hint).toBe('Think of the Jaws theme (John Williams) or the Pink Panther theme (Henry Mancini)');
  });

  it('says where in the song the interval is, when it is not the opening', () => {
    expect(songHint('interval:P5:up')).toContain('at the first "twinkle" to the second');
  });

  it('leaves out "traditional", which is not something anyone searches for', () => {
    expect(songHint('interval:M2:down')).toBe('Think of Mary Had a Little Lamb or Three Blind Mice');
  });

  it('says nothing for an item with no songs, rather than a broken sentence', () => {
    expect(songHint('chord:dom7')).toBe('');
  });
});

describe('a song as written', () => {
  it('carries one pair of brackets, holding everything about it', () => {
    /*
      Titles that bracketed their own qualifier — "Star Wars (main title)" —
      produced "Star Wars (main title) (John Williams)" once a composer was
      added. A title with brackets in it is the thing to refuse.
    */
    const bracketed = Object.values(SONGS).flat().filter((song) => /[()]/.test(song.title));
    expect(bracketed.map((song) => song.title)).toEqual([]);
  });
});

describe('which songs a learner is offered', () => {
  it('can show every song in every row, so none is verified for nothing', () => {
    /*
      The hint took the first two, and three rows held a third — Summertime,
      Auld Lang Syne, Sweet Caroline — that no question could ever show. Each
      was checked against a published source and then sat unreachable, which
      is worse than not having it: the table claims coverage the learner never
      meets. Asked across every seed modulo the row length, which is every
      window the rotation can produce.
    */
    const unreachable: string[] = [];
    for (const [item, songs] of Object.entries(SONGS)) {
      const shown = new Set<string>();
      for (let seed = 0; seed < songs.length; seed += 1) {
        for (const song of songs) if (songHint(item, seed).includes(song.title)) shown.add(song.title);
      }
      for (const song of songs) if (!shown.has(song.title)) unreachable.push(`${item}: ${song.title}`);
    }
    expect(unreachable, 'a verified song no question can show').toEqual([]);
  });

  it('offers the same pair again for the same question', () => {
    // A question reported by its seed has to reproduce its whole verdict,
    // hint included, or the report describes something nobody can see again.
    for (const seed of [0, 1, 7, 12_345]) {
      expect(songHint('interval:P4:up', seed)).toBe(songHint('interval:P4:up', seed));
    }
  });

  it('offers a different pair on a different question, where the row has more than two', () => {
    const pairs = new Set([0, 1, 2].map((seed) => songHint('interval:P4:up', seed)));
    expect(pairs.size, 'every question offered the same two songs').toBe(3);
  });
});
