/**
 * The Night Bite: "Bait nearby" card on each lake home.
 * Reads data/bait-shops.json and shows the closest bait and tackle shops for the active lake
 * (window.NightBiteLake.id): three rows, the rest under "More shops". No hours, on purpose.
 * A lake with no confirmed shop gets a calm "No shops confirmed yet" line. To add a lake, add its id
 * and shops to data/bait-shops.json; nothing here changes.
 */
(function () {
  var card = document.getElementById("bait-nearby");
  if (!card) return;
  var list = card.querySelector(".bait-list");
  var more = card.querySelector(".bait-more");
  var moreList = card.querySelector(".bait-more-list");
  var status = card.querySelector(".bait-status");
  var tell = card.querySelector(".bait-tell");
  var SHOW = 3;
  var L = window.NightBiteLake || {};
  var id = L.id || "hoover";
  var short = (L.cfg && (L.cfg.short || L.cfg.name)) || "the lake";

  if (tell) {
    tell.href = "mailto:contact@nightbiteoh.com?subject=" + encodeURIComponent("Bait shop near " + short);
  }

  function row(s) {
    var li = document.createElement("li");
    li.className = "bait-row";
    var info = document.createElement("div");
    info.className = "bait-info";
    var name = document.createElement("span");
    name.className = "bait-name";
    name.textContent = s.name;
    var time = document.createElement("span");
    time.className = "bait-time";
    time.textContent = "about " + s.min + " min";
    info.appendChild(name);
    info.appendChild(time);
    var a = document.createElement("a");
    a.className = "btn btn-ghost bait-go";
    a.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(s.name + " " + s.address);
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Directions";
    a.setAttribute("aria-label", "Directions to " + s.name + " (opens Google Maps)");
    li.appendChild(info);
    li.appendChild(a);
    return li;
  }

  function none() {
    list.hidden = true;
    more.hidden = true;
    status.textContent = "No shops confirmed yet near " + short + ".";
    status.hidden = false;
    card.setAttribute("data-state", "none");
  }

  fetch("data/bait-shops.json")
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      var shops = (d && d.lakes && d.lakes[id]) || [];
      if (!shops.length) return none();
      list.textContent = "";
      moreList.textContent = "";
      shops.forEach(function (s, i) { (i < SHOW ? list : moreList).appendChild(row(s)); });
      list.hidden = false;
      more.hidden = shops.length <= SHOW;
      status.hidden = true;
      card.setAttribute("data-state", "ready");
    })
    .catch(function () {
      list.hidden = true;
      more.hidden = true;
      status.textContent = "Shop list didn't load. Try again when you have signal.";
      status.hidden = false;
      card.setAttribute("data-state", "error");
    });
})();
