// Coming-soon cards and countdown clocks, shared by the 即將發售 page and the home page teaser.
(function () {
  "use strict";
  var T = function (k, v) { return window.MHT.t(k, undefined, v); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function img(v) { return /^data:image\/(jpeg|png|webp);base64,/.test(v || "") ? v : ""; }
  function href(l) { l = String(l || ""); if (l.charAt(0) === "#") return "/" + l; return /^(https:\/\/|\/)/.test(l) ? l : ""; }
  window.MHSoon = {
    card: function (u) {
      var today = (function () { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); })(), released = u.releaseDate && u.releaseDate <= today;
      var when = u.releaseDate
        ? (released ? '<div class="soon-when">' + esc(T("soon.released")) + "</div>" : '<div class="soon-when"><div class="cdown" data-when="' + esc(u.releaseDate) + '"></div><small class="hint">' + esc(T("soon.when", { date: u.releaseDate })) + "</small></div>")
        : '<div class="soon-when">' + esc(u.releaseText ? T("soon.when", { date: u.releaseText }) : T("soon.tbd")) + "</div>";
      var l = href(u.link), ext = /^https:\/\//.test(l);
      var im = img(u.image);
      return '<article class="soon-card reveal"><div class="soon-img">' + (im ? '<img src="' + esc(im) + '" alt="' + esc((u.group ? u.group + " " : "") + u.title) + '" loading="lazy">' : '<div class="soon-ph">' + esc(u.group || "MHKPOP") + "</div>") + "</div>" +
        '<div class="soon-body">' + (u.group ? '<div class="soon-group caps">' + esc(u.group) + "</div>" : "") + "<h3>" + esc(u.title) + "</h3>" +
        (u.storeOnly ? '<div class="soon-badges"><span class="chan chan-stock">' + esc(T("soon.storeOnly")) + "</span></div>" : "") +
        (u.note ? '<p class="soon-note">' + esc(u.note) + "</p>" : "") + when +
        '<div class="soon-foot">' + (u.price ? '<span class="price">' + esc(T("soon.price", { price: u.price })) + "</span>" : "<span></span>") +
        (l && u.linkLabel ? '<a class="btn btn-line" href="' + esc(l) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" + esc(u.linkLabel) + "</a>" : "") + "</div></div></article>";
    },
    sort: function (list) { return list.slice().sort(function (a, b) { return (a.releaseDate || "9999").localeCompare(b.releaseDate || "9999") || String(a.title).localeCompare(String(b.title)); }); },
    clocks: function (root) {
      Array.prototype.forEach.call((root || document).querySelectorAll(".cdown[data-when]"), function (el) {
        if (el.dataset.on) return; el.dataset.on = "1";
        window.FX.countdown(el, el.dataset.when, T("soon.released"), { d: T("soon.d"), h: T("soon.h"), m: T("soon.m"), s: T("soon.s") });
      });
    }
  };

})();
