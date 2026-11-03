/**
 * The Night Bite: the water picker at the site root (index.html).
 * The page works with no script: every water is a plain link to its home page (<id>/), grouped by region in
 * <details>, built from js/lakes.js by tools/build-lake-pages.py. This script only adds:
 *  · the "Find a water" box: filters by name, short name and aliases, opens the regions with a match and hides the
 *    rest; Enter opens the top match;
 *  · remembering the pick: the water's id (only the id) goes in localStorage "nb-lake" on the way out, the same key
 *    js/lakes.js reads. Next visit, js/lakes.js opens that water's home page before this page paints. ?pick keeps
 *    the picker open (the lake pages' "Change water" sheet is the other way to switch).
 */
(function () {
  var box = document.getElementById("waters");
  if (!box) return;
  var LS = window.NightBiteLakes || {}, KEY = LS.storageKey || "nb-lake";
  var tools = box.querySelector(".wp-tools"), input = document.getElementById("wp-search");
  var empty = box.querySelector(".wp-empty");
  var regions = Array.prototype.slice.call(box.querySelectorAll(".wp-region"));
  var links = Array.prototype.slice.call(box.querySelectorAll("a[data-water]"));
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}

  // ?pick with a water already saved: mark it, and open its region
  links.forEach(function (a) {
    if (a.getAttribute("data-water") !== saved) return;
    var li = a.parentNode, meta = a.querySelector(".lp-meta");
    li.classList.add("is-now");
    if (!meta) { meta = document.createElement("span"); meta.className = "lp-meta"; a.appendChild(meta); }
    var now = document.createElement("span"); now.className = "lp-now"; now.textContent = "Last picked";
    meta.insertBefore(now, meta.firstChild);
    var d = a.closest("details"); if (d) d.open = true;
  });

  links.forEach(function (a) {
    a.addEventListener("click", function () {
      try { localStorage.setItem(KEY, a.getAttribute("data-water")); } catch (e) {}
    });
  });

  if (!tools || !input) return;
  tools.hidden = false;
  var wasOpen = regions.map(function (d) { return d.open; });
  function norm(s) { return (s || "").toLowerCase().replace(/[\u2019']/g, "").replace(/\s+/g, " ").trim(); }
  function paint() {
    var q = norm(input.value), hits = 0;
    regions.forEach(function (d, i) {
      var n = 0;
      d.querySelectorAll(".lp-row").forEach(function (li) {
        var a = li.querySelector("a[data-water]");
        var ok = !q || norm(a.getAttribute("data-q")).indexOf(q) !== -1;
        li.hidden = !ok; if (ok) n++;
      });
      d.hidden = !!q && !n;
      d.open = q ? n > 0 : wasOpen[i];
      hits += n;
    });
    empty.hidden = !q || hits > 0;
    empty.textContent = q && !hits ? "No waters match \u201c" + input.value.trim() + "\u201d yet." : "";
  }
  regions.forEach(function (d, i) { d.addEventListener("toggle", function () { if (!input.value) wasOpen[i] = d.open; }); });
  input.addEventListener("input", paint);
  input.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !input.value.trim()) return;
    var top = links.filter(function (a) { return !a.parentNode.hidden; })[0];
    if (top) { e.preventDefault(); top.click(); }
  });
})();
