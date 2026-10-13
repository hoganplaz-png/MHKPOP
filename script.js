(function () {
  "use strict";
  var S = window.SETTINGS || {};
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  function dn(g, n) { g = String(g || "").trim(); n = String(n || "").trim(); return !g || n.toLowerCase().indexOf(g.toLowerCase()) >= 0 ? n : g + " " + n; }
  var money = function (n) { return "HK$" + n; };
  var T = function (k, vars) { return window.MHT.t(k, undefined, vars); };

  // product rules, the cart and the sleeve colours are shared with the product page (shop-core.js)
  var M = window.MHShop;
  var kindOf = M.kindOf;

  // ---------- shop details from settings.js ----------
  var igUrl;
  function bindSettings() {
    igUrl = "https://www.instagram.com/" + S.instagram + "/";
    $$("[data-s]").forEach(function (el) { if (S[el.dataset.s] != null) el.textContent = S[el.dataset.s]; });
    $$("[data-s-ig]").forEach(function (a) { a.href = igUrl; a.textContent = "@" + S.instagram; });
    var addr = $("#address"); if (addr) addr.innerHTML = (S.addressLines || []).map(esc).join("<br>");
    var stall = $("#stall"); if (stall) stall.innerHTML = (S.stall || []).map(esc).join("<br>");
  }
  bindSettings();

  // ---------- content edited on the admin page (Firebase) ----------
  var getDb = function () { return window.MHFB.load(); };
  var SITE_KEYS = ["headline", "intro", "shelfNote", "hours", "addressShort", "addressLines", "stall", "enquiryNote", "claims", "instagram", "ordersOpen"];
  function loadRemote() {
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 7000); });
    return Promise.race([loadRemoteNow(), timeout]);
  }
  function loadRemoteNow() {
    return getDb().then(function (c) {
      if (!c) return null;
      var fs = c.fs;
      return Promise.all([
        fs.getDoc(fs.doc(c.db, "settings", "site")).then(function (d) { return d.exists() ? d.data() : null; }).catch(function () { return null; }),
        fs.getDocs(fs.query(fs.collection(c.db, "products"), fs.orderBy("order"))).then(function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }).catch(function () { return null; }),
        fs.getDocs(fs.query(fs.collection(c.db, "upcoming"), fs.where("published", "==", true))).then(function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }).catch(function () { return []; }),
        fs.getDocs(fs.query(fs.collection(c.db, "pages"), fs.where("published", "==", true))).then(function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }).catch(function () { return []; })
      ]).then(function (r) { return { site: r[0], products: r[1], upcoming: r[2], pages: r[3] }; });
    }).catch(function () { return null; });
  }

  // ---------- products: Google Sheet (CSV) with a built-in fallback ----------
  function parseCSV(text) {
    var rows = [], row = [], cell = "", q = false, i, c;
    text = text.replace(/^﻿/, "");
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  var HEAD = {
    group: ["組合", "group", "artist"], name: ["名稱", "name", "album", "專輯"],
    price: ["價錢", "price", "價格"], tag: ["標籤", "tag"],
    image: ["圖片", "image", "photo", "相片"], status: ["狀態", "status"]
  };
  function rowsToProducts(rows) {
    if (rows.length < 2) return [];
    var head = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var idx = {};
    Object.keys(HEAD).forEach(function (k) {
      idx[k] = head.findIndex(function (h) { return HEAD[k].indexOf(h) >= 0; });
    });
    if (idx.group < 0 || idx.name < 0 || idx.price < 0) return [];
    var out = [];
    rows.slice(1).forEach(function (r) {
      var get = function (k) { return idx[k] >= 0 && r[idx[k]] != null ? r[idx[k]].trim() : ""; };
      var price = parseFloat(get("price").replace(/[^0-9.]/g, ""));
      if (!get("group") || !get("name") || isNaN(price)) return;
      out.push({ group: get("group"), name: get("name"), price: price, tag: get("tag"), image: get("image"), status: get("status") });
    });
    return out;
  }

  var products = [], allProducts = [];
  var activeGroup = "";

  function loadProducts() {
    var fallback = function () { return (S.defaultProducts || []).slice(); };
    if (!S.sheetCsvUrl) return Promise.resolve(fallback());
    return fetch(S.sheetCsvUrl, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (t) { var list = rowsToProducts(parseCSV(t)); return list.length ? list : fallback(); })
      .catch(function () { return fallback(); });
  }

  // ---------- price list ----------
  function renderChips() {
    var groups = [];
    products.forEach(function (p) { if (groups.indexOf(p.group) < 0) groups.push(p.group); });
    var chip = function (value, text) {
      return '<button type="button" class="chip" aria-pressed="' + (value === activeGroup) + '" data-g="' + esc(value) + '">' + esc(text) + "</button>";
    };
    $("#chips").innerHTML = chip("", T("shelf.all")) + groups.map(function (g) { return chip(g, g); }).join("");
    var run = groups.map(function (n) { return '<span class="caps">' + esc(n) + " <i>·</i></span>"; }).join("");
    $("#marquee").innerHTML = run + run + run + run;
  }

  function renderCards() {
    var shown = 0;
    $("#grid").innerHTML = products.map(function (p) {
      return activeGroup && p.group !== activeGroup ? "" : M.cardHtml(p, shown++);
    }).join("");
  }

  $("#chips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-g]"); if (!b) return;
    activeGroup = b.dataset.g; renderChips(); renderCards();
  });

  // coming-soon teaser, extra pages (活動頁面) in the menu and as cards on the home page
  function renderExtras(remote) {
    var up = remote && remote.upcoming && window.MHSoon ? window.MHSoon.sort(remote.upcoming) : [];
    $("#nav-soon").hidden = !up.length; $("#soon-teaser").hidden = !up.length;
    if (up.length) { $("#soon-grid").innerHTML = up.slice(0, 3).map(window.MHSoon.card).join(""); window.MHSoon.clocks($("#soon-grid")); }
    var pg = remote && remote.pages ? remote.pages.slice().sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); }) : [];
    $$(".nav-extra").forEach(function (a) { a.parentNode.removeChild(a); });
    var nav = $(".nav-links"), after = $("#nav-soon");
    pg.filter(function (p) { return p.showInNav; }).forEach(function (p) {
      var a = document.createElement("a"); a.className = "nav-extra"; a.href = "/p/" + p.id; a.textContent = p.navLabel || p.title;
      nav.insertBefore(a, after.nextSibling);
    });
    var promos = pg.filter(function (p) { return p.homeButton; });
    $("#promos").hidden = !promos.length;
    $("#promo-grid").innerHTML = promos.map(function (p) {
      var im = /^data:image\/(jpeg|png|webp);base64,/.test(p.banner || "") ? p.banner : "";
      return '<a class="promo-card reveal" href="/p/' + esc(p.id) + '"><div class="promo-img">' + (im ? '<img src="' + esc(im) + '" alt="" loading="lazy">' : '<div class="soon-ph">' + esc(p.title) + "</div>") + "</div>" +
        '<div class="soon-body"><h3>' + esc(p.title) + "</h3>" + (p.subtitle ? '<p class="soon-note">' + esc(p.subtitle) + "</p>" : "") + '<span class="promo-more">' + esc(p.homeLabel || T("promo.more")) + "</span></div></a>";
    }).join("");
  }
  function emptyShelf() { return '<p class="loading" id="empty-shelf">' + esc(T("shelf.empty")) + "</p>"; }

  window.MHA.init();
  Promise.all([loadRemote(), window.MHT.init()]).then(function (r) {
    var remote = r[0];
    if (remote && remote.site) {
      SITE_KEYS.forEach(function (k) { if (remote.site[k] !== undefined && remote.site[k] !== "") S[k] = remote.site[k]; });
      if (remote.site.ordersOpen === false) S.ordersOpen = false;
      bindSettings();
    }
    window.MHA.refresh(); renderExtras(remote);
    if (remote && remote.products && remote.products.length) return remote.products;
    return loadProducts();
  }).then(function (list) {
    allProducts = M.setProducts(list);
    list = allProducts;
    products = list.filter(function (p) { return kindOf(p) !== "hidden"; });
    $("#loading").hidden = true;
    renderChips(); renderCards();
    if (!products.length) $("#grid").innerHTML = emptyShelf();
  });
})();
