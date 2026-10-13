// Shared shop code for the home page and the product page:
//  - product rules (price, sale price, sold out, how it can be bought), the same ones the order form uses
//  - loading the products from the database (with the sample products in settings.js as a fallback)
//  - the shopping cart (kept in this browser), the cart button, the slide-out cart and the "added" animation
//  - the rotating announcement bar and the perks strip (lists from content.js)
// window.MHShop is used by script.js (home page) and product.js (product page).
(function () {
  "use strict";
  var S = window.SETTINGS || {}, C = window.CONTENT || {};
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var T = function (k, vars) { return window.MHT ? window.MHT.t(k, undefined, vars) : k; };
  var money = function (n) { return "HK$" + n; };
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- product rules ----------
  function tracked(p) { return typeof p.stock === "number"; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  // sale price (特價) until its last day
  function priceOf(p) {
    var sp = p.salePrice;
    if (sp !== undefined && sp !== null && sp !== "" && isFinite(Number(sp)) && (!p.saleEnds || today() <= p.saleEnds)) return Number(sp);
    return Number(p.price) || 0;
  }
  function priceHtml(p) {
    var n = priceOf(p), o = Number(p.price) || 0;
    return n < o ? '<s class="was">' + money(o) + "</s> " + money(n) : money(n);
  }
  function offPct(p) { var n = priceOf(p), o = Number(p.price) || 0; return n < o && o > 0 ? Math.round((1 - n / o) * 100) : 0; }
  // How a product can be bought: stock = 格仔舖現貨, preorder = 訂購, sf = 順豐. Older products without a setting get stock + sf.
  var CH = ["stock", "preorder", "sf"];
  function chOf(p) {
    var c = Array.isArray(p.channels) ? p.channels.filter(function (x) { return CH.indexOf(x) >= 0; }) : [];
    return c.length ? c : ["stock", "sf"];
  }
  function hasSource(p) { var c = chOf(p); return c.indexOf("stock") >= 0 || c.indexOf("preorder") >= 0; }
  function defMode(p) { var c = chOf(p); return c.indexOf("stock") >= 0 ? "stock" : c.indexOf("preorder") >= 0 ? "preorder" : "sf"; }
  // a product with a stock number sells out by itself at 0 (pre-order products keep selling)
  function stockOut(p) { return tracked(p) && p.stock <= 0 && (Array.isArray(p.channels) ? p.channels.indexOf("preorder") < 0 : true); }
  function kindOf(p) {
    var s = (p.status || "").toLowerCase();
    if (s === "hidden" || s.indexOf("隱藏") >= 0) return "hidden";
    if (s === "pending") return "pending";
    if (s.indexOf("售罄") >= 0 || s.indexOf("sold") >= 0) return "sold";
    if (s.indexOf("門市") >= 0 || s.indexOf("store") >= 0) return "store";
    if (stockOut(p)) return "sold";
    return "ok";
  }
  // products marked 未到貨 can still be pre-ordered when they have the 訂購 option
  function pendingOrderable(p) { return kindOf(p) === "pending" && chOf(p).indexOf("preorder") >= 0; }
  function buyable(p) { return !!p && (kindOf(p) === "ok" || pendingOrderable(p)); }
  function imgSrc(v) { return /^(https?:)?\/\//.test(v) || v.charAt(0) === "/" || /^data:image\/(jpeg|png|webp);base64,/.test(v) ? v : "images/" + v; }
  function addonAvailable(t) { return (t.status || "") !== "sold" && !stockOut(t); }
  // the colour pair for a product without a photo, from the theme (--tone-1 … --tone-8)
  function toneStyle(i) { var n = (i % 8) + 1; return "background:var(--tone-" + n + "-bg);color:var(--tone-" + n + "-fg)"; }
  function sleeveInner(p) {
    return p.image
      ? '<img src="' + esc(imgSrc(p.image)) + '" alt="' + esc(p.group + " " + p.name) + '" loading="lazy">'
      : '<div class="sleeve-ph"><span class="caps">MHKPOP</span><b>' + esc(p.group) + "</b></div>";
  }
  function tagOf(p) {
    var k = kindOf(p);
    return k === "sold" ? T("shelf.soldTag") : k === "pending" ? T("shelf.pendingTag") : offPct(p) ? T("shelf.saleTag") : p.tag;
  }
  function url(p) { return "product.html?id=" + encodeURIComponent(p.id); }
  // sample products in settings.js have no id: give them one so the cart and product page can find them
  function withIds(list) { return (list || []).map(function (p, i) { return p.id ? p : Object.assign({ id: "demo-" + i }, p); }); }

  // ---------- loading ----------
  var all = [], loadP = null;
  function loadProducts() {
    if (loadP) return loadP;
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 7000); });
    var remote = (window.MHFB ? window.MHFB.load() : Promise.resolve(null)).then(function (c) {
      if (!c) return null;
      var fs = c.fs;
      return fs.getDocs(fs.query(fs.collection(c.db, "products"), fs.orderBy("order"))).then(function (q) {
        return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      });
    }).catch(function () { return null; });
    loadP = Promise.race([remote, timeout]).then(function (list) {
      setProducts(list && list.length ? list : (S.defaultProducts || []));
      return all;
    });
    return loadP;
  }
  function setProducts(list) { all = withIds(list); renderCart(); syncCount(); return all; }
  function byId(id) { return all.filter(function (p) { return p.id === id; })[0]; }
  function indexOf(p) { return all.indexOf(p); }
  function addonsFor(p) {
    return (p.addons || []).map(function (a) { var t = byId(a.id); return t ? { t: t, price: Number(a.price) || 0 } : null; }).filter(Boolean);
  }

  // ---------- product card (home page price list, related products) ----------
  function chanBadges(p) {
    var c = chOf(p), h = c.map(function (x) { return '<span class="chan chan-' + x + '">' + esc(T("chan." + x)) + "</span>"; }).join("");
    if (c.indexOf("preorder") >= 0 && p.eta) h += '<span class="eta">' + esc(T("chan.eta", { eta: p.eta })) + "</span>";
    if (tracked(p) && p.stock > 0 && p.stock <= 5 && c.indexOf("stock") >= 0) h += '<span class="eta low">' + esc(T("shelf.left", { n: p.stock })) + "</span>";
    var ad = addonsFor(p).filter(function (a) { return addonAvailable(a.t); });
    return '<div class="chans">' + h + "</div>" + (ad.length ? '<div class="addon-note">' + ad.map(function (a) { return esc(T("addon.card", { name: a.t.name, price: a.price })); }).join("<br>") + "</div>" : "");
  }
  // n = position in the grid (for the staggered entrance)
  function cardHtml(p, n) {
    var k = kindOf(p), tag = tagOf(p), off = offPct(p), href = esc(url(p)), can = buyable(p);
    var foot = k === "sold" ? '<span class="state">' + esc(T("shelf.soldFoot")) + "</span>"
      : k === "pending" && !pendingOrderable(p) ? '<span class="state">' + esc(T("shelf.pendingFoot")) + "</span>"
      : k === "store" ? '<span class="state">' + esc(T("shelf.storeFoot")) + "</span>"
      : '<a class="more" href="' + href + '">' + esc(T("shelf.view")) + "</a>";
    return '<article class="card reveal' + (k === "sold" ? " is-sold" : "") + (k === "pending" ? " is-pending" : "") + '" style="--i:' + ((n || 0) % 8) + '">' +
      '<div class="stage-wrap"><a class="stage" href="' + href + '" aria-label="' + esc(p.group + " " + p.name) + '"><div class="cd"></div>' +
      '<div class="sleeve" style="' + toneStyle(indexOf(p)) + '">' + sleeveInner(p) + "</div>" +
      (tag ? '<span class="tag' + (off ? " tag-sale" : "") + '">' + esc(tag) + "</span>" : "") +
      (off ? '<span class="off">' + esc(T("shelf.off", { n: off })) + "</span>" : "") + "</a>" +
      (can ? '<button type="button" class="quick-add" data-add="' + esc(p.id) + '"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>' + esc(T("cart.add")) + "</span></button>" : "") +
      "</div>" +
      '<div class="card-body"><div class="card-group caps">' + esc(p.group) + '</div><a class="card-name" href="' + href + '">' + esc(p.name) + "</a>" + chanBadges(p) + "</div>" +
      '<div class="card-foot"><span class="price">' + priceHtml(p) + "</span>" + foot + "</div></article>";
  }

  // ---------- cart (kept in this browser only) ----------
  var KEY = "mh-cart", items = read(), listeners = [];
  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter(function (x) { return x && x.id && x.q > 0; }) : []; }
    catch (e) { return []; }
  }
  function save(from) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* private mode: the cart lasts until the page closes */ }
    syncCount(); renderCart();
    listeners.forEach(function (fn) { fn(from); });
  }
  function line(id) { return items.filter(function (x) { return x.id === id; })[0]; }
  // largest quantity allowed for a product (stock limit unless it is pre-ordered)
  function maxQty(p, mode) { return !tracked(p) || mode === "preorder" ? 99 : Math.max(0, p.stock); }
  var cart = {
    items: function () { return items.slice(); },
    qty: function (id) { var l = line(id); return l ? l.q : 0; },
    mode: function (id) { var l = line(id); return l ? l.mode : ""; },
    count: function () { return items.reduce(function (s, x) { var p = byId(x.id); return s + (!all.length || buyable(p) ? x.q : 0); }, 0); },
    // set the quantity (0 removes). from = who changed it, so a listener can skip its own change.
    set: function (id, q, mode, from) {
      var l = line(id), p = byId(id);
      q = Math.max(0, Math.floor(Number(q) || 0));
      if (p) q = Math.min(q, maxQty(p, mode || (l && l.mode) || defMode(p)));
      if (!q) items = items.filter(function (x) { return x.id !== id; });
      else if (l) { l.q = q; if (mode) l.mode = mode; }
      else items.push({ id: id, q: q, mode: mode || (p ? defMode(p) : "stock") });
      save(from);
    },
    add: function (id, n, mode, from) {
      var p = byId(id), before = cart.qty(id);
      cart.set(id, before + (n || 1), mode, from);
      return cart.qty(id) > before || !p;
    },
    clear: function () { items = []; save("clear"); },
    onChange: function (fn) { listeners.push(fn); }
  };
  window.addEventListener("storage", function (e) { if (e.key === KEY) { items = read(); syncCount(); renderCart(); listeners.forEach(function (fn) { fn("storage"); }); } });

  // ---------- cart button, slide-out cart, toast ----------
  var onHome = !!$("#grid");
  var checkoutHref = "checkout.html";
  var drawer = null;
  function buildDrawer() {
    if (drawer || !document.body) return;
    drawer = document.createElement("div");
    drawer.className = "cart-layer"; drawer.id = "cart"; drawer.hidden = true;
    drawer.innerHTML = '<div class="cart-scrim" data-cart-close></div>' +
      '<aside class="cart-panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">' +
      '<header class="cart-head"><h3 id="cart-title" data-t="cart.title">' + esc(T("cart.title")) + '</h3><button type="button" class="cart-x" data-cart-close aria-label="' + esc(T("cart.close")) + '">×</button></header>' +
      '<div class="cart-body" id="cart-body"></div>' +
      '<footer class="cart-foot"><div class="cart-sub"><span>' + esc(T("cart.subtotal")) + '</span><b id="cart-total">HK$0</b></div>' +
      '<a class="btn btn-solid btn-lg cart-go" id="cart-go" href="' + checkoutHref + '">' + esc(T("cart.checkout")) + "</a>" +
      '<p class="hint">' + esc(T("cart.hint")) + "</p></footer></aside>";
    document.body.appendChild(drawer);
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("[data-cart-close]")) return closeCart();
      if (e.target.closest("#cart-go")) { closeCart(); return; }
      var b = e.target.closest("button[data-cq]"); if (!b) return;
      var id = b.getAttribute("data-cq"), d = +b.getAttribute("data-d");
      if (d === 0) cart.set(id, 0, null, "drawer"); else cart.set(id, cart.qty(id) + d, null, "drawer");
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && drawer && !drawer.hidden) closeCart(); });
    renderCart();
  }
  var lastFocus = null;
  function openCart() {
    buildDrawer(); renderCart();
    lastFocus = document.activeElement;
    drawer.hidden = false; document.documentElement.classList.add("cart-open");
    requestAnimationFrame(function () { drawer.classList.add("open"); var x = $(".cart-x", drawer); if (x) x.focus(); });
  }
  function closeCart() {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove("open"); document.documentElement.classList.remove("cart-open");
    setTimeout(function () { drawer.hidden = true; }, reduce ? 0 : 420);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function renderCart() {
    var body = $("#cart-body"); if (!body) return;
    var total = 0;
    var rows = items.map(function (x) {
      var p = byId(x.id);
      if (!p) return all.length ? "" : '<div class="cart-row"><div class="cart-info"><b>…</b></div></div>';
      var ok = buyable(p), price = priceOf(p), i = indexOf(p);
      if (ok) total += price * x.q;
      return '<div class="cart-row' + (ok ? "" : " is-off") + '">' +
        '<a class="cart-thumb" href="' + esc(url(p)) + '" style="' + toneStyle(i) + '">' + sleeveInner(p) + "</a>" +
        '<div class="cart-info"><span class="caps">' + esc(p.group) + "</span><a href=\"" + esc(url(p)) + '">' + esc(p.name) + "</a>" +
        "<small>" + esc(ok ? T("chan." + (x.mode || defMode(p))) : T("cart.unavailable")) + "</small>" +
        '<div class="cart-ctl">' + (ok ? '<div class="qty qty-sm"><button type="button" data-cq="' + esc(p.id) + '" data-d="-1" aria-label="' + esc(T("item.dec", { name: p.name })) + '">−</button><output>' + x.q + '</output><button type="button" data-cq="' + esc(p.id) + '" data-d="1" aria-label="' + esc(T("item.inc", { name: p.name })) + '">+</button></div>' : "") +
        '<button type="button" class="link" data-cq="' + esc(p.id) + '" data-d="0">' + esc(T("cart.remove")) + "</button></div></div>" +
        '<b class="cart-price">' + money(price * x.q) + "</b></div>";
    }).join("");
    body.innerHTML = rows || '<div class="cart-empty"><div class="cart-empty-disc" aria-hidden="true"></div><p>' + esc(T("cart.empty")) + '</p><a class="btn btn-line" href="' + (onHome ? "#shelf" : "index.html#shelf") + '" data-cart-close>' + esc(T("cart.browse")) + "</a></div>";
    $("#cart-total").textContent = money(total);
    var go = $("#cart-go"); if (go) go.classList.toggle("is-disabled", !total);
  }
  function syncCount() {
    var n = cart.count();
    Array.prototype.forEach.call(document.querySelectorAll(".cart-count"), function (el) {
      el.textContent = n > 99 ? "99+" : String(n); el.hidden = !n;
    });
  }
  function bump() {
    Array.prototype.forEach.call(document.querySelectorAll(".cart-btn"), function (b) {
      b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
    });
  }
  // a small copy of the album flies from the product to the cart button
  function fly(fromEl) {
    var target = document.querySelector(".cart-btn");
    if (reduce || !fromEl || !target || !fromEl.animate) { bump(); return; }
    var a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
    if (!a.width || b.bottom < 0) { bump(); return; }
    var ghost = fromEl.cloneNode(true), size = Math.min(a.width, 160);
    ghost.className = "fly-ghost"; ghost.removeAttribute("id");
    ghost.style.cssText = "left:" + (a.left + a.width / 2 - size / 2) + "px;top:" + (a.top + a.height / 2 - size / 2) + "px;width:" + size + "px;height:" + size + "px";
    document.body.appendChild(ghost);
    var dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    ghost.animate([
      { transform: "translate(0,0) scale(1) rotate(0)", opacity: 1 },
      { transform: "translate(" + dx * 0.45 + "px," + (dy * 0.45 - 90) + "px) scale(.55) rotate(-12deg)", opacity: 1, offset: 0.55 },
      { transform: "translate(" + dx + "px," + dy + "px) scale(.12) rotate(-30deg)", opacity: 0.2 }
    ], { duration: 760, easing: "cubic-bezier(.5,0,.3,1)" }).onfinish = function () { ghost.remove(); bump(); };
  }
  var toastEl = null, toastT = 0;
  function toast(msg, withLink) {
    if (!toastEl) { toastEl = document.createElement("div"); toastEl.className = "shop-toast"; toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.innerHTML = '<span class="shop-toast-dot" aria-hidden="true"></span><span>' + esc(msg) + "</span>" + (withLink ? '<button type="button" class="shop-toast-go">' + esc(T("cart.view")) + "</button>" : "");
    toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
    var go = $(".shop-toast-go", toastEl); if (go) go.onclick = function () { toastEl.classList.remove("show"); openCart(); };
  }
  // add a product to the cart with the animation and the message. fromEl = the picture it flies from.
  function addWithFx(p, n, mode, fromEl) {
    if (!p) return false;
    var ok = cart.add(p.id, n || 1, mode || (pendingOrderable(p) ? "preorder" : defMode(p)), "add");
    if (ok) { fly(fromEl); toast(T("cart.added", { name: p.name }), true); }
    else toast(T("err.stock", { name: p.name, n: Math.max(p.stock || 0, 0) }), false);
    return ok;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".cart-btn");
    if (b) { e.preventDefault(); openCart(); return; }
    var q = e.target.closest && e.target.closest(".card [data-add]");
    if (q) { var card = q.closest(".card"); addWithFx(byId(q.getAttribute("data-add")), 1, null, card && card.querySelector(".sleeve")); }
  });

  // ---------- announcement bar + perks (content.js) ----------
  var ICONS = {
    tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.6"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a3 3 0 0 1-5.3 2A3 3 0 0 1 12 14a3 3 0 0 1-2.7-1A3 3 0 0 1 4 11z"/><path d="M5 14v6h14v-6"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    truck: '<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + (ICONS[name] || ICONS.tag) + "</svg>"; }
  function announce() {
    var box = $("#announce"), list = (C.announcements || []).filter(function (a) { return a && a.text; });
    if (!box || !list.length) return;
    box.innerHTML = list.map(function (a, i) {
      var inner = esc(a.text);
      return '<li class="ann' + (i ? "" : " on") + '">' + (a.link ? '<a href="' + esc(a.link) + '">' + inner + "</a>" : "<span>" + inner + "</span>") + "</li>";
    }).join("");
    if (list.length < 2 || reduce) return;
    var n = 0, els = box.children, paused = false;
    box.addEventListener("mouseenter", function () { paused = true; });
    box.addEventListener("mouseleave", function () { paused = false; });
    setInterval(function () {
      if (paused || document.hidden) return;
      els[n].classList.remove("on"); els[n].classList.add("off");
      var prev = els[n]; setTimeout(function () { prev.classList.remove("off"); }, 700);
      n = (n + 1) % els.length; els[n].classList.add("on");
    }, 4200);
  }
  function perks() {
    var box = $("#perks"), list = C.perks || [];
    if (!box || !list.length) return;
    box.innerHTML = list.map(function (p) {
      return '<div class="perk"><span class="perk-ic">' + icon(p.icon) + '</span><div><b>' + esc(p.title) + "</b><small>" + esc(p.text) + "</small></div></div>";
    }).join("");
  }
  function heroExtras() {
    var st = $("#hero-stats"), list = C.heroStats || [];
    if (st && list.length) {
      st.innerHTML = list.map(function (s) { return '<div class="stat"><b><span data-count="' + esc(s.num) + '">' + esc(s.num) + "</span>" + esc(s.suffix || "") + "</b><small>" + esc(s.label) + "</small></div>"; }).join("");
      if (window.FX && window.FX.countUp && !reduce) Array.prototype.forEach.call(st.querySelectorAll("[data-count]"), function (el) { window.FX.countUp(el, el.getAttribute("data-count")); });
    }
    var cards = C.heroCards || [];
    Array.prototype.forEach.call(document.querySelectorAll("[data-hero-card]"), function (el) {
      var c = cards[+el.getAttribute("data-hero-card")];
      if (!c) { el.hidden = true; return; }
      el.innerHTML = '<span class="caps">' + esc(c.kicker) + "</span><b>" + esc(c.title) + "</b>";
    });
  }
  function boot() { buildDrawer(); syncCount(); announce(); perks(); heroExtras(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.MHShop = {
    esc: esc, money: money, T: T, icon: icon,
    tracked: tracked, today: today, priceOf: priceOf, priceHtml: priceHtml, offPct: offPct, chOf: chOf, hasSource: hasSource, defMode: defMode,
    stockOut: stockOut, kindOf: kindOf, pendingOrderable: pendingOrderable, buyable: buyable, imgSrc: imgSrc, addonAvailable: addonAvailable,
    toneStyle: toneStyle, sleeveInner: sleeveInner, chanBadges: chanBadges, cardHtml: cardHtml, indexOf: indexOf, tagOf: tagOf, url: url, withIds: withIds,
    loadProducts: loadProducts, setProducts: setProducts, byId: byId, addonsFor: addonsFor, products: function () { return all; },
    cart: cart, maxQty: maxQty, openCart: openCart, closeCart: closeCart, addWithFx: addWithFx, fly: fly, toast: toast
  };
})();
