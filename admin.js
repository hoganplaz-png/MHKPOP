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
  let orders = [], products = [], site = null, filter = "all";
  let unsubs = [];
  let editing = null;      // product being edited (object) or null for a new one
  let photo = "";          // data URL of the photo in the product form
  let siteDirty = false;

  // ---------- sign in / out ----------
  const stopAll = () => { unsubs.forEach((u) => u()); unsubs = []; };
  const denied = (err) => {
    if (err && err.code === "permission-denied") notice("此帳戶沒有權限。請用管理員電郵登入。");
    else notice("載入資料失敗，請稍後再試。");
  };

  onAuthStateChanged(auth, (user) => {
    stopAll(); orders = []; products = []; site = null; siteDirty = false;
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
  const visibleOrders = () => {
    const q = $("#search").value.trim().toLowerCase();
    return orders.filter((o) => (filter === "all" || o.status === filter) &&
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
    $("#filters").innerHTML = ["all", "new", "confirmed", "done", "cancelled"].map((s) =>
      '<button type="button" class="chip" data-f="' + s + '" aria-pressed="' + (filter === s) + '">' + (s === "all" ? "全部" : ORDER_STATUS[s]) + " (" + count(s) + ")</button>").join("");
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
        '<ul class="o-items">' + items + '</ul><div class="o-total"><span>貨品總額（未計運費）</span><span>' + money(o.total) + "</span></div></article>";
    }).join("");
  }

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
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const sc = Math.min(1, 800 / Math.max(img.width, img.height));
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

  // ---------- website text ----------
  const TEXT = ["headline", "intro", "shelfNote", "hours", "addressShort", "enquiryNote", "claims", "instagram"];
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
