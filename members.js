// Membership on the admin page (會員 tab): point rules and tiers, the member list, manual point changes,
// and automatic points when a website order is confirmed.
import { money, memberSettings, tierFor, pointsFor, DEFAULT_MEMBER } from "./shoplib.js";

export function setupMembers(ctx) {
  const { db, fb, $, esc, notice } = ctx;
  const { collection, doc, onSnapshot, query, orderBy, setDoc, updateDoc, writeBatch, serverTimestamp, increment } = fb;
  let members = [], logs = [], settings = memberSettings(null), unsubs = [], editing = null, settingsDirty = false;
  const fmtDate = (ts) => (ts && ts.toDate ? ts.toDate().toLocaleDateString("zh-HK") : "");
  const fmtTime = (ts) => (ts && ts.toDate ? ts.toDate().toLocaleString("zh-HK", { hour12: false }) : "");

  function start() {
    stop();
    const err = (e) => { if (!e || e.code !== "permission-denied") notice("載入會員資料失敗，請稍後再試。"); };
    unsubs.push(onSnapshot(collection(db, "members"), (snap) => { members = snap.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, err));
    unsubs.push(onSnapshot(query(collection(db, "pointlogs"), orderBy("createdAt", "desc")), (snap) => { logs = snap.docs.map((d) => ({ id: d.id, ...d.data() })); render(); }, err));
    unsubs.push(onSnapshot(doc(db, "settings", "member"), (snap) => { settings = memberSettings(snap.exists() ? snap.data() : null); if (!settingsDirty) fillSettings(); render(); }, err));
    fillSettings();
  }
  function stop() { unsubs.forEach((u) => u()); unsubs = []; members = []; logs = []; settings = memberSettings(null); settingsDirty = false; }

  // ---------- point rules ----------
  function tierRow(t) {
    return '<div class="tier-row"><label class="mini grow">等級名稱<input class="field tr-name" maxlength="30" value="' + esc(t.name) + '"></label>' +
      '<label class="mini">累積消費達 HK$<input class="field tr-min" type="number" min="0" step="any" value="' + esc(t.min) + '"></label>' +
      '<label class="mini">積分倍率<input class="field tr-mult" type="number" min="0" step="0.05" value="' + esc(t.mult) + '"></label><button type="button" class="icon tr-del" aria-label="移除這個等級">✕</button></div>';
  }
  function fillSettings() {
    $("#mb-enabled").checked = settings.enabled; $("#mb-per").value = settings.per;
    $("#mb-tiers").innerHTML = settings.tiers.map(tierRow).join("");
  }
  $("#mb-addtier").addEventListener("click", () => { $("#mb-tiers").insertAdjacentHTML("beforeend", tierRow({ name: "", min: 0, mult: 1 })); settingsDirty = true; });
  $("#mb-tiers").addEventListener("click", (e) => { const d = e.target.closest(".tr-del"); if (d) { d.closest(".tier-row").remove(); settingsDirty = true; } });
  $("#mb-form").addEventListener("input", () => { settingsDirty = true; $("#mb-saved").textContent = ""; });
  $("#mb-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#mb-error"), per = Number($("#mb-per").value);
    const tiers = [...document.querySelectorAll("#mb-tiers .tier-row")].map((r) => ({ name: r.querySelector(".tr-name").value.trim(), min: Number(r.querySelector(".tr-min").value) || 0, mult: Number(r.querySelector(".tr-mult").value) || 1 })).filter((t) => t.name);
    err.hidden = true;
    if (!(per > 0)) { err.textContent = "「每消費 HK$ 得 1 分」要大於 0。"; err.hidden = false; return; }
    if (!tiers.length) { err.textContent = "請最少保留一個會員等級（例如「一般會員」，累積消費 0）。"; err.hidden = false; return; }
    if (tiers.length > 6) { err.textContent = "最多 6 個等級。"; err.hidden = false; return; }
    $("#mb-saved").textContent = "儲存中…";
    setDoc(doc(db, "settings", "member"), { enabled: $("#mb-enabled").checked, per, tiers })
      .then(() => { settingsDirty = false; $("#mb-saved").textContent = "已儲存。"; })
      .catch(() => { $("#mb-saved").textContent = ""; err.textContent = "儲存失敗。請確認已發布最新的安全規則，或稍後再試。"; err.hidden = false; });
  });

  // ---------- member list ----------
  function render() {
    const q = $("#mb-search").value.trim().toLowerCase();
    const list = members.filter((m) => !q || [m.name, m.email, m.note].join(" ").toLowerCase().includes(q)).sort((a, b) => (b.spent || 0) - (a.spent || 0));
    const totalPts = members.reduce((t, m) => t + (Number(m.points) || 0), 0), totalSpent = members.reduce((t, m) => t + (Number(m.spent) || 0), 0);
    $("#mb-stats").innerHTML = [["會員人數", members.length + " 人"], ["會員累積消費", money(totalSpent)], ["未使用積分", totalPts + " 分"]].map(([k, v]) => '<div class="stat"><small>' + k + "</small><b>" + v + "</b></div>").join("");
    $("#mb-empty").hidden = members.length > 0;
    $("#mb-list").innerHTML = list.map((m) => {
      const t = tierFor(settings, Number(m.spent) || 0).tier;
      return '<article class="ex-row"><div class="ex-main"><b>' + esc(m.name || "（未填姓名）") + ' <span class="badge">' + esc(t.name) + "</span></b><small>" + esc(m.email) + " · 加入 " + esc(fmtDate(m.joinedAt)) + (m.note ? " · " + esc(m.note) : "") + "</small></div>" +
        '<div class="ex-amt">' + (Number(m.points) || 0) + ' 分<small class="block">累積消費 ' + money(Number(m.spent) || 0) + '</small></div><button type="button" class="btn btn-line" data-member="' + esc(m.id) + '">調整／紀錄</button></article>';
    }).join("");
  }
  $("#mb-search").addEventListener("input", render);

  // ---------- adjust points / view history ----------
  const mdlg = $("#mdlg");
  $("#mb-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-member]"); if (!b) return;
    editing = members.find((m) => m.id === b.dataset.member); if (!editing) return;
    $("#mdlg-title").textContent = (editing.name || editing.email) + " 的積分";
    $("#m-balance").textContent = (Number(editing.points) || 0) + " 分 · 累積消費 " + money(Number(editing.spent) || 0);
    $("#m-delta").value = ""; $("#m-reason").value = ""; $("#m-note").value = editing.note || ""; $("#m-error").hidden = true;
    const mine = logs.filter((l) => l.uid === editing.id);
    $("#m-logs").innerHTML = mine.length ? mine.map((l) => '<div class="web-row"><b class="' + (l.points < 0 ? "neg" : "pos") + '">' + (l.points > 0 ? "+" : "") + l.points + "</b><span>" + esc(l.note || l.type) + '</span><span class="o-mode">' + esc(fmtTime(l.createdAt)) + "</span></div>").join("") : '<p class="empty">未有積分紀錄。</p>';
    mdlg.showModal();
  });
  $("#m-cancel").addEventListener("click", () => mdlg.close());
  $("#mform").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!editing) return;
    const err = $("#m-error"), delta = Math.round(Number($("#m-delta").value) || 0), reason = $("#m-reason").value.trim(), note = $("#m-note").value.trim();
    const b = writeBatch(db), ref = doc(db, "members", editing.id);
    const upd = { note, updatedAt: serverTimestamp() };
    if (delta) {
      if (!reason) { err.textContent = "請填寫調整原因（例如「兌換優惠」「補回積分」）。"; err.hidden = false; return; }
      upd.points = increment(delta);
      b.set(doc(db, "pointlogs", "adj-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)), { uid: editing.id, points: delta, type: delta < 0 ? "redeem" : "adjust", note: reason, createdAt: serverTimestamp() });
    }
    b.update(ref, upd);
    err.hidden = true;
    b.commit().then(() => mdlg.close()).catch(() => { err.textContent = "儲存失敗。請確認已發布最新的安全規則，或稍後再試。"; err.hidden = false; });
  });

  // ---------- points for orders ----------
  // confirmed / done: add points once (the log id is fixed, so it can never be added twice). cancelled / new: take them back.
  async function syncOrder(order, status) {
    if (!order || !order.uid || !order.orderNo) return;
    const logId = "earn-" + order.orderNo, log = logs.find((l) => l.id === logId), m = members.find((x) => x.id === order.uid), total = Number(order.total) || 0;
    try {
      if ((status === "confirmed" || status === "done") && !log) {
        if (!settings.enabled) return;
        const pts = pointsFor(total, settings, m ? Number(m.spent) || 0 : 0);
        const b = writeBatch(db), base = { uid: order.uid, email: order.email || "", points: increment(pts), spent: increment(total), updatedAt: serverTimestamp() };
        if (!m) { base.name = order.name || ""; base.joinedAt = serverTimestamp(); }
        b.set(doc(db, "pointlogs", logId), { uid: order.uid, orderNo: order.orderNo, points: pts, type: "earn", note: "訂單 " + order.orderNo + "（消費 " + money(total) + "）", createdAt: serverTimestamp() });
        b.set(doc(db, "members", order.uid), base, { merge: true });
        await b.commit();
      } else if ((status === "new" || status === "cancelled") && log) {
        const b = writeBatch(db);
        b.delete(doc(db, "pointlogs", logId));
        if (m) b.update(doc(db, "members", order.uid), { points: increment(-(Number(log.points) || 0)), spent: increment(-total), updatedAt: serverTimestamp() });
        await b.commit();
      }
    } catch (e) { notice("訂單已更新，但未能更新會員積分，請到「會員」檢查。"); }
  }
  const pointsPreview = (order) => { const m = members.find((x) => x.id === order.uid); return pointsFor(Number(order.total) || 0, settings, m ? Number(m.spent) || 0 : 0); };

  return { start, stop, syncOrder, pointsPreview, hasEarned: (order) => logs.some((l) => l.id === "earn-" + order.orderNo), settings: () => settings, DEFAULT_MEMBER };
}
