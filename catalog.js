// Shared product rules for the shop pages: price (with sale), how a product can be bought, stock and sold-out state.
(function () {
  "use strict";
  var CH = ["stock", "preorder", "sf"];
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function chOf(p) {
    var c = Array.isArray(p.channels) ? p.channels.filter(function (x) { return CH.indexOf(x) >= 0; }) : [];
    return c.length ? c : ["stock", "sf"];
  }
  var Cat = {
    money: function (n) { return "HK$" + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US"); },
    esc: function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); },
    dn: function (g, n) { g = String(g || "").trim(); n = String(n || "").trim(); return !g || n.toLowerCase().indexOf(g.toLowerCase()) >= 0 ? n : g + " " + n; },
    imgSrc: function (v) { v = String(v || ""); return !v ? "" : /^(https?:)?\/\//.test(v) || v.charAt(0) === "/" || /^data:image\/(jpeg|png|webp);base64,/.test(v) ? v : "images/" + v; },
    today: today,
    chOf: chOf,
    hasSource: function (p) { var c = chOf(p); return c.indexOf("stock") >= 0 || c.indexOf("preorder") >= 0; },
    defMode: function (p) { var c = chOf(p); return c.indexOf("stock") >= 0 ? "stock" : c.indexOf("preorder") >= 0 ? "preorder" : "sf"; },
    tracked: function (p) { return typeof p.stock === "number"; },
    stockOut: function (p) { return typeof p.stock === "number" && p.stock <= 0 && chOf(p).indexOf("preorder") < 0; },
    priceOf: function (p) {
      var sp = p.salePrice;
      if (sp !== undefined && sp !== null && sp !== "" && isFinite(Number(sp)) && (!p.saleEnds || today() <= p.saleEnds)) return Number(sp);
      return Number(p.price) || 0;
    },
    onSale: function (p) { return Cat.priceOf(p) < (Number(p.price) || 0); },
    // hidden | pending | sold | store | ok
    kindOf: function (p) {
      var s = String(p.status || "").toLowerCase();
      if (s === "hidden" || s.indexOf("隱藏") >= 0) return "hidden";
      if (s === "pending") return "pending";
      if (s.indexOf("售罄") >= 0 || s.indexOf("sold") >= 0) return "sold";
      if (s.indexOf("門市") >= 0 || s.indexOf("store") >= 0) return "store";
      if (Cat.stockOut(p)) return "sold";
      return "ok";
    },
    pendingOrderable: function (p) { return Cat.kindOf(p) === "pending" && chOf(p).indexOf("preorder") >= 0; },
    // can this product be put in the cart at all?
    buyable: function (p) { var k = Cat.kindOf(p); return k === "ok" || Cat.pendingOrderable(p); },
    // modes a customer can choose for this product
    modesOf: function (p) {
      if (Cat.kindOf(p) === "pending") return ["preorder"];
      var c = chOf(p), m = [];
      if (c.indexOf("stock") >= 0) m.push("stock");
      if (c.indexOf("preorder") >= 0) m.push("preorder");
      if (!m.length) m.push("sf");
      return m;
    },
    addonsOf: function (p, list) {
      return (p.addons || []).map(function (a) {
        var t = list.filter(function (x) { return x.id === a.id; })[0];
        return t ? { t: t, price: Number(a.price) || 0 } : null;
      }).filter(Boolean);
    },
    addonAvailable: function (t) { return (t.status || "") !== "sold" && !Cat.stockOut(t) && ((t.status || "") !== "pending" || Cat.pendingOrderable(t)); }
  };
  window.MHCat = Cat;
})();
