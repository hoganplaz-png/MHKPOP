// Admin tabs 兌換 (products members can swap points for) and 優惠碼 (private discount codes).
// Codes are stored under the SHA-256 of the code, so nobody can list them; only the admin can read the whole collection.
import { codeId, normCode, money } from "./shoplib.js";

export function setupPerks(ctx) {
  const { db, fb, $, esc, notice, getWebProducts, getOrders } = ctx;
  const { collection, doc, onSnapshot, query, orderBy, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment } = fb;
  let rewards = [], redemptions = [], codes = [], unsubs = [];
  const fmtTime = (ts) => (ts && ts.toDate ? ts.toDate().toLocaleString("zh-HK", { hour12: false }) : "");
  const err = (e) => { if (!e || e.code !== "permission-denied") notice("載入資料失敗，請稍後再試。"); };
  const RSTATUS = { new: "待處理", fulfilled: "已交收", cancelled: "已取消（已退分）" };

  function start() {
    stop();
    unsubs.push(onSnapshot(query(collection(db, "rewards"), orderBy("order")), (s) => { rewards = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderRewards(); }, err));
    unsubs.push(onSnapshot(query(collection(db, "redemptions"), orderBy("createdAt", "desc")), (s) => { redemptions = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderRedemptions(); }, err));
    unsubs.push(onSnapshot(collection(db, "codes"), (s) => { codes = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderCodes(); }, err));
    fillProducts();
  }
  function stop() { unsubs.forEach((u) => u()); unsubs = []; rewards = []; redemptions = []; codes = []; }

  // ---------- rewards (兌換商品) ----------
  function fillProducts() {
    const dn = (p) => (p.group ? p.group + " " : "") + p.name;
    $("#rw-product").innerHTML = '<option value="">（自訂名稱）</option>' + getWebProducts().map((p) => '<option value="' + esc(p.id) + '">' + esc(dn(p)) + "</option>").join("");
  }
  $("#rw-product").addEventListener("focus", fillProducts);
  $("#rw-product").addEventListener("change", () => {
    const p = getWebProducts().find((x) => x.id === $("#rw-product").value);
    if (p) $("#rw-name").value = ((p.group ? p.group + " " : "") + p.name).slice(0, 100);
  });
  $("#rw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const e1 = $("#rw-error"), name = $("#rw-name").value.trim(), points = Math.round(Number($("#rw-points").value));
    e1.hidden = true;
    if (!name) { e1.textContent = "請填寫商品名稱。"; e1.hidden = false; return; }
    if (!(points > 0)) { e1.textContent = "所需積分要大於 0。"; e1.hidden = false; return; }
    const id = "rw-" + Date.now().toString(36);
    try {
      await setDoc(doc(db, "rewards", id), { name, points, productId: $("#rw-product").value, active: true, order: Date.now(), createdAt: serverTimestamp() });
      $("#rw-form").reset();
    } catch (x) { e1.textContent = "儲存失敗。請確認已發布最新的安全規則。"; e1.hidden = false; }
  });
  function renderRewards() {
    $("#rw-empty").hidden = rewards.length > 0;
    $("#rw-list").innerHTML = rewards.map((r) => '<article class="ex-row' + (r.active ? "" : " is-off") + '"><div class="ex-main"><b>' + esc(r.name) + "</b><small>" + (r.active ? "客人可兌換" : "已暫停，客人看不到") + '</small></div>' +
      '<label class="mini">所需積分<input class="field rw-pts" type="number" min="1" step="1" data-id="' + esc(r.id) + '" value="' + esc(r.points) + '" style="max-width:110px"></label>' +
      '<button type="button" class="btn btn-line" data-rw-toggle="' + esc(r.id) + '">' + (r.active ? "暫停" : "重新開放") + '</button><button type="button" class="btn btn-line" data-rw-del="' + esc(r.id) + '">刪除</button></article>').join("");
  }
  $("#rw-list").addEventListener("change", (e) => {
    const i = e.target.closest(".rw-pts"); if (!i) return;
    const v = Math.round(Number(i.value));
    if (v > 0) updateDoc(doc(db, "rewards", i.dataset.id), { points: v }).catch(() => notice("更新失敗。"));
  });
  $("#rw-list").addEventListener("click", (e) => {
    const t = e.target.closest("[data-rw-toggle]"), d = e.target.closest("[data-rw-del]");
    if (t) { const r = rewards.find((x) => x.id === t.dataset.rwToggle); if (r) updateDoc(doc(db, "rewards", r.id), { active: !r.active }).catch(() => notice("更新失敗。")); }
    if (d && confirm("刪除這個兌換商品？已提交的兌換紀錄不受影響。")) deleteDoc(doc(db, "rewards", d.dataset.rwDel)).catch(() => notice("刪除失敗。"));
  });

  // ---------- redemptions (客人提交的兌換) ----------
  // The customer's own page already took the points off. Cancelling here gives them back.
  function renderRedemptions() {
    const open = redemptions.filter((r) => r.status === "new").length;
    $("#rd-count").textContent = open ? open : "";
    $("#rd-empty").hidden = redemptions.length > 0;
    $("#rd-list").innerHTML = redemptions.map((r) => '<article class="ex-row"><div class="ex-main"><b>' + esc(r.name) + ' <span class="badge">' + esc(RSTATUS[r.status] || r.status) + "</span></b><small>" +
      esc(r.email) + " · " + esc(fmtTime(r.createdAt)) + '</small></div><div class="ex-amt">' + esc(r.points) + " 分</div>" +
      (r.status === "new" ? '<button type="button" class="btn btn-solid" data-rd-done="' + esc(r.id) + '">已交收</button><button type="button" class="btn btn-line" data-rd-cancel="' + esc(r.id) + '">取消並退分</button>' : "") + "</article>").join("");
  }
  $("#rd-list").addEventListener("click", async (e) => {
    const ok = e.target.closest("[data-rd-done]"), no = e.target.closest("[data-rd-cancel]");
    try {
      if (ok) await updateDoc(doc(db, "redemptions", ok.dataset.rdDone), { status: "fulfilled" });
      if (no) {
        const r = redemptions.find((x) => x.id === no.dataset.rdCancel);
        if (!r || r.status !== "new" || !confirm("取消這個兌換，並把 " + r.points + " 分退回給客人？")) return;
        const b = writeBatch(db);
        b.update(doc(db, "redemptions", r.id), { status: "cancelled" });
        b.update(doc(db, "members", r.uid), { points: increment(r.points), updatedAt: serverTimestamp() });
        b.set(doc(db, "pointlogs", "refund-" + r.id), { uid: r.uid, points: r.points, type: "adjust", note: "退回兌換：" + r.name, createdAt: serverTimestamp() });
        await b.commit();
      }
    } catch (x) { notice("更新失敗，請稍後再試。"); }
  });

  // ---------- discount codes (優惠碼) ----------
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  $("#cd-gen").addEventListener("click", () => {
    const b = new Uint8Array(8); crypto.getRandomValues(b);
    $("#cd-code").value = Array.from(b, (x) => ALPHA[x % 32]).join("");
  });
  const usedCount = (c) => getOrders().filter((o) => o.codeId === c.id && o.status !== "cancelled").length;
  $("#cd-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const e1 = $("#cd-error"), code = normCode($("#cd-code").value), type = $("#cd-type").value, value = Number($("#cd-value").value);
    const num = (id) => { const v = Math.round(Number($(id).value)); return v > 0 ? v : 0; };
    e1.hidden = true;
    if (!/^[A-Z0-9_-]{4,24}$/.test(code)) { e1.textContent = "優惠碼要 4–24 個英文字母或數字。可以按「隨機產生」。"; e1.hidden = false; return; }
    if (!(value > 0) || (type === "percent" && value > 100)) { e1.textContent = type === "percent" ? "折扣百分比要在 1 至 100 之間。" : "折扣金額要大於 0。"; e1.hidden = false; return; }
    const id = await codeId(code);
    if (codes.some((c) => c.id === id)) { e1.textContent = "已有相同的優惠碼。"; e1.hidden = false; return; }
    const data = { code, type, value, active: true, used: 0, maxUses: num("#cd-max"), perCustomer: num("#cd-per"), minSpend: num("#cd-min"), expires: $("#cd-exp").value || "", email: $("#cd-email").value.trim().toLowerCase(), note: $("#cd-note").value.trim().slice(0, 100), createdAt: serverTimestamp() };
    if (data.expires) data.expiresAt = new Date(data.expires + "T23:59:59+08:00");   // valid to the end of that day, Hong Kong time
    try { await setDoc(doc(db, "codes", id), data); $("#cd-form").reset(); }
    catch (x) { e1.textContent = "儲存失敗。請確認已發布最新的安全規則。"; e1.hidden = false; }
  });
  function codeDesc(c) {
    const bits = [c.type === "percent" ? c.value + "% off" : "減 " + money(c.value)];
    if (c.minSpend) bits.push("滿 " + money(c.minSpend));
    if (c.expires) bits.push("到 " + c.expires);
    if (c.maxUses) bits.push("共 " + c.maxUses + " 次");
    if (c.perCustomer) bits.push("每人 " + c.perCustomer + " 次");
    if (c.email) bits.push("限 " + c.email);
    return bits.join(" · ");
  }
  function renderCodes() {
    $("#cd-empty").hidden = codes.length > 0;
    $("#cd-list").innerHTML = codes.slice().sort((a, b) => ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0)).map((c) => '<article class="ex-row' + (c.active ? "" : " is-off") + '"><div class="ex-main"><b><code>' + esc(c.code) + "</code>" + (c.note ? " · " + esc(c.note) : "") + "</b><small>" + esc(codeDesc(c)) + '</small></div><div class="ex-amt">' + usedCount(c) + " 張訂單<small class=\"block\">計數 " + (Number(c.used) || 0) + "</small></div>" +
      '<button type="button" class="btn btn-line" data-cd-toggle="' + esc(c.id) + '">' + (c.active ? "停用" : "啟用") + '</button><button type="button" class="btn btn-line" data-cd-del="' + esc(c.id) + '">刪除</button></article>').join("");
  }
  $("#cd-list").addEventListener("click", (e) => {
    const t = e.target.closest("[data-cd-toggle]"), d = e.target.closest("[data-cd-del]");
    if (t) { const c = codes.find((x) => x.id === t.dataset.cdToggle); if (c) updateDoc(doc(db, "codes", c.id), { active: !c.active }).catch(() => notice("更新失敗。")); }
    if (d && confirm("刪除這個優惠碼？已用過的訂單不受影響。")) deleteDoc(doc(db, "codes", d.dataset.cdDel)).catch(() => notice("刪除失敗。"));
  });

  return { start, stop, ordersChanged: renderCodes };
}
