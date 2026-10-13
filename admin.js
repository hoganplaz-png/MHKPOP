import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc, writeBatch, serverTimestamp, increment, arrayUnion, deleteField
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { setupShop } from "./shop.js";
import { setupMembers } from "./members.js";
import { setupContent } from "./admin-content.js";
import { PROGRESS, progressKey, effectivePrice } from "./shoplib.js";
import { setupProofCheck } from "./proofcheck.js";

const $ = (s) => document.querySelector(s);
const ORDER_STATUS = { new: "新訂單", confirmed: "已確認", done: "已完成", cancelled: "已取消" };
const PRODUCT_STATUS = { ok: "有貨", pending: "未到貨", sold: "售罄", store: "只限門市（舊設定）", hidden: "隱藏" };
const CHANNELS = { stock: "格仔舖現貨", preorder: "訂購", sf: "可寄順豐" };
const chOf = (p) => { const c = Array.isArray(p.channels) ? p.channels.filter((x) => CHANNELS[x]) : []; return c.length ? c : ["stock", "sf"]; };
const money = (n) => "HK$" + n;
const dn = (g, n) => { g = String(g || "").trim(); n = String(n || "").trim(); return !g || n.toLowerCase().includes(g.toLowerCase()) ? n : g + " " + n; };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const notice = (msg) => { const n = $("#notice"); n.textContent = msg; n.hidden = !msg; };
const cfg = window.FIREBASE_CONFIG;

if (!cfg) {
  notice("訂單系統尚未設定完成。請完成 Firebase 設定後重新部署網站。");
} else {
  const app = initializeApp(cfg);
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
  const db = getFirestore(app);
  const DEFAULTS = window.SETTINGS || {};
  let orders = [], products = [], payments = [], proofs = [], site = null, filter = "all";
  let unsubs = [];
  let editing = null;      // product being edited (object) or null for a new one
  let editingPay = null, payPhoto = "";
  let photo = "";          // data URL of the photo in the product form
  let siteDirty = false;
  const members = setupMembers({
    db, $, esc, notice,
    fb: { collection, doc, onSnapshot, query, orderBy, setDoc, updateDoc, writeBatch, serverTimestamp, increment }
  });
  const content = setupContent({
    db, $, esc, notice, shrink: (f, side) => shrink(f, side),
    fb: { collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, deleteField },
    getWebProducts: () => products
  });
  const shop = setupShop({
    db, $, esc, notice,
    fb: { collection, doc, onSnapshot, query, orderBy, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment, arrayUnion, deleteField },
    getOrders: () => orders, getWebProducts: () => products
  });
  // reads each payment screenshot and compares it with its order (see proofcheck.js)
  // only the check boxes and the filter counts are redrawn, so fields being typed in are not reset
  const pcheck = setupProofCheck({ onChange: () => refreshChecks() });

  // ---------- sign in / out ----------
  const stopAll = () => { unsubs.forEach((u) => u()); unsubs = []; };
  const denied = (err) => {
    if (err && err.code === "permission-denied") { notice("此帳戶沒有管理權限。請登出，再用管理員電郵登入。"); $("#app").hidden = true; }
    else notice("載入資料失敗，請稍後再試。");
  };

  onAuthStateChanged(auth, (user) => {
    stopAll(); shop.stop(); members.stop(); content.stop(); orders = []; products = []; payments = []; proofs = []; site = null; siteDirty = false;
    if (!user) {
      $("#login").hidden = false; $("#app").hidden = true; $("#who").hidden = true;
      return;
    }
    $("#login").hidden = true; $("#app").hidden = false; $("#who").hidden = false;
    $("#who-email").textContent = user.email;
    notice("");
    shop.start(); members.start(); content.start();
    unsubs.push(onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")),
      (snap) => { orders = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderOrders(); shop.ordersChanged(); }, denied));
    unsubs.push(onSnapshot(query(collection(db, "products"), orderBy("order")),
      (snap) => { products = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderProducts(); shop.productsChanged(); }, denied));
    unsubs.push(onSnapshot(query(collection(db, "proofs"), orderBy("createdAt", "desc")),
      (snap) => { proofs = snap.docs.map((d) => ({ id: d.id, ...d.data() })); pcheck.update(proofs); renderOrders(); }, denied));
    unsubs.push(onSnapshot(query(collection(db, "payments"), orderBy("order")),
      (snap) => { payments = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderPayments(); }, denied));
    unsubs.push(onSnapshot(doc(db, "settings", "site"),
      (snap) => { site = snap.exists() ? snap.data() : null; if (!siteDirty) fillSite(); }, denied));
    unsubs.push(onSnapshot(doc(db, "settings", "texts"),
      (snap) => { textMap = snap.exists() && snap.data().t ? snap.data().t : {}; if (!textsDirty) { edits = {}; renderTexts(); } }, denied));
    fillSite();
  });

  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#login-error"), btn = $("#login-btn");
    err.hidden = true; btn.disabled = true; btn.textContent = "登入中…";
    signInWithEmailAndPassword(auth, $("#email").value.trim(), $("#password").value)
      .catch(() => { err.textContent = "電郵或密碼不正確。"; err.hidden = false; })
      .finally(() => { btn.disabled = false; btn.textContent = "登入"; });
  });
  $("#signout").addEventListener("click", () => signOut(auth));

  // ---------- tabs ----------
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => {
      const on = x === t;
      x.setAttribute("aria-selected", String(on));
      $("#p-" + x.dataset.tab).hidden = !on;
    });
  }));

  // ---------- orders ----------
  const fmt = (o) => o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toLocaleString("zh-HK", { hour12: false }) : "";
  const proofsOf = (o) => proofs.filter((p) => p.orderNo === o.orderNo);
  const checksOf = (o) => proofsOf(o).map((p) => ({ p, r: pcheck.resultFor(o, p, proofs) }));
  // an order needs a manual check when any of its screenshots did not pass (or could not be read)
  const needsCheck = (o) => o.status !== "cancelled" && checksOf(o).some(({ r }) => r.state === "error" || (r.state === "done" && r.status === "review"));
  const visibleOrders = () => {
    const q = $("#search").value.trim().toLowerCase();
    return orders.filter((o) => (filter === "all" || (filter === "proof" ? proofsOf(o).length > 0 : filter === "review" ? needsCheck(o) : o.status === filter)) &&
      (!q || [o.orderNo, o.name, o.contact, o.email, o.address, o.notes].join(" ").toLowerCase().includes(q)));
  };

  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    filter = b.dataset.f; renderOrders();
  });
  $("#search").addEventListener("input", renderOrders);
  $("#orders").addEventListener("change", (e) => {
    const sel = e.target.closest("select[data-id]"); if (!sel) return;
    const tag = sel.parentElement.querySelector(".saving");
    tag.textContent = "儲存中…";
    const order = orders.find((o) => o.id === sel.dataset.id), status = sel.value, upd = { status };
    // keep the customer-visible progress in step with the status
    if (status === "confirmed" && (!order.progress || order.progress === "received")) upd.progress = "paid";
    if (status === "done") upd.progress = "done";
    updateDoc(doc(db, "orders", sel.dataset.id), upd)
      .then(() => {
        tag.textContent = "已儲存";
        // confirmed / done = a sale: stock goes down and the member gets points. cancelled = both are put back.
        const next = { ...order, ...upd };
        return Promise.all([shop.syncOrderSale(next, status), members.syncOrder(next, status)]);
      })
      .catch(() => { tag.textContent = "儲存失敗，請再試"; });
  });
  // progress, SF tracking number and a note the customer sees on their order page
  $("#orders").addEventListener("click", (e) => {
    const b = e.target.closest("[data-save-track]"); if (!b) return;
    const box = b.closest(".o-track"), tag = box.querySelector(".saving");
    tag.textContent = "儲存中…";
    updateDoc(doc(db, "orders", box.dataset.id), { progress: box.querySelector('[data-f="progress"]').value, tracking: box.querySelector('[data-f="tracking"]').value.trim(), customerNote: box.querySelector('[data-f="cnote"]').value.trim() })
      .then(() => { tag.textContent = "已儲存，客人可以看到"; })
      .catch(() => { tag.textContent = "儲存失敗，請再試"; });
  });
  $("#csv").addEventListener("click", () => {
    const q = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
    const rows = [["訂單編號", "時間", "狀態", "姓名", "聯絡方式", "帳戶電郵", "交收方式", "地址", "貨品", "總額(HK$)", "備註"]];
    visibleOrders().forEach((o) => rows.push([o.orderNo, fmt(o), ORDER_STATUS[o.status] || o.status, o.name, o.contact, o.email, o.delivery, o.address,
      (o.items || []).map((i) => i.group + " " + i.name + " x" + i.qty + (i.mode && CHANNELS[i.mode] ? " (" + CHANNELS[i.mode] + ")" : "")).join("; "), o.total, o.notes]));
    const blob = new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "mhkpop-orders.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  function renderFilters() {
    const count = (s) => orders.filter((o) => s === "all" || o.status === s).length;
    $("#c-orders").textContent = count("new") ? "(" + count("new") + " 新)" : "";
    const nProof = orders.filter((o) => proofsOf(o).length > 0).length, nReview = orders.filter(needsCheck).length;
    const label = { all: "全部", proof: "有付款截圖", review: "需人手核對" };
    $("#filters").innerHTML = ["all", "new", "confirmed", "done", "cancelled", "proof", "review"].map((s) =>
      '<button type="button" class="chip' + (s === "review" && nReview ? " chip-alert" : "") + '" data-f="' + s + '" aria-pressed="' + (filter === s) + '">' + (label[s] || ORDER_STATUS[s]) + " (" + (s === "proof" ? nProof : s === "review" ? nReview : count(s)) + ")</button>").join("");
  }
  function refreshChecks() {
    renderFilters();
    if (filter === "review") { renderOrders(); return; }
    document.querySelectorAll("[data-checks]").forEach((box) => {
      const o = orders.find((x) => x.id === box.dataset.checks); if (o) box.innerHTML = checksHtml(o);
    });
  }
  function renderOrders() {
    renderFilters();
    const list = visibleOrders();
    $("#empty").hidden = list.length > 0;
    $("#orders").innerHTML = list.map((o) => {
      const items = (o.items || []).map((i) => "<li><span>" + esc(dn(i.group, i.name)) + " × " + esc(i.qty) + (i.mode && CHANNELS[i.mode] ? ' <span class="o-mode">· ' + CHANNELS[i.mode] + "</span>" : "") + "</span><span>" + money(i.price * i.qty) + "</span></li>").join("");
      const sum = (o.items || []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
      const warn = sum !== o.total ? '<p class="o-warn">⚠ 總額 ' + money(o.total) + " 與貨品加起來的 " + money(sum) + " 不符，請小心核對，不要確認。</p>" : "";
      const opts = Object.keys(ORDER_STATUS).map((k) => '<option value="' + k + '"' + (o.status === k ? " selected" : "") + ">" + ORDER_STATUS[k] + "</option>").join("");
      return '<article class="order is-' + esc(o.status) + '">' +
        '<div class="o-head"><div><div class="o-no">' + esc(o.orderNo) + '</div><div class="o-time">' + esc(fmt(o)) + "</div></div>" +
        '<div><label class="sr" for="s-' + o.id + '">狀態</label><select class="o-status" id="s-' + o.id + '" data-id="' + o.id + '">' + opts + '</select> <span class="saving" aria-live="polite"></span></div></div>' +
        '<dl class="o-grid"><div><dt>姓名</dt><dd>' + esc(o.name) + "</dd></div><div><dt>聯絡方式</dt><dd>" + esc(o.contact) + "</dd></div>" +
        (o.email ? "<div><dt>帳戶電郵</dt><dd>" + esc(o.email) + "</dd></div>" : "") + "<div><dt>交收方式</dt><dd>" + esc(o.delivery) + "</dd></div>" +
        (o.address ? "<div><dt>地址</dt><dd>" + esc(o.address) + "</dd></div>" : "") +
        (o.notes ? "<div><dt>備註</dt><dd>" + esc(o.notes) + "</dd></div>" : "") + "</dl>" +
        '<ul class="o-items">' + items + '</ul><div class="o-total"><span>貨品總額（未計運費）</span><span>' + money(o.total) + "</span></div>" + warn +
        trackHtml(o) + proofHtml(o) + "</article>";
    }).join("");
  }

  function trackHtml(o) {
    if (o.status === "cancelled") return "";
    const cur = progressKey(o);
    const opts = PROGRESS.map(([k, t]) => '<option value="' + k + '"' + (cur === k ? " selected" : "") + ">" + t + "</option>").join("");
    const pts = o.uid ? members.pointsPreview(o) : 0;
    return '<div class="o-track" data-id="' + o.id + '"><label class="mini">訂單進度（客人可見）<select class="field" data-f="progress">' + opts + "</select></label>" +
      '<label class="mini">順豐單號（選填）<input class="field" data-f="tracking" maxlength="60" value="' + esc(o.tracking || "") + '"></label>' +
      '<label class="mini grow">給客人的備註（選填）<input class="field" data-f="cnote" maxlength="250" value="' + esc(o.customerNote || "") + '"></label>' +
      '<button type="button" class="btn btn-line" data-save-track>儲存進度</button><span class="saving" aria-live="polite"></span>' +
      (o.uid ? '<small class="hint">會員積分：' + (members.hasEarned(o) ? "已加分" : "按「已確認」後加 " + pts + " 分") + "</small>" : '<small class="hint">此訂單沒有會員帳戶（舊訂單）</small>') + "</div>";
  }
  function proofHtml(o) {
    const list = checksOf(o);
    if (!list.length) return '<p class="o-proof none">未有付款截圖</p>';
    return '<div class="o-proof"><b>付款截圖 (' + list.length + ")</b>" + list.map(({ p }) =>
      '<button type="button" class="proof-thumb" data-proof="' + p.id + '" aria-label="查看付款截圖"><img src="' + esc(p.image) + '" alt=""></button>').join("") + "</div>" +
      '<div class="o-checks" data-checks="' + esc(o.id) + '">' + checksHtml(o) + "</div>";
  }
  const checksHtml = (o) => { const list = checksOf(o); return list.map(({ p, r }, i) => checkHtml(p, r, list.length > 1 ? i + 1 : 0)).join(""); };
  const MARK = { ok: "✓", bad: "✗", info: "–" };
  function checkHtml(p, r, n) {
    const tag = n ? "（第 " + n + " 張）" : "";
    if (r.state === "pending") return '<div class="o-check is-pending" role="status"><span class="o-check-head"><span class="o-check-dot" aria-hidden="true"></span>自動核對中' + tag + "…</span></div>";
    if (r.state === "error") return '<div class="o-check is-review"><span class="o-check-head">無法自動讀取截圖' + tag + '，請人手核對</span><button type="button" class="o-check-again" data-recheck="' + p.id + '">再試</button></div>';
    const pass = r.status === "pass";
    return '<div class="o-check ' + (pass ? "is-pass" : "is-review") + '"><span class="o-check-head">' + (pass ? "自動核對：相符" : "自動核對：需人手核對") + tag + "</span>" +
      '<ul class="o-check-list">' + r.checks.map((c) => '<li class="' + c.state + '"><span aria-hidden="true">' + MARK[c.state] + "</span> " + esc(c.text) + "</li>").join("") + "</ul>" +
      '<small class="hint">' + (pass ? "仍請在 PayMe／Alipay 確認收到款項才按「已確認」。" : "請打開截圖，並在 PayMe／Alipay 核對。") + "</small></div>";
  }
  $("#orders").addEventListener("click", (e) => {
    const b = e.target.closest("[data-recheck]"); if (!b) return;
    const p = proofs.find((x) => x.id === b.dataset.recheck); if (p) pcheck.recheck(p);
  });
  $("#orders").addEventListener("click", (e) => {
    const b = e.target.closest("[data-proof]"); if (!b) return;
    const p = proofs.find((x) => x.id === b.dataset.proof); if (!p) return;
    $("#prdlg-img").src = p.image;
    $("#prdlg-meta").textContent = p.orderNo + (p.note ? " · 備註：" + p.note : "") + (p.createdAt && p.createdAt.toDate ? " · " + p.createdAt.toDate().toLocaleString("zh-HK", { hour12: false }) : "");
    const txt = pcheck.textOf(p.id);
    $("#prdlg-ocr").hidden = !txt; $("#prdlg-ocr-text").textContent = txt;
    $("#prdlg").showModal();
  });
  $("#prdlg-close").addEventListener("click", () => $("#prdlg").close());

  // ---------- products ----------
  function renderProducts() {
    $("#empty-products").hidden = products.length > 0;
    $("#import").hidden = products.length > 0 || !(DEFAULTS.defaultProducts && DEFAULTS.defaultProducts.length);
    $("#products").innerHTML = products.map((p, i) => {
      const thumb = p.image && /^data:image\//.test(p.image)
        ? '<img src="' + esc(p.image) + '" alt="">' : '<span>' + esc((p.group || "?").slice(0, 2)) + "</span>";
      const opts = Object.keys(PRODUCT_STATUS).map((k) => '<option value="' + k + '"' + (p.status === k ? " selected" : "") + ">" + PRODUCT_STATUS[k] + "</option>").join("");
      const sale = effectivePrice(p) !== (Number(p.price) || 0);
      return '<article class="prod' + (p.status === "hidden" ? " is-hidden" : "") + (p.status === "pending" ? " is-pending" : "") + '" data-id="' + p.id + '">' +
        '<div class="thumb">' + thumb + "</div>" +
        '<div class="p-main"><div class="p-group">' + esc(p.group) + "</div><div class=\"p-name\">" + esc(p.name) + "</div>" +
        '<div class="p-meta">' + (sale ? '<s>' + money(p.price) + "</s> <b>" + money(effectivePrice(p)) + "</b> 特價" : money(p.price)) + (p.status === "pending" ? ' · <b class="neg">未到貨</b>' : "") + (p.addons && p.addons.length ? " · 加購 " + p.addons.length + " 項" : "") + (p.tag ? " · " + esc(p.tag) : "") + (p.eta && chOf(p).includes("preorder") ? " · 預計到貨：" + esc(p.eta) : "") + "</div>" +
        '<div class="badges">' + chOf(p).map((c) => '<span class="badge">' + CHANNELS[c] + "</span>").join("") + "</div></div>" +
        '<div class="p-actions">' +
        '<label class="mini stk' + (typeof p.stock === "number" && p.stock <= 0 ? " neg" : "") + '">存庫<input class="inl" type="number" step="1" data-act="stock" placeholder="不追蹤" value="' + (typeof p.stock === "number" ? p.stock : "") + '"></label>' +
        '<label class="sr" for="ps-' + p.id + '">狀態</label><select class="o-status" id="ps-' + p.id + '" data-act="status">' + opts + "</select>" +
        '<button type="button" class="btn ' + (p.status === "pending" ? "btn-solid" : "btn-line") + '" data-act="pending">' + (p.status === "pending" ? "已到貨 ✓" : "標記未到貨") + "</button>" +
        '<button type="button" class="icon" data-act="up" aria-label="向上移" ' + (i === 0 ? "disabled" : "") + ">▲</button>" +
        '<button type="button" class="icon" data-act="down" aria-label="向下移" ' + (i === products.length - 1 ? "disabled" : "") + ">▼</button>" +
        '<button type="button" class="btn btn-line" data-act="edit">編輯</button></div></article>';
    }).join("");
  }

  $("#products").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); const card = e.target.closest(".prod"); if (!b || !card) return;
    const idx = products.findIndex((p) => p.id === card.dataset.id); if (idx < 0) return;
    if (b.dataset.act === "edit") return openProduct(products[idx]);
    if (b.dataset.act === "pending") {
      const next = products[idx].status === "pending" ? "ok" : "pending";
      return updateDoc(doc(db, "products", products[idx].id), { status: next }).catch(() => notice("儲存失敗，請再試。"));
    }
    if (b.dataset.act === "up" || b.dataset.act === "down") {
      const j = b.dataset.act === "up" ? idx - 1 : idx + 1;
      if (j < 0 || j >= products.length) return;
      const a = products[idx], c = products[j], batch = writeBatch(db);
      batch.update(doc(db, "products", a.id), { order: c.order });
      batch.update(doc(db, "products", c.id), { order: a.order });
      batch.commit().catch(() => notice("移動失敗，請再試。"));
    }
  });
  $("#products").addEventListener("change", (e) => {
    const card = e.target.closest(".prod"); if (!card) return;
    const stk = e.target.closest('input[data-act="stock"]');
    if (stk) {
      const v = stk.value.trim();
      updateDoc(doc(db, "products", card.dataset.id), { stock: v === "" ? deleteField() : Math.round(Number(v)) }).catch(() => notice("儲存失敗，請再試。"));
      return;
    }
    const sel = e.target.closest('select[data-act="status"]'); if (!sel) return;
    updateDoc(doc(db, "products", card.dataset.id), { status: sel.value }).catch(() => notice("儲存失敗，請再試。"));
  });

  $("#import").addEventListener("click", () => {
    const list = DEFAULTS.defaultProducts || [];
    const batch = writeBatch(db);
    list.forEach((p, i) => {
      const st = (p.status || "").indexOf("門市") >= 0 ? "store" : (p.status || "").indexOf("售罄") >= 0 ? "sold" : "ok";
      batch.set(doc(collection(db, "products")), { group: p.group, name: p.name, price: Number(p.price) || 0, tag: p.tag || "", image: "", status: st, order: i + 1, channels: Array.isArray(p.channels) ? p.channels : (st === "store" ? ["stock"] : ["stock", "sf"]), eta: "" });
    });
    batch.commit().catch(() => notice("匯入失敗，請確認已發布最新的安全規則。"));
  });

  // product form
  const dlg = $("#pdlg");
  const setPhoto = (v) => {
    photo = v || "";
    const pv = $("#p-preview"); pv.innerHTML = "";
    if (photo) { const im = document.createElement("img"); im.src = photo; im.alt = ""; pv.appendChild(im); }
    $("#p-photo-remove").hidden = !photo;
  };
  function openProduct(p) {
    editing = p || null;
    $("#pdlg-title").textContent = p ? "編輯商品" : "新增商品";
    $("#p-group").value = p ? p.group : ""; $("#p-name").value = p ? p.name : "";
    $("#p-price").value = p ? p.price : ""; $("#p-tag").value = p ? p.tag || "" : "";
    $("#p-status").value = p ? p.status || "ok" : "ok";
    $("#p-sale").value = p && p.salePrice != null && p.salePrice !== "" ? p.salePrice : ""; $("#p-saleends").value = p ? p.saleEnds || "" : "";
    const ch = p ? chOf(p) : ["stock", "sf"];
    Object.keys(CHANNELS).forEach((k) => { $("#p-ch-" + k).checked = ch.includes(k); });
    $("#p-eta").value = p ? p.eta || "" : "";
    $("#p-stock").value = p && typeof p.stock === "number" ? p.stock : "";
    $("#p-aliases").value = p ? (p.aliases || []).join("\n") : "";
    $("#p-addons").innerHTML = ""; (p && p.addons ? p.addons : []).forEach((a) => addAddonRow(a));
    $("#p-photo").value = ""; setPhoto(p ? p.image : "");
    $("#p-error").hidden = true; $("#p-delete").hidden = !p; $("#p-confirm").hidden = true;
    dlg.showModal();
  }
  // add-on rows: another product + its special price
  function addAddonRow(a) {
    const opts = products.filter((x) => !editing || x.id !== editing.id).map((x) => '<option value="' + esc(x.id) + '"' + (a && a.id === x.id ? " selected" : "") + ">" + esc(x.group + " " + x.name) + "（" + money(x.price) + "）</option>").join("");
    $("#p-addons").insertAdjacentHTML("beforeend", '<div class="addon-row"><label class="mini grow">加購商品<select class="field ad-prod">' + opts + '</select></label>' +
      '<label class="mini">加購價（HK$）<input class="field ad-price" type="number" min="0" step="any" inputmode="decimal" value="' + esc(a ? a.price : "") + '"></label><button type="button" class="icon ad-del" aria-label="移除">✕</button></div>');
  }
  $("#p-addon-add").addEventListener("click", () => { if (products.filter((x) => !editing || x.id !== editing.id).length) addAddonRow(null); else { $("#p-error").textContent = "請先建立其他商品，才可以設定加購。"; $("#p-error").hidden = false; } });
  $("#p-addons").addEventListener("click", (e) => { const d = e.target.closest(".ad-del"); if (d) d.closest(".addon-row").remove(); });
  $("#add-product").addEventListener("click", () => openProduct(null));
  $("#p-cancel").addEventListener("click", () => dlg.close());
  $("#p-photo-remove").addEventListener("click", () => { $("#p-photo").value = ""; setPhoto(""); });
  $("#p-photo").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const err = $("#p-error"); err.hidden = true;
    shrink(f).then(setPhoto).catch(() => { err.textContent = "這張相片無法使用，請試另一張。"; err.hidden = false; });
  });
  function shrink(file, maxSide = 800) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
        let q = 0.82, out = c.toDataURL("image/jpeg", q);
        while (out.length > 300000 && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
        out.length > 380000 ? reject(new Error("too big")) : resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      img.src = url;
    });
  }
  $("#pform").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#p-error"), btn = $("#p-save");
    const group = $("#p-group").value.trim(), name = $("#p-name").value.trim(), price = parseFloat($("#p-price").value);
    if (!group || !name) { err.textContent = "請填寫組合和專輯名稱。"; err.hidden = false; return; }
    if (isNaN(price) || price < 0) { err.textContent = "請填寫正確的價錢（只填數字）。"; err.hidden = false; return; }
    const channels = Object.keys(CHANNELS).filter((k) => $("#p-ch-" + k).checked);
    if (!channels.length) { err.textContent = "請最少選擇一種供應方式（格仔舖現貨、訂購或可寄順豐）。"; err.hidden = false; return; }
    err.hidden = true; btn.disabled = true; btn.textContent = "儲存中…";
    const stockRaw = $("#p-stock").value.trim();
    const aliases = [...new Set($("#p-aliases").value.split("\n").map((x) => x.trim()).filter(Boolean))].slice(0, 30);
    const addons = [...document.querySelectorAll("#p-addons .addon-row")].map((r) => ({ id: r.querySelector(".ad-prod").value, price: Number(r.querySelector(".ad-price").value) }))
      .filter((a) => a.id && Number.isFinite(a.price) && a.price >= 0);
    const data = { group, name, price, tag: $("#p-tag").value.trim(), image: photo, status: $("#p-status").value, channels, eta: $("#p-eta").value.trim(), aliases, addons };
    const saleRaw = $("#p-sale").value.trim();
    if (saleRaw !== "") { const sp = Number(saleRaw); if (!Number.isFinite(sp) || sp < 0) { err.textContent = "特價請填寫正確的數字。"; err.hidden = false; btn.disabled = false; btn.textContent = "儲存"; return; } data.salePrice = sp; data.saleEnds = $("#p-saleends").value; }
    else if (editing && editing.salePrice != null) { data.salePrice = deleteField(); data.saleEnds = deleteField(); }
    if (stockRaw !== "") data.stock = Math.round(Number(stockRaw)); else if (editing && typeof editing.stock === "number") data.stock = deleteField();
    const job = editing
      ? updateDoc(doc(db, "products", editing.id), data)
      : addDoc(collection(db, "products"), { ...data, order: products.reduce((m, p) => Math.max(m, p.order || 0), 0) + 1 });
    job.then(() => dlg.close())
      .catch(() => { err.textContent = "儲存失敗。請確認已發布最新的安全規則，或稍後再試。"; err.hidden = false; })
      .finally(() => { btn.disabled = false; btn.textContent = "儲存"; });
  });
  $("#p-delete").addEventListener("click", () => { $("#p-confirm").hidden = false; });
  $("#p-delete-no").addEventListener("click", () => { $("#p-confirm").hidden = true; });
  $("#p-delete-yes").addEventListener("click", () => {
    if (!editing) return;
    deleteDoc(doc(db, "products", editing.id)).then(() => dlg.close())
      .catch(() => { $("#p-error").textContent = "刪除失敗，請再試。"; $("#p-error").hidden = false; });
  });

  // ---------- payment methods ----------
  const PAY_TYPE = { qr: "二維碼", text: "文字資料", link: "付款連結" };
  function renderPayments() {
    $("#empty-pay").hidden = payments.length > 0;
    $("#import-pay").hidden = true;
    $("#payments").innerHTML = payments.map((m, i) => {
      const thumb = m.type === "qr" && m.image ? '<img src="' + esc(m.image) + '" alt="">' : "<span>" + esc((m.name || "?").slice(0, 2)) + "</span>";
      return '<article class="prod' + (m.enabled === false ? " is-hidden" : "") + '" data-id="' + m.id + '">' +
        '<div class="thumb">' + thumb + "</div>" +
        '<div class="p-main"><div class="p-group">' + esc(m.name) + '</div><div class="p-meta">' + PAY_TYPE[m.type] + (m.enabled === false ? " · 已關閉" : " · 顯示中") + "</div></div>" +
        '<div class="p-actions">' +
        '<button type="button" class="icon" data-act="up" aria-label="向上移" ' + (i === 0 ? "disabled" : "") + ">▲</button>" +
        '<button type="button" class="icon" data-act="down" aria-label="向下移" ' + (i === payments.length - 1 ? "disabled" : "") + ">▼</button>" +
        '<button type="button" class="btn btn-line" data-act="edit">編輯</button></div></article>';
    }).join("");
  }
  $("#payments").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); const card = e.target.closest(".prod"); if (!b || !card) return;
    const idx = payments.findIndex((p) => p.id === card.dataset.id); if (idx < 0) return;
    if (b.dataset.act === "edit") return openPay(payments[idx]);
    const j = b.dataset.act === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= payments.length) return;
    const a = payments[idx], c = payments[j], batch = writeBatch(db);
    batch.update(doc(db, "payments", a.id), { order: c.order });
    batch.update(doc(db, "payments", c.id), { order: a.order });
    batch.commit().catch(() => notice("移動失敗，請再試。"));
  });
  $("#import-pay").addEventListener("click", async () => {
    const list = DEFAULTS.defaultPayments || [];
    try {
      const batch = writeBatch(db);
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        let image = "";
        if (m.image) { image = await urlToDataUrl(m.image); }
        batch.set(doc(collection(db, "payments")), { name: m.name, type: m.type, details: m.details || "", link: m.link || "", image, order: i + 1, enabled: true });
      }
      await batch.commit();
    } catch (e) { notice("匯入失敗，請確認已發布最新的安全規則。"); }
  });
  function urlToDataUrl(url) {
    return fetch(url).then((r) => r.blob()).then((blob) => shrink(blob, 900));
  }

  const pmdlg = $("#pmdlg");
  const setPayPhoto = (v) => {
    payPhoto = v || "";
    const pv = $("#pm-preview"); pv.innerHTML = "";
    if (payPhoto) { const im = document.createElement("img"); im.src = payPhoto; im.alt = ""; pv.appendChild(im); }
    $("#pm-photo-remove").hidden = !payPhoto;
  };
  const syncPayType = () => {
    const t = $("#pm-type").value;
    $("#pm-photo-wrap").hidden = t !== "qr"; $("#pm-link-wrap").hidden = t !== "link";
  };
  $("#pm-type").addEventListener("change", syncPayType);
  function openPay(m) {
    editingPay = m || null;
    $("#pmdlg-title").textContent = m ? "編輯付款方式" : "新增付款方式";
    $("#pm-name").value = m ? m.name : ""; $("#pm-type").value = m ? m.type : "qr";
    $("#pm-details").value = m ? m.details || "" : ""; $("#pm-link").value = m ? m.link || "" : "";
    $("#pm-enabled").checked = m ? m.enabled !== false : true;
    $("#pm-photo").value = ""; setPayPhoto(m ? m.image : "");
    syncPayType();
    $("#pm-error").hidden = true; $("#pm-delete").hidden = !m; $("#pm-confirm").hidden = true;
    pmdlg.showModal();
  }
  $("#add-pay").addEventListener("click", () => openPay(null));
  $("#pm-cancel").addEventListener("click", () => pmdlg.close());
  $("#pm-photo-remove").addEventListener("click", () => { $("#pm-photo").value = ""; setPayPhoto(""); });
  $("#pm-photo").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const err = $("#pm-error"); err.hidden = true;
    shrink(f, 900).then(setPayPhoto).catch(() => { err.textContent = "這張圖片無法使用，請試另一張。"; err.hidden = false; });
  });
  $("#pmform").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#pm-error"), btn = $("#pm-save");
    const type = $("#pm-type").value, name = $("#pm-name").value.trim(), link = $("#pm-link").value.trim();
    if (!name) { err.textContent = "請填寫名稱。"; err.hidden = false; return; }
    if (type === "qr" && !payPhoto) { err.textContent = "請上傳二維碼圖片。"; err.hidden = false; return; }
    if (type === "link" && !/^https:\/\//.test(link)) { err.textContent = "付款連結必須以 https:// 開頭。"; err.hidden = false; return; }
    if (type === "text" && !$("#pm-details").value.trim()) { err.textContent = "請填寫付款資料。"; err.hidden = false; return; }
    err.hidden = true; btn.disabled = true; btn.textContent = "儲存中…";
    const data = { name, type, details: $("#pm-details").value.trim(), link: type === "link" ? link : "", image: type === "qr" ? payPhoto : "", enabled: $("#pm-enabled").checked };
    const job = editingPay
      ? updateDoc(doc(db, "payments", editingPay.id), data)
      : addDoc(collection(db, "payments"), { ...data, order: payments.reduce((m, p) => Math.max(m, p.order || 0), 0) + 1 });
    job.then(() => pmdlg.close())
      .catch(() => { err.textContent = "儲存失敗。請確認已發布最新的安全規則，或稍後再試。"; err.hidden = false; })
      .finally(() => { btn.disabled = false; btn.textContent = "儲存"; });
  });
  $("#pm-delete").addEventListener("click", () => { $("#pm-confirm").hidden = false; });
  $("#pm-delete-no").addEventListener("click", () => { $("#pm-confirm").hidden = true; });
  $("#pm-delete-yes").addEventListener("click", () => {
    if (!editingPay) return;
    deleteDoc(doc(db, "payments", editingPay.id)).then(() => pmdlg.close())
      .catch(() => { $("#pm-error").textContent = "刪除失敗，請再試。"; $("#pm-error").hidden = false; });
  });

  // ---------- every word on the website ----------
  const GROUPS = [
    ["nav", "頂部及選單"], ["hero", "首頁主視覺"], ["shelf", "價目區"], ["chan", "供應方式標籤"], ["how", "購買流程"], ["info", "購買須知"],
    ["ord", "落單區"], ["gate", "登入提示"], ["form", "落單表格"], ["item", "貨品選擇"], ["delivery", "交收方式"], ["err", "落單提示訊息"],
    ["review", "核對訂單視窗"], ["acct", "帳戶（登入／註冊）"], ["store", "門市"], ["faq", "常見問題"], ["foot", "頁尾"], ["legal", "條款連結"],
    ["promo", "活動及優惠區"], ["soon", "即將發售"], ["pg", "活動頁面（共用文字）"], ["pay", "付款頁面"], ["me", "會員及訂單頁面"], ["prog", "訂單進度名稱"], ["addon", "加購"], ["terms", "服務條款頁面"], ["priv", "私隱政策頁面"], ["idx", "瀏覽器標題"]
  ];
  let catalog = [], textMap = {}, edits = {}, textsDirty = false, catalogReady = false;

  async function loadCatalog() {
    const pages = ["index.html", "product.html", "soon.html", "page.html", "pay.html", "me.html", "terms.html", "privacy.html"];
    const items = new Map();
    for (const file of pages) {
      try {
        const res = await fetch(file, { cache: "no-store" });
        if (!res.ok) continue;
        const dom = new DOMParser().parseFromString(await res.text(), "text/html");
        dom.querySelectorAll("[data-t]").forEach((el) => {
          const k = el.getAttribute("data-t");
          if (!items.has(k)) items.set(k, { key: k, def: el.textContent.replace(/\s+/g, " ").trim() });
        });
      } catch (e) { /* skip this page */ }
    }
    Object.entries(window.MHT.DEFAULTS).forEach(([k, v]) => { if (!items.has(k)) items.set(k, { key: k, def: v }); });
    (DEFAULTS.delivery || []).forEach((d, i) => {
      items.set("delivery." + i + ".name", { key: "delivery." + i + ".name", def: d.name });
      if (d.note) items.set("delivery." + i + ".note", { key: "delivery." + i + ".note", def: d.note });
    });
    catalog = [...items.values()];
    catalogReady = true;
    renderTexts();
  }

  const curText = (it) => (edits[it.key] !== undefined ? edits[it.key] : (textMap[it.key] !== undefined && textMap[it.key] !== "" ? textMap[it.key] : it.def));
  const prefix = (k) => k.split(".")[0];

  function renderTexts() {
    const list = $("#tx-list");
    if (!catalogReady) { list.innerHTML = '<p class="empty">正在載入文字…</p>'; return; }
    const q = $("#tx-search").value.trim().toLowerCase();
    const known = new Set(GROUPS.map((g) => g[0]));
    const groups = GROUPS.concat([["_other", "其他"]]);
    let html = "";
    groups.forEach(([gk, gname]) => {
      const rows = catalog.filter((it) => (gk === "_other" ? !known.has(prefix(it.key)) : prefix(it.key) === gk) &&
        (!q || (it.def + " " + curText(it) + " " + it.key).toLowerCase().includes(q)));
      if (!rows.length) return;
      html += "<details" + (q ? " open" : "") + "><summary>" + esc(gname) + "（" + rows.length + "）</summary>" + rows.map((it, n) => {
        const v = curText(it), changed = v !== it.def;
        const id = "tx-" + gk + "-" + n, h = Math.min(10, Math.max(1, Math.ceil(v.length / 38)));
        const head = it.def.length > 36 ? it.def.slice(0, 36) + "…" : it.def;
        return '<div class="tx" data-k="' + esc(it.key) + '"><label for="' + id + '">' + esc(head) + "<small>" + esc(it.key) + '</small><span class="tx-changed">' + (changed ? "已修改" : "") + "</span></label>" +
          '<div class="tx-row"><textarea id="' + id + '" class="field" rows="' + h + '" maxlength="5000">' + esc(v) + "</textarea>" +
          '<button type="button" class="btn btn-line" data-reset="' + esc(it.key) + '"' + (changed ? "" : " disabled") + ">還原</button></div></div>";
      }).join("") + "</details>";
    });
    list.innerHTML = html || '<p class="empty">找不到相符的文字。</p>';
  }

  $("#tx-list").addEventListener("input", (e) => {
    const ta = e.target.closest("textarea"); const row = e.target.closest(".tx"); if (!ta || !row) return;
    const it = catalog.find((x) => x.key === row.dataset.k); if (!it) return;
    edits[it.key] = ta.value; textsDirty = true; $("#tx-status").textContent = "有未儲存的修改。";
    const changed = ta.value.trim() !== it.def;
    row.querySelector(".tx-changed").textContent = changed ? "已修改" : "";
    row.querySelector("[data-reset]").disabled = !changed;
  });
  $("#tx-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-reset]"); if (!b) return;
    const it = catalog.find((x) => x.key === b.dataset.reset); if (!it) return;
    edits[it.key] = it.def; textsDirty = true; $("#tx-status").textContent = "有未儲存的修改。";
    renderTexts();
  });
  $("#tx-search").addEventListener("input", renderTexts);
  $("#tx-save").addEventListener("click", () => {
    const err = $("#tx-error"), st = $("#tx-status"), btn = $("#tx-save");
    const t = {};
    catalog.forEach((it) => { const v = curText(it).trim(); if (v && v !== it.def) t[it.key] = v; });
    if (Object.keys(t).length > 700) { err.textContent = "修改的項目太多（上限 700 項）。"; err.hidden = false; return; }
    err.hidden = true; btn.disabled = true; st.textContent = "儲存中…";
    setDoc(doc(db, "settings", "texts"), { t })
      .then(() => { textsDirty = false; edits = {}; textMap = t; st.textContent = "已儲存。網站已更新。"; renderTexts(); })
      .catch(() => { st.textContent = ""; err.textContent = "儲存失敗。請確認已發布最新的安全規則，或稍後再試。"; err.hidden = false; })
      .finally(() => { btn.disabled = false; });
  });
  loadCatalog();

  // ---------- website text ----------
  const TEXT = ["headline", "intro", "shelfNote", "hours", "addressShort", "enquiryNote", "claims", "instagram", "paymentNote"];
  const LINES = ["addressLines", "stall"];
  const val = (k) => (site && site[k] !== undefined && site[k] !== "" ? site[k] : DEFAULTS[k]);
  function fillSite() {
    TEXT.forEach((k) => { $("#s-" + k).value = val(k) || ""; });
    LINES.forEach((k) => { $("#s-" + k).value = (val(k) || []).join("\n"); });
    $("#s-ordersOpen").checked = !(site && site.ordersOpen === false);
  }
  $("#site-form").addEventListener("input", () => { siteDirty = true; $("#site-saved").textContent = ""; });
  $("#site-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#site-error"), btn = $("#site-save"), saved = $("#site-saved");
    const data = { ordersOpen: $("#s-ordersOpen").checked };
    TEXT.forEach((k) => { data[k] = $("#s-" + k).value.trim(); });
    LINES.forEach((k) => { data[k] = $("#s-" + k).value.split("\n").map((x) => x.trim()).filter(Boolean); });
    data.instagram = data.instagram.replace(/^@/, "");
    err.hidden = true; btn.disabled = true; saved.textContent = "儲存中…";
    setDoc(doc(db, "settings", "site"), data, { merge: true })
      .then(() => { siteDirty = false; saved.textContent = "已儲存。網站已更新。"; })
      .catch(() => { saved.textContent = ""; err.textContent = "儲存失敗。請確認已發布最新的安全規則，或稍後再試。"; err.hidden = false; })
      .finally(() => { btn.disabled = false; });
  });
}
