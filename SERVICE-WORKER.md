# Service worker and Add to Home Screen (preview)

Files: `sw.js` (site root), `js/sw-update.js` (every page except whisperwood.html), `site.webmanifest`,
`offline.html`, `js/install-tip.js` (Home only), `assets/icons/icon-maskable-192.png` and `-512.png`.

## What it does

* Scope is the folder `sw.js` sits in: `/night-bite-preview/` on the preview, `/` on nightbiteoh.com. Every path in
  `sw.js` and the manifest is relative, so the same files work in both places.
* Install precaches the core pages, `css/styles.css`, all of `js/`, the Latin fonts, icons, map art and `data/*.json`.
* Pages (navigations and `text/html`): network first with a 4 second timeout, then the saved copy, then `offline.html`.
* `data/*.json`: network first, saved copy when offline.
* CSS and JS: network first with the same 4 second timeout, saved copy when offline or slow. (Through v11 they were
  stale while revalidate, so right after a deploy a page could get new HTML with last deploy's `styles.css` and
  `hoover-map.js`: the lake picker showed unstyled and every map opened Hoover.)
* Everything else on this site (fonts, images): stale while revalidate.
* Every page links its own CSS and JS with `?v=VERSION`, which skips GitHub Pages' 10 minute HTTP cache. The worker
  strips `?v=` when it saves a copy, so offline copies still match.
* `js/sw-update.js` (renamed from `sw-register.js` in v12 so an older worker has never cached it) reloads the page
  once when a new worker takes over a page an older one was controlling, only in the first 20 seconds.

## Every deploy

1. Bump `VERSION` in `sw.js`.
2. Run `python3 tools/stamp-version.py` from the repo root (rewrites every `?v=` to match; skips Whisperwood).
* Never touched: anything under `whisperwood/` and `whisperwood.html` (no `respondWith`, nothing cached), the
  service worker file itself, any other origin (NWS, USGS, Google Maps, GitHub). Non GET requests pass through.
* Live readings are not cached by the service worker. The page keeps the last good USGS reading, 7 day trend and NWS
  forecast in localStorage (`nb-usgs-last`, `nb-trend-last`, `nb-cond-last`) and, with no signal, shows them with
  "Offline. Last updated HH:MM ET." Values only ever come from a real fetch.
* Cache name is `PREFIX + VERSION`, for example `nb-preview-v1-2026-10-22`. Activate deletes caches with the same
  prefix only, so other projects on the same origin (other github.io repos) are never cleared.

## Moving it to nightbiteoh.com

1. Copy `sw.js`, `js/sw-update.js`, `offline.html`, the maskable icons and the manifest changes. Keep `sw.js` at
   the repo root so the scope is `/`.
2. In `sw.js` set `PREFIX = "nb-live-"` and a fresh `VERSION`. Check the `PRECACHE` list against the live tree
   (clean URLs: the live site links `/water` style paths; `cachedPage()` already tries `.html` and `/` for
   extensionless paths, but precache the paths the live nav uses).
3. Whisperwood stays excluded by `isWhisperwood()`: it matches `whisperwood`, `whisperwood/...` and
   `whisperwood.html` relative to the scope. Don't add `sw-update.js` to any Whisperwood page. The game keeps
   its own saves in localStorage and is never served from this cache.
4. Change `worker-src 'none'` to `worker-src 'self'` in the CSP meta of the pages that load `sw-update.js`.
5. Manifest: drop "(Preview)" from `name`. Keep `id`, `start_url` and `scope` as `./`.
6. Bump `VERSION` on every deploy that changes a precached file, so phones pick up the new copies.

## Kill switch

If the worker ever misbehaves, deploy this as `sw.js` (same path). Browsers check for a new `sw.js` on every
navigation (at most every 24 hours), so it reaches everyone who opens the site:

```js
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf("nb-") === 0; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.registration.unregister(); })
      .then(function () { return self.clients.matchAll({ type: "window" }); })
      .then(function (clients) { clients.forEach(function (c) { c.navigate(c.url); }); })
  );
});
```

Also make `js/sw-update.js` stop registering (or replace its body with
`navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); });`).
Don't delete `sw.js` outright: a 404 leaves already installed workers running until they expire.
