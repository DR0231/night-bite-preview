/* The Night Bite: interface language (draft translations). No third-party code.
 * js/a11y-boot.js sets <html lang> from localStorage "nb-lang" before paint; js/a11y.js loads this file only when a
 * language other than English is picked. The static HTML stays English (SEO and no-JS unchanged).
 * Strings live in data/i18n/<lang>.json as {"_meta": {...}, "strings": {key: text}}; data/i18n/en.json is the source.
 * Matching is by the English text: inside the UI chrome scopes below, a text node, placeholder, aria-label or
 * data-short that equals an English string (or fits a template such as "{time} left") is swapped for the same key in
 * the picked language. A key missing there keeps the English text. Lake names, ramp names, species, levels, rules and
 * regulations are never in the string files, so they always stay as the source publishes them.
 */
(function (d) {
  var SCOPES = ".site-header, .site-footer, .glance, #glance-actions, .a11y-panel, .night-chip, .nws-alert, #my-trips, #add-trip, [data-log-filter], .i18n-draft";
  var ATTRS = ["placeholder", "aria-label", "data-short", "title"];
  var me = d.currentScript, BASE = me ? me.src : location.href;
  var cache = {}, orig = new WeakMap(), attrOrig = new WeakMap(), cur = "en", tbl = null, obs = null, busy = false;
  function load(lang) {
    if (cache[lang]) return cache[lang];
    cache[lang] = fetch(new URL("../data/i18n/" + lang + ".json", BASE).href, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { delete cache[lang]; return { _meta: { lang: lang }, strings: {} }; });
    return cache[lang];
  }
  function norm(s) { return s.replace(/\s+/g, " ").trim(); }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function build(en, tr) {
    var exact = {}, tpl = [];
    Object.keys(en).forEach(function (k) {
      var e = norm(en[k]);
      if (/\{\w+\}/.test(e)) {
        var names = [], re = "^" + esc(e).replace(/\\\{(\w+)\\\}/g, function (m, n) { names.push(n); return "(.+?)"; }) + "$";
        tpl.push({ k: k, re: new RegExp(re), names: names });
      } else if (!(e in exact)) exact[e] = k;
    });
    return { exact: exact, tpl: tpl, tr: tr };
  }
  function lookup(t, s) {
    var n = norm(s); if (!n) return null;
    var k = t.exact[n];
    if (k) return t.tr[k] != null ? t.tr[k] : null;
    for (var i = 0; i < t.tpl.length; i++) {
      var m = n.match(t.tpl[i].re); if (!m) continue;
      var out = t.tr[t.tpl[i].k]; if (out == null) return null;
      t.tpl[i].names.forEach(function (nm, j) { out = out.split("{" + nm + "}").join(m[j + 1]); });
      return out;
    }
    return null;
  }
  function walk(root) {
    var w = d.createTreeWalker(root, NodeFilter.SHOW_TEXT), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function (node) {
      var p = node.parentNode; if (!p || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.nodeName)) return;
      // its own script rewrote the text since we swapped it (a countdown, a state): the new text is the English now
      if (orig.has(node) && node.nodeValue !== node.__nbOut) orig.delete(node);
      var en = orig.has(node) ? orig.get(node) : node.nodeValue;
      if (!norm(en)) return;
      var out = cur === "en" ? null : lookup(tbl, en), want;
      if (out != null) { want = en.match(/^\s*/)[0] + out + en.match(/\s*$/)[0]; orig.set(node, en); node.__nbOut = want; }
      else { want = en; orig.delete(node); }
      if (node.nodeValue !== want) node.nodeValue = want;
    });
    var els = root.querySelectorAll ? [root].concat([].slice.call(root.querySelectorAll("[" + ATTRS.join("],[") + "]"))) : [];
    els.forEach(function (el) {
      if (!el.getAttribute) return;
      var o = attrOrig.get(el) || {};
      ATTRS.forEach(function (a) {
        if (!el.hasAttribute(a)) return;
        var en = a in o ? o[a] : el.getAttribute(a), out = cur === "en" ? null : lookup(tbl, en);
        if (out != null) { o[a] = en; if (el.getAttribute(a) !== out) el.setAttribute(a, out); } else if (a in o) { el.setAttribute(a, o[a]); delete o[a]; }
      });
      attrOrig.set(el, o);
    });
  }
  function scopes() { return [].slice.call(d.querySelectorAll(SCOPES)); }
  function run() { if (busy) return; busy = true; try { scopes().forEach(walk); } finally { busy = false; } }
  function marker(meta) {
    var m = d.getElementById("i18n-draft");
    if (cur === "en") { if (m) m.remove(); return; }
    if (!m) {
      m = d.createElement("p"); m.id = "i18n-draft"; m.className = "i18n-draft"; m.setAttribute("role", "note");
      var tag = d.createElement("span"); tag.className = "i18n-draft-tag";
      var txt = d.createElement("span"); txt.className = "i18n-draft-text";
      m.appendChild(tag); m.appendChild(d.createTextNode(" ")); m.appendChild(txt);
      var main = d.querySelector("main"); if (main) main.insertBefore(m, main.firstChild); else d.body.insertBefore(m, d.body.firstChild);
    }
    // always shows the English words too, so anyone can tell this is a draft
    m.querySelector(".i18n-draft-tag").textContent = (tbl.tr["i18n.draft"] || "Draft translation") + (tbl.tr["i18n.draft"] ? " (Draft translation)" : "");
    m.querySelector(".i18n-draft-text").textContent = tbl.tr["i18n.facts_note"] || "";
    m.dataset.review = (meta && meta.review) || "draft";
  }
  function set(lang) {
    lang = lang || "en";
    return Promise.all([load("en"), lang === "en" ? null : load(lang)]).then(function (r) {
      cur = lang;
      tbl = build(r[0].strings || {}, (r[1] && r[1].strings) || {});
      d.documentElement.lang = lang; d.documentElement.dir = (r[1] && r[1]._meta && r[1]._meta.dir) || "ltr";
      if (lang === "en") d.documentElement.removeAttribute("data-lang"); else d.documentElement.setAttribute("data-lang", lang);
      marker(r[1] && r[1]._meta);
      run();
      if (!obs && window.MutationObserver) {
        obs = new MutationObserver(function () { if (!busy && cur !== "en") { clearTimeout(obs.t); obs.t = setTimeout(run, 30); } });
        obs.observe(d.body, { childList: true, subtree: true, characterData: true });
      }
      d.dispatchEvent(new CustomEvent("nb-lang", { detail: { lang: lang } }));
      return lang;
    });
  }
  window.NB_I18N = { set: set, load: load, current: function () { return cur; } };
  var saved = window.NB_A11Y && NB_A11Y.lang ? NB_A11Y.lang() : "en";
  if (saved !== "en") set(saved);
})(document);
