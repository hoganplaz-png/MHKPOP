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
    var out = [], given = {};
    M.cart.items().forEach(function (x) {
      var p = M.byId(x.id); if (!p || !M.buyable(p)) return;
      var mode = x.mode || M.defMode(p);
      out.push({ p: p, q: x.q, mode: mode, price: M.priceOf(p) });
      M.addonsFor(p).forEach(function (a) {
        var n = Math.min(addonQty[p.id + "|" + a.t.id] || 0, x.q);
        if (a.max) n = Math.min(n, a.max - (given[a.t.id] || 0));   // 每張訂單只可加購 1 件
        if (n > 0) given[a.t.id] = (given[a.t.id] || 0) + n;
        if (n > 0) out.push({ p: a.t, q: n, mode: M.defMode(a.t), price: a.price, addon: true, addonOf: p.name });
      });
    });
    return out;
  }
  function total(list) { return list.reduce(function (s, x) { return s + x.price * x.q; }, 0); }

  // ---------- discount code ----------
  // The code is checked against the one document stored under its hash (see firestore.rules); the list of codes is never readable.
  var applied = null, L = null;     // applied = { code, id, doc, mine }
  var today = function () { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); };
  var lib = function () { return L ? Promise.resolve(L) : import("./shoplib.js").then(function (m) { L = m; return m; }); };
  function discountNow(sub) {
    if (!applied || !L) return 0;
    var r = L.evalCode(applied.doc, sub, window.MHA.user && window.MHA.user.email, applied.mine, today());
    return r.ok ? r.discount : 0;
  }
  function codeMsg(text, cls) { var m = $("#code-msg"); m.textContent = text || ""; m.className = "code-msg" + (cls ? " " + cls : ""); m.hidden = !text; }
  function dropCode(text) { applied = null; $("#code-in").value = ""; $("#code-apply").textContent = T("co.code.apply"); codeMsg(text, text ? "bad" : ""); renderSummary(); }
  $("#code-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (applied) return dropCode("");
    var u = window.MHA.user, raw = $("#code-in").value;
    if (!raw.trim()) return;
    if (!u) { window.MHA.open("in"); return codeMsg(T("co.code.login"), "bad"); }
    var sub = total(lines());
    codeMsg("…");
    Promise.all([lib(), getDb()]).then(function (r) {
      var lb = r[0], c = r[1];
      return lb.codeId(raw).then(function (id) {
        return Promise.all([
          c.fs.getDoc(c.fs.doc(c.db, "codes", id)).catch(function () { return null; }),
          c.fs.getDoc(c.fs.doc(c.db, "codes", id, "uses", u.uid)).catch(function () { return null; })
        ]).then(function (d) {
          var doc = d[0] && d[0].exists() ? d[0].data() : null, mine = d[1] && d[1].exists() ? Number(d[1].data().n) || 0 : 0;
          var res = lb.evalCode(doc, sub, u.email, mine, today());
          if (!res.ok) return codeMsg(T("co.code." + res.reason), "bad");
          applied = { code: lb.normCode(raw), id: id, doc: doc, mine: mine };
          $("#code-apply").textContent = T("co.code.remove");
          codeMsg(T("co.code.ok", { code: applied.code, amount: money(res.discount) }), "good");
          renderSummary();
        });
      });
    }).catch(function () { codeMsg(T("co.code.invalid"), "bad"); });
  });
  function usedOf(id) {
    var n = M.cart.qty(id);
    Object.keys(addonQty).forEach(function (k) { if (k.split("|")[1] === id) n += addonQty[k]; });
    return n;
  }

  // how many of one add-on product are ticked in the whole order (across every main product that offers it)
  function addonTotal(tid) {
    var n = 0;
    Object.keys(addonQty).forEach(function (k) { if (k.split("|")[1] === tid) n += addonQty[k]; });
    return n;
  }
  // Names the first tracked product that the order needs more of than is on the shelf, using the stock numbers in `stockOf` (id -> number or null).
  function shortage(list, stockOf) {
    var need = {};
    list.forEach(function (x) { if (M.tracked(x.p) && x.mode !== "preorder") need[x.p.id] = (need[x.p.id] || 0) + x.q; });
    var id = Object.keys(need).filter(function (k) { var s = stockOf(k); return typeof s === "number" && need[k] > Math.max(s, 0); })[0];
    return id ? { p: M.byId(id), n: Math.max(stockOf(id), 0) } : null;
  }
  // stock numbers straight from the database, so a stale page cannot oversell
  function freshStock() {
    return getDb().then(function (c) {
      if (!c) return null;
      return c.fs.getDocs(c.fs.collection(c.db, "products")).then(function (q) { var m = {}; q.docs.forEach(function (d) { m[d.id] = d.data().stock; }); return m; });
    }).catch(function () { return null; });
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
        return '<div class="addon-line"><span>' + esc(T("addon.line", { name: a.t.name, price: a.price })) + (a.max ? " · " + esc(T("addon.onlyOne")) : "") + '</span><div class="qty qty-sm"><button type="button" data-ai="' + esc(p.id) + '" data-at="' + esc(a.t.id) + '" data-d="-1" aria-label="' + esc(T("addon.dec", { name: a.t.name })) + '">−</button><output>' + n + '</output><button type="button" data-ai="' + esc(p.id) + '" data-at="' + esc(a.t.id) + '" data-d="1" aria-label="' + esc(T("addon.inc", { name: a.t.name })) + '">+</button></div></div>';
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
    var sub = total(list), disc = discountNow(sub);
    if (applied && !disc && sub > 0) { applied = null; $("#code-apply").textContent = T("co.code.apply"); codeMsg(T("co.code.min"), "bad"); }
    $("#sum-disc-row").hidden = !disc; $("#sum-disc").textContent = "−" + money(disc);
    $("#sum-sub").textContent = money(sub); $("#sum-total").textContent = money(sub - disc);
    syncDelivery();
  }
  function showErr(id, msg) { var e = $(id); e.textContent = msg; e.hidden = !msg; if (msg) e.scrollIntoView({ block: "nearest", behavior: "smooth" }); }

  $("#co-lines").addEventListener("click", function (e) {
    var ab = e.target.closest("button[data-ai]");
    if (ab) {
      var id = ab.dataset.ai, t = M.byId(ab.dataset.at), key = id + "|" + ab.dataset.at, d = +ab.dataset.d;
      var next = Math.max(0, (addonQty[key] || 0) + d);
      var cfg = M.addonsFor(M.byId(id)).filter(function (a) { return a.t.id === ab.dataset.at; })[0];
      if (d > 0 && next > M.cart.qty(id)) return showErr("#err1", T("addon.limit"));
      if (d > 0 && cfg && cfg.max && addonTotal(ab.dataset.at) >= cfg.max) return showErr("#err1", T("addon.one", { name: t.name }));
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
      if (dd > 0 && p && M.tracked(p) && M.cart.mode(pid) !== "preorder" && usedOf(pid) > p.stock) M.cart.set(pid, before, null, "co");   // add-ons of the same product use stock too
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
    var short = shortage(list, function (id) { return M.byId(id).stock; });
    if (short) return showErr("#err1", T("err.stock", { name: short.p.name, n: short.n }));
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
      var data = {
        orderNo: o.orderNo, uid: u.uid, email: u.email || "", name: o.name, contact: o.contact, delivery: o.delivery, address: o.address,
        notes: o.notes, items: o.items, total: o.total, agreed: true, status: "new", createdAt: c.fs.serverTimestamp()
      };
      if (!o.code) return c.fs.setDoc(c.fs.doc(c.db, "orders", o.orderNo), data);
      // with a code, the order and the code's use counters are saved together or not at all
      data.code = o.code.code; data.codeId = o.code.id; data.discount = o.discount;
      var b = c.fs.writeBatch(c.db), uses = c.fs.doc(c.db, "codes", o.code.id, "uses", u.uid);
      b.set(c.fs.doc(c.db, "orders", o.orderNo), data);
      b.update(c.fs.doc(c.db, "codes", o.code.id), { used: c.fs.increment(1), lastOrder: o.orderNo });
      b.set(uses, { n: c.fs.increment(1) }, { merge: true });
      return b.commit();
    });
  }
  $("#co-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (pending) return;
    if (!window.MHA.user) { window.MHA.open("in"); return showErr("#err2", T("err.login")); }
    if (!window.MHA.user.emailVerified) {
      // The shop only takes orders from verified email addresses (also enforced by the database rules).
      window.MHA.user.reload().then(function () { return window.MHA.user.getIdToken(true); }).catch(function () {}).then(function () {
        if (!window.MHA.user.emailVerified) { window.MHA.open("in"); showErr("#err2", T("err.verify")); }
        else showErr("#err2", T("err.verified"));
      });
      return;
    }
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
    var sub = total(list), disc = discountNow(sub), t = sub - disc;
    var o = {
      orderNo: newOrderNo(), name: name, contact: contact, delivery: dName(d, +r.value), address: d.pickup ? "" : address, notes: notes, total: t,
      code: disc ? applied : null, discount: disc,
      items: list.map(function (x) { var it = { group: x.p.group, name: x.p.name, price: x.price, qty: x.q, mode: x.mode }; if (x.addon) { it.addon = true; it.addonOf = x.addonOf; } return it; })
    };
    var btn = $("#submit"); pending = true; btn.disabled = true; btn.textContent = T("review.sending");
    freshStock().then(function (fresh) {
      var short = fresh && shortage(list, function (id) { return id in fresh ? fresh[id] : M.byId(id).stock; });
      if (short) {
        short.p.stock = short.n; M.cart.set(short.p.id, Math.min(M.cart.qty(short.p.id), short.n), null, "co"); trimAddons(); renderCart();
        var e = new Error("stock"); e.stock = short; throw e;
      }
      return sendOrder(o);
    }).then(function () {
      try { sessionStorage.setItem("mh-order", JSON.stringify({ orderNo: o.orderNo, total: o.total, contact: o.contact, delivery: o.delivery, address: o.address, name: o.name, items: o.items })); } catch (err) { /* the payment page also reads the order number and amount from the address */ }
      M.cart.clear();
      location.href = "pay.html?o=" + encodeURIComponent(o.orderNo) + "&t=" + o.total;
    }).catch(function (err) {
      pending = false; btn.disabled = false; btn.textContent = T("co.place");
      if (err && err.stock) { go(1); showErr("#err1", T("err.stock", { name: err.stock.p.name, n: err.stock.n })); }
      else if (err && err.message === "login") { window.MHA.open("in"); showErr("#err2", T("err.login")); }
      else { if (applied) dropCode(T("co.code.invalid")); showErr("#err2", T("err.submit", { ig: S.instagram })); }
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
  lib();
  window.MHA.onChange(function () { if (applied && !window.MHA.user) dropCode(""); });
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
