import { describe, expect, it } from 'vitest';
import { makeRng } from '../theory/rng';
import { noteValue, timeSignature } from '../theory/meter';
import { ALL_KEYS, findKey } from '../theory/key';
import { midiOf } from '../theory/pitch';
import { baseOf } from './motif';
import { generateHarmony } from './harmony';
import { generateMelody } from './melody';
import { planMotifs } from './motif';
import { deriveStreams, generatePassage, slotsOf } from './passage';
import type { RhythmBar, RhythmEvent } from './rhythm';

/**
 * What joining the three layers owes, beyond what each owes alone.
 *
 * Harmony, motifs and melody each have their own suite and none of it is
 * repeated here. These are the claims that only exist once they are
 * composed — and they are worth having because the only place the three
 * had ever met before this file was a path built by hand inside another
 * test, which supplies what it meant and so never makes the seam speak.
 */

const TS = timeSignature('4/4');
const base = {
  key: findKey('C_major'),
  timeSignature: TS,
  bars: 4,
  range: [60, 81] as const,
};

describe('a generated passage', () => {
  it('puts a note on every written attack and nowhere else', () => {
    /*
      The join. A rest is a written event and not an attack; a note tied
      from the one before it is the same attack continuing. A line with
      a note for either would have more notes than the rhythm has
      sounds, and the error is invisible in each layer's own tests —
      the rhythm is right, the melody is right, and they disagree about
      how many notes there are.
    */
    let restsSeen = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const p = generatePassage(makeRng(seed), base);
      /*
        Derived here rather than from `slotsOf`, which is the function
        that *built* the melody — comparing the two compares a thing to
        itself. Caught by mutation: counting rests as attacks changed
        both sides together and the assertion never moved.
      */
      const attacks = p.bars
        .flatMap((bar) => bar.events)
        .filter((e) => !e.isRest && !e.tiedFromPrevious);

      expect(p.melody.length, `seed ${seed}`).toBe(attacks.length);
      for (const [i, note] of p.melody.entries()) {
        expect(note.startTick, `seed ${seed} note ${i}`).toBe(attacks[i].startTick);
      }
      restsSeen += p.bars.flatMap((bar) => bar.events).filter((e) => e.isRest).length;
    }
    /*
      Rests have to be there to be excluded, or the filter above is
      agreeing with the melody about music that never tested it. 36 of
      these 40 seeds write at least one; the one this replaces compared
      `attacks.length` with `attacks.length + rests + 1`, which is true
      whenever `rests` is not negative.
    */
    expect(restsSeen, 'no rest in forty passages, so nothing was excluded')
      .toBeGreaterThan(0);
  });

  it('leaves out a note tied from the one before it, which nothing generates', () => {
    /*
      **The other half of the join, and the generator cannot currently
      exercise it.** `tiedFromPrevious` is written `false` at the only place
      a `RhythmEvent` is constructed and is set true nowhere in the
      repository, so no passage at any seed contains a tie. Removing the
      clause from `slotsOf` leaves the whole suite green.

      That makes it the same situation as `Aiming`'s empty middle in ADR
      0032 — a branch with no members, which is a line the generator has
      not crossed rather than a thing that cannot happen, the field and
      `tiedToNext` being there for the rhythm writer that will. So the
      clause is held against a stand-in rather than left to be verified by
      music that does not exist, and the comment on `slotsOf` can go on
      describing it as the off-by-one this join exists to get right.

      Built by hand on purpose. A plan assembled here cannot drift with the
      generator, which is the point: what is under test is `slotsOf`'s rule,
      not today's rhythms.
    */
    const event = (startTick: number, over: Partial<RhythmEvent> = {}): RhythmEvent => ({
      startTick, durationTicks: 480, value: noteValue('q'), isRest: false,
      tiedFromPrevious: false, tiedToNext: false, ...over,
    });
    const bar: RhythmBar = {
      index: 0,
      startTick: 0,
      ticks: 1920,
      events: [
        event(0),
        event(480, { isRest: true }),
        event(960, { tiedToNext: true }),
        event(1440, { tiedFromPrevious: true }),
      ],
      cellIds: [],
    };
    const slots = slotsOf([bar]);

    // Two sounds in four written events: one plain note, and one held
    // across the tie. The rest is not a slot and neither is the
    // continuation.
    expect(slots.map((slot) => slot.startTick)).toEqual([0, 960]);
  });

  it('keeps a restatement recognisable after the melody is fitted to it', () => {
    /*
      The motif plan promises a repeated label is the same rhythm. The
      melody search runs afterwards and is free to relax a constraint,
      so nothing checked that the promise survived it.

      Asserted on the rhythm rather than the pitches: the shape is a
      preference the harmony may overrule (ADR 0033), so two statements
      of one idea need not share intervals — but they must share their
      attacks, or the idea is not restated at all.
    */
    let restatements = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const p = generatePassage(makeRng(seed), base);
      const byLabel = new Map<string, number[]>();
      for (const [i, label] of p.motifs.form.entries()) {
        const ticks = p.bars[i].events.map((e) => e.startTick - p.bars[i].startTick);
        const first = byLabel.get(baseOf(label));
        if (first) {
          expect(ticks, `seed ${seed} bar ${i} (${label})`).toEqual(first);
          restatements += 1;
        } else byLabel.set(baseOf(label), ticks);
      }
    }
    /*
      A form of four distinct labels would assert nothing here, and the
      loop cannot tell the difference between "every restatement held" and
      "there were none". Measured: these forty passages contain eighty
      restated bars, every form being A A' B A''.
    */
    expect(restatements, 'no bar restated any other, so nothing was compared')
      .toBeGreaterThan(0);
  });

  it('stays inside the range it was given', () => {
    // The one thing an exercise cares about most and no layer below owns:
    // a line that leaves the staff is unreadable whatever else it is.
    for (let seed = 0; seed < 30; seed += 1) {
      const p = generatePassage(makeRng(seed), { ...base, range: [64, 76] });
      for (const note of p.melody) {
        const midi = midiOf(note.pitch);
        expect(midi, `seed ${seed}`).toBeGreaterThanOrEqual(64);
        expect(midi).toBeLessThanOrEqual(76);
      }
    }
  });

  it('reproduces exactly from a seed, in every key', () => {
    // ADR 0005, asserted through the composition rather than through each
    // layer: three streams derived from one seed is new machinery, and
    // getting it wrong gives a passage that varies while every layer
    // below it is deterministic.
    for (const key of ALL_KEYS.slice(0, 8)) {
      const once = generatePassage(makeRng(7919), { ...base, key });
      const twice = generatePassage(makeRng(7919), { ...base, key });
      expect(JSON.stringify(once), key.mode).toEqual(JSON.stringify(twice));
    }
  });

  it('varies every layer with the seed, not just the one on top', () => {
    /*
      Each layer separately, which is the point. Checking only the melody
      passed with the motif stream seeded from a constant — the rhythm
      was identical in all twenty passages and the melody varied anyway,
      because harmony still did. A frozen layer under a varying one is
      invisible from the top.
    */
    const melodies = new Set<string>();
    const rhythms = new Set<string>();
    const harmonies = new Set<string>();
    for (let seed = 0; seed < 20; seed += 1) {
      const p = generatePassage(makeRng(seed), base);
      melodies.add(JSON.stringify(p.melody));
      rhythms.add(JSON.stringify(p.bars.map((b) => b.cellIds)));
      harmonies.add(JSON.stringify(p.harmony.events.map((e) => e.numeral)));
    }
    expect(melodies.size, 'the melody ignores the seed').toBe(20);
    expect(rhythms.size, 'the rhythm ignores the seed').toBeGreaterThan(10);
    expect(harmonies.size, 'the harmony ignores the seed').toBeGreaterThan(5);
  });

  it('derives its three streams before drawing anything else', () => {
    /*
      The one break the other determinism guards cannot see. They look
      for `Math.random`, for clock reads, and for a seed reproducing
      within a run — and all of them stay green if a draw is inserted
      into the parent stream above the derivations, which shifts all
      three derived seeds at once and silently replaces every passage
      the app has ever produced from every seed.

      So each layer is rebuilt here from the stream it is supposed to
      have been given, and compared against what the passage actually
      contains. That pins where in the parent stream the three draws
      happen and nothing else: every weight in every layer is free to
      move, because both sides move with it. Only the position of the
      derivations, or which stream reaches which layer, breaks this.

      The first version pinned the three seeds `deriveStreams` returns,
      and a draw inserted into `generatePassage` above the call
      survived it — the test was checking the helper and the hazard is
      in the caller. Worth remembering before trusting that shape
      again.
    */
    const streams = deriveStreams(makeRng(7));

    /*
      Half one: where in the parent stream the three draws sit, and
      which layer each belongs to. The rebuild below cannot see either
      — it asks for the streams by name, so it permutes and shifts
      along with any change inside `deriveStreams`. Permuting the three
      survived it in testing, which is why this half is here.
    */
    expect([streams.harmonyRng.seed, streams.motifRng.seed, streams.melodyRng.seed]).toEqual([
      25135766, 133054345, 2097893166,
    ]);

    /*
      Half two: that `generatePassage` hands those streams out without
      having spent any of the parent first. This is the half the seeds
      above cannot see, because they are read from the helper and the
      hazard is in the caller.
    */
    const passage = generatePassage(makeRng(7), base);

    const harmony = generateHarmony(streams.harmonyRng, {
      key: base.key,
      timeSignature: base.timeSignature,
      bars: base.bars,
    });
    const motifs = planMotifs(streams.motifRng, {
      timeSignature: base.timeSignature,
      bars: base.bars,
    });
    const melody = generateMelody(streams.melodyRng, {
      harmony,
      slots: slotsOf(motifs.bars),
      range: base.range,
      shape: motifs.shape,
    });

    expect(passage.harmony, 'harmony did not get the first stream').toEqual(harmony);
    expect(passage.bars, 'the motifs did not get the second stream').toEqual(motifs.bars);
    expect(passage.melody, 'the melody did not get the third stream').toEqual(melody);
  });

  it('hands each layer the options it was given for it', () => {
    /*
      `PassageOptions` says of `harmony` and `rhythm`: "Passed through;
      everything optional there stays optional here." Nothing checked it.
      Deleting `...options.harmony` from the call below leaves the whole
      suite green, and so does deleting `...options.rhythm` — no test in
      the repository passes either, so the only knobs an exercise has over
      the vocabulary and the rhythm could be ignored in silence.

      That is the shape of "turning diminished triads off did not turn them
      off", one layer up: the exercise asks, the join drops it, and every
      exercise built on this gets the defaults whatever its settings say.

      Asserted the way the stream guard above is — rebuilt directly from
      the same stream with the same options, so dropping the spread and
      mangling it both fail — and each half carries a control that the
      option changes the music at all, or the equality would be two
      functions agreeing to ignore the same thing.
    */
    const withOptions = {
      ...base,
      harmony: { sevenths: true },
      rhythm: { allowRests: false, syncopationsPerBar: 3 },
    };
    const streams = deriveStreams(makeRng(11));
    const passage = generatePassage(makeRng(11), withOptions);

    expect(passage.harmony, 'the harmony options were not passed through').toEqual(
      generateHarmony(streams.harmonyRng, {
        sevenths: true,
        key: base.key,
        timeSignature: base.timeSignature,
        bars: base.bars,
      }),
    );
    expect(passage.bars, 'the rhythm options were not passed through').toEqual(
      planMotifs(streams.motifRng, {
        allowRests: false,
        syncopationsPerBar: 3,
        timeSignature: base.timeSignature,
        bars: base.bars,
      }).bars,
    );

    // The controls. Each option has to make a difference on this seed, or
    // the equalities above are satisfied by both sides ignoring it.
    const plain = generatePassage(makeRng(11), base);
    expect(plain.harmony, 'sevenths changed nothing, so the first half proves nothing')
      .not.toEqual(passage.harmony);
    expect(plain.bars, 'the rhythm options changed nothing, so the second half proves nothing')
      .not.toEqual(passage.bars);
  });

  it('fills every bar, so the notation can be engraved at all', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const p = generatePassage(makeRng(seed), base);
      expect(p.bars).toHaveLength(4);
      for (const bar of p.bars) {
        const sum = bar.events.reduce((n, e) => n + e.durationTicks, 0);
        expect(sum, `seed ${seed} bar ${bar.index}`).toBe(TS.barTicks);
      }
    }
  });
});
