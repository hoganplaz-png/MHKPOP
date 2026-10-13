// Product page: product.html?id=<product id>. Shows one album with its price, how it can be bought,
// a quantity picker and "add to cart"; checkout happens on the home page order form.
(function () {
  "use strict";
  var M = window.MHShop, C = window.CONTENT || {}, T = M.T, esc = M.esc;
  var $ = function (sel) { return document.querySelector(sel); };
  var id = new URLSearchParams(location.search).get("id") || "";
  var p = null, n = 1;

  function mode() { return M.kindOf(p) === "pending" ? "preorder" : ($("#pd-mode-wrap").hidden ? M.defMode(p) : $("#pd-mode").value); }
  function room() { return Math.max(0, M.maxQty(p, mode()) - M.cart.qty(p.id)); }
  function syncQty() {
    var max = Math.max(1, room());
    n = Math.min(Math.max(1, n), max);
    $("#pd-qty").textContent = n;
    $("#pd-dec").disabled = n <= 1; $("#pd-inc").disabled = n >= max;
    $("#pd-add").disabled = $("#pd-bar-add").disabled = room() <= 0;
  }

  function render() {
    var k = M.kindOf(p), can = M.buyable(p), off = M.offPct(p), tag = M.tagOf(p);
    document.title = "MHKPOP｜" + p.group + " " + p.name;
    $("#pd-crumb").textContent = p.name;
    var sl = $("#pd-sleeve");
    sl.setAttribute("style", M.toneStyle(M.indexOf(p))); sl.innerHTML = M.sleeveInner(p);
    var img = sl.querySelector("img"); if (img) img.loading = "eager";
    if (tag) { $("#pd-tag").textContent = tag; $("#pd-tag").hidden = false; $("#pd-tag").classList.toggle("tag-sale", !!off); }
    $("#pd-group").textContent = p.group;
    $("#pd-name").textContent = p.name;
    $("#pd-price").innerHTML = M.priceHtml(p);
    if (off) { $("#pd-save").textContent = T("prod.save", { n: (Number(p.price) || 0) - M.priceOf(p) }) + " · " + T("shelf.off", { n: off }); $("#pd-save").hidden = false; }
    $("#pd-chans").innerHTML = M.chanBadges(p);
    var c = M.chOf(p);
    $("#pd-mode-wrap").hidden = !(can && k !== "pending" && c.indexOf("stock") >= 0 && c.indexOf("preorder") >= 0);
    if (M.cart.mode(p.id)) $("#pd-mode").value = M.cart.mode(p.id);
    $("#pd-buy").hidden = !can;
    var st = k === "sold" ? T("shelf.soldFoot") : k === "store" ? T("shelf.storeFoot") : k === "pending" && !can ? T("shelf.pendingFoot") : "";
    $("#pd-state").textContent = st; $("#pd-state").hidden = !st;
    $("#pd-tabs").innerHTML = (C.productTabs || []).map(function (t, i) {
      return "<details" + (i ? "" : " open") + "><summary>" + esc(t.title) + "</summary><p>" + esc(t.text) + "</p></details>";
    }).join("");
    $("#pd-bar-name").textContent = p.group + " " + p.name;
    $("#pd-bar-price").innerHTML = M.priceHtml(p);
    syncQty();

    // related: same group first, then the rest of the shelf
    var list = M.products().filter(function (x) { return x !== p && M.kindOf(x) !== "hidden"; });
    list.sort(function (a, b) { return (b.group === p.group) - (a.group === p.group) || (M.buyable(b) - M.buyable(a)); });
    list = list.slice(0, 4);
    $("#related").hidden = !list.length;
    $("#rel-grid").innerHTML = list.map(M.cardHtml).join("");
    $("#pd").hidden = false;
    requestAnimationFrame(function () { $("#pd").classList.add("in"); });
  }

  function add(go) {
    if (!M.buyable(p) || room() <= 0) return;
    M.addWithFx(p, n, mode(), $("#pd-sleeve"));
    n = 1; syncQty();
    if (go) location.href = "checkout.html";
  }
  $("#pd-dec").addEventListener("click", function () { n--; syncQty(); });
  $("#pd-inc").addEventListener("click", function () { n++; syncQty(); });
  $("#pd-mode").addEventListener("change", syncQty);
  $("#pd-add").addEventListener("click", function () { add(false); });
  $("#pd-bar-add").addEventListener("click", function () { add(false); });
  $("#pd-now").addEventListener("click", function () { add(true); });
  M.cart.onChange(function () { if (p) syncQty(); });

  // the bar at the bottom of the screen appears once the main button scrolls away
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      var bar = $("#pd-bar"), show = p && M.buyable(p) && !en[0].isIntersecting && en[0].boundingClientRect.top < 0;
      if (show) { bar.hidden = false; requestAnimationFrame(function () { bar.classList.add("show"); }); }
      else bar.classList.remove("show");
    }).observe($("#pd-add"));
  }

  Promise.all([M.loadProducts(), window.MHT.init()]).then(function () {
    $("#pd-loading").hidden = true;
    p = M.byId(id);
    if (!p || M.kindOf(p) === "hidden") { $("#pd-missing").hidden = false; $("#related").hidden = true; return; }
    render();
  });
})();
