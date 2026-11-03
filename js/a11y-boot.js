/* The Night Bite: display settings, applied before first paint. Loaded sync in <head> (the CSP forbids inline script).
 * Reads localStorage "nb-a11y" and sets data attributes on <html>; css/styles.css does the rest. The panel is js/a11y.js.
 *   data-text     sm | lg | xl            (absent = default size)
 *   data-font     readable                (phone's own system font for text and UI; lg and xl turn it on too)
 *   data-motion   reduce                  (also makes matchMedia('(prefers-reduced-motion: reduce)') report true)
 *   data-contrast more                    (high contrast, still navy and cream)
 *   data-light    reserved for red-light mode (S3b); accepted and set, not styled yet
 */
(function (d) {
  var KEY = "nb-a11y", OK = { text: ["sm", "lg", "xl"], font: ["readable"], motion: ["reduce"], contrast: ["more"], light: ["red"] };
  function read() { try { var s = JSON.parse(localStorage.getItem(KEY) || "{}"); return s && typeof s === "object" ? s : {}; } catch (e) { return {}; } }
  function apply(s) {
    var h = d.documentElement;
    for (var k in OK) { if (OK[k].indexOf(s[k]) >= 0) h.setAttribute("data-" + k, s[k]); else h.removeAttribute("data-" + k); }
    if (s.text === "lg" || s.text === "xl") h.setAttribute("data-font", "readable");
  }
  var mm = window.matchMedia;
  if (mm) window.matchMedia = function (q) {
    if (/prefers-reduced-motion:\s*reduce/.test(q) && d.documentElement.getAttribute("data-motion") === "reduce") {
      var n = function () {};
      return { matches: true, media: q, onchange: null, addEventListener: n, removeEventListener: n, addListener: n, removeListener: n, dispatchEvent: function () { return false; } };
    }
    return mm.call(window, q);
  };
  window.NB_A11Y = { KEY: KEY, OK: OK, read: read, apply: apply,
    save: function (s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} apply(s); } };
  apply(read());
})(document);
