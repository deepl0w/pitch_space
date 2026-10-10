import { useEffect, useRef, useState } from 'react';
import { drawScore, type ScoreLayout, type ScoreSpec } from '../../exercises/render/toVexflow';

/**
 * VexFlow draws imperatively into a DOM node it owns, which is the opposite of
 * how React wants to work. Containing that in one effect keyed on the spec —
 * and letting the effect own the node's children entirely — keeps the two from
 * fighting: React never reconciles inside this div, and VexFlow never sees a
 * node React is about to replace.
 */
export function Score({ spec, height, onLayout, cursorX }: {
  spec: ScoreSpec;
  height?: number;
  /**
   * Where the engraver put each note, handed up after every draw — which
   * includes every resize, because the x positions change with the width.
   * A caller that stores these must take the newest and not the first.
   */
  onLayout?: (layout: ScoreLayout) => void;
  /**
   * Draw a playback cursor at this x, in the same pixels `onLayout`
   * reports. Null or absent draws none.
   *
   * Owned here rather than by the caller because the cursor's *height* is
   * the stave's, which only this component knows, and because the SVG is
   * redrawn at the measured width rather than scaled — so these pixels are
   * only interchangeable with CSS pixels inside this box.
   */
  cursorX?: number | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [stave, setStave] = useState<ScoreLayout['stave'] | null>(null);
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
    const bump = () => setScheme((n) => n + 1);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', bump);
    /*
      The device's preference is only one of the two ways the palette
      moves. The other is the reader choosing Light or Dark, which sets
      `data-theme` on the root and changes no media query at all — so the
      stave kept the ink it was drawn with and a reader who switched theme
      had black noteheads on a dark page until something else forced a
      redraw. Watching the attribute covers the choice the same way the
      query covers the default.
    */
    const root = new MutationObserver(bump);
    root.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => {
      media.removeEventListener('change', bump);
      root.disconnect();
    };
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
    const style = getComputedStyle(node);
    const token = (name: string) => style.getPropertyValue(name).trim();
    const colour = token('--score-ink') || undefined;
    /*
      A note's colour is resolved here rather than passed straight through.

      VexFlow writes it into a presentation attribute — `fill` on the note's
      group — and presentation attributes do not accept `var()`. So
      `fill="var(--right)"` is simply invalid, the mark keeps the default
      ink, and the result looks exactly like colouring that was never asked
      for. This is the same reason the ink itself is read here and handed in
      rather than set from the stylesheet: the note above makes that case
      for the staff lines and it holds for the noteheads too.
    */
    const resolved = {
      ...spec,
      notes: spec.notes.map((note) => {
        const match = /^var\(\s*(--[\w-]+)\s*\)$/.exec(note.colour ?? '');
        return match ? { ...note, colour: token(match[1]) || undefined } : note;
      }),
    };
    try {
      const layout = drawScore(node, resolved, { width, height, colour });
      onLayout?.(layout);
      // oxlint-disable-next-line react/set-state-in-effect
      setStave(layout.stave);
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
      setStave(null);
      // oxlint-disable-next-line react/set-state-in-effect
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [spec, width, height, scheme, onLayout]);

  return (
    <div className="score">
      <div ref={host} className="score-host">
        {/*
          Rendered as a sibling of what VexFlow owns rather than inside it.
          The effect calls `replaceChildren` on `.score-host`, so anything
          React puts in there is wiped on the next draw — and a resize
          redraws.
        */}
      </div>
      {cursorX != null && stave && (
        <div
          className="score-cursor"
          style={{
            left: `${cursorX}px`,
            top: `${stave.top - 8}px`,
            height: `${stave.bottom - stave.top + 16}px`,
          }}
        />
      )}
      {error && <p className="score-error">Could not engrave: {error}</p>}
    </div>
  );
}
