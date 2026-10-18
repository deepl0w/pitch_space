import { useEffect, type ReactElement } from 'react';
import { Overlay } from './Overlay';
import { Intervals } from '../screens/Intervals';
import { Scales } from '../screens/Scales';
import { Chords } from '../screens/Chords';
import { KeyChords } from '../screens/KeyChords';
import { CircleOfFifths } from '../screens/CircleOfFifths';
import { Rhythms } from '../screens/Rhythms';
import { entryFor } from '../menu';
import { stopSound } from '../sound';
import type { ReferenceRoute, ReferenceTarget } from '../reference';

const PAGES: Record<ReferenceRoute, (props: { focus?: string; tonic?: string }) => ReactElement> = {
  intervals: Intervals,
  scales: Scales,
  chords: Chords,
  'key-chords': KeyChords,
  circle: CircleOfFifths,
  rhythms: Rhythms,
};

/**
 * A reference page over the practice screen, opened on the thing just asked.
 *
 * A layer and not a route, which is the whole of the design: the round and
 * the session tally are state inside the practice screen, so navigating to
 * the reference and back gave a new question and a count reset to zero —
 * a learner who looked up the interval they had just missed lost the
 * question they wanted to understand. Over the top, the answer is still
 * there when the layer closes.
 */
export function ReferenceOverlay({ target, onClose }: {
  target: ReferenceTarget;
  onClose(): void;
}) {
  const Page = PAGES[target.route];
  // What the page played stops with it, as it does when a route is left;
  // a scale running on under the question it was opened from would be
  // heard as part of the question.
  useEffect(() => () => stopSound(), []);
  return (
    <Overlay label={entryFor(target.route).name} onClose={onClose}>
      <Page focus={target.focus} tonic={target.tonic} />
    </Overlay>
  );
}
