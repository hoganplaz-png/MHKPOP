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

  var products = [], allProducts = [];
var addonQty = {};   // "mainIndex|addonProductId" -> quantity
  var qty = {};
  var activeGroup = "";

  function kindOf(p) {
    var s = (p.status || "").toLowerCase();
    if (s === "hidden" || s.indexOf("隱藏") >= 0) return "hidden";
    if (s === "pending") return "pending";
    if (s.indexOf("售罄") >= 0 || s.indexOf("sold") >= 0) return "sold";
    if (s.indexOf("門市") >= 0 || s.indexOf("store") >= 0) return "store";
    if (stockOut(p)) return "sold";
    return "ok";
  }
  // a product with a stock number sells out by itself at 0 (pre-order products keep selling)
  function tracked(p) { return typeof p.stock === "number"; }
  // sale price (特價) until its last day; products marked 未到貨 can still be pre-ordered when they have the 訂購 option
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function priceOf(p) {
    var sp = p.salePrice;
    if (sp !== undefined && sp !== null && sp !== "" && isFinite(Number(sp)) && (!p.saleEnds || today() <= p.saleEnds)) return Number(sp);
    return Number(p.price) || 0;
  }
  function priceHtml(p) {
    var n = priceOf(p), o = Number(p.price) || 0;
    return n < o ? '<s class="was">' + money(o) + "</s> " + money(n) : money(n);
  }
  function pendingOrderable(p) { return kindOf(p) === "pending" && chOf(p).indexOf("preorder") >= 0; }
  function modeFor(i) { return kindOf(products[i]) === "pending" ? "preorder" : (modes[i] || defMode(products[i])); }
  function stockOut(p) { return tracked(p) && p.stock <= 0 && (Array.isArray(p.channels) ? p.channels.indexOf("preorder") < 0 : true); }
  function byId(id) { return allProducts.filter(function (p) { return p.id === id; })[0]; }
  function addonsFor(p) {
    return (p.addons || []).map(function (a) { var t = byId(a.id); return t ? { t: t, price: Number(a.price) || 0 } : null; }).filter(Boolean);
  }
  function addonAvailable(t) { return (t.status || "") !== "sold" && !stockOut(t); }
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
    if (tracked(p) && p.stock > 0 && p.stock <= 5 && chOf(p).indexOf("stock") >= 0) h += '<span class="eta low">' + esc(T("shelf.left", { n: p.stock })) + "</span>";
    var ad = addonsFor(p).filter(function (a) { return addonAvailable(a.t); });
    return '<div class="chans">' + h + "</div>" + (ad.length ? '<div class="addon-note">' + ad.map(function (a) { return esc(T("addon.card", { name: a.t.name, price: a.price })); }).join("<br>") + "</div>" : "");
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
      var tag = k === "sold" ? T("shelf.soldTag") : k === "pending" ? T("shelf.pendingTag") : priceOf(p) < (Number(p.price) || 0) ? T("shelf.saleTag") : p.tag;
      var foot = k === "sold" ? '<span class="state">' + esc(T("shelf.soldFoot")) + "</span>"
        : k === "pending" && !pendingOrderable(p) ? '<span class="state">' + esc(T("shelf.pendingFoot")) + "</span>"
        : k === "store" ? '<span class="state">' + esc(T("shelf.storeFoot")) + "</span>"
        : '<a href="#order">' + esc(T("shelf.orderLink")) + "</a>";
      return '<article class="card reveal' + (k === "sold" ? " is-sold" : "") + (k === "pending" ? " is-pending" : "") + '">' +
        '<div class="stage"><div class="cd"></div>' +
        '<div class="sleeve" style="background:' + tone[0] + ";color:" + tone[1] + '">' + sleeve + "</div>" +
        (tag ? '<span class="tag">' + esc(tag) + "</span>" : "") + "</div>" +
        '<div class="card-body"><div class="card-group caps">' + esc(p.group) + '</div><div class="card-name">' + esc(p.name) + "</div>" + chanBadges(p) + "</div>" +
        '<div class="card-foot"><span class="price">' + priceHtml(p) + "</span>" + foot + "</div></article>";
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
      var k = kindOf(p), off = k !== "ok" && !pendingOrderable(p), c = chOf(p);
      var control = off
        ? '<span class="item-state">' + esc(k === "sold" ? T("shelf.soldFoot") : k === "pending" ? T("shelf.pendingFoot") : T("shelf.storeFoot")) + "</span>"
        : '<div class="qty"><button type="button" data-i="' + i + '" data-d="-1" aria-label="' + esc(T("item.dec", { name: p.name })) + '">−</button>' +
          '<output id="q' + i + '" aria-live="polite">0</output>' +
          '<button type="button" data-i="' + i + '" data-d="1" aria-label="' + esc(T("item.inc", { name: p.name })) + '">+</button></div>';
      var modeSel = !off && k !== "pending" && c.indexOf("stock") >= 0 && c.indexOf("preorder") >= 0
        ? '<select class="mode" data-m="' + i + '" aria-label="' + esc(T("item.mode", { name: p.name })) + '">' +
          '<option value="stock">' + esc(T("item.modeStock")) + '</option><option value="preorder">' + esc(T("item.modePreorder")) + "</option></select>" : "";
      var line = c.map(function (x) { return T("chan." + x); }).join(" · ");
      if (c.indexOf("preorder") >= 0 && p.eta) line += " · " + T("chan.eta", { eta: p.eta });
      return '<div class="item' + (off ? " is-off" : "") + '"><div class="item-main"><span class="caps">' + esc(p.group) + "</span><small>" + esc(p.name) + "</small>" +
        '<small class="chan-line">' + esc(line) + "</small>" + modeSel + "</div>" +
        '<div class="item-price">' + priceHtml(p) + "</div>" + control + '<div class="addons" id="ad' + i + '"></div></div>';
    }).join("");
    qty = {}; modes = {}; addonQty = {}; updateTotal(); syncDelivery();
  }

  // units of a product already in the order (as itself or as an add-on)
  function usedOf(pid) {
    var n = 0;
    products.forEach(function (p, j) { if (p.id === pid) n += qty[j] || 0; });
    Object.keys(addonQty).forEach(function (k) { if (k.split("|")[1] === pid) n += addonQty[k]; });
    return n;
  }
  function canAdd(p, mode) { return !tracked(p) || mode === "preorder" || usedOf(p.id) < p.stock; }
  function renderAddons(i) {
    var box = $("#ad" + i); if (!box) return;
    var q = qty[i] || 0;
    box.innerHTML = q ? addonsFor(products[i]).filter(function (a) { return addonAvailable(a.t); }).map(function (a) {
      var n = addonQty[i + "|" + a.t.id] || 0;
      return '<div class="addon-line"><span>' + esc(T("addon.line", { name: a.t.name, price: a.price })) + '</span><div class="qty"><button type="button" data-ai="' + i + '" data-at="' + esc(a.t.id) + '" data-d="-1" aria-label="' + esc(T("addon.dec", { name: a.t.name })) + '">−</button>' +
        "<output>" + n + '</output><button type="button" data-ai="' + i + '" data-at="' + esc(a.t.id) + '" data-d="1" aria-label="' + esc(T("addon.inc", { name: a.t.name })) + '">+</button></div></div>';
    }).join("") : "";
  }
  function trimAddons(i) {
    Object.keys(addonQty).forEach(function (k) {
      if (k.split("|")[0] !== String(i)) return;
      if (addonQty[k] > (qty[i] || 0)) addonQty[k] = qty[i] || 0;
      if (!addonQty[k]) delete addonQty[k];
    });
  }
  $("#items").addEventListener("click", function (e) {
    var ab = e.target.closest("button[data-ai]");
    if (ab) {
      var ai = +ab.dataset.ai, t = byId(ab.dataset.at), key = ai + "|" + ab.dataset.at, d = +ab.dataset.d;
      var next = Math.max(0, (addonQty[key] || 0) + d);
      if (d > 0 && next > (qty[ai] || 0)) return showError(T("addon.limit"));
      if (d > 0 && t && !canAdd(t, defMode(t))) return showError(T("err.stock", { name: t.name, n: Math.max(t.stock, 0) }));
      if (next) addonQty[key] = next; else delete addonQty[key];
      errorEl.hidden = true; renderAddons(ai); updateTotal(); syncDelivery();
      return;
    }
    var b = e.target.closest("button[data-i]"); if (!b) return;
    var i = +b.dataset.i, dd = +b.dataset.d;
    if (dd > 0 && !canAdd(products[i], modeFor(i))) return showError(T("err.stock", { name: products[i].name, n: Math.max(products[i].stock, 0) }));
    qty[i] = Math.max(0, (qty[i] || 0) + dd);
    $("#q" + i).textContent = qty[i];
    trimAddons(i); renderAddons(i);
    errorEl.hidden = true; updateTotal(); syncDelivery();
  });
  $("#items").addEventListener("change", function (e) {
    var sel = e.target.closest("select[data-m]"); if (!sel) return;
    modes[+sel.dataset.m] = sel.value;
  });

  function chosen() {
    var out = [];
    products.forEach(function (p, i) {
      var q = qty[i] || 0; if (q <= 0) return;
      out.push({ p: p, q: q, mode: modeFor(i), price: priceOf(p) });
      addonsFor(p).forEach(function (a) {
        var n = addonQty[i + "|" + a.t.id] || 0;
        if (n > 0) out.push({ p: a.t, q: n, mode: defMode(a.t), price: a.price, addon: true, addonOf: p.name });
      });
    });
    return out;
  }
  function updateTotal() { $("#total").textContent = money(chosen().reduce(function (s, x) { return s + x.price * x.q; }, 0)); }

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

    var need = {};
    list.forEach(function (x) { if (tracked(x.p) && x.mode !== "preorder") need[x.p.id] = (need[x.p.id] || 0) + x.q; });
    var short = Object.keys(need).filter(function (id) { return need[id] > Math.max(byId(id).stock, 0); })[0];
    if (short) return showError(T("err.stock", { name: byId(short).name, n: Math.max(byId(short).stock, 0) }));
    var total = list.reduce(function (s, x) { return s + x.price * x.q; }, 0);
    var order = {
      orderNo: newOrderNo(), name: name, contact: contact, delivery: dName(d, +r.value), address: d.pickup ? "" : address, notes: notes,
      items: list.map(function (x) { var it = { group: x.p.group, name: x.p.name, price: x.price, qty: x.q, mode: x.mode }; if (x.addon) { it.addon = true; it.addonOf = x.addonOf; } return it; }), total: total
    };
    pending = order;
    openReview(order);
  });

  // Step 2: the customer checks the order, then confirms. Confirming saves the order and opens the payment page.
  var pending = null, review = $("#review");
  function openReview(o) {
    $("#review-summary").innerHTML = o.items.map(function (i) {
      return "<div><span>" + (i.addon ? esc(T("me.addon")) + " " : "") + esc(dn(i.group, i.name)) + " × " + i.qty + " · " + esc(T("chan." + i.mode)) + "</span><span>" + money(i.price * i.qty) + "</span></div>";
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

  renderDelivery();
  window.MHA.init();
  Promise.all([loadRemote(), window.MHT.init()]).then(function (r) {
    var remote = r[0];
    if (remote && remote.site) {
      SITE_KEYS.forEach(function (k) { if (remote.site[k] !== undefined && remote.site[k] !== "") S[k] = remote.site[k]; });
      if (remote.site.ordersOpen === false) S.ordersOpen = false;
      bindSettings();
    }
    syncOrderForm(); renderDelivery(); window.MHA.refresh(); renderExtras(remote);
    if (remote && remote.products && remote.products.length) return remote.products;
    return loadProducts();
  }).then(function (list) {
    allProducts = list;
    products = list.filter(function (p) { return kindOf(p) !== "hidden"; });
    $("#loading").hidden = true;
    renderChips(); renderCards(); renderItems();
    if (!products.length) $("#grid").innerHTML = emptyShelf();
  });
})();
