/**
 * The Night Bite: one shared auto refresh for live data (conditions, alerts, pool readout, pool trend).
 * Every 15 minutes while the tab is visible, plus right away when the tab comes back into view
 * and the last refresh is 15 minutes old or more. Nothing is fetched while the tab is hidden.
 * Scripts register with NightBiteRefresh.add(name, fn); fn(force) re-fetches and re-renders.
 * The first load is done by each script itself, so add() only stamps the time.
 */
(function () {
  if (window.NightBiteRefresh) return;
  var EVERY = 15 * 60 * 1000;
  var tasks = [];
  var last = Date.now();
  var stats = { runs: 0, lastRun: last, byTask: {} };

  function runAll(reason) {
    if (document.hidden) return;
    last = Date.now();
    stats.runs++;
    stats.lastRun = last;
    stats.lastReason = reason;
    tasks.forEach(function (t) {
      stats.byTask[t.name] = (stats.byTask[t.name] || 0) + 1;
      try { t.fn(true); } catch (e) {}
    });
  }

  // a short tick, so a timer that was throttled in a background tab still catches up on time
  setInterval(function () {
    if (!document.hidden && Date.now() - last >= EVERY) runAll("timer");
  }, 60 * 1000);

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && Date.now() - last >= EVERY) runAll("visible");
  });

  window.NightBiteRefresh = {
    EVERY: EVERY,
    stats: stats,
    add: function (name, fn) { tasks.push({ name: name, fn: fn }); },
    run: runAll
  };
})();
