// Website theme: colours, corner shape, fonts, logo shape, motion level. The shop owner designs it on the admin page (主題設計).
// Loaded in <head> so the saved theme is applied before the page is drawn (a copy is kept in the browser).
(function () {
  "use strict";
  var PRESETS = {
    forest:   { name: "森林墨綠", ink: "#122521", ground: "#FBFAF6", cream: "#FEFDFB", accent: "#8A1C14" },
    mono:     { name: "黑白灰",   ink: "#111111", ground: "#F4F4F4", cream: "#FFFFFF", accent: "#D62828" },
    blush:    { name: "櫻花粉",   ink: "#3B1F2B", ground: "#FFF5F7", cream: "#FFFFFF", accent: "#E0527A" },
    ocean:    { name: "海洋藍",   ink: "#0B2A4A", ground: "#F3F7FB", cream: "#FFFFFF", accent: "#E4572E" },
    lavender: { name: "薰衣草紫", ink: "#2B1E4F", ground: "#F7F4FD", cream: "#FFFFFF", accent: "#C2185B" },
    midnight: { name: "午夜深色", ink: "#F1EEE6", ground: "#0E1413", cream: "#172120", accent: "#E8B94F" }
  };
  var RADIUS = {
    sharp: { s: 2, m: 4, l: 6, btn: 2 }, soft: { s: 8, m: 14, l: 20, btn: 10 },
    round: { s: 10, m: 18, l: 26, btn: 999 }, pill: { s: 18, m: 28, l: 40, btn: 999 }
  };
  var HEAD_FONTS = { "Jost": "Jost:wght@400;500;600", "Playfair Display": "Playfair+Display:wght@500;700", "Montserrat": "Montserrat:wght@500;700", "Poppins": "Poppins:wght@500;600", "Cormorant Garamond": "Cormorant+Garamond:wght@500;700", "Bebas Neue": "Bebas+Neue", "Noto Serif TC": "Noto+Serif+TC:wght@500;700" };
  var BODY_FONTS = { "Noto Sans TC": "Noto+Sans+TC:wght@400;500;700;900", "Noto Serif TC": "Noto+Serif+TC:wght@400;500;700;900" };
  var DEFAULT = { preset: "forest", ink: PRESETS.forest.ink, ground: PRESETS.forest.ground, cream: PRESETS.forest.cream, accent: PRESETS.forest.accent, radius: "round", headFont: "Jost", bodyFont: "Noto Sans TC", logoShape: "squircle", motion: "full", cardStyle: "outline" };

  function rgb(h) { h = String(h || "").replace("#", ""); if (h.length === 3) h = h.replace(/(.)/g, "$1$1"); var n = parseInt(h, 16); return isNaN(n) || h.length !== 6 ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return "#" + [0, 1, 2].map(function (i) { return ("0" + Math.round(x[i] * (1 - t) + y[i] * t).toString(16)).slice(-2); }).join(""); }
  var ok = function (v, list, d) { return Object.prototype.hasOwnProperty.call(list, v) ? v : d; };
  var hex = function (v, d) { return /^#[0-9a-fA-F]{6}$/.test(v || "") ? v : d; };

  function normalise(t) {
    t = t || {};
    return {
      preset: t.preset || "custom", ink: hex(t.ink, DEFAULT.ink), ground: hex(t.ground, DEFAULT.ground), cream: hex(t.cream, DEFAULT.cream), accent: hex(t.accent, DEFAULT.accent),
      radius: ok(t.radius, RADIUS, DEFAULT.radius), headFont: ok(t.headFont, HEAD_FONTS, DEFAULT.headFont), bodyFont: ok(t.bodyFont, BODY_FONTS, DEFAULT.bodyFont),
      logoShape: ["squircle", "arch", "circle", "blob", "card"].indexOf(t.logoShape) >= 0 ? t.logoShape : DEFAULT.logoShape,
      motion: ["off", "subtle", "full"].indexOf(t.motion) >= 0 ? t.motion : DEFAULT.motion,
      cardStyle: ["outline", "shadow", "flat"].indexOf(t.cardStyle) >= 0 ? t.cardStyle : DEFAULT.cardStyle
    };
  }
  var fontLink = null;
  function apply(raw) {
    var t = normalise(raw), r = document.documentElement, st = r.style, rad = RADIUS[t.radius];
    var ink = t.ink, ground = t.ground, cream = t.cream;
    st.setProperty("--ink", ink); st.setProperty("--ground", ground); st.setProperty("--cream", cream); st.setProperty("--accent", t.accent);
    st.setProperty("--muted", mix(ink, ground, 0.32)); st.setProperty("--panel", mix(ground, ink, 0.08)); st.setProperty("--grey", mix(ground, ink, 0.3));
    st.setProperty("--ink-rgb", rgb(ink).join(", ")); st.setProperty("--cream-rgb", rgb(cream).join(", "));
    st.setProperty("--line", "rgba(" + rgb(ink).join(",") + ",.22)"); st.setProperty("--line-strong", "rgba(" + rgb(ink).join(",") + ",.45)");
    st.setProperty("--r-s", rad.s + "px"); st.setProperty("--r-m", rad.m + "px"); st.setProperty("--r-l", rad.l + "px"); st.setProperty("--r-btn", rad.btn + "px");
    st.setProperty("--font-head", '"' + t.headFont + '"'); st.setProperty("--font-body", '"' + t.bodyFont + '"');
    r.setAttribute("data-logo", t.logoShape); r.setAttribute("data-motion", t.motion); r.setAttribute("data-cards", t.cardStyle);
    r.setAttribute("data-dark", /^#(0|1|2)/i.test(ground) ? "1" : "0");
    var fams = [];
    if (t.headFont !== "Jost") fams.push(HEAD_FONTS[t.headFont]);
    if (t.bodyFont !== "Noto Sans TC") fams.push(BODY_FONTS[t.bodyFont]);
    var href = fams.length ? "https://fonts.googleapis.com/css2?" + fams.map(function (f) { return "family=" + f; }).join("&") + "&display=swap" : "";
    if (href && (!fontLink || fontLink.getAttribute("href") !== href)) {
      if (!fontLink) { fontLink = document.createElement("link"); fontLink.rel = "stylesheet"; document.head.appendChild(fontLink); }
      fontLink.setAttribute("href", href);
    }
    return t;
  }
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem("mh-theme") || "null"); } catch (e) { cached = null; }
  var passive = document.documentElement.hasAttribute("data-no-theme"); // the admin page only uses the presets, it is not themed itself
  if (cached && !passive) apply(cached);

  // live preview from the admin page (same site only)
  window.addEventListener("message", function (e) {
    if (passive || e.origin !== location.origin || !e.data || e.data.type !== "mh-theme") return;
    apply(e.data.theme);
  });

  window.MHTheme = {
    PRESETS: PRESETS, RADIUS: RADIUS, HEAD_FONTS: HEAD_FONTS, BODY_FONTS: BODY_FONTS, DEFAULT: DEFAULT, normalise: normalise, apply: apply,
    // called with the saved settings/theme document
    set: function (doc) {
      var t = apply(doc);
      try { localStorage.setItem("mh-theme", JSON.stringify(doc || {})); } catch (e) { /* private mode */ }
      return t;
    }
  };
})();
