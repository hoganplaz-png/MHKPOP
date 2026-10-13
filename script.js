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

  // sleeve tones taken from the logo
  var TONES = [
    ["#122521", "#FEFDFB"], ["#B4B4B4", "#122521"], ["#2F4A41", "#FEFDFB"], ["#E7E7E3", "#122521"],
    ["#5E6F68", "#FEFDFB"], ["#CFCFCB", "#122521"], ["#1E3A32", "#FEFDFB"], ["#9A9F9C", "#122521"]
  ];

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

  function loadProducts() {
    var fallback = function () { return (S.defaultProducts || []).slice(); };
    if (!S.sheetCsvUrl) return Promise.resolve(fallback());
    return fetch(S.sheetCsvUrl, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (t) { var list = rowsToProducts(parseCSV(t)); return list.length ? list : fallback(); })
      .catch(function () { return fallback(); });
  }

  var Cat = window.MHCat, Cart = window.MHCart;
  var products = [], allProducts = [], activeGroup = "", query = "", sortBy = "", picked = {};
  money = Cat.money;
  function tracked(p) { return Cat.tracked(p); }

  function chanBadges(p) {
    var c = Cat.chOf(p);
    var h = c.map(function (x) { return '<span class="chan chan-' + x + '">' + esc(T("chan." + x)) + "</span>"; }).join("");
    if (c.indexOf("preorder") >= 0 && p.eta) h += '<span class="eta">' + esc(T("chan.eta", { eta: p.eta })) + "</span>";
    if (tracked(p) && p.stock > 0 && p.stock <= 5 && c.indexOf("stock") >= 0) h += '<span class="eta low">' + esc(T("shelf.left", { n: p.stock })) + "</span>";
    var ad = Cat.addonsOf(p, allProducts).filter(function (a) { return Cat.addonAvailable(a.t); });
    return '<div class="chans">' + h + "</div>" + (ad.length ? '<div class="addon-note">' + ad.map(function (a) { return esc(T("addon.card", { name: a.t.name, price: a.price })); }).join("<br>") + "</div>" : "");
  }
  function priceHtml(p) {
    var n = Cat.priceOf(p), o = Number(p.price) || 0;
    return n < o ? '<s class="was">' + money(o) + '</s> <b class="now">' + money(n) + "</b>" : "<b>" + money(n) + "</b>";
  }
  function modeOf(p) { var m = Cat.modesOf(p); return picked[p.id] && m.indexOf(picked[p.id]) >= 0 ? picked[p.id] : Cat.defMode(p) === "sf" ? m[0] : m.indexOf(Cat.defMode(p)) >= 0 ? Cat.defMode(p) : m[0]; }

  function renderChips() {
    var groups = [];
    products.forEach(function (p) { if (groups.indexOf(p.group) < 0) groups.push(p.group); });
    var chip = function (value, text) { return '<button type="button" class="chip" aria-pressed="' + (value === activeGroup) + '" data-g="' + esc(value) + '">' + esc(text) + "</button>"; };
    $("#chips").innerHTML = chip("", T("shelf.all")) + groups.map(function (g) { return chip(g, g); }).join("");
    var run = groups.map(function (n) { return '<span class="caps">' + esc(n) + " <i>·</i></span>"; }).join("");
    $("#marquee").innerHTML = run + run + run + run;
  }

  function visible() {
    var q = query.toLowerCase();
    var list = products.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) {
      if (activeGroup && x.p.group !== activeGroup) return false;
      if (!q) return true;
      return (x.p.group + " " + x.p.name + " " + (x.p.aliases || []).join(" ")).toLowerCase().indexOf(q) >= 0;
    });
    if (sortBy) list.sort(function (a, b) { return (Cat.priceOf(a.p) - Cat.priceOf(b.p)) * (sortBy === "low" ? 1 : -1); });
    return list;
  }

  function renderCards() {
    var list = visible();
    $("#grid").innerHTML = list.map(function (x) {
      var p = x.p, k = Cat.kindOf(p), tone = TONES[x.i % TONES.length], on = Cat.priceOf(p) < (Number(p.price) || 0);
      var sleeve = p.image
        ? '<img src="' + esc(Cat.imgSrc(p.image)) + '" alt="' + esc(p.group + " " + p.name) + '" loading="lazy">'
        : '<div class="sleeve-ph"><span class="caps">MHKPOP</span><b>' + esc(p.group) + "</b></div>";
      var tag = k === "sold" ? T("shelf.soldTag") : k === "pending" ? T("shelf.pendingTag") : on ? T("shelf.saleTag") : p.tag;
      var modes = Cat.modesOf(p), act;
      if (Cat.buyable(p)) {
        var m = modeOf(p);
        act = (modes.length > 1 ? '<div class="modes" role="group" aria-label="' + esc(T("item.mode", { name: p.name })) + '">' + modes.map(function (x2) {
          return '<button type="button" class="mode' + (x2 === m ? " on" : "") + '" data-mode="' + x2 + '" data-id="' + esc(p.id) + '" aria-pressed="' + (x2 === m) + '">' + esc(T("chan." + x2)) + "</button>";
        }).join("") + "</div>" : "") + '<button type="button" class="btn btn-solid add" data-add="' + esc(p.id) + '">' + esc(T("shelf.add")) + "</button>";
      } else act = '<span class="state">' + esc(k === "sold" ? T("shelf.soldFoot") : k === "pending" ? T("shelf.pendingFoot") : T("shelf.storeFoot")) + "</span>";
      return '<article class="card reveal' + (k === "sold" ? " is-sold" : "") + (k === "pending" ? " is-pending" : "") + '">' +
        '<div class="stage"><div class="cd"></div><div class="sleeve" style="background:' + tone[0] + ";color:" + tone[1] + '">' + sleeve + "</div>" +
        (tag ? '<span class="tag' + (on && k === "ok" ? " is-sale" : "") + '">' + esc(tag) + "</span>" : "") + "</div>" +
        '<div class="card-body"><div class="card-group caps">' + esc(p.group) + '</div><div class="card-name">' + esc(p.name) + "</div>" + chanBadges(p) + "</div>" +
        '<div class="card-foot"><span class="price">' + priceHtml(p) + "</span></div><div class=\"card-act\">" + act + "</div></article>";
    }).join("");
    $("#empty-shelf") && $("#empty-shelf").remove();
    if (!list.length) $("#grid").insertAdjacentHTML("afterend", '<p class="loading" id="empty-shelf">' + esc(T("shelf.empty")) + "</p>");
  }

  $("#chips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-g]"); if (!b) return;
    activeGroup = b.dataset.g; renderChips(); renderCards();
  });
  $("#search").addEventListener("input", function () { query = this.value.trim(); renderCards(); });
  $("#sort").addEventListener("change", function () { sortBy = this.value; renderCards(); });
  $("#grid").addEventListener("click", function (e) {
    var m = e.target.closest("[data-mode]");
    if (m) { picked[m.dataset.id] = m.dataset.mode; $$('[data-id="' + m.dataset.id + '"]', m.parentNode).forEach(function (x) { var on = x === m; x.classList.toggle("on", on); x.setAttribute("aria-pressed", on); }); return; }
    var b = e.target.closest("[data-add]"); if (!b) return;
    var p = allProducts.filter(function (x) { return x.id === b.dataset.add; })[0]; if (!p) return;
    var r = Cart.add(p.id, modeOf(p), 1);
    if (!r.ok) return Cart.toast(Cart.reasonText(r));
    Cart.fly(b.closest(".card").querySelector(".stage"));
    b.classList.add("added"); b.textContent = T("shelf.added"); setTimeout(function () { b.classList.remove("added"); b.textContent = T("shelf.add"); }, 1400);
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
    allProducts = list;
    products = list.filter(function (p) { return Cat.kindOf(p) !== "hidden"; });
    $("#loading").hidden = true;
    Cart.setProducts(allProducts);
    renderChips(); renderCards();
    if (!products.length) $("#grid").innerHTML = '<p class="loading" id="empty-shelf">' + esc(T("shelf.empty")) + "</p>";
  });
})();
