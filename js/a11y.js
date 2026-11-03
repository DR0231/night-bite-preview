/* The Night Bite: Display panel (text size, readable text, less motion, high contrast). Settings live in
 * localStorage "nb-a11y" on this device only; js/a11y-boot.js applies them before paint. Any [data-a11y-open]
 * button opens the panel (More menu and footer). Red-light mode (S3b) goes in the [data-a11y-slot="light"] row.
 */
(function () {
  var A = window.NB_A11Y; if (!A) return;
  var dlg, lastBtn;
  var SIZES = [["sm", "Small"], ["", "Default"], ["lg", "Large"], ["xl", "Extra large"]];
  var TOGGLES = [
    ["font", "readable", "Readable text", "Your phone\u2019s own font for text, menus and buttons. Large sizes turn it on."],
    ["motion", "reduce", "Less motion", "No sliding or fading."],
    ["contrast", "more", "High contrast", "Brighter text and borders."]
  ];
  function el(t, a, kids) {
    var e = document.createElement(t);
    for (var k in a || {}) { if (k === "text") e.textContent = a[k]; else e.setAttribute(k, a[k]); }
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function build() {
    dlg = el("dialog", { id: "a11y-panel", "class": "a11y-panel", "aria-labelledby": "a11y-title" });
    var form = el("form", { method: "dialog", "class": "a11y-form" });
    form.appendChild(el("h2", { id: "a11y-title", "class": "a11y-title", text: "Display" }));
    var fs = el("fieldset", { "class": "a11y-sizes" }, [el("legend", { text: "Text size" })]);
    var row = el("div", { "class": "a11y-seg" });
    SIZES.forEach(function (s) {
      var id = "a11y-size-" + (s[0] || "default");
      var inp = el("input", { type: "radio", name: "a11y-text", id: id, value: s[0] });
      row.appendChild(el("label", { "for": id, "class": "a11y-seg-opt", "data-size": s[0] || "default" }, [inp, el("span", { text: s[1] })]));
    });
    fs.appendChild(row); form.appendChild(fs);
    TOGGLES.forEach(function (t) {
      var id = "a11y-" + t[0];
      var inp = el("input", { type: "checkbox", id: id, "data-key": t[0], value: t[1], "aria-describedby": id + "-note" });
      form.appendChild(el("div", { "class": "a11y-row" }, [
        el("label", { "for": id, "class": "a11y-toggle" }, [inp, el("span", { "class": "a11y-toggle-text", text: t[2] })]),
        el("p", { id: id + "-note", "class": "a11y-note", text: t[3] })
      ]));
    });
    form.appendChild(el("div", { "class": "a11y-row", "data-a11y-slot": "light", hidden: "" }));
    form.appendChild(el("p", { "class": "a11y-saved", text: "Saved on this phone only." }));
    var reset = el("button", { type: "button", "class": "btn btn-ghost a11y-reset", text: "Reset" });
    var done = el("button", { type: "submit", "class": "btn a11y-done", value: "done", text: "Done" });
    form.appendChild(el("div", { "class": "a11y-actions" }, [reset, done]));
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    form.addEventListener("change", function () { A.save(collect(form)); sync(form); });
    reset.addEventListener("click", function () { A.save({}); sync(form); });
    dlg.addEventListener("close", function () { if (lastBtn) lastBtn.focus(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    return form;
  }
  function collect(form) {
    var s = A.read(), r = form.querySelector('input[name="a11y-text"]:checked');
    if (r && r.value) s.text = r.value; else delete s.text;
    form.querySelectorAll("input[data-key]").forEach(function (c) { if (c.checked) s[c.dataset.key] = c.value; else delete s[c.dataset.key]; });
    if ((s.text === "lg" || s.text === "xl") && !s.font) s.font = "readable";
    return s;
  }
  function sync(form) {
    var s = A.read(), big = s.text === "lg" || s.text === "xl";
    form.querySelectorAll('input[name="a11y-text"]').forEach(function (r) { r.checked = r.value === (s.text || ""); });
    form.querySelectorAll("input[data-key]").forEach(function (c) { c.checked = s[c.dataset.key] === c.value; });
    var f = form.querySelector("#a11y-font"); f.disabled = big; if (big) f.checked = true;
    var m = form.querySelector("#a11y-motion"), os = window.matchMedia && matchMedia.call(window, "(prefers-reduced-motion: reduce)").matches && s.motion !== "reduce";
    var note = form.querySelector("#a11y-motion-note");
    note.textContent = os ? "On already, because your phone asks for less motion." : "No sliding or fading.";
  }
  function open(btn) {
    var form = (dlg && dlg.querySelector("form")) || build();
    lastBtn = btn; sync(form);
    var nm = document.getElementById("nav-more-panel"); if (nm && !nm.hidden) { var mb = document.querySelector(".nav-more-btn"); if (mb) mb.click(); lastBtn = mb || btn; }
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    var first = form.querySelector('input[name="a11y-text"]:checked') || form.querySelector("input");
    if (first) first.focus();
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-a11y-open]");
    if (b) { e.preventDefault(); open(b); }
  });
  document.querySelectorAll("[data-a11y-open]").forEach(function (b) { b.hidden = false; });
  window.addEventListener("storage", function (e) { if (e.key === A.KEY) { A.apply(A.read()); if (dlg) sync(dlg.querySelector("form")); } });
})();
