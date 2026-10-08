// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { Settings } from './Settings';

function render(node: React.ReactElement): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => { createRoot(host).render(node); });
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
