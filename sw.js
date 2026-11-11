/**
 * The Night Bite service worker (preview build).
 * Lives at the site root so its scope is the whole site: /night-bite-preview/ here, / on nightbiteoh.com.
 * Every path below is relative to this file, so the same file works in both places.
 *
 * Since v127 (the "diet"): a small precache, kept across deploys, plus runtime caches.
 *  · Precache: the shell only. The water picker (./), hoover/, offline.html, the manifest and icons, css/styles.css,
 *    the shared scripts in js/, the fonts, the picker tiles, Hoover's map art and the small data files the home and
 *    lake pages read. Each file has a content hash in REVISIONS (written by tools/sw-precache.py), and the cache
 *    (PREFIX + "precache") outlives VERSION: a new worker only downloads files whose hash changed. Hashes of HTML
 *    ignore the ?v= stamps, which change on every deploy without changing the page.
 *  · Pages (navigations and text/html): network first with a 4 second timeout, then the saved copy, then offline.html.
 *    Every page you open online is saved (PREFIX + "pages", newest 40), so a lake you visited opens offline.
 *  · data/*.json: network first, saved copy when offline (PREFIX + "data", newest 60; the precached copy is the
 *    last resort). The worker never adds headers: data/advisor-rules.json for the Android app is plain GitHub Pages.
 *  · CSS and JS: network first too, saved copy when offline or slow, so a page never mixes this deploy's HTML
 *    with last deploy's styles or scripts. (Up to v11 these were cache first, which showed the multi-lake
 *    picker unstyled and the old Hoover-only map script after a deploy.) Pages ask for them with ?v=VERSION.
 *  · Fonts and images: precached ones straight from the precache; the rest stale while revalidate
 *    (PREFIX + "assets", newest 200, which also holds the lake only scripts).
 *  · Whisperwood is never touched: nothing under whisperwood/ (or whisperwood.html) is cached or intercepted.
 *  · Cross origin requests (NWS, USGS, links out) pass straight through. The page itself keeps the last good
 *    readings in localStorage and labels them "Offline. Last updated ..." (js/refresh.js, NightBiteOffline).
 *  · Activate deletes every other cache with this PREFIX (the old one per VERSION caches included) and precache
 *    entries no longer listed. Other sites on the same origin (other github.io projects) are left alone.
 *
 * Kill switch: see SERVICE-WORKER.md.
 */
var PREFIX = "nb-preview-";
var VERSION = "v127-2026-11-11";
var SCOPE = new URL("./", self.location).href;
var NETWORK_TIMEOUT = 4000;
var PRECACHE_CACHE = PREFIX + "precache";
var RUNTIME = { pages: PREFIX + "pages", data: PREFIX + "data", assets: PREFIX + "assets" };
var LIMITS = { pages: 40, data: 60, assets: 200 };

var PRECACHE = [
  "./",
  "hoover/",
  "offline.html",
  "site.webmanifest",
  "favicon.svg",
  "favicon.ico",
  "apple-touch-icon.png",
  "css/styles.css",
  "js/alerts.js",
  "js/astro.js",
  "js/night-rules.js",
  "js/i18n.js",
  "js/bait-nearby.js",
  "js/biting-data.js",
  "js/biting-data-lakes.js",
  "js/biting.js",
  "js/community-log.js",
  "js/conditions.js",
  "js/get-app.js",
  "js/glance.js",
  "js/home-log.js",
  "js/hoover-map-data.js",
  "js/hoover-map.js",
  "js/ice-species.js",
  "js/install-tip.js",
  "js/lake-picker.js",
  "js/water-picker.js",
  "js/lake-snapshot.js",
  "js/lakes.js",
  "js/log.js",
  "js/mode-toggle.js",
  "js/nav.js",
  "js/a11y-boot.js",
  "js/a11y.js",
  "js/updates-draft.js",
  "js/pack-list.js",
  "js/pool-readout.js",
  "js/pool-trend.js",
  "js/refresh.js",
  "js/species-filter.js",
  "js/species-lake.js",
  "js/sticky-nav.js",
  "js/sw-update.js",
  "js/tonight-tools.js",
  "js/tournaments.js",
  "js/usgs.js",
  "js/water.js",
  "js/visits.js",
  "js/scrollspy.js",
  "js/fold-anchors.js",
  "js/local-notes.js",
  "js/docks.js",
  "data/quick-facts.json",
  "data/bait-shops.json",
  "data/community-log.json",
  "data/tournaments.json",
  "assets/fonts/night-bite-pixel-bold.woff2",
  "assets/fonts/night-bite-pixel-regular.woff2",
  "assets/fonts/pixelify-sans-latin.woff2",
  "assets/fonts/source-serif-4-italic-latin.woff2",
  "assets/fonts/source-serif-4-latin.woff2",
  "assets/tiles/hoover.png",
  "assets/tiles/alum.png",
  "assets/tiles/buckeye.png",
  "assets/tiles/oshaughnessy.png",
  "assets/tiles/griggs.png",
  "assets/tiles/indian.png",
  "assets/tiles/delaware.png",
  "assets/tiles/deercreek.png",
  "assets/tiles/madison.png",
  "assets/tiles/knox.png",
  "assets/tiles/clearfork.png",
  "assets/tiles/seneca.png",
  "assets/tiles/dillon.png",
  "assets/tiles/logan.png",
  "assets/tiles/saltfork.png",
  "assets/tiles/burroak.png",
  "assets/tiles/dow.png",
  "assets/tiles/mosquito.png",
  "assets/tiles/berlin.png",
  "assets/tiles/westbranch.png",
  "assets/tiles/pymatuning.png",
  "assets/tiles/milton.png",
  "assets/tiles/leesville.png",
  "assets/tiles/grandlakestmarys.png",
  "assets/tiles/caesarcreek.png",
  "assets/tiles/eastfork.png",
  "assets/tiles/cjbrown.png",
  "assets/tiles/rockyfork.png",
  "assets/tiles/ladue.png",
  "assets/tiles/paintcreek.png",
  "assets/tiles/portagelakes.png",
  "assets/tiles/mogadore.png",
  "assets/tiles/loramie.png",
  "assets/tiles/nimisila.png",
  "assets/tiles/cowan.png",
  "assets/tiles/acton.png",
  "assets/tiles/tappan.png",
  "assets/tiles/piedmont.png",
  "assets/tiles/clendening.png",
  "assets/tiles/atwood.png",
  "assets/tiles/charlesmill.png",
  "assets/tiles/pleasanthill.png",
  "assets/tiles/beachcity.png",
  "assets/tiles/wingfoot.png",
  "assets/tiles/eastbranch.png",
  "assets/tiles/guilford.png",
  "assets/tiles/highlandtown.png",
  "assets/tiles/punderson.png",
  "assets/tiles/wellington.png",
  "assets/icons/bank.svg",
  "assets/icons/boat.svg",
  "assets/icons/bobber.svg",
  "assets/icons/fish-black-crappie.svg",
  "assets/icons/fish-blue-catfish.svg",
  "assets/icons/fish-bluegill.svg",
  "assets/icons/fish-channel-catfish.svg",
  "assets/icons/fish-common-carp.svg",
  "assets/icons/fish-flathead-catfish.svg",
  "assets/icons/fish-hybrid-striped-bass.svg",
  "assets/icons/fish-largemouth-bass.svg",
  "assets/icons/fish-longnose-gar.svg",
  "assets/icons/fish-saugeye.svg",
  "assets/icons/fish-smallmouth-bass.svg",
  "assets/icons/fish-walleye.svg",
  "assets/icons/fish-white-bass.svg",
  "assets/icons/fish-white-crappie.svg",
  "assets/icons/fish-muskellunge.svg",
  "assets/icons/fish-yellow-perch.svg",
  "assets/icons/fish-bullhead.svg",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-192.png",
  "assets/icons/icon-maskable-512.png",
  "assets/icons/moon.svg",
  "assets/lantern.svg",
  "assets/lantern-hero.svg",
  "assets/horizon-center.png",
  "assets/horizon-thin.png",
  "assets/horizon-tile.png",
  "assets/hoover-chart.png",
  "assets/map/hoover-map-tall.png",
  "assets/map/hoover-map-wide.png",
  "assets/maps/hoover-depth-contours.webp",
  "assets/map/pin-access.png",
  "assets/map/pin-ramp.png",
  "assets/map/pin-shop.png",
  "assets/moon/moon-phases.png",
  "assets/wind/wind-arrows.png"
];

// tools/sw-precache.py writes this block (stamp-version.py and promote.py run it). Don't edit it by hand.
// BEGIN REVISIONS
var REVISIONS = {
  "./": "c52a8c480a0c",
  "hoover/": "03da61ac0f67",
  "offline.html": "8d469f9804f8",
  "site.webmanifest": "e6a918f4b6f1",
  "favicon.svg": "a4203bb6ec2d",
  "favicon.ico": "ec8fafebba48",
  "apple-touch-icon.png": "ae1b52f0a95b",
  "css/styles.css": "66f295fc82ca",
  "js/alerts.js": "2c7b980aa108",
  "js/astro.js": "a3ec0945f030",
  "js/night-rules.js": "c14111456232",
  "js/i18n.js": "e4390c024f98",
  "js/bait-nearby.js": "b75e87af32d4",
  "js/biting-data.js": "a34d2c4327fb",
  "js/biting-data-lakes.js": "0b33ed7d3612",
  "js/biting.js": "96b7dd457419",
  "js/community-log.js": "8115f19147eb",
  "js/conditions.js": "411b3d05c3d9",
  "js/get-app.js": "8345fce8e5c8",
  "js/glance.js": "10a9bc96cc51",
  "js/home-log.js": "09d0017c6cec",
  "js/hoover-map-data.js": "88336536d9dc",
  "js/hoover-map.js": "eb007aca9278",
  "js/ice-species.js": "1b7ad6422ffa",
  "js/install-tip.js": "066437822918",
  "js/lake-picker.js": "03f6265ee9c9",
  "js/water-picker.js": "b48ce9fb2f0d",
  "js/lake-snapshot.js": "9f0ac1a4d1ac",
  "js/lakes.js": "1f72f697524f",
  "js/log.js": "69cf38e8db8a",
  "js/mode-toggle.js": "842ee5852866",
  "js/nav.js": "85c14199105b",
  "js/a11y-boot.js": "dce50da82642",
  "js/a11y.js": "285b620a50bc",
  "js/updates-draft.js": "954b481592ef",
  "js/pack-list.js": "f9a5e5d83c93",
  "js/pool-readout.js": "8d7a2674f345",
  "js/pool-trend.js": "a619ea9620f8",
  "js/refresh.js": "fdff32325088",
  "js/species-filter.js": "454f000c5ba6",
  "js/species-lake.js": "6619e409199a",
  "js/sticky-nav.js": "320454e88b43",
  "js/sw-update.js": "6e734dea5cc5",
  "js/tonight-tools.js": "e58623e5304e",
  "js/tournaments.js": "fd4ba507c0c4",
  "js/usgs.js": "a25e9832344f",
  "js/water.js": "23040b9980b5",
  "js/visits.js": "e0f046529c59",
  "js/scrollspy.js": "1b056c72b92f",
  "js/fold-anchors.js": "50003a38a248",
  "js/local-notes.js": "d68fc177c5f1",
  "js/docks.js": "a1a7f6febfb1",
  "data/quick-facts.json": "856ba6ea6354",
  "data/bait-shops.json": "64f734bc9039",
  "data/community-log.json": "580fe5dfefbb",
  "data/tournaments.json": "a5ba0fefa580",
  "assets/fonts/night-bite-pixel-bold.woff2": "3e683f59654f",
  "assets/fonts/night-bite-pixel-regular.woff2": "1458fee0d42d",
  "assets/fonts/pixelify-sans-latin.woff2": "9c367c6a9e26",
  "assets/fonts/source-serif-4-italic-latin.woff2": "f97463f721a8",
  "assets/fonts/source-serif-4-latin.woff2": "88c3215f1779",
  "assets/tiles/hoover.png": "411fd8c327e8",
  "assets/tiles/alum.png": "5a075b159522",
  "assets/tiles/buckeye.png": "49fa9166b395",
  "assets/tiles/oshaughnessy.png": "8986fdeff21f",
  "assets/tiles/griggs.png": "0fce7b9cec29",
  "assets/tiles/indian.png": "ae0f4f923523",
  "assets/tiles/delaware.png": "67f9ba436001",
  "assets/tiles/deercreek.png": "ca508082e49b",
  "assets/tiles/madison.png": "abd1960f02de",
  "assets/tiles/knox.png": "bf6cc39419cb",
  "assets/tiles/clearfork.png": "7c8f14d451ea",
  "assets/tiles/seneca.png": "f57a6316a301",
  "assets/tiles/dillon.png": "bd6608c42c35",
  "assets/tiles/logan.png": "9b19d7c77372",
  "assets/tiles/saltfork.png": "a9eae44cbb73",
  "assets/tiles/burroak.png": "001b10eed944",
  "assets/tiles/dow.png": "237f2f4aace4",
  "assets/tiles/mosquito.png": "6588818a309f",
  "assets/tiles/berlin.png": "5b955766882c",
  "assets/tiles/westbranch.png": "e56bb16d0261",
  "assets/tiles/pymatuning.png": "fbe089a5aefa",
  "assets/tiles/milton.png": "968f2a7d6219",
  "assets/tiles/leesville.png": "3d0fc02b5bb7",
  "assets/tiles/grandlakestmarys.png": "8b90b41a6af9",
  "assets/tiles/caesarcreek.png": "551a3bd7ed01",
  "assets/tiles/eastfork.png": "5ac9f2c45bc3",
  "assets/tiles/cjbrown.png": "68418c62d334",
  "assets/tiles/rockyfork.png": "131752bec923",
  "assets/tiles/ladue.png": "7b3e1bafb155",
  "assets/tiles/paintcreek.png": "59da3f0fad45",
  "assets/tiles/portagelakes.png": "79de1b5039b0",
  "assets/tiles/mogadore.png": "0f699c2f3fed",
  "assets/tiles/loramie.png": "a1b5bf7ac644",
  "assets/tiles/nimisila.png": "19b9ca50ba99",
  "assets/tiles/cowan.png": "037e85394b6b",
  "assets/tiles/acton.png": "fb8b3d71db81",
  "assets/tiles/tappan.png": "da0dbd2fbac5",
  "assets/tiles/piedmont.png": "dcd9c2334098",
  "assets/tiles/clendening.png": "edab7e9945e9",
  "assets/tiles/atwood.png": "a3966e5ffcac",
  "assets/tiles/charlesmill.png": "27f56f47e49f",
  "assets/tiles/pleasanthill.png": "82e454bd8cf3",
  "assets/tiles/beachcity.png": "e15c29994997",
  "assets/tiles/wingfoot.png": "c7d7901bcc55",
  "assets/tiles/eastbranch.png": "5ae73f8ed328",
  "assets/tiles/guilford.png": "96ac04ccb00d",
  "assets/tiles/highlandtown.png": "53939e559f2c",
  "assets/tiles/punderson.png": "ce058a1f557b",
  "assets/tiles/wellington.png": "c264604f3ce0",
  "assets/icons/bank.svg": "3d52f3c2091d",
  "assets/icons/boat.svg": "adc37375205e",
  "assets/icons/bobber.svg": "9d2e548697f8",
  "assets/icons/fish-black-crappie.svg": "93c7ad010cd4",
  "assets/icons/fish-blue-catfish.svg": "24f95321d2d8",
  "assets/icons/fish-bluegill.svg": "66638a4c5289",
  "assets/icons/fish-channel-catfish.svg": "fc3a94949f46",
  "assets/icons/fish-common-carp.svg": "0503f0acf360",
  "assets/icons/fish-flathead-catfish.svg": "ad68bb1d7c9d",
  "assets/icons/fish-hybrid-striped-bass.svg": "11eeada354fd",
  "assets/icons/fish-largemouth-bass.svg": "5bc042d6c48f",
  "assets/icons/fish-longnose-gar.svg": "bbc598d003a0",
  "assets/icons/fish-saugeye.svg": "8fe6267acfdf",
  "assets/icons/fish-smallmouth-bass.svg": "687d4a0e2427",
  "assets/icons/fish-walleye.svg": "c8ec0b5ad7df",
  "assets/icons/fish-white-bass.svg": "e9dae8031412",
  "assets/icons/fish-white-crappie.svg": "7226b8d28926",
  "assets/icons/fish-muskellunge.svg": "5f928de1be7b",
  "assets/icons/fish-yellow-perch.svg": "8bd5aa0775bf",
  "assets/icons/fish-bullhead.svg": "f6891883c429",
  "assets/icons/icon-192.png": "1a71fa8bf8ff",
  "assets/icons/icon-512.png": "731523cf6126",
  "assets/icons/icon-maskable-192.png": "7b5bd4488247",
  "assets/icons/icon-maskable-512.png": "49588ad8eca6",
  "assets/icons/moon.svg": "823fef6f2eb8",
  "assets/lantern.svg": "e99d689ca189",
  "assets/lantern-hero.svg": "a00256a88874",
  "assets/horizon-center.png": "d4e12d76b18e",
  "assets/horizon-thin.png": "e221a7fc7502",
  "assets/horizon-tile.png": "f876ce581248",
  "assets/hoover-chart.png": "fe743cba0221",
  "assets/map/hoover-map-tall.png": "8ccedbbfb7ab",
  "assets/map/hoover-map-wide.png": "1330bbed1c9a",
  "assets/maps/hoover-depth-contours.webp": "afd472240e97",
  "assets/map/pin-access.png": "0b291a11e61d",
  "assets/map/pin-ramp.png": "4fb65a1c2743",
  "assets/map/pin-shop.png": "b7beeb5fd6a9",
  "assets/moon/moon-phases.png": "88eb81447164",
  "assets/wind/wind-arrows.png": "320e354157c4"
};
// END REVISIONS

function rel(url) { return url.href.slice(SCOPE.length); }

function isWhisperwood(url) {
  var r = rel(url).toLowerCase();
  return r === "whisperwood" || r.indexOf("whisperwood/") === 0 || r.indexOf("whisperwood.html") === 0;
}

// a cached redirect can't answer a navigation, so store a clean copy
function clean(res) {
  if (!res.redirected) return Promise.resolve(res);
  return res.blob().then(function (b) {
    return new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}

function keyFor(url) {
  var u = new URL(url.href);
  u.search = "";
  u.hash = "";
  return u.href;
}

// ---------------------------------------------------------------- precache with content hashes

// the precache key carries the file's hash, so two deploys' copies never collide
function revKey(path) { return new URL(path, SCOPE).href + "?__nbrev=" + (REVISIONS[path] || VERSION); }

function isHtmlPath(path) { return path === "./" || /\/$/.test(path) || /\.html$/i.test(path); }

// the same hash tools/sw-precache.py writes: sha256 of the bytes, HTML with its ?v= stamps blanked, first 12 hex
function hashOf(path, res) {
  if (!self.crypto || !crypto.subtle) return Promise.resolve(null);
  return res.arrayBuffer().then(function (buf) {
    if (isHtmlPath(path)) {
      var text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf);
      buf = new TextEncoder().encode(text.replace(/\?v=[^"'<>&#) \t\n\r\f]*/g, "?v="));
    }
    return crypto.subtle.digest("SHA-256", buf);
  }).then(function (d) {
    var h = Array.prototype.map.call(new Uint8Array(d), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    return h.slice(0, 12);
  }).catch(function () { return null; });
}

// before downloading, reuse a copy an older worker already has (the per VERSION caches up to v126), if its hash matches
function fromOldCaches(path, url, want) {
  if (!REVISIONS[path]) return Promise.resolve(null);
  return caches.keys().then(function (keys) {
    var old = keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== PRECACHE_CACHE && !isRuntime(k); });
    var i = 0;
    function next() {
      if (i >= old.length) return null;
      return caches.open(old[i++]).then(function (c) { return c.match(url); }).then(function (hit) {
        if (!hit) return next();
        return hashOf(path, hit.clone()).then(function (h) { return h === want ? hit : next(); });
      });
    }
    return next();
  }).catch(function () { return null; });
}

function download(path, url) {
  var want = REVISIONS[path];
  return fetch(new Request(url, { cache: "no-cache", credentials: "same-origin" })).then(function (res) {
    if (!res.ok) throw new Error(path + " " + res.status);
    if (!want) return res;
    return hashOf(path, res.clone()).then(function (h) {
      if (h === want || h === null) return res;
      // a cache between here and the server still had the last deploy's copy: ask past it once, then keep what comes
      return fetch(new Request(url + (url.indexOf("?") < 0 ? "?" : "&") + "nbrev=" + want, { cache: "reload", credentials: "same-origin" }))
        .then(function (r2) { return r2.ok ? r2 : res; }, function () { return res; });
    });
  });
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(PRECACHE_CACHE).then(function (cache) {
      return Promise.all(PRECACHE.map(function (path) {
        var key = revKey(path), url = new URL(path, SCOPE).href;
        return cache.match(key).then(function (have) {
          if (have) return;                                       // unchanged since an earlier worker saved it
          return fromOldCaches(path, url, REVISIONS[path]).then(function (old) {
            return old || download(path, url);
          }).then(function (res) {
            return clean(res).then(function (c) { return cache.put(key, c); });
          });
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

function isRuntime(name) { return name === RUNTIME.pages || name === RUNTIME.data || name === RUNTIME.assets; }

self.addEventListener("activate", function (event) {
  var wanted = {};
  PRECACHE.forEach(function (p) { wanted[revKey(p)] = true; });
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(PREFIX) === 0 && k !== PRECACHE_CACHE && !isRuntime(k)) return caches.delete(k);
      }));
    }).then(function () {
      return caches.open(PRECACHE_CACHE).then(function (cache) {
        return cache.keys().then(function (reqs) {
          return Promise.all(reqs.map(function (r) { if (!wanted[r.url]) return cache.delete(r); }));
        });
      });
    }).then(function () { return self.clients.claim(); })
  );
});

// ---------------------------------------------------------------- lookups

// the forms one page can be asked for: hoover/, hoover/index.html, /water and water.html
function variants(href) {
  var tries = [href];
  if (/\/$/.test(href)) tries.push(href + "index.html");
  else if (/\/index\.html$/.test(href)) tries.push(href.replace(/index\.html$/, ""));
  else if (/\.html$/.test(href)) tries.push(href.replace(/\.html$/, ""));
  else if (!/\.[a-z0-9]+$/i.test(href)) { tries.push(href + ".html"); tries.push(href + "/"); }
  return tries;
}

function precachePath(url) {
  var tries = variants(keyFor(url));
  for (var i = 0; i < tries.length; i++) {
    if (tries[i].indexOf(SCOPE) !== 0) continue;
    var p = tries[i].slice(SCOPE.length) || "./";
    if (Object.prototype.hasOwnProperty.call(REVISIONS, p) || PRECACHE.indexOf(p) !== -1) return p;
  }
  return null;
}

function fromPrecache(url) {
  var p = precachePath(url);
  if (!p) return Promise.resolve(undefined);
  return caches.open(PRECACHE_CACHE).then(function (c) { return c.match(revKey(p)); });
}

function fromRuntime(name, url) {
  var tries = variants(keyFor(url));
  return caches.open(name).then(function (cache) {
    var i = 0;
    function next() {
      if (i >= tries.length) return undefined;
      return cache.match(tries[i++]).then(function (r) { return r || next(); });
    }
    return next();
  });
}

// saved copy: data prefers the newest runtime copy; pages, CSS and JS prefer the precache (same deploy as the shell)
function saved(kind, url) {
  if (kind === "data") return fromRuntime(RUNTIME.data, url).then(function (r) { return r || fromPrecache(url); });
  return fromPrecache(url).then(function (r) { return r || fromRuntime(RUNTIME[kind], url); });
}

// keep each runtime cache to its newest LIMITS entries (put appends, so the oldest come first)
function trim(name, max) {
  return caches.open(name).then(function (cache) {
    return cache.keys().then(function (keys) {
      if (keys.length <= max) return;
      return Promise.all(keys.slice(0, keys.length - max).map(function (k) { return cache.delete(k); }));
    });
  });
}

function remember(kind, url, res) {
  var name = RUNTIME[kind], key = keyFor(url);
  return clean(res).then(function (c) {
    return caches.open(name).then(function (cache) {
      return cache.delete(key).then(function () { return cache.put(key, c); });
    });
  }).then(function () { return trim(name, LIMITS[kind]); }).catch(function () {});
}

function offlinePage() {
  return fromPrecache(new URL("offline.html", SCOPE)).then(function (res) {
    if (!res) return Response.error();
    // links in offline.html are written from the site root; a <base> keeps them right from any folder
    return res.text().then(function (html) {
      return new Response(html.replace("<head>", '<head><base href="' + SCOPE + '">'), {
        status: 200, headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    });
  });
}

// ---------------------------------------------------------------- strategies

// kind: "pages", "data" or "assets" (CSS and JS). A precached page, script or style is not saved again at runtime
// (its precache copy matches the shell); data is always saved, so the log and tournaments offline are the newest seen.
function networkFirst(event, url, kind) {
  var network = fetch(event.request).then(function (res) {
    if (res.ok && res.type === "basic" && (kind === "data" || !precachePath(url))) {
      event.waitUntil(remember(kind, url, res.clone()));
    }
    return res;
  });
  var timeout = new Promise(function (resolve) {
    setTimeout(function () { resolve(saved(kind, url)); }, NETWORK_TIMEOUT);
  });
  return Promise.race([
    network,
    timeout.then(function (hit) { return hit || network; })   // slow signal: use the saved copy if there is one
  ]).catch(function () {
    return saved(kind, url).then(function (hit) { return hit || (kind === "pages" ? offlinePage() : Response.error()); });
  });
}

function staleWhileRevalidate(event, url) {
  return fromPrecache(url).then(function (pre) {
    if (pre) return pre;                                      // precached art changes only with its hash
    return fromRuntime(RUNTIME.assets, url).then(function (hit) {
      var fresh = fetch(event.request).then(function (res) {
        if (res.ok && res.type === "basic") return remember("assets", url, res.clone()).then(function () { return res; });
        return res;
      });
      if (hit) {
        event.waitUntil(fresh.catch(function () {}));
        return hit;
      }
      return fresh;
    });
  });
}

// js/sw-update.js asks before it heals a page: this worker keeps CSS and JS network first, so pages it served are
// never a mix of two deploys and don't need the one time reload.
self.addEventListener("message", function (event) {
  var d = event.data;
  if (d && d.type === "nb-hello" && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: VERSION, assets: "network-first" });
  }
});

// "Remind me" (js/tonight-tools.js): the page shows the notification through this worker; tapping it opens
// (or focuses) the lake's home page. No push subscription, no server: nothing arrives here from outside.
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || SCOPE;
  if (url.indexOf(SCOPE) !== 0) url = SCOPE;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.split("#")[0] === url && "focus" in list[i]) return list[i].focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // NWS, USGS and every other site: untouched
  if (url.href.indexOf(SCOPE) !== 0) return;           // outside this site
  if (isWhisperwood(url)) return;                      // Whisperwood: never cached, never intercepted
  if (url.pathname.endsWith("/sw.js") || url.pathname === "/sw.js") return;
  var accept = req.headers.get("Accept") || "";
  if (req.mode === "navigate" || accept.indexOf("text/html") !== -1) {
    event.respondWith(networkFirst(event, url, "pages"));
    return;
  }
  if (rel(url).indexOf("data/") === 0) {                // data feeds: freshest first
    event.respondWith(networkFirst(event, url, "data"));
    return;
  }
  if (/\.(css|js)$/i.test(url.pathname)) {               // styles and scripts: always the same deploy as the page
    event.respondWith(networkFirst(event, url, "assets"));
    return;
  }
  event.respondWith(staleWhileRevalidate(event, url));
});
