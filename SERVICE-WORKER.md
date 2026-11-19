# Service worker and Add to Home Screen (preview)

Files: `sw.js` (site root), `js/sw-update.js` (every page except whisperwood.html), `site.webmanifest`,
`offline.html`, `js/install-tip.js` (Home only), `assets/icons/icon-maskable-192.png` and `-512.png`.

## What it does

* Scope is the folder `sw.js` sits in: `/night-bite-preview/` on the preview, `/` on nightbiteoh.com. Every path in
  `sw.js` and the manifest is relative, so the same files work in both places.
* Precache (since v127, the "diet"; v128 adds every lake home; v132 splits "what's biting" per lake): 436 files,
  about 4.1 MB. The water picker (`./`),
  `offline.html`, the manifest, favicons and icons, `css/styles.css`, the 42 shared scripts in `js/`, the Latin
  and Latin-ext fonts, the picker tiles, Hoover's depth contours, the map pins, moon and wind sprites, and `data/quick-facts.json`,
  `bait-shops.json`, `community-log.json` and `tournaments.json`, plus every lake home and the chart, map script
  (`js/lake-map-data-*.js`, or `js/hoover-map-data.js` for Hoover), map images and its own "what's biting" set
  (`js/biting/<id>.js`, from `tools/biting-split.py`; the species and ice pages and the share card read it) that
  its pages need offline. Before v132 every install also took the combined `js/biting-data.js` and
  `js/biting-data-lakes.js` (about 263 KB) and every species page loaded both. The lake
  list is written by `tools/sw-precache.py` from `js/lakes.js`, so a new water is picked up automatically. Up to v126
  it was all 436 files (about 6.4 MB): every page, all 18 language files and every lake's maps. v127 cut that to the
  shell only (149 files, about 1.6 MB) and left unvisited lake homes offline until they were opened online.
* Content hashes: `REVISIONS` in `sw.js` holds a 12 hex sha256 per precached file, written by
  `tools/sw-precache.py`. The precache (`PREFIX + "precache"`) is kept across deploys and each copy is saved under its
  hash, so a new worker downloads only the files whose hash changed. HTML hashes blank the `?v=` stamps first,
  because `stamp-version.py` rewrites them on every deploy without changing the page. A changed file is fetched with
  `cache: "no-cache"` (a 304 when the server copy is the same) and checked against its hash; if a cache in between
  still hands out last deploy's copy, it asks once more past it (`?nbrev=<hash>`, `cache: "reload"`) and keeps that.
  On the first install after v126 the worker also reuses any copy in the old per version cache whose hash matches,
  so that upgrade only downloaded `sw.js` and the newly precached `quick-facts.json`.
* Runtime caches, kept across deploys and capped by count (newest kept): `PREFIX + "pages"` (40) for every page
  opened online, so a lake you visited opens offline; `PREFIX + "data"` (60) for `data/*.json` and the language
  files; `PREFIX + "assets"` (200) for lake only scripts, lake maps and other images and fonts.
* Pages (navigations and `text/html`): network first with a 4 second timeout, then the saved copy (precache for
  `./` and every lake home, else the pages cache, see "Deploys never mix" below), then `offline.html`. An unvisited
  deeper page (for example `water.html` or a species page) shows `offline.html`.
* `data/*.json`: network first, then the newest saved copy, then the precached one. The worker only answers the
  site's own pages; it never changes headers, so `data/advisor-rules.json` for the Android app (which fetches it
  directly over HTTPS) is exactly what GitHub Pages serves.
* CSS and JS: by the deploy the page asks for (`?v=`), see "Deploys never mix" below. A precached script or style is
  not saved again at runtime. (Through v11 they were stale while revalidate, so right after a deploy a page could
  get new HTML with last deploy's `styles.css` and `hoover-map.js`: the lake picker showed unstyled and every map
  opened Hoover. v12 to v134 were network first with a 4 second fallback to the saved copy, which still mixed
  deploys on a slow connection; N1 and N2 below.)
* Fonts and images: precached ones come straight from the precache (they change only with their hash). The rest
  are cache first in the assets cache: a request with `?v=<content hash>` is served from that cache with no
  revalidate; an unversioned one is stale while revalidate. `tools/stamp-assets.py` writes a 12 hex sha256 of the
  file on static font and image URLs (CSS `@font-face`, preloads, `img`, icons, manifest, and JS string literals),
  so a later long HTTP cache at the edge is safe and a changed file gets a new URL. Dynamic concatenations (for
  example the species fish icons) are left unstamped and stay stale while revalidate. The latin and latin-ext
  faces are all in the precache.
* Every page links its own CSS and JS with `?v=VERSION`, which skips GitHub Pages' 10 minute HTTP cache. Static
  fonts and images use `?v=<content hash>` instead, so their URL changes only when the file changes. The worker
  strips `?v=` (and any query) when it saves or looks up a copy, so offline copies still match.
* `js/sw-update.js` (renamed from `sw-register.js` in v12) asks the worker that served the page `nb-hello`. A v135 or
  newer worker answers `assets: "by-deploy"` and never needs a reload, unless it says the page is mixed (the
  `mixed` flag in that answer, or an `nb-mixed` message later). A v19 to v134 worker answers
  `assets: "network-first"`: when the new worker takes over, the page reloads once if the page or one of its
  styles or scripts took 3.5 seconds or more, or the phone is offline, since only then could the old 4 second
  fallback have mixed it. A worker that doesn't answer (before v19) still gets the reload. Only in the first 20
  seconds, at most once per deploy and once a minute. There is no update toast; the update is silent.
* Activate deletes every other cache with this `PREFIX` (the old per version caches like `nb-preview-v126-...`
  included) and every precache entry that is no longer listed and that no saved page still needs, then claims
  open pages. Other projects on the same origin (other github.io repos) are never cleared.

## Deploys never mix (v135)

The Nov. 13, 2026 verification run found two ways a page could show one deploy's HTML with another deploy's styles
(details and the reproductions in /workspace/nb-research/sw-deploy-mix-2026-11-16/):

* N1: during the update window, the old worker's 4 second fallback answered a slow `styles.css` (or a slow page)
  from its own deploy, so new HTML got old styles, or an old saved page got new styles and scripts from the network.
* N2: pages saved at runtime (`PREFIX + "pages"`) carried no deploy, so after the next deploy, offline or with a
  slow page, they were served next to the new precached styles.

How v135 works. Every page names its deploy: `stamp-version.py` writes `?v=VERSION` on its own CSS and JS.

1. Each worker writes a small manifest of its CSS and JS hashes to `PREFIX + "deploys"` at install. The first
   v135 install also writes one for the worker it replaces (it asks it `nb-hello` for its VERSION and reads its
   files from the precache keys it left), so pages the v134 (live v41) worker saved are covered too.
2. A page saved at runtime keeps its deploy in an `X-NB-Deploy` header (the `?v=` stamp in the page). Pages saved
   before v135 have no header; the stamp is read from the page itself.
3. CSS and JS requests, by their `?v=`:
   * this worker's deploy (or no `?v=`): the precached copy, which install checked against its hash. No network
     wait, so a slow `styles.css` can't matter.
   * a deploy this worker keeps (a saved page of an earlier deploy, or a tab left open across the update): that
     deploy's own copy from the precache.
   * a deploy it doesn't know, which can only be newer (its page came from the network before this worker
     updated): the network, with no 4 second fallback, because every copy here is older. Only when the network
     fails outright does it use a saved copy, and then it tells the page (`nb-mixed`), which reloads once.
4. Pages, when the network is slow (4 seconds) or gone:
   * a precached page (`./`, every lake home, `offline.html`) belongs to this deploy (its hash ignores the stamps),
     so it is served with its stamps rewritten to this `VERSION` and gets this deploy's files.
   * a page from the pages cache is served only when its deploy is this one, or every file of its deploy that
     changed since is still kept. Otherwise the worker waits for the network or shows `offline.html`, never the old
     page with new styles.
5. Activate keeps the changed CSS and JS of each deploy a saved page still needs, and deletes the manifests and
   copies nobody needs. The pages cache holds at most 40 pages, so this is a few old copies of the files that
   changed (usually `styles.css` and a handful of scripts), not a second precache.

`tools/check-sw-deploys.cjs` runs these in Chrome against a local Pages-like server that switches deploys, slows
chosen files and drops connections: `n1-slow-css`, `n1-slow-page`, `n2-offline`, `n2-slow`, `no-reload`,
`legacy-offline` and `legacy-slow-css` (from the v134 worker), `kill-sw-only` and `kill-both`. On the v134 code
the N1 and N2 cases fail (`--code <v134 tree> --expect-fail`).

The one deploy that still runs an old worker (the first v135 install, live's first v42 install) can't be changed
after the fact: during that update window a v134 worker can still mix a slow page. js/sw-update.js heals that page
with one reload when the v135 worker takes over (`legacy-slow-css`).

## Every deploy

1. Bump `VERSION` in `sw.js`.
2. Run `python3 tools/stamp-version.py` from the repo root. It rewrites every CSS and JS `?v=` to match (skips
   Whisperwood), runs `tools/stamp-assets.py` (content-hash stamps on static font and image URLs), and then runs
   `tools/sw-precache.py`, which refreshes `REVISIONS`. Run `stamp-assets.py` and `sw-precache.py` again after any
   later build that touches a stamped or precached file; `tools/check-all.py` and `tools/promote.py` run them late
   on their own, with `sw-precache.py` last.
3. `python3 tools/sw-precache.py --check` (in the GitHub static checks and in check-all as `check-sw-precache`)
   fails when `REVISIONS` is stale or a precached file is missing (a missing file would fail every install).
   `python3 tools/stamp-assets.py --check` (check-all as `check-asset-revs`) fails when a static font or image URL
   is missing its content hash, or the hash does not match the file.
4. `python3 tools/check-precache-refs.py` (in the GitHub static checks and in check-all) fails when a lake home, the
   lake home template or offline.html loads a script, stylesheet or first-paint image that `PRECACHE` doesn't list, so
   a new `<script>` can't quietly break offline pages.
* A precached file without a hash (say a line added by hand without running the tool) is keyed by `VERSION`
  instead, so it is downloaded again on every deploy, which is the old behaviour and never stale.
* To precache another file, add its path to `PRECACHE` and run `sw-precache.py`. Keep the list small: anything a
  visitor opens online is saved at runtime anyway. New waters need no hand edit of `sw.js`: `sw-precache.py` adds
  the new lake home and its first-paint assets from `js/lakes.js`, and `build-tile-charts.py` writes the picker tile
  line.
* Never touched: anything under `whisperwood/` and `whisperwood.html` (no `respondWith`, nothing cached), the
  service worker file itself, any other origin (NWS, USGS, Google Maps, GitHub). Non GET requests pass through.
* Live readings are not cached by the service worker. The page keeps the last good USGS reading, 7 day trend and NWS
  forecast in localStorage (`nb-usgs-last`, `nb-trend-last`, `nb-cond-last`) and, with no signal, shows them with
  "Offline. Last updated 8:45 AM ET." (a reading from another day carries its weekday and date, "Mon Nov. 9, 8:45 AM
  ET"). Values only ever come from a real fetch.
* Measured on the v127 change (details in /workspace/nb-research/sw-diet-2026-11-11/): a deploy with one changed
  page moved 437 files and 6.44 MB to each installed phone before, and 2 files (`sw.js` and the page) and 63 KB after.
  v128 keeps that hashed update: a bump that changes one page still downloads only that page (and `sw.js`). The first
  install is larger than v127 because every lake home is saved up front (see all-lakes.md in that same folder).

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
6. Every promotion bumps `VERSION` (promote.py does it) and runs `sw-precache.py` on the live tree last, so the
   hashes are those of the live files. Phones download only the files whose hash changed.

## Kill switch

If the worker ever misbehaves, deploy `tools/sw-kill-switch.js` as `sw.js` (same path) and **change nothing else**.
Leave `js/sw-update.js` as it is: it keeps registering `sw.js`, which is now the kill switch, and the browser picks
it up on the next navigation (it checks `sw.js` on every navigation, at most every 24 hours), so it reaches everyone
who opens the site. The kill switch clears every cache whose name starts with `nb-` (precache, pages, data, assets,
deploys; about 4 MB) on install and again on activate, then unregisters and reloads open pages, which then run on
the plain network. Each step runs even if the one before fails.

```js
// tools/sw-kill-switch.js, deployed as sw.js
function clearNb() {
  return caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("nb-") === 0; }).map(function (k) { return caches.delete(k); }));
  }).catch(function () {});
}
self.addEventListener("install", function (event) { self.skipWaiting(); event.waitUntil(clearNb()); });
self.addEventListener("activate", function (event) {
  event.waitUntil(
    clearNb()
      .then(function () { return self.registration.unregister(); }).catch(function () {})
      .then(clearNb)
      .then(function () { return self.clients.matchAll({ type: "window" }); })
      .then(function (clients) { clients.forEach(function (c) { c.navigate(c.url); }); })
      .catch(function () {})
  );
});
```

Don't replace `js/sw-update.js` with an unregister line at the same time (up to v134 this page said either was
fine). Unregistering from the page can win the race against the kill switch worker; a worker that is unregistered
before it activates never runs its cleanup, so every `nb-` cache stays behind (N3 in the Nov. 13 run, reproduced
by `repro-kill-old` in `tools/check-sw-deploys.cjs`). If, weeks later, pages should stop registering for good,
`tools/sw-kill-switch-page.js` can replace the body of `js/sw-update.js`: it clears the `nb-` caches from the page
itself, before and after it unregisters, so it is safe in either order (`kill-both`).

Don't delete `sw.js` outright: a 404 leaves already installed workers running until they expire.

A first install that fails part way (one file can't be fetched) leaves the files it already got in
`PREFIX + "precache"` (N4, about 435 entries). That is harmless: they are saved under their hashes, and the next
install reuses every one whose hash still matches instead of downloading it again.
