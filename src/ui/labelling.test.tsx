// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Calibration } from './screens/Calibration';
import { Chords } from './screens/Chords';
import { CircleOfFifths } from './screens/CircleOfFifths';
import { Home } from './screens/Home';
import { KeyChords } from './screens/KeyChords';
import { PracticeScreen } from './screens/PracticeScreen';
import { Rhythms } from './screens/Rhythms';
import { Scales } from './screens/Scales';
import { Settings } from './screens/Settings';
import { SettingsPanel } from './components/SettingsPanel';
import { ExerciseBoundary } from './components/ExerciseBoundary';
import { EXERCISE_TYPES } from '../exercises/registry';
import type { AudioOut } from '../exercises/types';

/**
 * One rule about captions, asked of every screen rather than of a component.
 *
 * `Field` grew a `group` prop so that a caption over a row of chips stops
 * being a remote control for the first chip, and `controls.test.tsx` pins
 * it. That was not enough: the component was right the whole time, and two
 * call sites in `Settings.tsx` never passed the flag, so Theme and
 * Instrument shipped as a `<label>` wrapped round six buttons each —
 * pressing any chip also activated the first, and clicking the word
 * "Instrument" selected Piano with nothing on screen to say the word did
 * anything. Found by a reader, not by the suite.
 *
 * A test on the component asks whether it *can* be used correctly. This
 * asks whether the app *does*, which is the only version that notices a
 * call site added next month and the only version that could have seen a
 * distribution of eleven right and two wrong.
 *
 * Scoped to labels that wrap their control. A `<label for=...>` sitting
 * beside one names exactly what it points at and cannot acquire a second
 * control by nesting, so it is not reachable by this mistake.
 */

declare global {
  // oxlint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The labelable elements that *do something* when activated.
 *
 * `<output>`, `<meter>` and `<progress>` are labelable too and are left
 * out, because activation reaching them has no effect. Including them
 * flags the volume slider, which pairs an `<input type="range">` with an
 * `<output>` showing its value: two labelable elements, one control, no
 * defect. A rule that fires where there is nothing wrong gets switched
 * off rather than obeyed, so it is narrowed here instead.
 */
const INTERACTIVE = 'button, input, select, textarea';

/** Silent, so a practice round can start without an AudioContext. */
const silent: AudioOut = { play: () => {} };

/**
 * Every screen this rule is asked of, by the file it lives in.
 *
 * Keyed by path because the guard below reads the same paths off disk: a
 * screen added to `src/ui` and not added here fails rather than quietly
 * going unchecked, which is the same gap — a call site nobody asked
 * about — that this file exists for.
 */
const SCREENS: Record<string, () => ReactElement> = {
  'components/ExerciseBoundary.tsx': () => (
    <ExerciseBoundary><p>nothing is wrong</p></ExerciseBoundary>
  ),
  'screens/Calibration.tsx': () => <Calibration />,
  'screens/Chords.tsx': () => <Chords />,
  'screens/CircleOfFifths.tsx': () => <CircleOfFifths />,
  'screens/Home.tsx': () => <Home go={() => {}} />,
  'screens/KeyChords.tsx': () => <KeyChords />,
  'screens/Rhythms.tsx': () => <Rhythms />,
  'screens/Scales.tsx': () => <Scales />,
  'screens/Settings.tsx': () => <Settings go={() => {}} />,
};

/**
 * The two that are swept over a population instead of rendered once.
 *
 * `SettingsPanel` is generic over a field list, so rendering it with one
 * invented list would check the panel and not the app; the field lists
 * the app actually passes it are the registered exercises', and there is
 * no reason to pick between them. `PracticeScreen` takes the exercise as
 * a prop for the same reason. Both are derived from the registry rather
 * than listed, so a seventh exercise type is covered without this file
 * being touched.
 */
const SWEPT: Record<string, () => ReactElement[]> = {
  'components/SettingsPanel.tsx': () => EXERCISE_TYPES.map((definition) => (
    <SettingsPanel
      key={definition.id}
      fields={definition.settings.fields}
      settings={definition.settings.defaults}
      onChange={() => {}}
    />
  )),
  'screens/PracticeScreen.tsx': () => EXERCISE_TYPES.map((definition) => (
    <PracticeScreen key={definition.id} exerciseId={definition.id} audio={silent} />
  )),
};

/**
 * What is deliberately not rendered here, and why.
 *
 * Written as a map rather than a list so the reason has somewhere to
 * live: an exemption with no reason beside it is how a population stops
 * being the population and nobody notices.
 */
const NOT_A_SCREEN: Record<string, string> = {
  'controls.tsx': 'The primitives the rule is about. `Field` is pinned at the '
    + 'component by controls.test.tsx; what this file adds is the call sites.',
  'notation/Score.tsx': 'Draws a stave. It has no caption and no control, and '
    + 'mounting it would need a spec invented here for nothing to be asked of.',
};

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

function render(node: ReactElement): HTMLElement {
  root ??= createRoot(container);
  act(() => root!.render(node));
  return container;
}

/** The captions that are a control for one of the things they caption. */
function remoteControls(host: HTMLElement): { caption: string; controls: number }[] {
  return [...host.querySelectorAll('label')]
    .map((label) => ({
      caption: label.querySelector('span')?.textContent
        ?? label.textContent?.trim().slice(0, 40)
        ?? '(unnamed)',
      controls: label.querySelectorAll(INTERACTIVE).length,
    }))
    .filter((found) => found.controls > 1);
}

describe('a caption over several controls', () => {
  for (const [file, screen] of Object.entries(SCREENS)) {
    it(`is a group, not a label, in ${file}`, () => {
      expect(remoteControls(render(screen()))).toEqual([]);
    });
  }

  for (const [file, screens] of Object.entries(SWEPT)) {
    it(`is a group, not a label, in ${file} for every exercise`, () => {
      const nodes = screens();
      // The sweep's own population, so an empty registry cannot pass this
      // by having nothing to render.
      expect(nodes.length).toBe(EXERCISE_TYPES.length);
      expect(EXERCISE_TYPES.length).toBeGreaterThan(1);
      for (const node of nodes) expect(remoteControls(render(node))).toEqual([]);
    });
  }

  /**
   * The cases above check the screens they name. This checks that they
   * name the screens — a sweep whose population is hand-written answers
   * a question about its own list unless something independent of that
   * list decides what belongs in it. The filesystem is that something.
   */
  it('is asked of every screen in src/ui, or excused by name', () => {
    /*
      `fileURLToPath`, not `new URL('.', import.meta.url).pathname`, which
      is the idiom the node-environment suites use. Under jsdom the global
      `URL` is the DOM's and resolves against the document base, so that
      expression yields `/src/ui` — an absolute path that does not exist,
      from a line that reads as though it cannot be wrong.
    */
    const here = dirname(fileURLToPath(import.meta.url));
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
          found.push(relative(here, path));
        }
      }
    };
    walk(here);

    const covered = new Set([
      ...Object.keys(SCREENS), ...Object.keys(SWEPT), ...Object.keys(NOT_A_SCREEN),
    ]);
    expect(found.filter((file) => !covered.has(file))).toEqual([]);
    // And nothing listed here that the directory no longer has, which is how
    // a rename leaves a screen unchecked with every case still green.
    expect([...covered].filter((file) => !found.includes(file))).toEqual([]);
  });

  /**
   * Every case above is satisfied by a screen that rendered nothing, and a
   * screen that fails to mount is exactly what would make it pass quietly.
   * One assertion that there was something there to be wrong about.
   */
  it('is asked of screens that actually drew their controls', () => {
    for (const [file, screen] of Object.entries(SCREENS)) {
      const host = render(screen());
      if (file === 'components/ExerciseBoundary.tsx') continue; // Draws its child.
      expect(host.querySelectorAll(INTERACTIVE).length, `${file} drew no controls`)
        .toBeGreaterThan(0);
    }
  });
});
