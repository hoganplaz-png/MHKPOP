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
        fs.getDocs(fs.query(fs.collection(c.db, "products"), fs.orderBy("order"))).then(function (q) { return q.docs.map(function (d) { return d.data(); }); }).catch(function () { return null; })
      ]).then(function (r) { return { site: r[0], products: r[1] }; });
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

  var products = [];
  var qty = {};
  var activeGroup = "";

  function kindOf(p) {
    var s = (p.status || "").toLowerCase();
    if (s === "hidden" || s.indexOf("隱藏") >= 0) return "hidden";
    if (s.indexOf("售罄") >= 0 || s.indexOf("sold") >= 0) return "sold";
    if (s.indexOf("門市") >= 0 || s.indexOf("store") >= 0) return "store";
    return "ok";
  }
  // How a product can be bought: stock = 格仔舖現貨, preorder = 訂購, sf = 順豐. Older products without a setting get stock + sf.
  var CH = ["stock", "preorder", "sf"];
  function chOf(p) {
    var c = Array.isArray(p.channels) ? p.channels.filter(function (x) { return CH.indexOf(x) >= 0; }) : [];
    return c.length ? c : ["stock", "sf"];
  }
  function hasSource(p) { var c = chOf(p); return c.indexOf("stock") >= 0 || c.indexOf("preorder") >= 0; }
  function defMode(p) { var c = chOf(p); return c.indexOf("stock") >= 0 ? "stock" : c.indexOf("preorder") >= 0 ? "preorder" : "sf"; }
  function chanBadges(p) {
    var h = chOf(p).map(function (c) { return '<span class="chan chan-' + c + '">' + esc(T("chan." + c)) + "</span>"; }).join("");
    if (chOf(p).indexOf("preorder") >= 0 && p.eta) h += '<span class="eta">' + esc(T("chan.eta", { eta: p.eta })) + "</span>";
    return '<div class="chans">' + h + "</div>";
  }
  function imgSrc(v) { return /^(https?:)?\/\//.test(v) || v.charAt(0) === "/" || /^data:image\/(jpeg|png|webp);base64,/.test(v) ? v : "images/" + v; }

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
    $("#grid").innerHTML = products.map(function (p, i) {
      if (activeGroup && p.group !== activeGroup) return "";
      var k = kindOf(p), tone = TONES[i % TONES.length];
      var sleeve = p.image
        ? '<img src="' + esc(imgSrc(p.image)) + '" alt="' + esc(p.group + " " + p.name) + '" loading="lazy">'
        : '<div class="sleeve-ph"><span class="caps">MHKPOP</span><b>' + esc(p.group) + "</b></div>";
      var tag = k === "sold" ? T("shelf.soldTag") : p.tag;
      var foot = k === "sold" ? '<span class="state">' + esc(T("shelf.soldFoot")) + "</span>"
        : k === "store" ? '<span class="state">' + esc(T("shelf.storeFoot")) + "</span>"
        : '<a href="#order">' + esc(T("shelf.orderLink")) + "</a>";
      return '<article class="card reveal' + (k === "sold" ? " is-sold" : "") + '">' +
        '<div class="stage"><div class="cd"></div>' +
        '<div class="sleeve" style="background:' + tone[0] + ";color:" + tone[1] + '">' + sleeve + "</div>" +
        (tag ? '<span class="tag">' + esc(tag) + "</span>" : "") + "</div>" +
        '<div class="card-body"><div class="card-group caps">' + esc(p.group) + '</div><div class="card-name">' + esc(p.name) + "</div>" + chanBadges(p) + "</div>" +
        '<div class="card-foot"><span class="price">' + money(p.price) + "</span>" + foot + "</div></article>";
    }).join("");
  }

  $("#chips").addEventListener("click", function (e) {
    var b = e.target.closest("[data-g]"); if (!b) return;
    activeGroup = b.dataset.g; renderChips(); renderCards();
  });

  // ---------- order form ----------
  var form = $("#order-form"), errorEl = $("#error");
  var delivery = S.delivery || [];
  var modes = {};          // product index -> "stock" | "preorder" | "sf" (what the customer picked)
  var pickedDelivery = 0;

  function renderItems() {
    $("#items").innerHTML = products.map(function (p, i) {
      var k = kindOf(p), off = k !== "ok", c = chOf(p);
      var control = off
        ? '<span class="item-state">' + esc(k === "sold" ? T("shelf.soldFoot") : T("shelf.storeFoot")) + "</span>"
        : '<div class="qty"><button type="button" data-i="' + i + '" data-d="-1" aria-label="' + esc(T("item.dec", { name: p.name })) + '">−</button>' +
          '<output id="q' + i + '" aria-live="polite">0</output>' +
          '<button type="button" data-i="' + i + '" data-d="1" aria-label="' + esc(T("item.inc", { name: p.name })) + '">+</button></div>';
      var modeSel = !off && c.indexOf("stock") >= 0 && c.indexOf("preorder") >= 0
        ? '<select class="mode" data-m="' + i + '" aria-label="' + esc(T("item.mode", { name: p.name })) + '">' +
          '<option value="stock">' + esc(T("item.modeStock")) + '</option><option value="preorder">' + esc(T("item.modePreorder")) + "</option></select>" : "";
      var line = c.map(function (x) { return T("chan." + x); }).join(" · ");
      if (c.indexOf("preorder") >= 0 && p.eta) line += " · " + T("chan.eta", { eta: p.eta });
      return '<div class="item' + (off ? " is-off" : "") + '"><div class="item-main"><span class="caps">' + esc(p.group) + "</span><small>" + esc(p.name) + "</small>" +
        '<small class="chan-line">' + esc(line) + "</small>" + modeSel + "</div>" +
        '<div class="item-price">' + money(p.price) + "</div>" + control + "</div>";
    }).join("");
    qty = {}; modes = {}; updateTotal(); syncDelivery();
  }

  $("#items").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-i]"); if (!b) return;
    var i = +b.dataset.i;
    qty[i] = Math.max(0, (qty[i] || 0) + +b.dataset.d);
    $("#q" + i).textContent = qty[i];
    errorEl.hidden = true; updateTotal(); syncDelivery();
  });
  $("#items").addEventListener("change", function (e) {
    var sel = e.target.closest("select[data-m]"); if (!sel) return;
    modes[+sel.dataset.m] = sel.value;
  });

  function chosen() {
    return products.map(function (p, i) { return { p: p, q: qty[i] || 0, mode: modes[i] || defMode(p) }; }).filter(function (x) { return x.q > 0; });
  }
  function updateTotal() { $("#total").textContent = money(chosen().reduce(function (s, x) { return s + x.p.price * x.q; }, 0)); }

  // 順豐 needs every chosen product to allow it; 門市自取 needs every chosen product to be a stock or pre-order item.
  function deliveryOk(d, list) {
    return list.every(function (x) { return d.pickup ? hasSource(x.p) : chOf(x.p).indexOf("sf") >= 0; });
  }
  function dName(d, i) { return window.MHT.t("delivery." + i + ".name", d.name); }
  function dNote(d, i) { return window.MHT.t("delivery." + i + ".note", d.note || ""); }

  function renderDelivery() {
    $("#delivery").innerHTML = delivery.map(function (d, i) {
      return '<label class="pill"><input type="radio" name="delivery" value="' + i + '"' + (i === pickedDelivery ? " checked" : "") + "><span>" + esc(dName(d, i)) + "</span></label>";
    }).join("");
    syncDelivery();
  }
  function curRadio() { return $('input[name="delivery"]:checked'); }
  function curDelivery() { var r = curRadio(); return delivery[r ? +r.value : 0] || {}; }
  function syncDelivery() {
    var list = chosen(), blocked = false, firstOk = null;
    $$('input[name="delivery"]').forEach(function (r) {
      var ok = deliveryOk(delivery[+r.value] || {}, list);
      r.disabled = !ok; r.parentNode.classList.toggle("is-off", !ok);
      if (!ok) blocked = true; else if (!firstOk) firstOk = r;
    });
    var cur = curRadio();
    if ((!cur || cur.disabled) && firstOk) firstOk.checked = true;
    cur = curRadio();
    if (cur) pickedDelivery = +cur.value;
    var d = curDelivery();
    $("#delivery-note").textContent = (cur ? dNote(d, +cur.value) : "") + (blocked ? " " + T("delivery.blocked") : "");
    $("#address-wrap").hidden = !!d.pickup;
  }
  $("#delivery").addEventListener("change", syncDelivery);

  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; errorEl.scrollIntoView({ block: "nearest", behavior: "smooth" }); }

  // Orders go to the shop's own Firebase database (viewed on /admin). The order number is the document name,
  // so nobody can overwrite an order and a payment screenshot can be tied to the account that placed it.
  function sendOrder(o) {
    return getDb().then(function (c) {
      var u = c && c.auth.currentUser;
      if (!u) throw new Error("login");
      return c.fs.setDoc(c.fs.doc(c.db, "orders", o.orderNo), {
        orderNo: o.orderNo, uid: u.uid, email: u.email || "", name: o.name, contact: o.contact, delivery: o.delivery, address: o.address,
        notes: o.notes, items: o.items, total: o.total, agreed: true, status: "new", createdAt: c.fs.serverTimestamp()
      });
    });
  }

  function newOrderNo() {
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(b);
    return "MH-" + Array.prototype.map.call(b, function (x) { return abc.charAt(x % 32); }).join("");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!window.MHA.user) { window.MHA.open("in"); return showError(T("err.login")); }
    var name = $("#f-name").value.trim(), contact = $("#f-contact").value.trim(), address = $("#f-address").value.trim();
    var notes = $("#f-notes").value.trim(), d = curDelivery(), list = chosen(), r = curRadio();
    if (!name) return showError(T("err.name"));
    if (!contact) return showError(T("err.contact"));
    if (!list.length) return showError(T("err.items"));
    if (!r || r.disabled) return showError(T("err.mixed"));
    if (!d.pickup && !address) return showError(T("err.address"));
    if (!$("#f-agree").checked) return showError(T("err.agree"));
    if ($("#f-website").value) return; // spam trap
    errorEl.hidden = true;

    var total = list.reduce(function (s, x) { return s + x.p.price * x.q; }, 0);
    var order = {
      orderNo: newOrderNo(), name: name, contact: contact, delivery: dName(d, +r.value), address: d.pickup ? "" : address, notes: notes,
      items: list.map(function (x) { return { group: x.p.group, name: x.p.name, price: x.p.price, qty: x.q, mode: x.mode }; }), total: total
    };
    pending = order;
    openReview(order);
  });

  // Step 2: the customer checks the order, then confirms. Confirming saves the order and opens the payment page.
  var pending = null, review = $("#review");
  function openReview(o) {
    $("#review-summary").innerHTML = o.items.map(function (i) {
      return "<div><span>" + esc(i.group) + " " + esc(i.name) + " × " + i.qty + " · " + esc(T("chan." + i.mode)) + "</span><span>" + money(i.price * i.qty) + "</span></div>";
    }).join("") + '<div class="tot"><span>' + esc(T("review.total")) + "</span><span>" + money(o.total) + "</span></div>";
    var rows = [[T("review.name"), o.name], [T("review.contact"), o.contact], [T("review.email"), window.MHA.user.email], [T("review.delivery"), o.delivery]];
    if (o.address) rows.push([T("review.address"), o.address]);
    if (o.notes) rows.push([T("review.notes"), o.notes]);
    $("#review-info").innerHTML = rows.map(function (r) { return "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("");
    $("#review-ok").textContent = T("review.ok");
    $("#review-error").hidden = true;
    review.showModal();
  }
  $("#review-back").addEventListener("click", function () { review.close(); });
  $("#review-ok").addEventListener("click", function () {
    if (!pending) return;
    var btn = this, o = pending;
    btn.disabled = true; btn.textContent = T("review.sending");
    sendOrder(o).then(function () {
      try {
        sessionStorage.setItem("mh-order", JSON.stringify({ orderNo: o.orderNo, total: o.total, contact: o.contact, delivery: o.delivery, items: o.items }));
      } catch (e) { /* the payment page also reads the order number and amount from the address */ }
      location.href = "pay.html?o=" + encodeURIComponent(o.orderNo) + "&t=" + o.total;
    }).catch(function (err) {
      review.close();
      if (err && err.message === "login") { window.MHA.open("in"); showError(T("err.login")); }
      else showError(T("err.submit", { ig: S.instagram }));
      btn.disabled = false; btn.textContent = T("review.ok");
    });
  });

  // The order form needs Firebase, an open shop and a signed-in customer.
  function syncOrderForm() {
    var off = !window.FIREBASE_CONFIG || S.ordersOpen === false, u = window.MHA.user, ready = window.MHA.ready;
    $("#closed").hidden = !off;
    $("#gate").hidden = off || !ready || !!u;
    form.hidden = off || !u;
    if (u) {
      $("#whoami").textContent = u.email || "";
      if (!$("#f-name").value && u.displayName) $("#f-name").value = u.displayName;
    }
    $$("[data-s-ig]").forEach(function (a) { a.href = igUrl; });
  }
  $("#gate-btn").addEventListener("click", function () { window.MHA.open("in"); });
  $("#form-signout").addEventListener("click", function () { window.MHA.signOut(); });
  window.MHA.onChange(syncOrderForm);
  syncOrderForm();

  function emptyShelf() { return '<p class="loading" id="empty-shelf">' + esc(T("shelf.empty")) + "</p>"; }

  renderDelivery();
  window.MHA.init();
  Promise.all([loadRemote(), window.MHT.init()]).then(function (r) {
    var remote = r[0];
    if (remote && remote.site) {
      SITE_KEYS.forEach(function (k) { if (remote.site[k] !== undefined && remote.site[k] !== "") S[k] = remote.site[k]; });
      if (remote.site.ordersOpen === false) S.ordersOpen = false;
      bindSettings();
    }
    syncOrderForm(); renderDelivery(); window.MHA.refresh();
    if (remote && remote.products && remote.products.length) return remote.products;
    return loadProducts();
  }).then(function (list) {
    products = list.filter(function (p) { return kindOf(p) !== "hidden"; });
    $("#loading").hidden = true;
    renderChips(); renderCards(); renderItems();
    if (!products.length) $("#grid").innerHTML = emptyShelf();
  });
})();
