// Checkout: reads the cart, asks for contact and delivery details, saves the order and opens the payment page.
(function () {
  "use strict";
  var S = window.SETTINGS || {}, Cat = window.MHCat, Cart = window.MHCart, esc = Cat.esc, money = Cat.money;
  var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var T = function (k, v) { return window.MHT.t(k, undefined, v); };
  var delivery = S.delivery || [], picked = 0, ready = false, errorEl = $("#error"), sending = false;

  function dName(d, i) { return window.MHT.t("delivery." + i + ".name", d.name); }
  function dNote(d, i) { return window.MHT.t("delivery." + i + ".note", d.note || ""); }
  function lines() { return Cart.lines().filter(function (l) { return l.ok; }); }
  function showError(m) { errorEl.textContent = m; errorEl.hidden = false; errorEl.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  function deliveryOk(d, ls) { return ls.every(function (l) { return d.pickup ? Cat.hasSource(l.p) : Cat.chOf(l.p).indexOf("sf") >= 0; }); }

  function renderSummary() {
    var ls = lines();
    $("#co-lines").innerHTML = ls.map(function (l) {
      var im = Cat.imgSrc(l.p.image);
      return '<div class="co-line"><div class="cl-img">' + (im ? '<img src="' + esc(im) + '" alt="">' : "<span>" + esc((l.p.group || "?").slice(0, 2)) + "</span>") + '<em>' + l.qty + '</em></div><div><b>' +
        (l.addonOf ? esc(T("me.addon")) + " " : "") + esc(Cat.dn(l.p.group, l.p.name)) + "</b><small>" + esc(T("chan." + l.mode)) + "</small></div><span>" + money(l.price * l.qty) + "</span></div>";
    }).join("");
    $("#co-total").textContent = money(Cart.subtotal());
  }
  function renderDelivery() {
    var ls = lines();
    $("#delivery").innerHTML = delivery.map(function (d, i) {
      var ok = deliveryOk(d, ls);
      return '<label class="dcard' + (ok ? "" : " is-off") + '"><input type="radio" name="delivery" value="' + i + '"' + (i === picked ? " checked" : "") + (ok ? "" : " disabled") + '><span class="dc-ic" aria-hidden="true">' + (d.pickup ? "🏬" : "📦") + "</span><span><b>" + esc(dName(d, i)) + "</b><small>" + esc(dNote(d, i) || T(d.pickup ? "co.pickupNote" : "co.sfNote")) + "</small></span></label>";
    }).join("");
    var cur = $('input[name="delivery"]:checked');
    if (!cur || cur.disabled) { var f = $('input[name="delivery"]:not(:disabled)'); if (f) f.checked = true; cur = f; }
    picked = cur ? +cur.value : 0;
    $("#address-wrap").hidden = !!(delivery[picked] && delivery[picked].pickup);
    $("#delivery-note").textContent = $$('input[name="delivery"]:disabled').length ? T("delivery.blocked") : "";
  }
  $("#delivery").addEventListener("change", function () { var c = $('input[name="delivery"]:checked'); picked = c ? +c.value : 0; renderDelivery(); });

  function sync() {
    var off = !window.FIREBASE_CONFIG || S.ordersOpen === false, n = lines().length, u = window.MHA.user;
    $("#closed").hidden = !off;
    $("#co-empty").hidden = !ready || !!n || off;
    $("#co-grid").hidden = !n || off;
    $("#co-gate").hidden = !!u || !window.MHA.ready;
    if (u && !$("#f-name").value && u.displayName) $("#f-name").value = u.displayName;
    renderSummary(); renderDelivery();
  }

  function newOrderNo() {
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(b);
    return "MH-" + Array.prototype.map.call(b, function (x) { return abc.charAt(x % 32); }).join("");
  }

  $("#gate-btn").addEventListener("click", function () { window.MHA.open("in"); });
  $("#co-form").addEventListener("submit", function (e) {
    e.preventDefault(); if (sending) return;
    if (!window.MHA.user) { window.MHA.open("in"); return showError(T("err.login")); }
    var name = $("#f-name").value.trim(), contact = $("#f-contact").value.trim(), address = $("#f-address").value.trim(), notes = $("#f-notes").value.trim();
    var ls = lines(), r = $('input[name="delivery"]:checked'), d = r ? delivery[+r.value] : null;
    if (!name) return showError(T("err.name"));
    if (!contact) return showError(T("err.contact"));
    if (!ls.length) return showError(T("err.items"));
    if (!d || r.disabled) return showError(T("err.mixed"));
    if (!d.pickup && !address) return showError(T("err.address"));
    if (!$("#f-agree").checked) return showError(T("err.agree"));
    if ($("#f-website").value) return;
    errorEl.hidden = true;
    var need = {};
    ls.forEach(function (l) { if (Cat.tracked(l.p) && l.mode !== "preorder") need[l.pid] = (need[l.pid] || 0) + l.qty; });
    var short = Object.keys(need).filter(function (id) { return need[id] > Math.max(ls.filter(function (l) { return l.pid === id; })[0].p.stock, 0); })[0];
    if (short) { var sp = ls.filter(function (l) { return l.pid === short; })[0].p; return showError(T("err.stock", { name: sp.name, n: Math.max(sp.stock, 0) })); }
    var total = ls.reduce(function (s, l) { return s + l.price * l.qty; }, 0);
    var order = {
      orderNo: newOrderNo(), name: name, contact: contact, delivery: dName(d, +r.value), address: d.pickup ? "" : address, notes: notes, total: total,
      items: ls.map(function (l) { var it = { group: l.p.group, name: l.p.name, price: l.price, qty: l.qty, mode: l.mode }; if (l.addonOf) { it.addon = true; it.addonOf = l.main ? l.main.name : ""; } return it; })
    };
    var btn = $("#submit"); sending = true; btn.disabled = true; btn.textContent = T("co.sending");
    window.MHFB.load().then(function (c) {
      var u = c && c.auth.currentUser; if (!u) throw new Error("login");
      return c.fs.setDoc(c.fs.doc(c.db, "orders", order.orderNo), {
        orderNo: order.orderNo, uid: u.uid, email: u.email || "", name: order.name, contact: order.contact, delivery: order.delivery, address: order.address,
        notes: order.notes, items: order.items, total: order.total, agreed: true, status: "new", createdAt: c.fs.serverTimestamp()
      });
    }).then(function () {
      try { sessionStorage.setItem("mh-order", JSON.stringify({ orderNo: order.orderNo, total: order.total, contact: order.contact, delivery: order.delivery, items: order.items })); } catch (x) { /* payment page reads the address */ }
      Cart.clear();
      location.href = "pay.html?o=" + encodeURIComponent(order.orderNo) + "&t=" + order.total;
    }).catch(function (err) {
      sending = false; btn.disabled = false; btn.textContent = T("co.place");
      if (err && err.message === "login") { window.MHA.open("in"); showError(T("err.login")); } else showError(T("err.submit", { ig: S.instagram }));
    });
  });

  // products are needed so that names and prices come from the live list
  function loadProducts(c) {
    var fs = c.fs;
    return fs.getDocs(fs.query(fs.collection(c.db, "products"), fs.orderBy("order"))).then(function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }).catch(function () { return []; });
  }
  Cart.onChange(function () { if (ready) sync(); });
  window.MHA.onChange(function () { if (ready) sync(); });
  window.MHA.init();
  window.MHFB.load().then(function (c) {
    if (!c) return [];
    return Promise.all([
      window.MHT.init(),
      c.fs.getDoc(c.fs.doc(c.db, "settings", "site")).then(function (d) { if (d.exists() && d.data().ordersOpen === false) S.ordersOpen = false; }).catch(function () {}),
      loadProducts(c)
    ]).then(function (r) { return r[2]; });
  }).catch(function () { return []; }).then(function (list) {
    Cart.setProducts(list); ready = true; sync();
  });
})();
