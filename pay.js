(function () {
  "use strict";
  var S = window.SETTINGS || {};
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var money = function (n) { return "HK$" + n; };

  // ---------- the order that was just confirmed ----------
  var qs = new URLSearchParams(location.search), no = qs.get("o") || "", amt = Number(qs.get("t"));
  var order = null;
  try { order = JSON.parse(sessionStorage.getItem("mh-order") || "null"); } catch (e) { order = null; }
  if (!order || order.orderNo !== no) order = { orderNo: no, total: amt, items: null };
  var valid = /^MH-[A-Z0-9]{3,18}$/.test(order.orderNo) && isFinite(order.total) && order.total >= 0;
  if (!valid) { $("#missing").hidden = false; return; }
  $("#pay").hidden = false;
  $("#pay-no").textContent = "訂單 " + order.orderNo;
  $("#pay-amount").textContent = money(order.total);
  $("#ref-no").textContent = order.orderNo;
  $("#ref-amount").textContent = money(order.total);
  if (order.items && order.items.length) {
    $("#order-sum").hidden = false;
    $("#sum-body").innerHTML = order.items.map(function (i) {
      return "<div><span>" + esc(i.group) + " " + esc(i.name) + " × " + i.qty + "</span><span>" + money(i.price * i.qty) + "</span></div>";
    }).join("") + '<div class="tot"><span>貨品總額（未計運費）</span><span>' + money(order.total) + "</span></div>" +
      (order.delivery ? '<div class="meta"><span>交收：' + esc(order.delivery) + "</span><span></span></div>" : "");
  }

  // ---------- shop details and payment methods (admin page content, with built-in fallback) ----------
  var FB = "https://www.gstatic.com/firebasejs/10.14.1/";
  function loadRemote() {
    if (!window.FIREBASE_CONFIG) return Promise.resolve(null);
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 6000); });
    var work = Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-firestore.js")]).then(function (m) {
      var fs = m[1], db = fs.getFirestore(m[0].initializeApp(window.FIREBASE_CONFIG));
      return Promise.all([
        fs.getDoc(fs.doc(db, "settings", "site")).then(function (d) { return d.exists() ? d.data() : null; }).catch(function () { return null; }),
        fs.getDocs(fs.query(fs.collection(db, "payments"), fs.orderBy("order"))).then(function (q) { return q.docs.map(function (d) { return d.data(); }); }).catch(function () { return null; })
      ]).then(function (r) { return { site: r[0], payments: r[1] }; });
    }).catch(function () { return null; });
    return Promise.race([work, timeout]);
  }

  var methods = [], current = 0;

  // Only images from this site or uploaded on the admin page are shown.
  function imgSrc(v) {
    return /^(assets\/|\/assets\/|data:image\/(jpeg|png|webp);base64,)/.test(v) ? v : "";
  }
  function linkFor(m) {
    var l = String(m.link || "").replace("{amount}", String(order.total)).replace("{order}", encodeURIComponent(order.orderNo));
    return /^https:\/\//.test(l) ? l : "";
  }
  function toast(t) {
    var el = $("#toast"); el.textContent = t; el.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("show"); }, 2500);
  }
  function copy(text) {
    var done = function () { toast("已複製"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast("請長按文字自行複製"); });
    else toast("請長按文字自行複製");
  }

  function render() {
    $("#methods").innerHTML = methods.map(function (m, i) {
      return '<button type="button" class="method" data-i="' + i + '" aria-pressed="' + (i === current) + '">' + esc(m.name) + "</button>";
    }).join("");
    var m = methods[current], html = "";
    if (!m) { $("#panel").innerHTML = "<p>暫時未有付款方式。請在 Instagram 私訊我們。</p>"; return; }
    if (m.type === "qr" && imgSrc(m.image)) {
      html += '<img class="qr" src="' + esc(imgSrc(m.image)) + '" alt="' + esc(m.name) + ' 付款二維碼">';
    }
    html += '<div class="body"><h3>' + esc(m.name) + "</h3>";
    if (m.type === "text") html += '<div class="box">' + esc(m.details) + '</div><button type="button" class="btn btn-line" data-copy="details">複製付款資料</button>';
    else if (m.details) html += '<p class="details">' + esc(m.details) + "</p>";
    if (m.type === "link" && linkFor(m)) html += '<a class="btn btn-solid btn-lg" href="' + esc(linkFor(m)) + '" target="_blank" rel="noopener">前往付款 ' + esc(money(order.total)) + "</a>";
    if (m.type === "qr" && imgSrc(m.image)) {
      html += '<p class="steps-hint">用手機瀏覽？長按二維碼儲存圖片，再在 ' + esc(m.name) + " 的掃描頁面選擇相簿圖片。</p>" +
        '<a class="btn btn-line" href="' + esc(imgSrc(m.image)) + '" download="' + esc(m.name) + '-qr.jpg">下載二維碼</a>';
    }
    html += "</div>";
    $("#panel").innerHTML = html;
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest(".method");
    if (b) { current = +b.dataset.i; render(); return; }
    var c = e.target.closest("[data-copy]");
    if (!c) return;
    copy(c.dataset.copy === "no" ? order.orderNo : (methods[current] && methods[current].details) || "");
  });

  function start(remote) {
    var site = remote && remote.site;
    var note = (site && site.paymentNote) || S.paymentNote || "";
    $("#pay-note").textContent = note; $("#pay-note").hidden = !note;
    var ig = (site && site.instagram) || S.instagram;
    document.querySelectorAll("[data-s-ig]").forEach(function (a) { a.href = "https://www.instagram.com/" + ig + "/"; a.textContent = "@" + ig; });
    var list = remote && remote.payments && remote.payments.length ? remote.payments : (S.defaultPayments || []);
    methods = list.filter(function (m) { return m.enabled !== false; });
    render();
  }
  start(null);
  loadRemote().then(function (remote) { if (remote) start(remote); });
})();
