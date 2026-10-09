# Running the app, and looking at it honestly

Two findings were published from this repository on 4 October and withdrawn
the same day — one said the notation was broken and one said the touch
targets were too small — and both were wrong for the same reason: the tool
used to look at the app reported something the app does not do. The cost of
each was a commit to publish the claim, a session to chase it, and a commit
to take it back. This file exists so the third one does not happen.

The rule underneath it is the one the ADR index already states for claims
about code, and it holds for claims about behaviour too: **check a claim
against the thing itself, not against whatever is in front of you.** A
preview pane is not the app.

## Contents

- [Starting a server](#starting-a-server)
- [What the preview harness gets wrong about this app](#what-the-preview-harness-gets-wrong-about-this-app)
- [A counter that never ran reads like a counter reading zero](#a-counter-that-never-ran-reads-like-a-counter-reading-zero)
- [Driving real Chrome](#driving-real-chrome)
- [What this does not cover](#what-this-does-not-cover)

## Starting a server

```bash
tools/app.sh              # picks a free port from 5190 up and prints it
tools/app.sh 5201         # or insist on one
tools/app.sh --print      # only say which port it would use
```

`npm run dev` and `./build.sh --dev` both want port 5173, and several
worktrees share this repository. Vite does not refuse a taken port, it
quietly moves to the next one — so the second agent to start a server gets a
working app on a port it does not know about, and a preview harness still
pointed at 5173 showing nothing. `tools/app.sh` finds a free port first and
then passes `--strictPort`, so a collision is an error rather than a silent
move.

`.claude/launch.json` pins 5173 with no `autoPort`, which is why only one
worktree can use the preview harness at all. Passing a port through the
harness is not enough on its own — vite ignores the `PORT` environment
variable and wants `--port` on the command line.

## What the preview harness gets wrong about this app

Recorded from the two withdrawn findings. It drives the app perfectly well;
it is the two measurements below that it cannot be trusted on.

**The notation never draws in it.** `div.score-host` mounts at full size and
stays empty — no console error, no failed request, Bravura loaded,
ResizeObserver present. Real Chrome draws staves on every screen that has
one. Checked again at `9ad3524` against `#/scales`: one `svg` inside
`.score-host`, a treble clef and eight noteheads, 24 stroke elements. Do not
conclude the notation is broken from a preview pane.

**A narrow viewport is not a phone.** Resizing the preview changes the width
and nothing else; the pointer stays `fine`, so every `@media (pointer:
coarse)` rule in the stylesheet is inert and each control measures at its
mouse size. At 375 px the same page gives 33 controls under 44 px with a
mouse pointer and none with a touch pointer. A touch-target claim made from
a resized preview is a claim about a desktop browser squeezed thin.

## A counter that never ran reads like a counter reading zero

Two measurements an hour apart were both false this way, and neither
announced it.

A harness patched `AudioScheduledSourceNode.prototype.start` to count notes.
**`AudioBufferSourceNode` declares its own `start`** — it takes
`(when, offset, duration)` rather than `(when)`, and the override is in the
IDL this repository already ships, at `AudioBufferSourceNode` and again at
`AudioScheduledSourceNode` in `node_modules/typescript/lib/lib.dom.d.ts`, so
the next person can establish it without a browser. A patch on the base is
shadowed rather than inherited: it caught every oscillator and no buffer
source. Before a sampled pack lands every note is an oscillator and the count
moves; after it lands every note is a buffer source and the count stops dead.
That is indistinguishable from the instrument going silent, and it was
reported as exactly that.

The second was a `Page.navigate` to a URL differing from the current one only
in the hash. The document never reloaded, so the script installing the
counters — injected with `Page.addScriptToEvaluateOnNewDocument`, which fires
only on a real navigation — never ran, and every counter was `undefined`.
**How that becomes a number is worth being exact about**, because the obvious
guard tests for the wrong value: `+undefined - +undefined` is `NaN`, not `0`.
The zero came from the readings being joined into a string before being
parsed, where an absent counter contributes an empty field and `+'' === 0`.
A harness that defended against `NaN` would have passed this through
unchanged.

**The two sections above are the tool lying about the app. This is the tool
not running and saying so in the voice of a true measurement**, which is
worse: a misdrawn stave is visible the moment you look at it, and a dead
counter looks exactly like the finding you went to get.

So, before trusting a reading, **assert the instrument, not the reading**.
`typeof window.__counters === 'object'` before any delta is read; a canary
the page increments unconditionally, so a zero in it is impossible; and a
baseline taken after the patch is installed rather than before. If a
navigation is only a hash change, reload explicitly — nothing will tell you
the injected script was skipped.

This is the suite's own rule arriving from outside it. A dozen cases under
`src/` assert the size of what they swept before asserting anything about it,
because a guard over an empty population passes. An instrument pointed at the
app needs the same guard and had none.

## Driving real Chrome

Headless Chrome over the DevTools protocol, which needs no dependencies —
Node's global `WebSocket` is enough.

```bash
tools/app.sh &                           # note the port it prints
google-chrome-stable --headless --remote-debugging-port=9333 \
    --remote-allow-origins='*' --user-data-dir=/tmp/chrome-prof \
    'http://localhost:5190/'
curl -s http://localhost:9333/json/list  # find the page target
```

Then open its `webSocketDebuggerUrl`, `Runtime.enable`, and evaluate. The
four things that are not obvious:

- **`Runtime.evaluate` needs `userGesture: true`** for anything behind the
  autoplay policy. A bare `.click()` is not a user activation, and every
  screen in this app that makes a sound is behind one.
- **`pointer: coarse` needs two calls, not one.**
  `Emulation.setDeviceMetricsOverride` with `mobile: true` *and*
  `Emulation.setTouchEmulationEnabled`. Metrics alone leaves the pointer
  `fine`: measured at 375 px, `false` with metrics only and `true` with both.
- **Glyphs read as empty text.** VexFlow draws SMuFL private-use codepoints,
  so `textContent` looks blank; decode with `codePointAt`. Treble `E050`,
  bass `E062`, **alto and tenor both `E05C`**, notehead `E0A4`, flat `E260`,
  natural `E261`, sharp `E262`.
- **The codepoint cannot tell alto from tenor**, and this app offers all four
  clefs — `CLEFS` in `key-id/keys.ts`. `E05C` is SMuFL's C clef and the two
  differ only in where it sits on the stave: measured in this app at `y=80`
  for alto against `y=70` for tenor. An agent identifying a clef from the
  codepoint alone has an instrument that cannot distinguish two of the four,
  and will report alto for both. Read the `y` as well, or do not claim which
  C clef it is.
- **Screens are hash routes**, so deep-link rather than click your way in:
  `#/scales`, `#/interval-id`.

## What this does not cover

A real phone, and a real instrument into a real microphone. Nothing above
tells you whether the pitch detector hears a cello, and the input-latency
measurement in `src/audio/capture/` is explicitly a thing that needs a
device. Where a claim needs one, say that it was not checked rather than
checking it in Chrome and calling it the same thing.
