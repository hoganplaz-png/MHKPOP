// Extra pages built on the admin page (活動頁面): /p/<name>
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var T = function (k, v) { return window.MHT.t(k, undefined, v); };
  var S = window.SETTINGS || {};
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var money = function (n) { return "HK$" + n; };
  function img(v) { return /^data:image\/(jpeg|png|webp);base64,/.test(v || "") ? v : ""; }
  function link(t) {
    t = String(t || "");
    if (t === "ig") return "https://www.instagram.com/" + S.instagram + "/";
    if (t === "#order") return "/checkout.html";
    if (t.charAt(0) === "#") return "/" + t;
    return /^(https:\/\/|\/)/.test(t) ? t : "";
  }
  var attrs = function (h) { return /^https:\/\//.test(h) ? ' target="_blank" rel="noopener"' : ""; };
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function priceOf(p) { var sp = p.salePrice; return sp !== undefined && sp !== null && sp !== "" && isFinite(Number(sp)) && (!p.saleEnds || today() <= p.saleEnds) ? Number(sp) : Number(p.price) || 0; }

  var slug = decodeURIComponent((location.pathname.replace(/^\/p\//, "").replace(/\.html$/, "").replace(/\/+$/, "") || new URLSearchParams(location.search).get("p") || "")).toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) slug = "";

  function productCard(p) {
    var n = priceOf(p), o = Number(p.price) || 0;
    var sold = p.status === "sold" || (typeof p.stock === "number" && p.stock <= 0);
    var im = img(p.image);
    return '<a class="pcard reveal' + (sold ? " is-sold" : "") + '" href="/checkout.html"><div class="pc-img">' + (im ? '<img src="' + esc(im) + '" alt="' + esc(p.group + " " + p.name) + '" loading="lazy">' : '<div class="soon-ph">' + esc(p.group) + "</div>") + (n < o ? '<span class="tag">' + esc(T("shelf.saleTag")) + "</span>" : "") + "</div>" +
      '<div class="pc-body"><span class="caps">' + esc(p.group) + "</span><b>" + esc(p.name) + '</b><span class="price">' + (n < o ? '<s class="was">' + money(o) + "</s> " : "") + money(n) + "</span>" +
      '<span class="pc-go">' + esc(sold ? T("shelf.soldFoot") : T("shelf.orderLink")) + "</span></div></a>";
  }

  function render(page, products) {
    document.title = page.title + " · MHKPOP";
    var meta = document.querySelector('meta[name="description"]') || document.head.appendChild(Object.assign(document.createElement("meta"), { name: "description" }));
    meta.content = page.subtitle || page.title;
    $("#pg-h1").textContent = page.title;
    if (page.subtitle) { $("#pg-sub").textContent = page.subtitle; $("#pg-sub").hidden = false; }
    var bn = img(page.banner); if (bn) { $("#pg-banner").innerHTML = '<img src="' + esc(bn) + '" alt="">'; $("#pg-banner").hidden = false; }
    var byId = {}; products.forEach(function (p) { byId[p.id] = p; });
    $("#pg-blocks").innerHTML = (page.blocks || []).map(function (b) {
      var al = b.align === "center" ? " center" : "";
      if (b.type === "heading") return "<h2 class=\"blk-out reveal" + al + (b.size === "m" ? " m" : "") + '">' + esc(b.text) + "</h2>";
      if (b.type === "text") return '<p class="blk-out reveal blk-text' + al + '">' + esc(b.text) + "</p>";
      if (b.type === "image") {
        var im = img(b.image); if (!im) return ""; var l = link(b.link);
        var tag = '<figure class="blk-out reveal blk-img w-' + esc(b.w || "full") + '"><img src="' + esc(im) + '" alt="' + esc(b.caption || "") + '" loading="lazy">' + (b.caption ? "<figcaption>" + esc(b.caption) + "</figcaption>" : "") + "</figure>";
        return l ? '<a href="' + esc(l) + '"' + attrs(l) + ">" + tag + "</a>" : tag;
      }
      if (b.type === "products") {
        var items = (b.ids || []).map(function (id) { return byId[id]; }).filter(function (p) { return p && (p.status !== "pending" || (p.channels || []).indexOf("preorder") >= 0); });
        if (!items.length) return "";
        return '<section class="blk-out">' + (b.title ? '<h2 class="blk-title">' + esc(b.title) + "</h2>" : "") + '<div class="pgrid cols-' + (Number(b.cols) || 3) + '">' + items.map(productCard).join("") + "</div></section>";
      }
      if (b.type === "button") {
        var h = link(b.target); if (!h || !b.label) return "";
        return '<p class="blk-out reveal' + al + '"><a class="btn ' + (b.style === "line" ? "btn-line" : "btn-solid") + ' btn-lg" href="' + esc(h) + '"' + attrs(h) + ">" + esc(b.label) + "</a></p>";
      }
      if (b.type === "countdown") return '<div class="blk-out reveal blk-cd">' + (b.label ? "<p><b>" + esc(b.label) + "</b></p>" : "") + '<div class="cdown" data-when="' + esc(b.endsAt) + '" data-ended="' + esc(b.endedText || "") + '"></div></div>';
      if (b.type === "code") return '<div class="blk-out reveal blk-code">' + (b.label ? "<p>" + esc(b.label) + "</p>" : "") + '<button type="button" class="code-box" data-code="' + esc(b.code) + '" aria-label="' + esc(T("pg.copy")) + '"><b>' + esc(b.code) + "</b><small>" + esc(T("pg.copy")) + "</small></button></div>";
      if (b.type === "divider") return '<hr class="blk-out blk-hr">';
      return "";
    }).join("");
    Array.prototype.forEach.call(document.querySelectorAll(".cdown[data-when]"), function (el) { window.FX.countdown(el, el.dataset.when, el.dataset.ended, { d: T("soon.d"), h: T("soon.h"), m: T("soon.m"), s: T("soon.s") }); });
    window.FX.observe();
    $("#pg-body").hidden = false;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".code-box"); if (!b) return;
    var done = function () { var s = b.querySelector("small"); s.textContent = T("pg.copied"); setTimeout(function () { s.textContent = T("pg.copy"); }, 1800); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(b.dataset.code).then(done, function () {}); else done();
  });

  window.MHT.init();
  var missing = function () { $("#pg-loading").hidden = true; $("#pg-missing").hidden = false; };
  if (!slug) { missing(); return; }
  window.MHFB.load().then(function (c) {
    if (!c) throw new Error("no firebase");
    return Promise.all([
      c.fs.getDoc(c.fs.doc(c.db, "pages", slug)).then(function (d) { return d.exists() ? d.data() : null; }),
      c.fs.getDocs(c.fs.collection(c.db, "products")).then(function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }).catch(function () { return []; })
    ]);
  }).then(function (r) {
    $("#pg-loading").hidden = true;
    if (!r[0]) return missing();
    render(r[0], r[1]);
  }).catch(missing);
})();
