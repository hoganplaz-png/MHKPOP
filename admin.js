import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, query, orderBy, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const STATUS = { new: "新訂單", confirmed: "已確認", done: "已完成", cancelled: "已取消" };
const money = (n) => "HK$" + n;

const notice = (msg) => { const n = $("#notice"); n.textContent = msg; n.hidden = !msg; };
const cfg = window.FIREBASE_CONFIG;

if (!cfg) {
  notice("訂單系統尚未設定完成。請完成 Firebase 設定後重新部署網站。");
} else {
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let orders = [], filter = "all", unsub = null;

  onAuthStateChanged(auth, (user) => {
    if (unsub) { unsub(); unsub = null; }
    orders = [];
    if (!user) {
      $("#login").hidden = false; $("#dash").hidden = true; $("#who").hidden = true;
      return;
    }
    $("#login").hidden = true; $("#dash").hidden = false; $("#who").hidden = false;
    $("#who-email").textContent = user.email;
    notice("");
    unsub = onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")),
      (snap) => { orders = snap.docs.map((d) => ({ id: d.id, ...d.data() })); render(); },
      (err) => {
        if (err && err.code === "permission-denied") notice("此帳戶沒有查看訂單的權限。請用管理員電郵登入。");
        else notice("載入訂單失敗，請稍後再試。");
      });
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

  $("#filters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]"); if (!b) return;
    filter = b.dataset.f; render();
  });
  $("#search").addEventListener("input", render);

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
    visible().forEach((o) => rows.push([o.orderNo, fmt(o), STATUS[o.status] || o.status, o.name, o.contact, o.delivery, o.address,
      (o.items || []).map((i) => i.group + " " + i.name + " x" + i.qty).join("; "), o.total, o.notes]));
    const blob = new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "mhkpop-orders.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  const fmt = (o) => o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toLocaleString("zh-HK", { hour12: false }) : "";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function visible() {
    const q = $("#search").value.trim().toLowerCase();
    return orders.filter((o) => (filter === "all" || o.status === filter) &&
      (!q || [o.orderNo, o.name, o.contact, o.address, o.notes].join(" ").toLowerCase().includes(q)));
  }

  function render() {
    const count = (s) => orders.filter((o) => s === "all" || o.status === s).length;
    $("#filters").innerHTML = ["all", "new", "confirmed", "done", "cancelled"].map((s) =>
      '<button type="button" class="chip" data-f="' + s + '" aria-pressed="' + (filter === s) + '">' + (s === "all" ? "全部" : STATUS[s]) + " (" + count(s) + ")</button>").join("");
    const list = visible();
    $("#empty").hidden = list.length > 0;
    $("#orders").innerHTML = list.map((o) => {
      const items = (o.items || []).map((i) => "<li><span>" + esc(i.group) + " " + esc(i.name) + " × " + esc(i.qty) + "</span><span>" + money(i.price * i.qty) + "</span></li>").join("");
      const opts = Object.keys(STATUS).map((k) => '<option value="' + k + '"' + (o.status === k ? " selected" : "") + ">" + STATUS[k] + "</option>").join("");
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
}
