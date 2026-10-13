// 主題設計 tab: colours, shapes, fonts and motion for the public website, with a live preview of the real site.
export function setupTheme(ctx) {
  const { db, fb, $, esc } = ctx;
  const { doc, onSnapshot, setDoc, serverTimestamp } = fb;
  const T = window.MHTheme;
  let unsub = null, state = { ...T.DEFAULT }, dirty = false, frameReady = false;
  const LOGOS = { squircle: "圓角方形", arch: "拱門", circle: "圓形", blob: "流動曲線", card: "卡片" };
  const RADII = { sharp: "直角", soft: "微圓角", round: "圓角", pill: "大圓角" };
  const CARDS = { outline: "線框", shadow: "陰影", flat: "平面" };
  const MOTION = { off: "不用動畫", subtle: "輕微", full: "完整（推薦）" };

  function radios(boxId, name, options, svg) {
    $(boxId).insertAdjacentHTML("beforeend", Object.keys(options).map((k) =>
      '<label class="th-opt"><input type="radio" name="' + name + '" value="' + k + '">' + (svg ? '<span class="th-shape th-shape-' + k + '"></span>' : "") + "<span>" + esc(options[k]) + "</span></label>").join(""));
  }
  radios("#th-radius", "th-radius", RADII); radios("#th-logo", "th-logo", LOGOS, true); radios("#th-cards", "th-cards", CARDS); radios("#th-motion", "th-motion", MOTION);
  $("#th-head").innerHTML = Object.keys(T.HEAD_FONTS).map((f) => '<option value="' + esc(f) + '">' + esc(f) + "</option>").join("");
  $("#th-body").innerHTML = Object.keys(T.BODY_FONTS).map((f) => '<option value="' + esc(f) + '">' + esc(f) + "</option>").join("");
  $("#th-presets").innerHTML = Object.keys(T.PRESETS).map((k) => {
    const p = T.PRESETS[k];
    return '<button type="button" class="th-preset" data-preset="' + k + '"><span class="th-sw"><i style="background:' + p.ground + '"></i><i style="background:' + p.cream + '"></i><i style="background:' + p.ink + '"></i><i style="background:' + p.accent + '"></i></span>' + esc(p.name) + "</button>";
  }).join("");

  function fill() {
    $("#th-ink").value = state.ink; $("#th-ground").value = state.ground; $("#th-cream").value = state.cream; $("#th-accent").value = state.accent;
    const set = (name, v) => { const r = document.querySelector('input[name="' + name + '"][value="' + v + '"]'); if (r) r.checked = true; };
    set("th-radius", state.radius); set("th-logo", state.logoShape); set("th-cards", state.cardStyle); set("th-motion", state.motion);
    $("#th-head").value = state.headFont; $("#th-body").value = state.bodyFont;
    document.querySelectorAll(".th-preset").forEach((b) => b.classList.toggle("on", b.dataset.preset === state.preset));
  }
  function read() {
    const g = (n) => { const r = document.querySelector('input[name="' + n + '"]:checked'); return r ? r.value : null; };
    state = T.normalise({ preset: state.preset, ink: $("#th-ink").value, ground: $("#th-ground").value, cream: $("#th-cream").value, accent: $("#th-accent").value,
      radius: g("th-radius"), logoShape: g("th-logo"), cardStyle: g("th-cards"), motion: g("th-motion"), headFont: $("#th-head").value, bodyFont: $("#th-body").value });
    return state;
  }
  function preview() {
    const f = $("#th-frame"); if (frameReady && f.contentWindow) f.contentWindow.postMessage({ type: "mh-theme", theme: state }, location.origin);
  }
  $("#th-frame").addEventListener("load", () => { frameReady = true; preview(); });

  $("#th-form").addEventListener("input", () => { state.preset = "custom"; read(); dirty = true; document.querySelectorAll(".th-preset").forEach((b) => b.classList.remove("on")); $("#th-saved").textContent = ""; preview(); });
  $("#th-presets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-preset]"); if (!b) return;
    const p = T.PRESETS[b.dataset.preset];
    state = T.normalise({ ...state, preset: b.dataset.preset, ink: p.ink, ground: p.ground, cream: p.cream, accent: p.accent });
    dirty = true; fill(); preview();
  });
  $("#th-reset").addEventListener("click", () => { state = { ...T.DEFAULT }; dirty = true; fill(); preview(); });
  document.querySelectorAll(".th-devices [data-dev]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".th-devices [data-dev]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("#th-frame-box").classList.toggle("mobile", b.dataset.dev === "mobile");
  }));
  $("#th-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#th-error"), btn = $("#th-save");
    read(); err.hidden = true; btn.disabled = true; $("#th-saved").textContent = "儲存中…";
    setDoc(doc(db, "settings", "theme"), { ...state, updatedAt: serverTimestamp() })
      .then(() => { dirty = false; $("#th-saved").textContent = "已儲存。網站已更新。"; })
      .catch(() => { $("#th-saved").textContent = ""; err.textContent = "儲存失敗。請確認已發布最新的安全規則，或稍後再試。"; err.hidden = false; })
      .then(() => { btn.disabled = false; });
  });

  function start() {
    stop();
    fill();
    unsub = onSnapshot(doc(db, "settings", "theme"), (snap) => { if (dirty) return; state = T.normalise(snap.exists() ? snap.data() : null); fill(); preview(); }, () => {});
  }
  function stop() { if (unsub) unsub(); unsub = null; dirty = false; }
  fill();
  return { start, stop };
}
