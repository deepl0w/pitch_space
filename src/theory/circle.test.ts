import { describe, expect, it } from 'vitest';
import {
  CIRCLE, RELATION_LABELS, type Relation,
  neighboursOf, positionFor, relationBetween,
} from './circle';
import { ALL_KEYS, keyId, keyName, relativeKey } from './key';
import { pitchClass } from './pitch';

/**
 * The circle, asked what the circle is.
 *
 * Four of this module's five exports had no test at all. That is worth
 * saying because the module is derived rather than written out — the
 * positions, the enharmonic pairs and the relations all fall out of
 * `accidentals % 12` — and derivation is exactly what makes a snapshot
 * test useless and a property test cheap. Every claim below is a fact
 * about the circle of fifths rather than about this implementation, so
 * none of them pins a decision anybody is free to change.
 *
 * The page built on it has a defect history: it printed one signature for
 * two spellings, which is the enharmonic case, and a wedge that could not
 * be reached by keyboard. Neither was visible from a unit test, and
 * neither is what these hold — what they hold is the arithmetic those
 * screens read off.
 */

const majorKeys = ALL_KEYS.filter((k) => k.mode === 'major');

describe('the wheel itself', () => {
  it('seats every key at exactly one position', () => {
    const seats = new Map<string, number[]>();
    for (const position of CIRCLE) {
      for (const key of [...position.major, ...position.minor]) {
        seats.set(keyId(key), [...(seats.get(keyId(key)) ?? []), position.index]);
      }
    }

    expect(CIRCLE, 'the circle is not twelve positions').toHaveLength(12);
    const twice = [...seats].filter(([, at]) => at.length > 1)
      .map(([id, at]) => `${id} at ${at.join(' and ')}`);
    expect(twice, 'a key seated in two places').toEqual([]);
    const unseated = ALL_KEYS.filter((k) => !seats.has(keyId(k))).map(keyName);
    expect(unseated, 'a key the wheel has nowhere to put').toEqual([]);
  });

  /**
   * The defining property, and the one the comment claims: a step
   * clockwise adds a sharp, which is the same thing as rising a fifth.
   * Asserted on pitch class rather than on spelling, because the step from
   * six sharps to seven is F♯ to C♯ and the step past it wraps.
   */
  it('rises a fifth at every step, all the way round', () => {
    for (let index = 0; index < 12; index += 1) {
      const here = CIRCLE[index].major[0];
      const next = CIRCLE[(index + 1) % 12].major[0];
      expect(here, `position ${index} seats no major key`).toBeDefined();
      const step = (pitchClass(next.tonic) - pitchClass(here.tonic) + 12) % 12;
      expect(step, `${keyName(here)} to ${keyName(next)} is not a fifth`).toBe(7);
    }
  });

  /**
   * Enharmonic twins share a seat, with the plainer spelling first.
   *
   * This is the arithmetic the page got wrong once by printing one
   * signature for two spellings: the keys *are* at one position and their
   * signatures are *not* the same, and only the first half is this
   * module's business.
   */
  it('seats an enharmonic pair together, plainer spelling first', () => {
    const shared = CIRCLE.filter((position) => position.major.length > 1);
    // The population: a circle with no enharmonic pair on it would satisfy
    // everything below by having nothing to order.
    expect(shared.length, 'no position seats two spellings').toBeGreaterThan(1);

    for (const position of shared) {
      const counts = position.major.map((k) => Math.abs(k.accidentals));
      expect([...counts].sort((a, b) => a - b), `position ${position.index} is out of order`)
        .toEqual(counts);
      const classes = new Set(position.major.map((k) => pitchClass(k.tonic)));
      expect(classes.size, `position ${position.index} seats two different sounds`).toBe(1);
    }
  });

  it('puts a key where positionFor says it is', () => {
    for (const key of ALL_KEYS) {
      const seat = positionFor(key);
      const seated = [...seat.major, ...seat.minor].map(keyId);
      expect(seated, `${keyName(key)} is not at the position it is given`).toContain(keyId(key));
    }
  });
});

describe('how one key stands to another', () => {
  /** Every ordered pair, which is what makes the symmetries checkable. */
  const pairs = ALL_KEYS.flatMap((a) => ALL_KEYS.map((b) => [a, b] as const));

  /**
   * The relations that are their own inverse, and the one that is not.
   *
   * Dominant and subdominant are the same step read from opposite ends,
   * so one implies the other and an implementation that computed them
   * independently could disagree. The rest are symmetric by what they
   * mean: a relative's relative is the key you started from.
   */
  it('names the inverse relation from the other end', () => {
    const seen: Record<string, number> = {};
    const broken: string[] = [];
    const inverse: Partial<Record<Relation, Relation>> = {
      dominant: 'subdominant',
      subdominant: 'dominant',
      relative: 'relative',
      parallel: 'parallel',
      enharmonic: 'enharmonic',
    };

    for (const [a, b] of pairs) {
      const forward = relationBetween(a, b);
      const wanted = inverse[forward];
      if (wanted === undefined) continue;
      seen[forward] = (seen[forward] ?? 0) + 1;
      const back = relationBetween(b, a);
      if (back !== wanted) {
        broken.push(`${keyName(a)} to ${keyName(b)} is ${forward}, back is ${back}`);
      }
    }

    // Every relation with an inverse actually occurs, or its row above is
    // a rule over nothing. The enharmonic one is the easiest to lose: it
    // needs a key whose spelling has a twin, which only six positions do.
    for (const relation of Object.keys(inverse)) {
      expect(seen[relation], `no pair is ${relation}, so its inverse is untested`)
        .toBeGreaterThan(0);
    }
    expect(broken).toEqual([]);
  });

  /**
   * The order is deliberate, because a key can answer to more than one
   * name at once — in C major, A minor is the relative *and* sits at the
   * same seat. The first match is what a musician would say.
   */
  it('prefers the name a musician would use when several fit', () => {
    for (const key of majorKeys) {
      expect(relationBetween(key, key), `${keyName(key)} against itself`).toBe('self');
      expect(relationBetween(key, relativeKey(key)), `${keyName(key)} to its relative minor`)
        .toBe('relative');
    }
  });

  it('agrees with the neighbours it hands out', () => {
    let listed = 0;
    for (const key of ALL_KEYS) {
      for (const neighbour of neighboursOf(key)) {
        listed += 1;
        expect(relationBetween(key, neighbour.key), `${keyName(key)} to ${keyName(neighbour.key)}`)
          .toBe(neighbour.relation);
        expect(neighbour.relation, 'a neighbour with no relation to point at').not.toBe('none');
        expect(keyId(neighbour.key), 'a key listed as its own neighbour').not.toBe(keyId(key));
      }
    }
    expect(listed, 'no neighbours anywhere, so the case above checks nothing')
      .toBeGreaterThan(ALL_KEYS.length);
  });

  /**
   * And every relation the wheel can report has words to report it in.
   * `none` is deliberately empty — it is the absence of a relation rather
   * than one with a name — so it is the one entry allowed to be blank.
   */
  it('has a label for every relation it can name', () => {
    const named = new Set<Relation>(['none']);
    for (const [a, b] of pairs) named.add(relationBetween(a, b));
    for (const relation of named) {
      expect(RELATION_LABELS, `no label for ${relation}`).toHaveProperty(relation);
      if (relation !== 'none') {
        expect(RELATION_LABELS[relation].length, `${relation} has an empty label`)
          .toBeGreaterThan(0);
      }
    }
    expect(named.size, 'the wheel reports fewer relations than it defines')
      .toBeGreaterThan(4);
  });
});
