import { useEffect, useRef, useState } from 'react';
import { drawScore, type ScoreSpec } from '../../exercises/render/toVexflow';

/**
 * VexFlow draws imperatively into a DOM node it owns, which is the opposite of
 * how React wants to work. Containing that in one effect keyed on the spec —
 * and letting the effect own the node's children entirely — keeps the two from
 * fighting: React never reconciles inside this div, and VexFlow never sees a
 * node React is about to replace.
 */
export function Score({ spec, height }: { spec: ScoreSpec; height?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [scheme, setScheme] = useState(0);

  // The ink colour is read from the stylesheet and handed to VexFlow, rather
  // than applied to its output afterwards. Recolouring the SVG from outside
  // does not work: a staff line is a stroked path carrying no `stroke`
  // attribute, so an attribute selector misses it and it stays black, while a
  // `fill` rule wide enough to catch the glyphs overrides the `fill="none"`
  // those same paths depend on.
  //
  // Reading it at draw time means a theme change has to force a redraw, which
  // is what `scheme` counts.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const bump = () => setScheme((n) => n + 1);
    media.addEventListener('change', bump);
    return () => media.removeEventListener('change', bump);
  }, []);

  // Notation does not reflow like text, so it is redrawn at the measured width
  // rather than scaled. A ResizeObserver is the only thing that reports the
  // width a flex child actually got.
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(320, Math.floor(entry.contentRect.width)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = host.current;
    if (!node || width === 0) return;
    const colour = getComputedStyle(node).getPropertyValue('--score-ink').trim() || undefined;
    try {
      drawScore(node, spec, { width, height, colour });
      // The rule says an effect should synchronize React with an external
      // system, which is exactly what this is: VexFlow is the external system,
      // and whether it could engrave the spec is only knowable by asking it.
      // React bails out when the value is unchanged, so the common path costs
      // no extra render.
      // oxlint-disable-next-line react/set-state-in-effect
      setError(null);
    } catch (cause) {
      // A spec the engraver cannot lay out is a bug worth seeing on the page
      // rather than only in the console, since this view is how the generator
      // gets looked at.
      node.replaceChildren();
      // Same exception as the success path above.
      // oxlint-disable-next-line react/set-state-in-effect
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [spec, width, height, scheme]);

  return (
    <div className="score">
      <div ref={host} className="score-host" />
      {error && <p className="score-error">Could not engrave: {error}</p>}
    </div>
  );
}
