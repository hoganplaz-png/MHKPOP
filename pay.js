(function () {
  "use strict";
  var S = window.SETTINGS || {};
  var $ = function (sel) { return document.querySelector(sel); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  function dn(g, n) { g = String(g || "").trim(); n = String(n || "").trim(); return !g || n.toLowerCase().indexOf(g.toLowerCase()) >= 0 ? n : g + " " + n; }
  var money = function (n) { return "HK$" + n; };
  var T = function (k, vars) { return window.MHT.t(k, undefined, vars); };

  // ---------- the order that was just confirmed ----------
  var qs = new URLSearchParams(location.search), no = qs.get("o") || "", amt = Number(qs.get("t"));
  var order = null;
  try { order = JSON.parse(sessionStorage.getItem("mh-order") || "null"); } catch (e) { order = null; }
  if (!order || order.orderNo !== no) order = { orderNo: no, total: amt, items: null };
  var valid = /^MH-[A-Z0-9]{3,18}$/.test(order.orderNo) && isFinite(order.total) && order.total >= 0;
  if (!valid) { $("#missing").hidden = false; return; }
  $("#pay").hidden = false; $("#stepper").hidden = false;
  $("#pay-amount").textContent = money(order.total);
  $("#ref-no").textContent = order.orderNo;
  $("#ref-amount").textContent = money(order.total);
  function paintOrder() {
    $("#pay-no").textContent = T("pay.order", { no: order.orderNo });
    if (order.items && order.items.length) {
      $("#order-sum").hidden = false;
      $("#sum-body").innerHTML = order.items.map(function (i) {
        return "<div><span>" + esc(dn(i.group, i.name)) + " × " + i.qty + "</span><span>" + money(i.price * i.qty) + "</span></div>";
      }).join("") + '<div class="tot"><span>' + esc(T("pay.total")) + "</span><span>" + money(order.total) + "</span></div>" +
        (order.delivery ? '<div class="meta"><span>' + esc(T("pay.delivery", { delivery: order.delivery })) + "</span><span></span></div>" : "");
    }
  }
  paintOrder();

  // ---------- shop details and payment methods (admin page content, with built-in fallback) ----------
  var needLogin = false;
  function loadRemote() {
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 6000); });
    var work = window.MHFB.load().then(function (c) {
      if (!c) return null;
      var fs = c.fs, db = c.db;
      // Payment details (QR codes, account names) are only readable by signed-in customers, so wait for sign-in first.
      var authP = new Promise(function (resolve) {
        var off = c.au.onAuthStateChanged(c.auth, function (u) { off(); resolve(u); });
        setTimeout(function () { resolve(c.auth.currentUser); }, 4000);
      });
      return Promise.all([
        fs.getDoc(fs.doc(db, "settings", "site")).then(function (d) { return d.exists() ? d.data() : null; }).catch(function () { return null; }),
        authP.then(function (u) {
          if (!u) { needLogin = true; return null; }
          return fs.getDocs(fs.query(fs.collection(db, "payments"), fs.orderBy("order"))).then(function (q) { return q.docs.map(function (d) { return d.data(); }); }).catch(function () { return null; });
        })
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
    var done = function () { toast(T("pay.copied")); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast(T("pay.copyManual")); });
    else toast(T("pay.copyManual"));
  }

  function render() {
    $("#methods").innerHTML = methods.map(function (m, i) {
      return '<button type="button" class="method" data-i="' + i + '" aria-pressed="' + (i === current) + '">' + esc(m.name) + "</button>";
    }).join("");
    var m = methods[current], html = "";
    if (!m) {
      $("#panel").innerHTML = needLogin
        ? "<p>" + esc(T("pay.needLogin")) + ' <a href="/checkout.html">' + esc(T("pay.proof.loginLink")) + "</a></p>"
        : "<p>" + esc(T("pay.none")) + "</p>";
      return;
    }
    if (m.type === "qr" && imgSrc(m.image)) {
      html += '<img class="qr" src="' + esc(imgSrc(m.image)) + '" alt="' + esc(T("pay.qrAlt", { name: m.name })) + '">';
    }
    html += '<div class="body"><h3>' + esc(m.name) + "</h3>";
    if (m.type === "text") html += '<div class="box">' + esc(m.details) + '</div><button type="button" class="btn btn-line" data-copy="details">' + esc(T("pay.copyDetails")) + "</button>";
    else if (m.details) html += '<p class="details">' + esc(m.details) + "</p>";
    if (m.type === "link" && linkFor(m)) html += '<a class="btn btn-solid btn-lg" href="' + esc(linkFor(m)) + '" target="_blank" rel="noopener">' + esc(T("pay.go", { amount: money(order.total) })) + "</a>";
    if (m.type === "qr" && imgSrc(m.image)) {
      html += '<p class="steps-hint">' + esc(T("pay.phone", { name: m.name })) + "</p>" +
        '<a class="btn btn-line" href="' + esc(imgSrc(m.image)) + '" download="' + esc(m.name) + '-qr.jpg">' + esc(T("pay.download")) + "</a>";
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
    var list = remote && remote.payments && remote.payments.length ? remote.payments : (needLogin ? [] : (S.defaultPayments || []));
    methods = list.filter(function (m) { return m.enabled !== false; });
    render();
  }
  // ---------- payment screenshot upload (saved for the shop owner only) ----------
  var proofImage = "";
  function shrinkPhoto(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var sc = Math.min(1, 1200 / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
        var c = document.createElement("canvas"); c.width = w; c.height = h;
        var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
        var qual = 0.8, out = c.toDataURL("image/jpeg", qual);
        while (out.length > 300000 && qual > 0.35) { qual -= 0.1; out = c.toDataURL("image/jpeg", qual); }
        out.length > 380000 ? reject(new Error("too big")) : resolve(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      img.src = url;
    });
  }
  if (window.FIREBASE_CONFIG) {
    $("#proof").hidden = false;
    // The screenshot is tied to the account that placed the order, so the customer must be signed in.
    var userP = window.MHFB.load().then(function (c) {
      if (!c) return null;
      return new Promise(function (resolve) {
        var off = c.au.onAuthStateChanged(c.auth, function (u) { off(); resolve({ c: c, user: u }); });
        setTimeout(function () { resolve({ c: c, user: c.auth.currentUser }); }, 5000);
      });
    }).catch(function () { return null; });
    $("#proof-file").addEventListener("change", function (e) {
      var f = e.target.files[0]; if (!f) return;
      var err = $("#proof-error"); err.hidden = true; $("#proof-done").hidden = true;
      shrinkPhoto(f).then(function (d) {
        proofImage = d; $("#proof-preview").innerHTML = '<img alt="" src="' + d + '">';
      }).catch(function () { proofImage = ""; err.textContent = T("pay.proof.bad"); err.hidden = false; });
    });
    $("#proof-send").addEventListener("click", function () {
      var err = $("#proof-error"), btn = this;
      var fail = function (msg) { err.textContent = msg; err.hidden = false; };
      if (!proofImage) { fail(T("pay.proof.need")); return; }
      err.hidden = true; btn.disabled = true; btn.textContent = T("pay.proof.sending");
      userP.then(function (r) {
        if (!r || !r.user) { var e = new Error("login"); throw e; }
        var fs = r.c.fs;
        return fs.addDoc(fs.collection(r.c.db, "proofs"), { orderNo: order.orderNo, image: proofImage, note: $("#proof-note").value.trim(), createdAt: fs.serverTimestamp() });
      }).then(function () {
        proofSent = true; $("#proof-done").hidden = false; proofImage = ""; $("#proof-file").value = ""; $("#proof-preview").innerHTML = ""; $("#proof-note").value = "";
      }).catch(function (e) {
        if (e && e.message === "login") {
          err.textContent = "";
          var t = document.createTextNode(T("pay.proof.login") + " ");
          var a = document.createElement("a"); a.href = "/checkout.html"; a.textContent = T("pay.proof.loginLink");
          err.appendChild(t); err.appendChild(a); err.hidden = false;
        } else fail(T("pay.proof.fail"));
      }).then(function () { btn.disabled = false; btn.textContent = T("pay.proof.send"); if (proofSent) setTimeout(finish, 1200); });
    });
  }

  // step 4: confirmation (after the screenshot is sent, or when the customer says they have paid)
  var proofSent = false;
  function finish() {
    $("#pay-step").hidden = true; $("#done").hidden = false;
    var li = document.querySelectorAll("#stepper li");
    Array.prototype.forEach.call(li, function (el) { var s = +el.dataset.s; el.classList.toggle("done", s <= 3); el.classList.toggle("on", s === 4); });
    $("#done-no").textContent = order.orderNo;
    $("#done-lead").textContent = T(proofSent ? "co.done.lead" : "co.done.pending");
    if (order.items && order.items.length) {
      $("#done-sum").innerHTML = order.items.map(function (i) { return "<div><span>" + esc(dn(i.group, i.name)) + " × " + i.qty + "</span><span>" + money(i.price * i.qty) + "</span></div>"; }).join("") +
        '<div class="tot"><span>' + esc(T("pay.total")) + "</span><span>" + money(order.total) + "</span></div>";
    }
    window.scrollTo(0, 0);
  }
  $("#pay-done").addEventListener("click", finish);

  start(null);
  Promise.all([window.MHT.init(), loadRemote()]).then(function (r) { paintOrder(); if (r[1]) start(r[1]); else render(); });
})();
