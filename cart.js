// Shopping cart: kept in the browser (localStorage), shown in a slide-in drawer, checked out on checkout.html.
// A cart line is { pid, mode, qty, addonOf? }; names and prices are always read from the current product list.
(function () {
  "use strict";
  var Cat = window.MHCat, esc = Cat.esc, money = Cat.money;
  var T = function (k, v) { return window.MHT.t(k, undefined, v); };
  var KEY = "mh-cart", lines = [], products = [], listeners = [], drawer = null, overlay = null, btn = null;

  function load() {
    var a; try { a = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { a = []; }
    lines = Array.isArray(a) ? a.filter(function (l) { return l && typeof l.pid === "string" && l.qty > 0 && /^(stock|preorder|sf)$/.test(l.mode); }).slice(0, 60) : [];
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch (e) { /* private mode */ } emit(); }
  function emit() { render(); listeners.forEach(function (fn) { try { fn(); } catch (e) { /* keep going */ } }); }
  function byId(id) { return products.filter(function (p) { return p.id === id; })[0]; }
  function idOf(pid, mode, addonOf) { return pid + "|" + mode + (addonOf ? "|a|" + addonOf : ""); }

  // lines with their current product and price
  function resolved() {
    return lines.map(function (l) {
      var p = byId(l.pid), main = l.addonOf ? byId(l.addonOf) : null, price = 0;
      if (l.addonOf) { var cfg = main ? (main.addons || []).filter(function (a) { return a.id === l.pid; })[0] : null; price = cfg ? Number(cfg.price) || 0 : 0; }
      else if (p) price = Cat.priceOf(p);
      var ok = !!p && (l.addonOf ? !!main && !!(main.addons || []).filter(function (a) { return a.id === l.pid; })[0] : true);
      return { id: idOf(l.pid, l.mode, l.addonOf), pid: l.pid, mode: l.mode, qty: l.qty, addonOf: l.addonOf || "", p: p, main: main, price: price, ok: ok };
    });
  }
  function usedStock(pid) { return lines.reduce(function (n, l) { return n + (l.pid === pid && l.mode !== "preorder" ? l.qty : 0); }, 0); }
  function mainQty(pid) { return lines.reduce(function (n, l) { return n + (l.pid === pid && !l.addonOf ? l.qty : 0); }, 0); }
  function addonQty(main, target) { return lines.reduce(function (n, l) { return n + (l.pid === target && l.addonOf === main ? l.qty : 0); }, 0); }
  function trimAddons() {
    // add-ons cannot outnumber the albums they belong to
    var mains = {}; lines.forEach(function (l) { if (!l.addonOf) mains[l.pid] = (mains[l.pid] || 0) + l.qty; });
    var used = {};
    lines = lines.filter(function (l) {
      if (!l.addonOf) return true;
      var cap = mains[l.addonOf] || 0, key = l.addonOf + ">" + l.pid, have = used[key] || 0;
      if (have >= cap) return false;
      if (have + l.qty > cap) l.qty = cap - have;
      used[key] = have + l.qty; return l.qty > 0;
    });
  }

  var C = window.MHCart = {
    onChange: function (fn) { listeners.push(fn); },
    setProducts: function (list) { products = list || []; emit(); },
    lines: resolved,
    count: function () { return lines.reduce(function (n, l) { return n + l.qty; }, 0); },
    subtotal: function () { return resolved().reduce(function (s, l) { return s + (l.ok ? l.price * l.qty : 0); }, 0); },
    clear: function () { lines = []; save(); },
    // returns { ok: true } or { ok: false, reason: "stock"|"unavailable"|"addon", left }
    add: function (pid, mode, qty) {
      var p = byId(pid); qty = qty || 1;
      if (!p || !Cat.buyable(p) || Cat.modesOf(p).indexOf(mode) < 0) return { ok: false, reason: "unavailable" };
      if (Cat.tracked(p) && mode !== "preorder" && usedStock(pid) + qty > p.stock) return { ok: false, reason: "stock", left: Math.max(p.stock - usedStock(pid), 0), name: p.name };
      var id = idOf(pid, mode, ""), l = lines.filter(function (x) { return idOf(x.pid, x.mode, x.addonOf) === id; })[0];
      if (l) l.qty += qty; else lines.push({ pid: pid, mode: mode, qty: qty });
      save(); return { ok: true };
    },
    addAddon: function (mainPid, targetPid, delta) {
      var main = byId(mainPid), cfg = main ? (main.addons || []).filter(function (a) { return a.id === targetPid; })[0] : null, t = byId(targetPid);
      if (!cfg || !t || !Cat.addonAvailable(t)) return { ok: false, reason: "unavailable" };
      var mode = Cat.defMode(t), cur = addonQty(mainPid, targetPid), next = cur + delta;
      if (delta > 0 && next > mainQty(mainPid)) return { ok: false, reason: "addon" };
      if (delta > 0 && Cat.tracked(t) && mode !== "preorder" && usedStock(targetPid) + delta > t.stock) return { ok: false, reason: "stock", left: Math.max(t.stock - usedStock(targetPid), 0), name: t.name };
      var id = idOf(targetPid, mode, mainPid), l = lines.filter(function (x) { return idOf(x.pid, x.mode, x.addonOf) === id; })[0];
      if (l) { l.qty += delta; if (l.qty <= 0) lines = lines.filter(function (x) { return x !== l; }); }
      else if (delta > 0) lines.push({ pid: targetPid, mode: mode, qty: delta, addonOf: mainPid });
      save(); return { ok: true };
    },
    setQty: function (id, qty) {
      var l = lines.filter(function (x) { return idOf(x.pid, x.mode, x.addonOf) === id; })[0]; if (!l) return { ok: false, reason: "unavailable" };
      var p = byId(l.pid), d = qty - l.qty;
      if (d > 0 && p && Cat.tracked(p) && l.mode !== "preorder" && usedStock(l.pid) + d > p.stock) return { ok: false, reason: "stock", left: Math.max(p.stock - usedStock(l.pid), 0), name: p.name };
      if (qty <= 0) lines = lines.filter(function (x) { return x !== l; }); else l.qty = qty;
      trimAddons(); save(); return { ok: true };
    },
    remove: function (id) { return C.setQty(id, 0); },
    needsChoice: function (p) { return Cat.modesOf(p).length > 1; },
    toast: function (msg) {
      var t = document.getElementById("shop-toast");
      if (!t) { t = document.createElement("div"); t.id = "shop-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
      t.textContent = msg; t.classList.add("show"); clearTimeout(C._t); C._t = setTimeout(function () { t.classList.remove("show"); }, 2600);
    },
    reasonText: function (r) {
      if (r.reason === "stock") return T("err.stock", { name: r.name || "", n: r.left || 0 });
      if (r.reason === "addon") return T("addon.limit");
      return T("cart.unavailable");
    },
    // small image flies from the product to the cart button
    fly: function (fromEl) {
      if (window.FX && window.FX.reduce) return;
      var target = document.getElementById("cart-btn"); if (!fromEl || !target) return;
      var a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect(), img = fromEl.querySelector("img");
      var el = document.createElement("div"); el.className = "fly";
      el.style.cssText = "left:" + a.left + "px;top:" + a.top + "px;width:" + a.width + "px;height:" + a.height + "px;" + (img ? "background-image:url('" + img.currentSrc.replace(/'/g, "%27") + "')" : "");
      document.body.appendChild(el);
      var dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      el.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: "translate(" + dx * 0.55 + "px," + (dy * 0.55 - 70) + "px) scale(.6)", opacity: 1, offset: 0.55 }, { transform: "translate(" + dx + "px," + dy + "px) scale(.08)", opacity: .2 }], { duration: 750, easing: "cubic-bezier(.5,0,.3,1)" })
        .onfinish = function () { el.remove(); target.classList.remove("bump"); void target.offsetWidth; target.classList.add("bump"); };
    },
    open: function () { if (!drawer) return; document.body.classList.add("drawer-open"); overlay.hidden = false; drawer.hidden = false; requestAnimationFrame(function () { overlay.classList.add("on"); drawer.classList.add("on"); }); drawer.focus(); },
    close: function () { if (!drawer) return; overlay.classList.remove("on"); drawer.classList.remove("on"); document.body.classList.remove("drawer-open"); setTimeout(function () { if (!drawer.classList.contains("on")) { overlay.hidden = true; drawer.hidden = true; } }, 380); }
  };

  // ---------- drawer ----------
  function thumb(p) { var im = p ? Cat.imgSrc(p.image) : ""; return im ? '<img src="' + esc(im) + '" alt="">' : '<span>' + esc(p ? (p.group || "?").slice(0, 2) : "?") + "</span>"; }
  function render() {
    if (btn) { var n = C.count(), c = document.getElementById("cart-count"); c.textContent = n; c.hidden = !n; btn.setAttribute("aria-label", T("cart.title") + " (" + n + ")"); }
    if (!drawer) return;
    var ls = resolved(), mains = ls.filter(function (l) { return !l.addonOf; }), body = "";
    if (!ls.length) body = '<div class="cart-empty"><div class="ce-art" aria-hidden="true"><i></i><i></i><i></i></div><p>' + esc(T("cart.empty")) + '</p><button type="button" class="btn btn-solid" data-cart-close>' + esc(T("cart.keep")) + "</button></div>";
    else body = mains.map(function (l) {
      var p = l.p, adds = p ? Cat.addonsOf(p, products).filter(function (a) { return Cat.addonAvailable(a.t); }) : [];
      return '<div class="cl' + (l.ok ? "" : " bad") + '" data-id="' + esc(l.id) + '"><div class="cl-img">' + thumb(p) + '</div><div class="cl-main"><b>' + esc(p ? Cat.dn(p.group, p.name) : T("cart.gone")) + "</b><small>" + esc(T("chan." + l.mode)) + "</small>" +
        (p && Cat.priceOf(p) < (Number(p.price) || 0) ? '<small class="cl-sale">' + esc(T("shelf.saleTag")) + "</small>" : "") +
        '<div class="cl-row"><div class="qty"><button type="button" data-cq="dec" aria-label="' + esc(T("item.dec", { name: p ? p.name : "" })) + '">−</button><output>' + l.qty + '</output><button type="button" data-cq="inc" aria-label="' + esc(T("item.inc", { name: p ? p.name : "" })) + '">+</button></div><span class="cl-price">' + money(l.price * l.qty) + '</span></div></div>' +
        '<button type="button" class="cl-x" data-cq="rm" aria-label="' + esc(T("cart.remove")) + '">✕</button>' +
        adds.map(function (a) {
          var n = addonQty(l.pid, a.t.id);
          return '<div class="cl-add"><span>' + esc(T("addon.line", { name: a.t.name, price: a.price })) + '</span><div class="qty"><button type="button" data-aq="-1" data-main="' + esc(l.pid) + '" data-target="' + esc(a.t.id) + '" aria-label="' + esc(T("addon.dec", { name: a.t.name })) + '">−</button><output>' + n + '</output><button type="button" data-aq="1" data-main="' + esc(l.pid) + '" data-target="' + esc(a.t.id) + '" aria-label="' + esc(T("addon.inc", { name: a.t.name })) + '">+</button></div></div>';
        }).join("") + "</div>";
    }).join("");
    var foot = ls.length ? '<div class="cart-foot"><div class="cf-row"><span>' + esc(T("cart.subtotal")) + "</span><b>" + money(C.subtotal()) + '</b></div><p class="hint">' + esc(T("cart.note")) + '</p><a class="btn btn-solid btn-lg" href="checkout.html">' + esc(T("cart.checkout")) + '</a><button type="button" class="btn btn-line" data-cart-close>' + esc(T("cart.keep")) + "</button></div>" : "";
    drawer.querySelector(".cart-body").innerHTML = body; drawer.querySelector(".cart-foot-wrap").innerHTML = foot;
    drawer.querySelector(".cart-count-label").textContent = C.count() ? "(" + C.count() + ")" : "";
  }
  function mount() {
    var host = document.querySelector(".nav-actions");
    if (host && !document.getElementById("cart-btn")) {
      btn = document.createElement("button"); btn.type = "button"; btn.id = "cart-btn"; btn.className = "cart-btn";
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 8V7a3 3 0 0 1 6 0v1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span class="cart-count" id="cart-count" hidden>0</span>';
      host.insertBefore(btn, host.firstChild);
      btn.addEventListener("click", function () { C.open(); });
    }
    if (document.body.hasAttribute("data-no-drawer")) return;
    overlay = document.createElement("div"); overlay.className = "drawer-overlay"; overlay.hidden = true;
    drawer = document.createElement("aside"); drawer.className = "drawer"; drawer.hidden = true; drawer.tabIndex = -1; drawer.setAttribute("role", "dialog"); drawer.setAttribute("aria-label", T("cart.title"));
    drawer.innerHTML = '<div class="drawer-head"><h2>' + esc(T("cart.title")) + ' <span class="cart-count-label"></span></h2><button type="button" class="drawer-x" data-cart-close aria-label="' + esc(T("cart.close")) + '">✕</button></div><div class="cart-body"></div><div class="cart-foot-wrap"></div>';
    document.body.appendChild(overlay); document.body.appendChild(drawer);
    overlay.addEventListener("click", C.close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && drawer.classList.contains("on")) C.close(); });
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("[data-cart-close]")) return C.close();
      var q = e.target.closest("[data-cq]"), a = e.target.closest("[data-aq]"), res = null;
      if (q) {
        var id = q.closest(".cl").dataset.id, l = resolved().filter(function (x) { return x.id === id; })[0]; if (!l) return;
        res = q.dataset.cq === "rm" ? C.remove(id) : C.setQty(id, l.qty + (q.dataset.cq === "inc" ? 1 : -1));
      } else if (a) res = C.addAddon(a.dataset.main, a.dataset.target, +a.dataset.aq);
      if (res && !res.ok) C.toast(C.reasonText(res));
    });
  }
  load();
  window.addEventListener("storage", function (e) { if (e.key === KEY) { load(); emit(); } });
  var go = function () { mount(); render(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
