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
  var FB = "https://www.gstatic.com/firebasejs/10.14.1/";
  var dbPromise = null;
  function getDb() {
    if (!window.FIREBASE_CONFIG) return Promise.resolve(null);
    if (!dbPromise) {
      dbPromise = Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-firestore.js")]).then(function (m) {
        return { fs: m[1], db: m[1].getFirestore(m[0].initializeApp(window.FIREBASE_CONFIG)) };
      });
    }
    return dbPromise;
  }
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
  var activeGroup = "全部";

  function kindOf(p) {
    var s = (p.status || "").toLowerCase();
    if (s === "hidden" || s.indexOf("隱藏") >= 0) return "hidden";
    if (s.indexOf("售罄") >= 0 || s.indexOf("sold") >= 0) return "sold";
    if (s.indexOf("門市") >= 0 || s.indexOf("store") >= 0) return "store";
    return "ok";
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
    var groups = ["全部"];
    products.forEach(function (p) { if (groups.indexOf(p.group) < 0) groups.push(p.group); });
    $("#chips").innerHTML = groups.map(function (g) {
      return '<button type="button" class="chip" aria-pressed="' + (g === activeGroup) + '" data-g="' + esc(g) + '">' + esc(g) + "</button>";
    }).join("");
    var names = groups.slice(1);
    var run = names.map(function (n) { return '<span class="caps">' + esc(n) + " <i>·</i></span>"; }).join("");
    $("#marquee").innerHTML = run + run + run + run;
  }

  function renderCards() {
    $("#grid").innerHTML = products.map(function (p, i) {
      if (activeGroup !== "全部" && p.group !== activeGroup) return "";
      var k = kindOf(p), tone = TONES[i % TONES.length];
      var sleeve = p.image
        ? '<img src="' + esc(imgSrc(p.image)) + '" alt="' + esc(p.group + " " + p.name) + '" loading="lazy">'
        : '<div class="sleeve-ph"><span class="caps">MHKPOP</span><b>' + esc(p.group) + "</b></div>";
      var tag = k === "sold" ? "售罄" : p.tag;
      var foot = k === "sold" ? '<span class="state">已售罄</span>'
        : k === "store" ? '<span class="state">只限門市購買</span>'
        : '<a href="#order">我要訂購 →</a>';
      return '<article class="card reveal' + (k === "sold" ? " is-sold" : "") + '">' +
        '<div class="stage"><div class="cd"></div>' +
        '<div class="sleeve" style="background:' + tone[0] + ";color:" + tone[1] + '">' + sleeve + "</div>" +
        (tag ? '<span class="tag">' + esc(tag) + "</span>" : "") + "</div>" +
        '<div class="card-body"><div class="card-group caps">' + esc(p.group) + '</div><div class="card-name">' + esc(p.name) + "</div></div>" +
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

  function renderItems() {
    $("#items").innerHTML = products.map(function (p, i) {
      var k = kindOf(p), off = k !== "ok";
      var control = off
        ? '<span class="item-state">' + (k === "sold" ? "已售罄" : "只限門市購買") + "</span>"
        : '<div class="qty"><button type="button" data-i="' + i + '" data-d="-1" aria-label="減少 ' + esc(p.name) + '">−</button>' +
          '<output id="q' + i + '" aria-live="polite">0</output>' +
          '<button type="button" data-i="' + i + '" data-d="1" aria-label="增加 ' + esc(p.name) + '">+</button></div>';
      return '<div class="item' + (off ? " is-off" : "") + '"><div class="item-main"><span class="caps">' + esc(p.group) + "</span><small>" + esc(p.name) + "</small></div>" +
        '<div class="item-price">' + money(p.price) + "</div>" + control + "</div>";
    }).join("");
    qty = {}; updateTotal();
  }

  $("#items").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-i]"); if (!b) return;
    var i = +b.dataset.i;
    qty[i] = Math.max(0, (qty[i] || 0) + +b.dataset.d);
    $("#q" + i).textContent = qty[i];
    errorEl.hidden = true; updateTotal();
  });

  function chosen() { return products.map(function (p, i) { return { p: p, q: qty[i] || 0 }; }).filter(function (x) { return x.q > 0; }); }
  function updateTotal() { $("#total").textContent = money(chosen().reduce(function (s, x) { return s + x.p.price * x.q; }, 0)); }

  function renderDelivery() {
    $("#delivery").innerHTML = delivery.map(function (d, i) {
      return '<label class="pill"><input type="radio" name="delivery" value="' + i + '"' + (i === 0 ? " checked" : "") + "><span>" + esc(d.name) + "</span></label>";
    }).join("");
    syncDelivery();
  }
  function curDelivery() { var r = $('input[name="delivery"]:checked'); return delivery[r ? +r.value : 0] || {}; }
  function syncDelivery() {
    var d = curDelivery();
    $("#delivery-note").textContent = d.note || "";
    $("#address-wrap").hidden = !!d.pickup;
  }
  $("#delivery").addEventListener("change", syncDelivery);

  function showError(msg) { errorEl.textContent = msg; errorEl.hidden = false; errorEl.scrollIntoView({ block: "nearest", behavior: "smooth" }); }

  // Orders go to the shop's own Firebase database (viewed on /admin).
  // If Firebase is not set up, an optional Formspree link in settings.js is used instead.
  function sendOrder(o) {
    if (window.FIREBASE_CONFIG) {
      return getDb().then(function (c) {
        return c.fs.addDoc(c.fs.collection(c.db, "orders"), {
          orderNo: o.orderNo, name: o.name, contact: o.contact, delivery: o.delivery, address: o.address, notes: o.notes,
          items: o.items, total: o.total, status: "new", createdAt: c.fs.serverTimestamp()
        });
      });
    }
    return fetch(S.formEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ _subject: "新訂單 " + o.orderNo + " · " + o.name, orderNo: o.orderNo, name: o.name, contact: o.contact,
        delivery: o.delivery, address: o.address, notes: o.notes, total: money(o.total), order: o.text })
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("#f-name").value.trim(), contact = $("#f-contact").value.trim(), address = $("#f-address").value.trim();
    var notes = $("#f-notes").value.trim(), d = curDelivery(), list = chosen();
    if (!name) return showError("請填寫姓名。");
    if (!contact) return showError("請填寫 Instagram 帳號或電話，方便我們聯絡你。");
    if (!list.length) return showError("請最少揀選一款貨品。");
    if (!d.pickup && !address) return showError("請填寫收件地址。");
    if ($("#f-website").value) return; // spam trap
    errorEl.hidden = true;

    var total = list.reduce(function (s, x) { return s + x.p.price * x.q; }, 0);
    var orderNo = "MH-" + Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
    var itemsText = list.map(function (x) { return "- " + x.p.group + " " + x.p.name + " x" + x.q + " (" + money(x.p.price * x.q) + ")"; }).join("\n");
    var text = ["訂單編號：" + orderNo, "姓名：" + name, "聯絡：" + contact, "交收：" + d.name,
      d.pickup ? "" : "地址：" + address, "貨品：\n" + itemsText, "貨品總額（未計運費）：" + money(total),
      notes ? "備註：" + notes : ""].filter(Boolean).join("\n");

    var order = { orderNo: orderNo, name: name, contact: contact, delivery: d.name, address: d.pickup ? "" : address, notes: notes,
      items: list.map(function (x) { return { group: x.p.group, name: x.p.name, price: x.p.price, qty: x.q }; }), total: total, text: text };
    pending = order;
    openReview(order);
  });

  // Step 2: the customer checks the order, then confirms. Confirming saves the order and opens the payment page.
  var pending = null, review = $("#review");
  function openReview(o) {
    $("#review-summary").innerHTML = o.items.map(function (i) {
      return "<div><span>" + esc(i.group) + " " + esc(i.name) + " × " + i.qty + "</span><span>" + money(i.price * i.qty) + "</span></div>";
    }).join("") + '<div class="tot"><span>貨品總額（未計運費）</span><span>' + money(o.total) + "</span></div>";
    var rows = [["姓名", o.name], ["聯絡方式", o.contact], ["交收方式", o.delivery]];
    if (o.address) rows.push(["收件地址", o.address]);
    if (o.notes) rows.push(["備註", o.notes]);
    $("#review-info").innerHTML = rows.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("");
    $("#review-error").hidden = true;
    review.showModal();
  }
  $("#review-back").addEventListener("click", function () { review.close(); });
  $("#review-ok").addEventListener("click", function () {
    if (!pending) return;
    var btn = this, o = pending;
    btn.disabled = true; btn.textContent = "提交中…";
    sendOrder(o).then(function () {
      try {
        sessionStorage.setItem("mh-order", JSON.stringify({ orderNo: o.orderNo, total: o.total, contact: o.contact, delivery: o.delivery, items: o.items }));
      } catch (e) { /* the payment page also reads the order number and amount from the address */ }
      location.href = "pay.html?o=" + encodeURIComponent(o.orderNo) + "&t=" + o.total;
    }).catch(function () {
      review.close();
      showError("提交失敗。請檢查網絡後再試，或在 Instagram 私訊 @" + S.instagram + "。");
      btn.disabled = false; btn.textContent = "確認訂單，前往付款";
    });
  });

  // The order form is switched off until orders have somewhere to go, or while the shop has closed it on the admin page.
  function syncOrderForm() {
    var off = (!window.FIREBASE_CONFIG && !S.formEndpoint) || S.ordersOpen === false;
    $("#closed").hidden = !off; form.hidden = off;
    $$("[data-s-ig]").forEach(function (a) { a.href = igUrl; });
  }
  syncOrderForm();

  function emptyShelf() { return '<p class="loading" id="empty-shelf">暫時未有商品。</p>'; }

  renderDelivery();
  loadRemote().then(function (remote) {
    if (remote && remote.site) {
      SITE_KEYS.forEach(function (k) { if (remote.site[k] !== undefined && remote.site[k] !== "") S[k] = remote.site[k]; });
      if (remote.site.ordersOpen === false) S.ordersOpen = false;
      bindSettings(); syncOrderForm();
    }
    if (remote && remote.products && remote.products.length) return remote.products;
    return loadProducts();
  }).then(function (list) {
    products = list.filter(function (p) { return kindOf(p) !== "hidden"; });
    $("#loading").hidden = true;
    renderChips(); renderCards(); renderItems();
    if (!products.length) $("#grid").innerHTML = emptyShelf();
  });
})();
