# What precaching costs, and when it is paid

[0046](../adr/0046-a-sampled-pack-is-fetched-on-use-not-precached.md) declines
to precache a sampled instrument "at the cost of roughly a third more first
load", and says the figure that would settle it does not exist. This note
gathers the half that is a fact about the platform rather than about this
app's audience. The measured payload is in that record's addendum of the same
date, because it is read out of this repository and belongs where a command
can reproduce it.

Taking no decision, as this directory requires.

## Contents

- [Precaching does not delay the first paint, if registration waits for load](#precaching-does-not-delay-the-first-paint-if-registration-waits-for-load)
- [This app registers on load](#this-app-registers-on-load)
- [The published guidance is the decision 0046 already took](#the-published-guidance-is-the-decision-0046-already-took)
- [What is still not answerable from outside](#what-is-still-not-answerable-from-outside)
- [Sources](#sources)

## Precaching does not delay the first paint, if registration waits for load

Precaching happens in the service worker's `install` handler, which dispatches
real network requests. Whether that competes with the page's own loading is
decided by **when the worker is registered**, not by what is in the manifest.
Chrome's guidance is explicit that a registration discovered by the HTML parser
can start before the page's critical assets have loaded, and that registration
should instead be deferred to the window's `load` event — "especially those on
mobile devices with slower network connections".

So "first-load cost" is two different claims and the published advice separates
them: precaching always costs **bytes** on a first visit, and costs **time to
interactive** only where registration races the page.

## This app registers on load

Built and read rather than assumed. `vite-plugin-pwa` injects its own
registration file, which the built `index.html` loads as
`<script id="vite-plugin-pwa:register-sw" src="./registerSW.js">`, and the
whole of that file is:

```js
if('serviceWorker' in navigator) {window.addEventListener('load', () => {navigator.serviceWorker.register('./sw.js', { scope: './' })})}
```

That is the deferred form the guidance asks for, obtained by default rather
than chosen. **Worth knowing precisely because nothing in this repository
states it**: the behaviour is the plugin's, so it is one `injectRegister`
option away from changing without anybody here deciding to.

*Method note, since this is the kind of claim that goes wrong quietly:* two
searches said the registration was absent — it is in neither the HTML's text
for `serviceWorker` nor the main bundle — because it lives in a separate file
the HTML loads by name. A third search found it. An absence reported from a
search that did not cover the place the thing lives is the mirror of the
obituary fault this project already catalogues.

## The published guidance is the decision 0046 already took

Chrome's Workbox documentation recommends cutting especially large assets out
of the precache and letting runtime caching pick them up instead, so that the
install handler does not fight the page for bandwidth. That is 0046's
decision, reached there from a pedagogical argument about synthesis covering
the gap, and it is worth recording that an outside source arrives at the same
place for a different reason — the record is not resting on a local intuition
as much as it thought.

## What is still not answerable from outside

0046 asks how long the payload takes "on the connections this app is used
on". That is a fact about this app's users and no published distribution
substitutes for it: a median national throughput figure answers a different
question than *what the people practising with this app have*, and quoting one
as the other is exactly how a number enters a record wearing a confidence it
has not earned. The byte count is now measured; the seconds are not, and this
note does not pretend otherwise.

## Sources

- [Expectations around service worker deployment — Chrome for Developers](https://developer.chrome.com/docs/workbox/service-worker-deployment)
- [Service worker registration — web.dev](https://web.dev/articles/service-workers-registration)
