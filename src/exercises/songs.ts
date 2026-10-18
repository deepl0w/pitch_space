/**
 * Songs that contain an interval, for a learner who just missed it.
 *
 * Asked for as "a list of songs and artists for different intervals",
 * shipped with the app and with no links. A wrong answer used to say
 * *"Think Greensleeves"* — one title, no artist, and for a descending
 * interval nothing at all, because the only table there was rose throughout.
 *
 * **Not `theory/`.** A song reference is pedagogy rather than a fact about
 * music: which tune a learner already knows is a guess about the learner,
 * where a minor third is a minor third. It is also the half of this that
 * will grow — to chords and progressions — and `theory/` is the layer that
 * should not.
 *
 * **Keyed on item ids**, the same strings an exercise already reports about
 * itself (`interval:m3:up`). A second key for the same things would be a
 * near-duplicate free to drift, and keying on ids makes "every entry is
 * something an exercise can ask" a one-line check rather than a hope.
 *
 * **Every entry was checked against a published list, not recalled.** The
 * cost of a wrong one is the exact defect this replaces: a reference that
 * puts the wrong contour in the ear is worse than none, because the learner
 * trusts it. One source consulted while building this called A to G natural
 * a major seventh — it is a minor seventh, ten semitones — which is the
 * reason for the rule. The reference used is Wikipedia's interval
 * recognition table; a cell with fewer songs is a cell where fewer could be
 * stood behind, not an oversight.
 */

/** One song, findable: a title alone often is not. */
export interface SongReference {
  readonly title: string;
  /** Composer or the best-known performer — whichever a search will find. */
  readonly by: string;
  /**
   * Where the interval is, when it is not the first two notes.
   *
   * A reference that only works at one moment is no help without the
   * moment: *The Entertainer* has the minor sixth, but after a run of
   * semitones a learner would otherwise start counting from.
   */
  readonly at?: string;
}

const TRADITIONAL = 'traditional';

/**
 * The table, by item id. Up and down are separate keys because they are
 * separate sounds — the whole of the defect this replaces was treating them
 * as one. A harmonic interval has no contour to contradict, so it reads the
 * ascending row; see `songsFor`.
 */
export const SONGS: Readonly<Record<string, readonly SongReference[]>> = {
  'interval:unison': [
    { title: 'Jingle Bells', by: TRADITIONAL, at: 'the repeated "jingle bells"' },
  ],

  'interval:m2:up': [
    { title: 'the Jaws theme', by: 'John Williams' },
    { title: 'the Pink Panther theme', by: 'Henry Mancini' },
  ],
  'interval:m2:down': [
    { title: 'Für Elise', by: 'Ludwig van Beethoven' },
    { title: 'Joy to the World', by: TRADITIONAL },
  ],

  'interval:M2:up': [
    { title: 'Happy Birthday to You', by: TRADITIONAL, at: '"happy" to "birth-"' },
    { title: 'Frère Jacques', by: TRADITIONAL },
  ],
  'interval:M2:down': [
    { title: 'Mary Had a Little Lamb', by: TRADITIONAL },
    { title: 'Three Blind Mice', by: TRADITIONAL },
  ],

  'interval:m3:up': [
    { title: 'Greensleeves', by: TRADITIONAL },
    { title: 'Smoke on the Water', by: 'Deep Purple', at: 'the riff\'s first two notes' },
  ],
  'interval:m3:down': [
    { title: 'Hey Jude', by: 'The Beatles' },
    { title: 'Frosty the Snowman', by: TRADITIONAL },
  ],

  'interval:M3:up': [
    { title: 'When the Saints Go Marching In', by: TRADITIONAL },
    { title: 'Kumbaya', by: TRADITIONAL },
  ],
  'interval:M3:down': [
    { title: 'Swing Low, Sweet Chariot', by: TRADITIONAL },
    { title: 'the Fifth Symphony', by: 'Ludwig van Beethoven', at: 'the opening four notes' },
    { title: 'Summertime', by: 'George Gershwin' },
  ],

  'interval:P4:up': [
    { title: 'Here Comes the Bride', by: 'Richard Wagner' },
    { title: 'Amazing Grace', by: TRADITIONAL },
    { title: 'Auld Lang Syne', by: TRADITIONAL },
  ],
  'interval:P4:down': [
    { title: 'Eine kleine Nachtmusik', by: 'Wolfgang Amadeus Mozart' },
    { title: 'O Come, All Ye Faithful', by: TRADITIONAL, at: '"come" to "all"' },
  ],

  'interval:tritone:up': [
    { title: 'Maria, from West Side Story', by: 'Leonard Bernstein' },
    // Not *The Simpsons*, though it is the commonest citation. Its score
    // opens on a held chord and then C–E — a major third — with the
    // tritone spread over three notes. Told "the first two notes", a
    // learner hears the wrong interval.

  ],
  'interval:tritone:down': [
    { title: 'YYZ', by: 'Rush' },
    { title: 'Black Sabbath', by: 'Black Sabbath', at: 'the opening riff' },
  ],

  'interval:P5:up': [
    { title: 'Twinkle, Twinkle, Little Star', by: TRADITIONAL, at: 'the first "twinkle" to the second' },
    { title: 'the Star Wars main title', by: 'John Williams' },
  ],
  'interval:P5:down': [
    { title: 'the Flintstones theme', by: 'Hoyt Curtin' },
    { title: 'the Back to the Future theme', by: 'Alan Silvestri' },
  ],

  'interval:m6:up': [
    { title: 'In My Life', by: 'The Beatles' },
    { title: 'The Entertainer', by: 'Scott Joplin', at: 'the big leap after the opening run' },
  ],
  'interval:m6:down': [
    { title: 'the Love Story theme', by: 'Francis Lai' },
    { title: 'Call Me Maybe', by: 'Carly Rae Jepsen', at: 'the first two notes of the chorus' },
  ],

  'interval:M6:up': [
    { title: 'My Bonnie Lies over the Ocean', by: TRADITIONAL },
    { title: 'the NBC chimes', by: 'NBC' },
  ],
  'interval:M6:down': [
    { title: 'Nobody Knows the Trouble I\'ve Seen', by: TRADITIONAL },
    { title: 'Over There', by: 'George M. Cohan' },
    { title: 'Sweet Caroline', by: 'Neil Diamond' },
  ],

  'interval:m7:up': [
    { title: 'Somewhere, from West Side Story', by: 'Leonard Bernstein' },
    { title: 'the original Star Trek theme', by: 'Alexander Courage' },
  ],
  'interval:m7:down': [
    { title: 'Watermelon Man', by: 'Herbie Hancock' },
    { title: 'An American in Paris', by: 'George Gershwin' },
  ],

  'interval:M7:up': [
    { title: 'Take On Me', by: 'a-ha', at: 'the first two notes of the chorus' },
    { title: 'the Superman theme', by: 'John Williams' },
  ],
  'interval:M7:down': [
    { title: 'I Love You', by: 'Cole Porter' },
  ],

  'interval:P8:up': [
    { title: 'Over the Rainbow', by: 'Harold Arlen', at: '"some-where"' },
    { title: 'When You Wish Upon a Star', by: 'Leigh Harline' },
  ],
  'interval:P8:down': [
    { title: 'Willow Weep for Me', by: 'Ann Ronell' },
  ],
};

/**
 * The songs for an item, or none.
 *
 * A harmonic interval reads its ascending row: both notes sound at once, so
 * there is no contour for a rising tune to contradict, and the tune is still
 * the quickest way to hear the distance. Everything else is looked up as
 * given — a descending item never borrows the ascending row, which is the
 * mistake this table exists to stop making.
 */
export function songsFor(item: string): readonly SongReference[] {
  const direct = SONGS[item];
  if (direct !== undefined) return direct;
  const harmonic = /^(interval:[^:]+):harmonic$/.exec(item);
  return harmonic === null ? [] : SONGS[`${harmonic[1]}:up`] ?? [];
}

/**
 * The hint a wrong answer carries: two songs, as a sentence.
 *
 * "Think of", not the old "Think": with titles that take an article — *the
 * Jaws theme*, *the Fifth Symphony* — "Think the Jaws theme" is not English.
 * Titles carry no brackets of their own for the same reason a moment goes
 * inside them: one pair of brackets per song, holding everything about it.
 *
 * Two rather than one because a single reference that happens not to be a
 * song the learner knows is no help at all; two rather than all because a
 * verdict line that lists four songs stops being read. Empty when there is
 * nothing — a silence is honest, a forced reference is not.
 *
 * **Which two turns with the question.** It took the first two, which left
 * every third song in a row unreachable — *Summertime*, *Auld Lang Syne* and
 * *Sweet Caroline* were verified and could never be shown, found by checking
 * why a song a reviewer looked for never appeared. A row's later songs are a
 * learner's later chances to know one, so the window starts at the seed:
 * different questions offer different pairs, and the same question — reported
 * by its seed — offers the same pair again.
 *
 * **The seed is required, and it had a default for one commit.** `seed = 0`
 * meant a caller that left it out got the first two songs for ever — the
 * exact defect the rotation removed, and invisible, because the hint it
 * produced was still correct, well-formed and verified. Only the dead
 * entries came back, which is the thing nobody notices. The next caller is
 * the most likely to forget it: this table is meant to grow to chords and
 * progressions. Required, the compiler refuses the omission where it is
 * written, in a worktree that never runs the suite as readily as one that
 * does — which a test grepping for one-argument calls could only approximate.
 * Raised by tester.
 */
export function songHint(item: string, seed: number): string {
  const songs = songsFor(item);
  const start = songs.length === 0 ? 0 : Math.abs(Math.trunc(seed)) % songs.length;
  const turned = [...songs.slice(start), ...songs.slice(0, start)];
  const named = turned.slice(0, 2).map(describe);
  if (named.length === 0) return '';
  return `Think of ${named.join(' or ')}`;
}

/**
 * One song as a phrase, with everything about it inside its own brackets.
 *
 * The moment went after the brackets at first — `Over the Rainbow (Harold
 * Arlen), at "some-where" or When You Wish…` — which left it unclear whether
 * "at some-where" belonged to the first song or to the sentence. Inside the
 * brackets it can only belong to the song it follows.
 */
function describe(song: SongReference): string {
  const parts = [
    ...(song.by === TRADITIONAL ? [] : [song.by]),
    ...(song.at === undefined ? [] : [`at ${song.at}`]),
  ];
  return parts.length === 0 ? song.title : `${song.title} (${parts.join(', ')})`;
}
