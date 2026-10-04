// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Calibration } from './Calibration';
import { settingsStore } from '../../state/settingsStore';
import { SETUP_MENU, entryFor } from '../menu';

/**
 * The calibration screen, which exists to make one distinction visible.
 *
 * ADR 0018: null is not zero. Most users will never calibrate, so "not
 * measured" is the normal state rather than an edge case, and a screen that
 * showed it as `0 ms` would be making a claim about their hardware that
 * nobody checked — and making it in the one place a user would go to find
 * out whether anybody had.
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<Calibration />));
  return {
    container,
    text: () => container.textContent ?? '',
    button: (label: string) => [...container.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === label),
    input: () => container.querySelector('input') as HTMLInputElement,
    unmount: () => { act(() => root.unmount()); container.remove(); },
  };
}

let screen: ReturnType<typeof mount>;

beforeEach(() => { settingsStore.getState().setInputLatency(null, 'manual'); });
afterEach(() => { screen?.unmount(); });

describe('what the screen says about an uncalibrated device', () => {
  it('says not measured, and never a number', () => {
    screen = mount();
    expect(screen.text()).toContain('Not measured');
    // The assertion that fails if anyone renders null as a zero.
    expect(screen.text()).not.toMatch(/\b0 ms\b/);
  });

  it('says plainly that nothing here is required', () => {
    // A musician who opens this, reads it and leaves has done nothing
    // wrong, and the screen has to be the thing that tells them so.
    screen = mount();
    expect(screen.text()).toContain('Nothing here is required');
  });

  it('offers no way to forget a setting that does not exist', () => {
    screen = mount();
    expect(screen.button('Forget it')).toBeUndefined();
  });
});

describe('setting it by hand', () => {
  /**
   * Type into a controlled input the way a person does.
   *
   * Assigning `.value` is not enough: React caches the last value it set on
   * the node and skips the change when it sees the same one back, so the
   * component never hears it and the test asserts against a field nobody
   * filled in. Going through the prototype's setter updates the node
   * without touching React's cache, which is what a real keystroke does.
   */
  function type(value: string) {
    const input = screen.input();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value',
    )?.set;
    act(() => {
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('stores the number and says where it came from', () => {
    screen = mount();
    type('65');
    act(() => screen.button('Use this')?.click());

    expect(settingsStore.getState().doc.audio).toMatchObject({
      inputLatencyMs: 65, source: 'manual',
    });
    expect(screen.text()).toContain('65 ms');
    expect(screen.text()).toContain('set by you');
  });

  /**
   * Zero typed by hand is a real answer and has to survive.
   *
   * It is the one value where the distinction this whole record is about
   * becomes a user-visible bug: a screen that treated 0 as "nothing
   * entered" would silently discard a deliberate setting.
   */
  it('accepts a typed zero, which is a setting and not an absence', () => {
    screen = mount();
    type('0');
    act(() => screen.button('Use this')?.click());

    expect(settingsStore.getState().doc.audio.inputLatencyMs).toBe(0);
    expect(settingsStore.getState().doc.audio.source).toBe('manual');
    expect(screen.text()).not.toContain('Not measured');
  });

  it('refuses a figure outside what a device can take, rather than storing it', () => {
    for (const bad of ['-20', '9000', 'nonsense']) {
      screen = mount();
      type(bad);
      act(() => screen.button('Use this')?.click());
      expect(settingsStore.getState().doc.audio.inputLatencyMs, bad).toBeNull();
      screen.unmount();
    }
    screen = mount();
  });

  it('will not submit an empty box', () => {
    screen = mount();
    expect(screen.button('Use this')?.disabled).toBe(true);
  });
});

describe('forgetting a setting', () => {
  it('goes back to not measured rather than to zero', () => {
    // The action a user needs after changing headphones, and the one most
    // likely to be implemented as a reset to 0.
    settingsStore.getState().setInputLatency(70, 'measured');
    screen = mount();
    expect(screen.text()).toContain('70 ms');

    act(() => screen.button('Forget it')?.click());
    expect(settingsStore.getState().doc.audio.inputLatencyMs).toBeNull();
    expect(screen.text()).toContain('Not measured');
  });
});

describe('the menu entry', () => {
  it('is listed under setup rather than among the exercises', () => {
    expect(SETUP_MENU.map((e) => e.route)).toContain('calibration');
    expect(entryFor('calibration').ready).toBe(true);
  });
});
