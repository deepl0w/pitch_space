import type { ItemId, Presentation } from '../exercises/types';

/**
 * A progression line: the thing progress belongs to.
 *
 * Not the exercise and not the item. The user's rule is that practising
 * minor 2nds and major 2nds is one line of progress and adding minor 3rds
 * is a different one — because a correct answer out of two choices is not
 * evidence about the same question out of three. ADR 0039 makes that
 * precise: a setting is part of a line's identity **if and only if it
 * changes `items(settings)`**, so the identity is the askable set rather
 * than the settings that produced it.
 *
 * That is why `askable` is here and `settings` is not. Settings outlive
 * the release that wrote them and get migrated; the set is the answer
 * space, which is the thing the user's argument was actually about. An
 * export reconstructs a line from the exercise and the set without
 * reading a settings blob at all.
 */
export interface ProgressLine {
  /** Which exercise. Two exercises may legitimately share an item id. */
  readonly exercise: string;
  /**
   * Everything these settings can ask, as `items(settings)` returned it.
   *
   * Taken as given rather than sorted on the way in: {@link lineKey} is
   * what imposes an order, so a caller cannot change a line's identity by
   * handing the same set in a different order.
   */
  readonly askable: readonly ItemId[];
  /** Reading a third and hearing one are two skills (ADR 0010). */
  readonly presentation: Presentation;
}

/** Separates the three parts; not legal inside an item id or a presentation. */
const PART = '|';
/** Separates items within the set, for the same reason. */
const ITEM = ',';

/**
 * A line's stored identity, stable across releases.
 *
 * A sorted join rather than a hash, because the sets are small — four to
 * fourteen items per exercise at defaults — and a key you can read is
 * worth more here than a short one. A hash would make a corrupted history
 * unreadable by a person, and this is the key an export is organised by.
 *
 * **Sorting is what makes it canonical**, and it happens here rather than
 * at construction so that no caller can produce two keys for one line by
 * passing its items in a different order. The sort is by code unit, which
 * is arbitrary and fixed — it needs to be the same next release, not
 * meaningful.
 */
export function lineKey(line: ProgressLine): string {
  const items = [...line.askable].sort();
  return `${line.exercise}${PART}${line.presentation}${PART}${items.join(ITEM)}`;
}

/**
 * Whether two lines are the same line.
 *
 * Through {@link lineKey} rather than by comparing fields, so there is one
 * definition of sameness and it is the one storage uses. A separate
 * structural comparison is how two notions of identity drift apart.
 */
export function sameLine(a: ProgressLine, b: ProgressLine): boolean {
  return lineKey(a) === lineKey(b);
}

/**
 * The line a round belongs to, for a screen that has the round but no
 * attempt yet.
 *
 * The readout beside a question asks what the learner's history is for the
 * pool they are practising, and it has to ask under the same line the
 * attempt will be filed under — otherwise it looks up a key the fold never
 * wrote and reads "not recorded yet" for ever.
 *
 * Here rather than inline at the call site because there were two
 * definitions of one line: `lineOf(attempt)` composes exercise, askable
 * and presentation from a record, and the screen composed the same three
 * from a round. Two spellings of one identity is how the readout and the
 * history drift apart without either being wrong on its own.
 */
export function lineOfRound(
  exercise: string,
  round: { readonly askable: readonly ItemId[]; readonly exercise: { readonly presentation: Presentation } },
): ProgressLine {
  return { exercise, askable: round.askable, presentation: round.exercise.presentation };
}
