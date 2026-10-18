import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Open layers, innermost last, so Escape closes only the one on top.
 *
 * Two can be open at once now — the reference over a practice round, and
 * settings over that through the cog — and each used to listen for Escape on
 * the window, so one key press closed both and dropped the learner back past
 * the thing they were reading.
 */
const layers: object[] = [];

/**
 * A layer over whatever is on screen, rather than a page in place of it.
 *
 * So the exercise underneath keeps its round and its audio: settings and the
 * reference both open this way, because a route change unmounts the practice
 * screen and with it the question being asked. Escape and the backdrop both
 * close it, because a thing that covers your work should be dismissible
 * without aiming at a button.
 */
export function Overlay({ label, onClose, children }: {
  label: string;
  onClose(): void;
  children: ReactNode;
}) {
  const done = useRef<HTMLButtonElement>(null);
  // Read through a ref so the effects below run once: a fresh `onClose` on
  // every render would otherwise re-register this layer and move it to the
  // top of the stack whenever its parent re-rendered.
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);

  useEffect(() => {
    const token = {};
    layers.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && layers.at(-1) === token) close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      layers.splice(layers.indexOf(token), 1);
    };
  }, []);

  /*
    Focus moves into the layer and comes back where it was.

    Without this a keyboard user opened the layer and stayed on the control
    underneath it, tabbing through a page they could no longer see; and on
    closing, focus fell to the document, so the next Tab started from the
    top of the page instead of from the button they had pressed.
  */
  useEffect(() => {
    const before = document.activeElement;
    done.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);

  /*
    Hold the page still underneath.

    `.overlay` is fixed and scrolls its own content, which is enough
    until the content fits — then a wheel over the backdrop has nothing
    to scroll, falls through to the document, and moves the page behind
    the panel. Worst on a phone, where the backdrop is the 16px either
    side of a full-width panel and is most of what a thumb lands on.

    The padding is not cosmetic. Removing the scrollbar by hiding
    overflow widens the content box by its width, so every centred thing
    on the page jumps sideways as the layer opens and back as it closes —
    replacing a scroll nobody wanted with a lurch nobody wanted. The gap
    is measured rather than assumed because it is zero on overlay
    scrollbars, which is most phones and some desktops. A layer opened
    over another saves and restores the first one's lock, so they unwind
    in order.
  */
  useEffect(() => {
    const root = document.documentElement;
    const gap = window.innerWidth - root.clientWidth;
    const scroll = root.style.overflow;
    const pad = root.style.paddingRight;
    root.style.overflow = 'hidden';
    if (gap > 0) root.style.paddingRight = `${gap}px`;
    return () => { root.style.overflow = scroll; root.style.paddingRight = pad; };
  }, []);

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      /* The backdrop only, not a click that bubbled out of the panel. */
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="overlay-panel">
        <button type="button" className="overlay-close" ref={done} onClick={onClose}>Done</button>
        {children}
      </div>
    </div>
  );
}
