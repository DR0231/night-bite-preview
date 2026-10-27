/**
 * The Night Bite: two buttons under the home "Right now" strip.
 *
 * Share tonight: draws a "Tonight at a glance" PNG on the phone (canvas) from what the page already shows: the lake
 * level in the strip (USGS or USACE gauge, with its "Checked" time) and tonight's bite rating (rule of thumb from the
 * NWS forecast, with its "Checked" time). Missing values print as "--". Shares the PNG with the Web Share API where
 * the browser can share files, otherwise offers a download. Nothing leaves the phone unless you share it.
 *
 * Remind me tonight: no push server, so it is honest about what a web app can do:
 *   1. Add to calendar: a .ics file with an alarm at the chosen time. Works everywhere, app open or not.
 *   2. Notify on this phone: asks notification permission, then
 *      · where the browser supports Notification Triggers (TimestampTrigger), schedules it with the service worker,
 *        so it can go off with the app closed;
 *      · otherwise keeps a timer while The Night Bite is open, and fires it late (up to an hour) if you reopen
 *        the app after the time passed. Phones often pause web apps in the background, so this is best effort.
 *   No third-party push service, no server, nothing stored outside localStorage on the phone.
 */
(function () {
  var row = document.getElementById("glance-actions");
  var LK = window.NightBiteLake, LS = window.NightBiteLakes;
  if (!row || !LK || !LS) return;
  var cfg = LK.cfg, lakeName = cfg.short === "Buckeye" ? "Buckeye Lake" : cfg.name;
  var home = LS.homeFor ? LS.homeFor(LK.id) : location.href.split("#")[0];
  var REMIND_KEY = "nb-remind";
  row.hidden = false;

  function $(s, r) { return (r || document).querySelector(s); }
  function txt(s) { var n = $(s); return n ? n.textContent.replace(/\s+/g, " ").trim() : ""; }
  function etNow() {
    try { return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date()) + " ET"; }
    catch (e) { return new Date().toLocaleString(); }
  }
  function etDate() {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  /* ------------------------------------------------------------------ share card ------------------------------------------------------------------ */
  function readings() {
    var poolCell = $('[data-glance="pool"]'), biteCell = $('[data-glance="bite"]');
    var poolOk = poolCell && !poolCell.closest(".glance-cell").hasAttribute("data-empty");
    var biteOk = biteCell && !biteCell.closest(".glance-cell").hasAttribute("data-empty");
    var checked = txt("#correction-checked time");
    var m = /Checked (\d{1,2}:\d{2} [AP]M) ET/.exec(txt("#conditions .cond-status"));
    return {
      level: poolOk ? txt('[data-glance="pool"]') : "--",
      levelSub: poolOk ? txt('[data-glance="pool-sub"]') : "No reading right now",
      bite: biteOk ? txt('[data-glance="bite"]') : "--",
      biteSub: biteOk ? txt('[data-glance="bite-sub"]') : "Forecast not available",
      levelSrc: (cfg.pool && cfg.pool.srcName ? cfg.pool.srcName + " gauge" : "Gauge") + (poolOk && checked ? ", checked " + checked : poolOk ? "" : ", no reading"),
      biteSrc: "Rule of thumb from the NWS forecast" + (biteOk && m ? ", checked " + m[1] + " ET" : biteOk ? "" : ", not loaded"),
      made: etNow()
    };
  }
  function img(src) {
    return new Promise(function (ok) { var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src; });
  }
  function fit(ctx, text, max, size, family) {
    var s = size;
    do { ctx.font = s + "px " + family; s -= 2; } while (ctx.measureText(text).width > max && s > 12);
    return text;
  }
  function draw() {
    var r = readings();
    var W = 1200, H = 630;
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var ctx = c.getContext("2d");
    var fonts = document.fonts && document.fonts.load ? Promise.all([
      document.fonts.load('64px "Night Bite Pixel"'), document.fonts.load('28px "Pixelify Sans"'), document.fonts.load('24px "Source Serif 4"')
    ]).catch(function () {}) : Promise.resolve();
    return Promise.all([fonts, img(LS.base + "assets/lantern.svg"), img(LS.base + "assets/horizon-tile.png")]).then(function (a) {
      var lantern = a[1], tile = a[2];
      var NAVY = "#0a1628", MID = "#122038", LIGHT = "#1a2e4a", AMBER = "#f0a830", CREAM = "#f5edd8", CREAM2 = "#e8d5a3", MUTED = "#8a9aaa";
      var HEAD = '"Night Bite Pixel", "Pixelify Sans", monospace', DISP = '"Pixelify Sans", monospace', BODY = '"Source Serif 4", Georgia, serif';
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = NAVY; ctx.fillRect(0, 0, W, H);
      if (tile) { ctx.globalAlpha = 0.9; for (var x = 0; x < W; x += tile.width * 2) ctx.drawImage(tile, x, H - tile.height * 2, tile.width * 2, tile.height * 2); ctx.globalAlpha = 1; }
      if (lantern) ctx.drawImage(lantern, 64, 50, 56, 72);
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = CREAM; ctx.font = "52px " + HEAD; ctx.fillText("The Night Bite", 140, 104);
      ctx.fillStyle = AMBER; ctx.font = "28px " + DISP; ctx.fillText(fit(ctx, "Tonight at " + lakeName, 1000, 30, DISP), 64, 172);
      // two readouts
      function block(x, label, value, sub) {
        ctx.fillStyle = MID; ctx.fillRect(x, 204, 516, 196);
        ctx.fillStyle = LIGHT; ctx.fillRect(x, 204, 516, 2);
        ctx.fillStyle = MUTED; ctx.font = "20px " + DISP; ctx.fillText(label.toUpperCase(), x + 28, 246);
        ctx.fillStyle = value === "--" ? MUTED : AMBER; fit(ctx, value, 460, 72, HEAD); ctx.fillText(value, x + 28, 330);
        ctx.fillStyle = CREAM2; fit(ctx, sub, 460, 24, DISP); ctx.fillText(sub, x + 28, 374);
      }
      block(64, "Lake level", r.level, r.levelSub);
      block(620, "Tonight\u2019s bite", r.bite, r.biteSub);
      ctx.fillStyle = CREAM2; ctx.font = "21px " + BODY;
      ctx.fillText(fit(ctx, "Level: " + r.levelSrc + ".", 1072, 21, BODY), 64, 440);
      ctx.fillText(fit(ctx, "Bite: " + r.biteSrc + ". A guide, not a promise.", 1072, 21, BODY), 64, 470);
      ctx.fillStyle = MUTED; ctx.font = "19px " + BODY;
      ctx.fillText(fit(ctx, "Card made " + r.made + ". Unofficial personal hub.", 1072, 19, BODY), 64, 500);
      ctx.fillStyle = AMBER; ctx.font = "22px " + DISP;
      var url = home.replace(/^https?:\/\//, "");
      ctx.fillText(url, W - 64 - ctx.measureText(url).width, 104);
      return { canvas: c, r: r };
    });
  }

  var shareDlg = document.getElementById("tt-share");
  var shareImg = $("#tt-share-img"), shareBtn = $("#tt-share-go"), dlLink = $("#tt-share-dl"), shareMsg = $("#tt-share-msg");
  var lastFile = null;
  function openShare() {
    if (!shareDlg) return;
    shareMsg.textContent = "Drawing the card\u2026";
    shareBtn.hidden = true;
    if (shareDlg.showModal) shareDlg.showModal(); else shareDlg.setAttribute("open", "");
    draw().then(function (o) {
      var url = o.canvas.toDataURL("image/png");
      shareImg.src = url;
      var name = "night-bite-" + LK.id + "-" + etDate() + ".png";
      dlLink.href = url; dlLink.download = name;
      shareMsg.textContent = "Made from this page: " + o.r.levelSrc + "; " + o.r.biteSrc + ".";
      o.canvas.toBlob(function (b) {
        if (!b || !window.File) return;
        lastFile = new File([b], name, { type: "image/png" });
        try { shareBtn.hidden = !(navigator.canShare && navigator.canShare({ files: [lastFile] })); } catch (e) { shareBtn.hidden = true; }
      }, "image/png");
    });
  }
  if (shareBtn) shareBtn.addEventListener("click", function () {
    if (!lastFile) return;
    navigator.share({ files: [lastFile], title: "Tonight at " + lakeName, text: "Tonight at " + lakeName + " on The Night Bite: " + home })
      .catch(function () {});
  });

  /* ------------------------------------------------------------------ reminder ------------------------------------------------------------------ */
  var remDlg = document.getElementById("tt-remind");
  var sel = $("#tt-remind-time"), remMsg = $("#tt-remind-msg"), notifyBtn = $("#tt-remind-notify"), cancelBtn = $("#tt-remind-cancel");
  var timer = null;
  var canNotify = "Notification" in window;
  var canTrigger = canNotify && "showTrigger" in Notification.prototype && typeof window.TimestampTrigger === "function";
  function at(h, mi) { var d = new Date(); d.setHours(h, mi, 0, 0); var tomorrow = d < new Date(); if (tomorrow) d.setDate(d.getDate() + 1); return { d: d, tomorrow: tomorrow }; }
  function label(d) { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
  function buildTimes() {
    sel.textContent = "";
    var sun = /(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(txt('[data-cond="sunset"] .cond-value'));
    var opts = [];
    if (sun) {
      var h = (+sun[1] % 12) + (/p/i.test(sun[3]) ? 12 : 0);
      var t = at(h, +sun[2]);
      opts.push({ d: t.d, text: "At sunset, " + label(t.d) + (t.tomorrow ? " (tomorrow)" : "") });
    }
    [18, 19, 20, 21, 22, 23].forEach(function (h) { var t = at(h, 0); opts.push({ d: t.d, text: label(t.d) + (t.tomorrow ? " (tomorrow)" : "") }); });
    opts.sort(function (a, b) { return a.d - b.d; });
    opts.forEach(function (o, i) { var op = document.createElement("option"); op.value = String(o.d.valueOf()); op.textContent = o.text; sel.appendChild(op); });
  }
  function title() { return "Night fishing check: " + lakeName; }
  function body() { return "Check tonight\u2019s level and bite before you head out."; }
  function ics(ts) {
    function u(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
    var s = new Date(ts), e = new Date(ts + 30 * 6e4);
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Night Bite//Remind me tonight//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT", "UID:" + ts + "-" + LK.id + "@nightbiteoh.com", "DTSTAMP:" + u(new Date()), "DTSTART:" + u(s), "DTEND:" + u(e),
      "SUMMARY:" + title(), "DESCRIPTION:" + body() + " " + home, "URL:" + home,
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + title(), "TRIGGER:PT0S", "END:VALARM", "END:VEVENT", "END:VCALENDAR"];
    return lines.join("\r\n") + "\r\n";
  }
  function fire(note) {
    var opts = { body: body(), tag: "nb-remind", icon: LS.base + "assets/icons/icon-192.png", data: { url: home } };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(function (reg) { reg.showNotification(title(), opts); });
    } else { try { new Notification(title(), opts); } catch (e) {} }
    try { localStorage.removeItem(REMIND_KEY); } catch (e) {}
    status();
  }
  function arm(rec) {
    clearTimeout(timer);
    var wait = rec.at - Date.now();
    if (wait <= 0) { if (wait > -36e5 && Notification.permission === "granted") fire(); else { try { localStorage.removeItem(REMIND_KEY); } catch (e) {} } return; }
    if (wait < 2147483647) timer = setTimeout(fire, wait);
  }
  function saved() { try { return JSON.parse(localStorage.getItem(REMIND_KEY) || "null"); } catch (e) { return null; } }
  function status() {
    var rec = saved();
    if (!remMsg) return;
    if (rec && rec.at > Date.now()) {
      remMsg.textContent = "Reminder set for " + label(new Date(rec.at)) + " on this phone" +
        (rec.trigger ? ". It is scheduled with the app, so it can go off while the app is closed." : ". It goes off only while The Night Bite is open. For a sure thing, add it to your calendar too.");
      cancelBtn.hidden = false;
    } else {
      remMsg.textContent = canNotify ? (canTrigger ? "This phone can schedule a reminder that goes off with the app closed." : "On this phone a reminder can only go off while The Night Bite is open. The calendar option always works.")
        : "This browser can\u2019t show notifications. The calendar option works everywhere.";
      cancelBtn.hidden = true;
    }
    if (notifyBtn) notifyBtn.hidden = !canNotify;
  }
  function openRemind() {
    if (!remDlg) return;
    buildTimes(); status();
    if (remDlg.showModal) remDlg.showModal(); else remDlg.setAttribute("open", "");
  }
  var calBtn = $("#tt-remind-ics");
  if (calBtn) calBtn.addEventListener("click", function () {
    var ts = +sel.value;
    var url = URL.createObjectURL(new Blob([ics(ts)], { type: "text/calendar;charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url; a.download = "night-bite-" + LK.id + "-reminder.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    remMsg.textContent = "Calendar file saved. Open it to add the reminder at " + label(new Date(ts)) + ".";
  });
  if (notifyBtn) notifyBtn.addEventListener("click", function () {
    var ts = +sel.value;
    Notification.requestPermission().then(function (p) {
      if (p !== "granted") { remMsg.textContent = "Notifications are off for this site, so use the calendar option instead."; return; }
      var rec = { at: ts, lake: LK.id, trigger: false };
      var done = function () { try { localStorage.setItem(REMIND_KEY, JSON.stringify(rec)); } catch (e) {} if (!rec.trigger) arm(rec); status(); };
      if (canTrigger && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then(function (reg) {
          return reg.showNotification(title(), { body: body(), tag: "nb-remind", icon: LS.base + "assets/icons/icon-192.png", data: { url: home }, showTrigger: new window.TimestampTrigger(ts) });
        }).then(function () { rec.trigger = true; done(); }, done);
      } else done();
    });
  });
  if (cancelBtn) cancelBtn.addEventListener("click", function () {
    clearTimeout(timer);
    try { localStorage.removeItem(REMIND_KEY); } catch (e) {}
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(function (reg) {
      if (reg && reg.getNotifications) reg.getNotifications({ tag: "nb-remind", includeTriggered: true }).then(function (ns) { ns.forEach(function (n) { n.close(); }); });
    });
    status();
  });
  // re-arm a page-open reminder after a reload
  var rec0 = saved();
  if (rec0 && !rec0.trigger && canNotify) arm(rec0);

  row.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-act]");
    if (!b) return;
    if (b.getAttribute("data-act") === "share") openShare(); else openRemind();
  });
  document.querySelectorAll(".tt-close").forEach(function (b) {
    b.addEventListener("click", function () { var d = b.closest("dialog"); if (d.close) d.close(); else d.removeAttribute("open"); });
  });
})();
