/**
 * The Night Bite: 7 day pool level trend for the home pool card.
 * Same USGS gauge as js/usgs.js: 03228400 (Hoover Reservoir at Central College), parameter 62614
 * (lake elevation, ft NGVD29), period P7D. Provisional data. Hidden if USGS can't be reached.
 */
(function () {
  var box = document.getElementById("pool-trend");
  if (!box || !window.fetch) return;
  var URL = "https://waterservices.usgs.gov/nwis/iv/?format=json&sites=03228400&parameterCd=62614&period=P7D";
  var NS = "http://www.w3.org/2000/svg";
  var W = 280, H = 56, PAD = 4;

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function day(iso) {
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(iso));
  }

  fetch(URL)
    .then(function (r) { if (!r.ok) throw new Error("usgs " + r.status); return r.json(); })
    .then(function (json) {
      var ts = json.value.timeSeries[0].values[0].value;
      var pts = [];
      ts.forEach(function (v) {
        var n = parseFloat(v.value);
        if (isFinite(n) && n > -9999) pts.push({ t: new Date(v.dateTime).valueOf(), v: n, iso: v.dateTime });
      });
      if (pts.length < 12) throw new Error("too few");
      var t0 = pts[0].t, t1 = pts[pts.length - 1].t;
      var lo = Infinity, hi = -Infinity;
      pts.forEach(function (p) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); });
      var span = Math.max(hi - lo, 0.2);             // keep tiny wobbles from looking like cliffs
      var mid = (hi + lo) / 2;
      lo = mid - span / 2; hi = mid + span / 2;
      function x(t) { return PAD + (t - t0) / (t1 - t0) * (W - 2 * PAD); }
      function y(v) { return PAD + (hi - v) / (hi - lo) * (H - 2 * PAD); }

      var svg = box.querySelector("svg");
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      // midnight ET ticks
      var A = window.NightBiteAstro;
      if (A) {
        var m = A.etMidnight(new Date(t0)).valueOf() + 864e5;
        for (; m < t1; m += 864e5) {
          var mm = A.etMidnight(new Date(m + 3 * 36e5)).valueOf();   // DST safe
          svg.appendChild(el("line", { x1: x(mm), x2: x(mm), y1: 0, y2: H, class: "pool-trend-tick" }));
        }
      }
      var d = "";
      pts.forEach(function (p, i) { d += (i ? "L" : "M") + x(p.t).toFixed(1) + " " + y(p.v).toFixed(1); });
      svg.appendChild(el("path", { d: d, class: "pool-trend-line" }));
      var last = pts[pts.length - 1];
      svg.appendChild(el("rect", { x: (x(last.t) - 3).toFixed(1), y: (y(last.v) - 3).toFixed(1), width: 6, height: 6, class: "pool-trend-now" }));

      var change = last.v - pts[0].v;
      var abs = Math.abs(change).toFixed(2);
      var word = Math.abs(change) < 0.05 ? "Steady" : change > 0 ? "Rising" : "Falling";
      var deltaEl = document.getElementById("pool-trend-delta");
      deltaEl.textContent = (change > 0 ? "+" : change < 0 ? "-" : "") + abs;
      var u = document.createElement("span");
      u.className = "pool-trend-unit";
      u.textContent = "ft";
      deltaEl.appendChild(u);
      document.getElementById("pool-trend-word").textContent = word;
      box.querySelector(".pool-trend-from").textContent = day(pts[0].iso);
      svg.setAttribute("aria-label", "Pool level over the last 7 days: " + word.toLowerCase() + ", " +
        (change >= 0 ? "up " : "down ") + abs + " ft, from " + pts[0].v.toFixed(2) + " to " + last.v.toFixed(2) + " ft.");
      box.hidden = false;
    })
    .catch(function () { box.hidden = true; });
})();
