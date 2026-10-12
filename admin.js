import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const ORDER_STATUS = { new: "新訂單", confirmed: "已確認", done: "已完成", cancelled: "已取消" };
const PRODUCT_STATUS = { ok: "有貨", sold: "售罄", store: "只限門市", hidden: "隱藏" };
const money = (n) => "HK$" + n;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const notice = (msg) => { const n = $("#notice"); n.textContent = msg; n.hidden = !msg; };
const cfg = window.FIREBASE_CONFIG;

if (!cfg) {
  notice("訂單系統尚未設定完成。請完成 Firebase 設定後重新部署網站。");
} else {
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const DEFAULTS = window.SETTINGS || {};
  let orders = [], products = [], payments = [], proofs = [], site = null, filter = "all";
  let unsubs = [];
  let editing = null;      // product being edited (object) or null for a new one
  let editingPay = null, payPhoto = "";
  let photo = "";          // data URL of the photo in the product form
  let siteDirty = false;

  // ---------- sign in / out ----------
  const stopAll = () => { unsubs.forEach((u) => u()); unsubs = []; };
  const denied = (err) => {
    if (err && err.code === "permission-denied") notice("此帳戶沒有權限。請用管理員電郵登入。");
    else notice("載入資料失敗，請稍後再試。");
  };

  onAuthStateChanged(auth, (user) => {
    stopAll(); orders = []; products = []; payments = []; proofs = []; site = null; siteDirty = false;
    if (!user) {
      $("#login").hidden = false; $("#app").hidden = true; $("#who").hidden = true;
      return;
    }
    $("#login").hidden = true; $("#app").hidden = false; $("#who").hidden = false;
    $("#who-email").textContent = user.email;
    notice("");
    unsubs.push(onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")),
      (snap) => { orders = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderOrders(); }, denied));
    unsubs.push(onSnapshot(query(collection(db, "products"), orderBy("order")),
      (snap) => { products = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderProducts(); }, denied));
    unsubs.push(onSnapshot(query(collection(db, "proofs"), orderBy("createdAt", "desc")),
      (snap) => { proofs = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderOrders(); }, denied));
    unsubs.push(onSnapshot(query(collection(db, "payments"), orderBy("order")),
      (snap) => { payments = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderPayments(); }, denied));
    unsubs.push(onSnapshot(doc(db, "settings", "site"),
      (snap) => { site = snap.exists() ? snap.data() : null; if (!siteDirty) fillSite(); }, denied));
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
  const visibleOrders = () => {
    const q = $("#search").value.trim().toLowerCase();
    return orders.filter((o) => (filter === "all" || (filter === "proof" ? proofsOf(o).length > 0 : o.status === filter)) &&
      (!q || [o.orderNo, o.name, o.contact, o.address, o.notes].join(" ").toLowerCase().includes(q)));
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
    updateDoc(doc(db, "orders", sel.dataset.id), { status: sel.value })
      .then(() => { tag.textContent = "已儲存"; })
      .catch(() => { tag.textContent = "儲存失敗，請再試"; });
  });
  $("#csv").addEventListener("click", () => {
    const q = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
    const rows = [["訂單編號", "時間", "狀態", "姓名", "聯絡方式", "交收方式", "地址", "貨品", "總額(HK$)", "備註"]];
    visibleOrders().forEach((o) => rows.push([o.orderNo, fmt(o), ORDER_STATUS[o.status] || o.status, o.name, o.contact, o.delivery, o.address,
      (o.items || []).map((i) => i.group + " " + i.name + " x" + i.qty).join("; "), o.total, o.notes]));
    const blob = new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "mhkpop-orders.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  function renderOrders() {
    const count = (s) => orders.filter((o) => s === "all" || o.status === s).length;
    $("#c-orders").textContent = count("new") ? "(" + count("new") + " 新)" : "";
    const nProof = orders.filter((o) => proofsOf(o).length > 0).length;
    $("#filters").innerHTML = ["all", "new", "confirmed", "done", "cancelled", "proof"].map((s) =>
      '<button type="button" class="chip" data-f="' + s + '" aria-pressed="' + (filter === s) + '">' + (s === "all" ? "全部" : s === "proof" ? "有付款截圖" : ORDER_STATUS[s]) + " (" + (s === "proof" ? nProof : count(s)) + ")</button>").join("");
    const list = visibleOrders();
    $("#empty").hidden = list.length > 0;
    $("#orders").innerHTML = list.map((o) => {
      const items = (o.items || []).map((i) => "<li><span>" + esc(i.group) + " " + esc(i.name) + " × " + esc(i.qty) + "</span><span>" + money(i.price * i.qty) + "</span></li>").join("");
      const opts = Object.keys(ORDER_STATUS).map((k) => '<option value="' + k + '"' + (o.status === k ? " selected" : "") + ">" + ORDER_STATUS[k] + "</option>").join("");
      return '<article class="order is-' + esc(o.status) + '">' +
        '<div class="o-head"><div><div class="o-no">' + esc(o.orderNo) + '</div><div class="o-time">' + esc(fmt(o)) + "</div></div>" +
        '<div><label class="sr" for="s-' + o.id + '">狀態</label><select class="o-status" id="s-' + o.id + '" data-id="' + o.id + '">' + opts + '</select> <span class="saving" aria-live="polite"></span></div></div>' +
        '<dl class="o-grid"><div><dt>姓名</dt><dd>' + esc(o.name) + "</dd></div><div><dt>聯絡方式</dt><dd>" + esc(o.contact) + "</dd></div>" +
        "<div><dt>交收方式</dt><dd>" + esc(o.delivery) + "</dd></div>" +
        (o.address ? "<div><dt>地址</dt><dd>" + esc(o.address) + "</dd></div>" : "") +
        (o.notes ? "<div><dt>備註</dt><dd>" + esc(o.notes) + "</dd></div>" : "") + "</dl>" +
        '<ul class="o-items">' + items + '</ul><div class="o-total"><span>貨品總額（未計運費）</span><span>' + money(o.total) + "</span></div>" +
        proofHtml(o) + "</article>";
    }).join("");
  }

  function proofHtml(o) {
    const list = proofsOf(o);
    if (!list.length) return '<p class="o-proof none">未有付款截圖</p>';
    return '<div class="o-proof"><b>付款截圖 (' + list.length + ")</b>" + list.map((p) =>
      '<button type="button" class="proof-thumb" data-proof="' + p.id + '" aria-label="查看付款截圖"><img src="' + esc(p.image) + '" alt=""></button>').join("") + "</div>";
  }
  $("#orders").addEventListener("click", (e) => {
    const b = e.target.closest("[data-proof]"); if (!b) return;
    const p = proofs.find((x) => x.id === b.dataset.proof); if (!p) return;
    $("#prdlg-img").src = p.image;
    $("#prdlg-meta").textContent = p.orderNo + (p.note ? " · 備註：" + p.note : "") + (p.createdAt && p.createdAt.toDate ? " · " + p.createdAt.toDate().toLocaleString("zh-HK", { hour12: false }) : "");
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
      return '<article class="prod' + (p.status === "hidden" ? " is-hidden" : "") + '" data-id="' + p.id + '">' +
        '<div class="thumb">' + thumb + "</div>" +
        '<div class="p-main"><div class="p-group">' + esc(p.group) + "</div><div class=\"p-name\">" + esc(p.name) + "</div>" +
        '<div class="p-meta">' + money(p.price) + (p.tag ? " · " + esc(p.tag) : "") + "</div></div>" +
        '<div class="p-actions">' +
        '<label class="sr" for="ps-' + p.id + '">狀態</label><select class="o-status" id="ps-' + p.id + '" data-act="status">' + opts + "</select>" +
        '<button type="button" class="icon" data-act="up" aria-label="向上移" ' + (i === 0 ? "disabled" : "") + ">▲</button>" +
        '<button type="button" class="icon" data-act="down" aria-label="向下移" ' + (i === products.length - 1 ? "disabled" : "") + ">▼</button>" +
        '<button type="button" class="btn btn-line" data-act="edit">編輯</button></div></article>';
    }).join("");
  }

  $("#products").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); const card = e.target.closest(".prod"); if (!b || !card) return;
    const idx = products.findIndex((p) => p.id === card.dataset.id); if (idx < 0) return;
    if (b.dataset.act === "edit") return openProduct(products[idx]);
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
    const sel = e.target.closest('select[data-act="status"]'); const card = e.target.closest(".prod"); if (!sel || !card) return;
    updateDoc(doc(db, "products", card.dataset.id), { status: sel.value }).catch(() => notice("儲存失敗，請再試。"));
  });

  $("#import").addEventListener("click", () => {
    const list = DEFAULTS.defaultProducts || [];
    const batch = writeBatch(db);
    list.forEach((p, i) => {
      const st = (p.status || "").indexOf("門市") >= 0 ? "store" : (p.status || "").indexOf("售罄") >= 0 ? "sold" : "ok";
      batch.set(doc(collection(db, "products")), { group: p.group, name: p.name, price: Number(p.price) || 0, tag: p.tag || "", image: "", status: st, order: i + 1 });
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
    $("#p-photo").value = ""; setPhoto(p ? p.image : "");
    $("#p-error").hidden = true; $("#p-delete").hidden = !p; $("#p-confirm").hidden = true;
    dlg.showModal();
  }
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
    err.hidden = true; btn.disabled = true; btn.textContent = "儲存中…";
    const data = { group, name, price, tag: $("#p-tag").value.trim(), image: photo, status: $("#p-status").value };
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
    $("#import-pay").hidden = payments.length > 0 || !(DEFAULTS.defaultPayments && DEFAULTS.defaultPayments.length);
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
