import { useEffect, useState } from 'react';

/**
 * Seconds left of a take, so a control that is waiting looks like it.
 *
 * **A disabled button reading "Listening…" is indistinguishable from a
 * broken one**, and the longer the take the more it looks broken. The scale
 * exercise listens for eight seconds; a reviewer watching it at five
 * concluded the control was stuck and nearly reported it, which is the most
 * expensive form of a missing progress indication — not that the learner
 * waits, but that they stop believing the app is working and go looking for
 * a fault that is not there.
 *
 * Counting *down* rather than up, because the two say different things. Up
 * says how long you have been waiting; down says how much longer, which is
 * the question being asked and the one that makes the end predictable.
 *
 * Driven by its own timer rather than by the take, since `AudioIn.listen`
 * resolves once and says nothing on the way. The two can disagree by a
 * fraction of a second at the end, which costs nothing: this is a reassurance
 * that something is happening, not a measurement of anything.
 */
export function useCountdown(running: boolean, seconds: number): number {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (!running) {
      setLeft(seconds);
      return undefined;
    }
    setLeft(seconds);
    const tick = setInterval(() => {
      // Never below zero: a take that runs a little past its own length —
      // the analysis happens after the last frame — would otherwise count
      // into negatives while the learner watches.
      setLeft((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => { clearInterval(tick); };
  }, [running, seconds]);

  return left;
}
