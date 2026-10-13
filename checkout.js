// Checkout: step 1 cart, step 2 contact and delivery, then the payment page (pay.html) and its confirmation.
// The cart is the one kept by shop-core.js. Orders are saved the same way the old order form saved them.
(function () {
  "use strict";
  var S = window.SETTINGS || {};
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var M = window.MHShop, esc = M.esc, money = M.money, T = M.T;
  var delivery = S.delivery || [], pickedDelivery = 0, addonQty = {}, step = 1, pending = false;

  function dn(g, n) { g = String(g || "").trim(); n = String(n || "").trim(); return !g || n.toLowerCase().indexOf(g.toLowerCase()) >= 0 ? n : g + " " + n; }
  var getDb = function () { return window.MHFB.load(); };

  // ---------- what is in the order ----------
  // cart lines that can still be bought, plus the add-ons the customer ticked
  function lines() {
    var out = [];
    M.cart.items().forEach(function (x) {
      var p = M.byId(x.id); if (!p || !M.buyable(p)) return;
      var mode = x.mode || M.defMode(p);
      out.push({ p: p, q: x.q, mode: mode, price: M.priceOf(p) });
      M.addonsFor(p).forEach(function (a) {
        var n = Math.min(addonQty[p.id + "|" + a.t.id] || 0, x.q);
        if (n > 0) out.push({ p: a.t, q: n, mode: M.defMode(a.t), price: a.price, addon: true, addonOf: p.name });
      });
    });
    return out;
  }
  function total(list) { return list.reduce(function (s, x) { return s + x.price * x.q; }, 0); }
  function usedOf(id) {
    var n = M.cart.qty(id);
    Object.keys(addonQty).forEach(function (k) { if (k.split("|")[1] === id) n += addonQty[k]; });
    return n;
  }

  // ---------- step 1: cart ----------
  function renderCart() {
    var items = M.cart.items().filter(function (x) { var p = M.byId(x.id); return p; });
    $("#co-empty").hidden = items.length > 0;
    $("#to2").hidden = !items.length;
    $("#co-lines").innerHTML = items.map(function (x) {
      var p = M.byId(x.id), ok = M.buyable(p), c = M.chOf(p), i = M.indexOf(p);
      var modeSel = ok && p.status !== "pending" && c.indexOf("stock") >= 0 && c.indexOf("preorder") >= 0
        ? '<select class="mode" data-m="' + esc(p.id) + '" aria-label="' + esc(T("item.mode", { name: p.name })) + '"><option value="stock"' + (x.mode === "stock" ? " selected" : "") + ">" + esc(T("item.modeStock")) + '</option><option value="preorder"' + (x.mode === "preorder" ? " selected" : "") + ">" + esc(T("item.modePreorder")) + "</option></select>" : "";
      var eta = x.mode === "preorder" && p.eta ? '<small class="co-eta">' + esc(T("chan.eta", { eta: p.eta })) + "</small>" : "";
      var addons = ok ? M.addonsFor(p).filter(function (a) { return M.addonAvailable(a.t); }).map(function (a) {
        var n = addonQty[p.id + "|" + a.t.id] || 0;
        return '<div class="addon-line"><span>' + esc(T("addon.line", { name: a.t.name, price: a.price })) + '</span><div class="qty qty-sm"><button type="button" data-ai="' + esc(p.id) + '" data-at="' + esc(a.t.id) + '" data-d="-1" aria-label="' + esc(T("addon.dec", { name: a.t.name })) + '">−</button><output>' + n + '</output><button type="button" data-ai="' + esc(p.id) + '" data-at="' + esc(a.t.id) + '" data-d="1" aria-label="' + esc(T("addon.inc", { name: a.t.name })) + '">+</button></div></div>';
      }).join("") : "";
      return '<div class="co-line' + (ok ? "" : " is-off") + '"><a class="cart-thumb" href="' + esc(M.url(p)) + '" style="' + M.toneStyle(i) + '">' + M.sleeveInner(p) + "</a>" +
        '<div class="co-info"><span class="caps">' + esc(p.group) + '</span><a href="' + esc(M.url(p)) + '">' + esc(p.name) + "</a>" +
        "<small>" + esc(ok ? T("chan." + x.mode) : T("cart.unavailable")) + "</small>" + eta + modeSel +
        '<button type="button" class="link" data-cq="' + esc(p.id) + '" data-d="0">' + esc(T("cart.remove")) + "</button></div>" +
        '<div class="co-qty">' + (ok ? '<div class="qty"><button type="button" data-cq="' + esc(p.id) + '" data-d="-1" aria-label="' + esc(T("item.dec", { name: p.name })) + '">−</button><output>' + x.q + '</output><button type="button" data-cq="' + esc(p.id) + '" data-d="1" aria-label="' + esc(T("item.inc", { name: p.name })) + '">+</button></div>' : "") + "</div>" +
        '<b class="co-price">' + (ok ? money(M.priceOf(p) * x.q) : "") + "</b>" + (addons ? '<div class="addons">' + addons + "</div>" : "") + "</div>";
    }).join("");
    renderSummary();
  }
  function renderSummary() {
    var list = lines();
    $("#sum-lines").innerHTML = list.length ? list.map(function (x) {
      return '<div class="sum-item"><span>' + (x.addon ? esc(T("me.addon")) + " " : "") + esc(dn(x.p.group, x.p.name)) + ' <i>× ' + x.q + "</i></span><span>" + money(x.price * x.q) + "</span></div>";
    }).join("") : '<p class="hint">' + esc(T("cart.empty")) + "</p>";
    $("#sum-sub").textContent = money(total(list)); $("#sum-total").textContent = money(total(list));
    syncDelivery();
  }
  function showErr(id, msg) { var e = $(id); e.textContent = msg; e.hidden = !msg; if (msg) e.scrollIntoView({ block: "nearest", behavior: "smooth" }); }

  $("#co-lines").addEventListener("click", function (e) {
    var ab = e.target.closest("button[data-ai]");
    if (ab) {
      var id = ab.dataset.ai, t = M.byId(ab.dataset.at), key = id + "|" + ab.dataset.at, d = +ab.dataset.d;
      var next = Math.max(0, (addonQty[key] || 0) + d);
      if (d > 0 && next > M.cart.qty(id)) return showErr("#err1", T("addon.limit"));
      if (d > 0 && t && M.tracked(t) && usedOf(t.id) >= t.stock) return showErr("#err1", T("err.stock", { name: t.name, n: Math.max(t.stock, 0) }));
      if (next) addonQty[key] = next; else delete addonQty[key];
      showErr("#err1", ""); return renderCart();
    }
    var b = e.target.closest("button[data-cq]"); if (!b) return;
    var pid = b.dataset.cq, dd = +b.dataset.d, p = M.byId(pid);
    if (dd === 0) M.cart.set(pid, 0, null, "co");
    else {
      var before = M.cart.qty(pid);
      M.cart.set(pid, before + dd, null, "co");
      if (dd > 0 && M.cart.qty(pid) === before && p) showErr("#err1", T("err.stock", { name: p.name, n: Math.max(p.stock || 0, 0) })); else showErr("#err1", "");
    }
    trimAddons();
  });
  $("#co-lines").addEventListener("change", function (e) {
    var sel = e.target.closest("select[data-m]"); if (!sel) return;
    M.cart.set(sel.dataset.m, M.cart.qty(sel.dataset.m), sel.value, "co");
  });
  function trimAddons() {
    Object.keys(addonQty).forEach(function (k) { var q = M.cart.qty(k.split("|")[0]); if (addonQty[k] > q) addonQty[k] = q; if (!addonQty[k]) delete addonQty[k]; });
  }
  M.cart.onChange(function () { trimAddons(); renderCart(); });

  // ---------- steps ----------
  function go(n) {
    step = n;
    $("#step1").hidden = n !== 1; $("#step2").hidden = n !== 2;
    $$("#stepper li").forEach(function (li) { var s = +li.dataset.s; li.classList.toggle("on", s === n); li.classList.toggle("done", s < n); li.setAttribute("aria-current", s === n ? "step" : "false"); });
    try { window.scrollTo({ top: 0, behavior: window.FX && window.FX.reduce ? "auto" : "smooth" }); } catch (e) { window.scrollTo(0, 0); }
  }
  $("#to2").addEventListener("click", function () {
    var list = lines();
    if (!list.length) return showErr("#err1", T("err.items"));
    var need = {};
    list.forEach(function (x) { if (M.tracked(x.p) && x.mode !== "preorder") need[x.p.id] = (need[x.p.id] || 0) + x.q; });
    var short = Object.keys(need).filter(function (id) { return need[id] > Math.max(M.byId(id).stock, 0); })[0];
    if (short) return showErr("#err1", T("err.stock", { name: M.byId(short).name, n: Math.max(M.byId(short).stock, 0) }));
    showErr("#err1", ""); syncForm(); go(2);
  });
  $("#back1").addEventListener("click", function () { go(1); });

  // ---------- step 2: delivery ----------
  function deliveryOk(d, list) { return list.every(function (x) { return d.pickup ? M.hasSource(x.p) : M.chOf(x.p).indexOf("sf") >= 0; }); }
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
    var list = lines(), blocked = false, firstOk = null;
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
    $("#sum-ship").textContent = d.pickup ? T("co.ship.pickup") : T("co.ship.v");
  }
  $("#delivery").addEventListener("change", syncDelivery);

  function syncForm() {
    var off = !window.FIREBASE_CONFIG || S.ordersOpen === false, u = window.MHA.user, ready = window.MHA.ready;
    $("#closed").hidden = !off;
    $("#gate").hidden = off || !ready || !!u;
    $("#co-form").hidden = off || !u;
    if (u) {
      $("#whoami").textContent = u.email || "";
      if (!$("#f-name").value && u.displayName) $("#f-name").value = u.displayName;
    }
    $$("[data-s-ig]").forEach(function (a) { a.href = "https://www.instagram.com/" + S.instagram + "/"; a.textContent = "@" + S.instagram; });
  }
  $("#gate-btn").addEventListener("click", function () { window.MHA.open("in"); });
  $("#form-signout").addEventListener("click", function () { window.MHA.signOut(); });
  window.MHA.onChange(syncForm);

  // ---------- placing the order ----------
  function newOrderNo() {
    var abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", b = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(b);
    return "MH-" + Array.prototype.map.call(b, function (x) { return abc.charAt(x % 32); }).join("");
  }
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
  $("#co-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (pending) return;
    if (!window.MHA.user) { window.MHA.open("in"); return showErr("#err2", T("err.login")); }
    var name = $("#f-name").value.trim(), contact = $("#f-contact").value.trim(), address = $("#f-address").value.trim();
    var notes = $("#f-notes").value.trim(), d = curDelivery(), list = lines(), r = curRadio();
    if (!list.length) { go(1); return showErr("#err1", T("err.items")); }
    if (!name) return showErr("#err2", T("err.name"));
    if (!contact) return showErr("#err2", T("err.contact"));
    if (!r || r.disabled) return showErr("#err2", T("err.mixed"));
    if (!d.pickup && !address) return showErr("#err2", T("err.address"));
    if (!$("#f-agree").checked) return showErr("#err2", T("err.agree"));
    if ($("#f-website").value) return;
    showErr("#err2", "");
    var t = total(list);
    var o = {
      orderNo: newOrderNo(), name: name, contact: contact, delivery: dName(d, +r.value), address: d.pickup ? "" : address, notes: notes, total: t,
      items: list.map(function (x) { var it = { group: x.p.group, name: x.p.name, price: x.price, qty: x.q, mode: x.mode }; if (x.addon) { it.addon = true; it.addonOf = x.addonOf; } return it; })
    };
    var btn = $("#submit"); pending = true; btn.disabled = true; btn.textContent = T("review.sending");
    sendOrder(o).then(function () {
      try { sessionStorage.setItem("mh-order", JSON.stringify({ orderNo: o.orderNo, total: o.total, contact: o.contact, delivery: o.delivery, address: o.address, name: o.name, items: o.items })); } catch (err) { /* the payment page also reads the order number and amount from the address */ }
      M.cart.clear();
      location.href = "pay.html?o=" + encodeURIComponent(o.orderNo) + "&t=" + o.total;
    }).catch(function (err) {
      pending = false; btn.disabled = false; btn.textContent = T("co.place");
      if (err && err.message === "login") { window.MHA.open("in"); showErr("#err2", T("err.login")); }
      else showErr("#err2", T("err.submit", { ig: S.instagram }));
    });
  });

  // ---------- start ----------
  function remote() {
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 7000); });
    var work = getDb().then(function (c) {
      if (!c) return null;
      return c.fs.getDoc(c.fs.doc(c.db, "settings", "site")).then(function (d) { return d.exists() ? d.data() : null; }).catch(function () { return null; });
    }).catch(function () { return null; });
    return Promise.race([work, timeout]);
  }
  renderDelivery();
  window.MHA.init();
  Promise.all([M.loadProducts(), window.MHT.init(), remote()]).then(function (r) {
    var site = r[2];
    if (site) {
      if (site.ordersOpen === false) S.ordersOpen = false;
      if (site.instagram) S.instagram = site.instagram;
    }
    $("#co-loading").hidden = true; $("#co-grid").hidden = false;
    renderDelivery(); renderCart(); syncForm(); go(1);
    if (window.FX && window.FX.observe) window.FX.observe(document);
  });
})();
