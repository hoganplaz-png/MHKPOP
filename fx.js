// Motion for the public pages: scroll reveals with stagger, scroll progress bar, hero parallax, spotlight on cards,
// magnetic buttons, button ripple, count-up numbers, countdown clocks and smooth page changes.
// Everything is switched off for visitors who ask their device for reduced motion.
(function () {
  "use strict";
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q).matches : false; };
  var reduce = mq("(prefers-reduced-motion: reduce)"), fine = mq("(hover: hover) and (pointer: fine)");
  var doc = document.documentElement, FX = window.FX = { reduce: reduce };
  if (!reduce) doc.classList.add("fx-on");

  // ---------- reveal on scroll ----------
  var AUTO = [".section-head", ".steps .step", ".info-grid > div", ".faq details", ".order-card", ".order-intro", ".store-wrap > div", ".legal h2", ".mo", ".member-card", ".soon-card", ".promo-card", ".blk-out", ".pay h2", ".ref", ".panel", ".perk", ".pd-info > *", ".rel-grid .card"];
  var seen = typeof WeakSet === "function" ? new WeakSet() : null, io = null;
  function show(el) { el.classList.add("in"); }
  if ("IntersectionObserver" in window && !reduce) {
    io = new IntersectionObserver(function (entries) {
      var n = 0;
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.style.setProperty("--rd", Math.min(n * 80, 400) + "ms"); n++;
        show(en.target); io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  }
  FX.observe = function (root) {
    root = root || document;
    AUTO.forEach(function (sel) { Array.prototype.forEach.call(root.querySelectorAll(sel), function (el) { el.classList.add("reveal"); }); });
    Array.prototype.forEach.call(root.querySelectorAll(".reveal"), function (el) {
      if (seen && seen.has(el)) return;
      if (seen) seen.add(el);
      if (io) io.observe(el); else show(el);
    });
  };
  FX.observe();
  if ("MutationObserver" in window && !reduce) {
    var t = 0;
    new MutationObserver(function () { clearTimeout(t); t = setTimeout(function () { FX.observe(); }, 30); }).observe(document.body, { childList: true, subtree: true });
  }
  window.addEventListener("beforeprint", function () { Array.prototype.forEach.call(document.querySelectorAll(".reveal"), show); });

  if (reduce) return;

  // ---------- scroll progress, nav shadow, hero parallax ----------
  var bar = document.createElement("div"); bar.id = "fx-progress"; bar.setAttribute("aria-hidden", "true"); document.body.appendChild(bar);
  var nav = document.querySelector(".nav"), heroArt = document.querySelector(".hero-art"), ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.pageYOffset, max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    bar.style.transform = "scaleX(" + Math.min(1, y / max) + ")";
    if (nav) nav.classList.toggle("scrolled", y > 8);
    if (heroArt && y < 1200) heroArt.style.setProperty("--py", Math.round(-y * 0.07) + "px");
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // ---------- pointer effects (mouse / trackpad only) ----------
  if (fine) {
    document.addEventListener("pointermove", function (e) {
      var card = e.target.closest && e.target.closest(".card, .soon-card, .promo-card");
      if (card) { var r = card.getBoundingClientRect(); card.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%"); card.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%"); }
      var btn = e.target.closest && e.target.closest(".btn-lg, .nav-actions .btn-solid");
      if (btn) { var b = btn.getBoundingClientRect(); btn.style.translate = ((e.clientX - b.left - b.width / 2) * 0.14) + "px " + ((e.clientY - b.top - b.height / 2) * 0.22) + "px"; }
    }, { passive: true });
    document.addEventListener("pointerout", function (e) {
      var btn = e.target.closest && e.target.closest(".btn-lg, .nav-actions .btn-solid");
      if (btn && !btn.contains(e.relatedTarget)) btn.style.translate = "";
    });
  }
  // the hero logo layers drift towards the pointer
  var orb = document.querySelector(".orb");
  if (orb && fine) {
    var hero = orb.closest(".hero") || orb, raf = 0, nx = 0, ny = 0;
    hero.addEventListener("pointermove", function (e) {
      var r = orb.getBoundingClientRect();
      nx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / r.width));
      ny = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / r.height));
      if (!raf) raf = requestAnimationFrame(function () { raf = 0; orb.style.setProperty("--tx", nx.toFixed(3)); orb.style.setProperty("--ty", ny.toFixed(3)); });
    }, { passive: true });
    hero.addEventListener("pointerleave", function () { orb.style.setProperty("--tx", 0); orb.style.setProperty("--ty", 0); });
  }
  document.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest(".btn:not(:disabled)"); if (!b) return;
    var r = b.getBoundingClientRect(), s = document.createElement("span"), size = Math.max(r.width, r.height) * 2;
    s.className = "fx-ripple"; s.style.cssText = "width:" + size + "px;height:" + size + "px;left:" + (e.clientX - r.left - size / 2) + "px;top:" + (e.clientY - r.top - size / 2) + "px";
    b.appendChild(s); setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 650);
  });

  // ---------- smooth page change ----------
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest("a[href]"); if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    var u; try { u = new URL(a.href, location.href); } catch (x) { return; }
    if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return;
    if (window.CSS && CSS.supports && CSS.supports("view-transition-name", "x")) return; // the browser animates it itself
    e.preventDefault(); document.body.classList.add("fx-leave");
    setTimeout(function () { location.href = a.href; }, 220);
  });
  window.addEventListener("pageshow", function (e) { if (e.persisted) document.body.classList.remove("fx-leave"); });

  // ---------- helpers other scripts use ----------
  FX.countUp = function (el, to, fmt) {
    to = Number(to) || 0; fmt = fmt || function (n) { return String(Math.round(n)); };
    var t0 = null, dur = 900;
    function step(ts) { if (t0 === null) t0 = ts; var p = Math.min(1, (ts - t0) / dur); el.textContent = fmt(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  };
})();

// Countdown clock (also used when motion is reduced). FX.countdown(element, "2026-11-01" | "2026-11-01T18:00", "已發售")
(function () {
  "use strict";
  window.FX = window.FX || {};
  var labels = { d: "日", h: "時", m: "分", s: "秒" };
  function parse(v) {
    var m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime() : NaN;
  }
  window.FX.countdown = function (el, when, endedText, lab) {
    var target = parse(when), L = lab || labels, timer = 0;
    if (!isFinite(target)) { el.textContent = ""; return; }
    function box(n, k) { return '<span class="cd-box"><b>' + (k === "d" ? n : ("0" + n).slice(-2)) + "</b><small>" + L[k] + "</small></span>"; }
    function tick() {
      var left = Math.floor((target - Date.now()) / 1000);
      if (left <= 0) { el.classList.add("ended"); el.textContent = endedText || ""; clearInterval(timer); return; }
      el.innerHTML = box(Math.floor(left / 86400), "d") + box(Math.floor(left / 3600) % 24, "h") + box(Math.floor(left / 60) % 60, "m") + box(left % 60, "s");
    }
    tick(); timer = setInterval(tick, 1000);
  };
})();
