// Coming-soon page: products the shop will release soon, with a countdown to each release date.
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var T = function (k, v) { return window.MHT.t(k, undefined, v); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  window.MHT.init();
  window.MHFB.load().then(function (c) {
    if (!c) return [];
    return c.fs.getDocs(c.fs.query(c.fs.collection(c.db, "upcoming"), c.fs.where("published", "==", true))).then(function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); });
  }).catch(function () { return []; }).then(function (list) {
    $("#soon-loading").hidden = true;
    list = window.MHSoon.sort(list);
    $("#soon-empty").hidden = list.length > 0;
    $("#soon-grid").innerHTML = list.map(window.MHSoon.card).join("");
    window.MHSoon.clocks();
    window.FX.observe();
  });
})();
