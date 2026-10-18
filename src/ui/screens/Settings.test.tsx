// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { Settings } from './Settings';

/**
 * Every root this file mounts, so none of them outlives it.
 *
 * A root that is never unmounted keeps React's scheduled work alive past the
 * last test, and vitest then tears the jsdom environment down underneath it —
 * which has already shown up here as `window is not defined`, once, and not
 * again in six runs. An intermittent failure with no stable name is expensive
 * out of all proportion to the fix, and the fix is to unmount what we mount.
 */
const mounted: Root[] = [];

afterEach(() => {
  act(() => { for (const root of mounted.splice(0)) root.unmount(); });
  document.body.replaceChildren();
});

function render(node: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => { root.render(node); });
  return host;
}

describe('the settings screen', () => {
  /**
   * The rule this screen broke — a caption over several controls is a
   * group, not a label — is now asked of every screen in `src/ui`, in
   * `../labelling.test.tsx`, because the mistake was a call site and
   * there are other call sites. Left here is only what is particular to
   * this screen: that the two fields which carried the defect are the
   * groups they should be, and that there was a screen to be wrong.
   */
  it('captions Theme and Instrument as groups, not as labels', () => {
    const host = render(<Settings go={() => {}} />);
    expect(host.querySelectorAll('.field').length).toBeGreaterThan(3);
    const captions = [...host.querySelectorAll('.field[role="group"] > span')]
      .map((s) => s.textContent);
    expect(captions).toContain('Theme');
    expect(captions).toContain('Instrument');
  });
});
