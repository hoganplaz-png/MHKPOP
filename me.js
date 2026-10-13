// "My membership and orders": points, member tier, and every order with its progress.
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var T = function (k, v) { return window.MHT.t(k, undefined, v); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function dn(g, n) { g = String(g || "").trim(); n = String(n || "").trim(); return !g || n.toLowerCase().indexOf(g.toLowerCase()) >= 0 ? n : g + " " + n; }
  var money = function (n) { return "HK$" + (Math.round(n * 100) / 100).toLocaleString("en-US"); };
  var STATUS = { new: "me.status.new", confirmed: "me.status.confirmed", done: "me.status.done", cancelled: "me.status.cancelled" };
  var client = null;

  function show(which) {
    $("#me-loading").hidden = which !== "loading"; $("#me-login").hidden = which !== "login"; $("#me-app").hidden = which !== "app";
  }
  function fmt(ts) { return ts && ts.toDate ? ts.toDate().toLocaleString("zh-HK", { hour12: false }) : ""; }

  window.MHT.init();
  window.MHFB.load().then(function (c) {
    client = c;
    if (!c) { show("login"); return; }
    var done = false;
    c.au.onAuthStateChanged(c.auth, function (u) {
      if (done && !u) { show("login"); $("#me-signout").hidden = true; return; }
      done = true;
      if (!u) { show("login"); return; }
      $("#me-signout").hidden = false;
      load(u);
    });
  }).catch(function () { show("login"); });

  $("#me-signout").addEventListener("click", function () { if (client) client.au.signOut(client.auth); });

  function load(user) {
    var fs = client.fs, db = client.db;
    show("loading");
    Promise.all([
      fs.getDoc(fs.doc(db, "members", user.uid)).then(function (d) { return d.exists() ? d.data() : null; }).catch(function () { return null; }),
      fs.getDocs(fs.query(fs.collection(db, "orders"), fs.where("uid", "==", user.uid))).then(function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }).catch(function () { return []; }),
      fs.getDocs(fs.query(fs.collection(db, "pointlogs"), fs.where("uid", "==", user.uid))).then(function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }).catch(function () { return []; }),
      fs.getDocs(fs.query(fs.collection(db, "rewards"), fs.where("active", "==", true))).then(function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }).catch(function () { return []; }),
      fs.getDocs(fs.query(fs.collection(db, "redemptions"), fs.where("uid", "==", user.uid))).then(function (q) { return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }).catch(function () { return []; }),
      fs.getDoc(fs.doc(db, "settings", "member")).then(function (d) { return d.exists() ? d.data() : null; }).catch(function () { return null; }),
      import("./shoplib.js"),
      window.MHT.init()
    ]).then(function (r) {
      render(user, r[0], r[1], r[2], r[5], r[6]);
      renderRewards(user, r[0], r[3], r[4]);
      watchOrders(user, r[1], r[6]);
    });
  }

  // ---------- live progress and "new update" alerts ----------
  var unwatch = null;
  function seenKey(user) { return "mh-seen-" + user.uid; }
  function readSeen(user) { try { return JSON.parse(localStorage.getItem(seenKey(user)) || "{}") || {}; } catch (e) { return {}; } }
  function writeSeen(user, m) { try { localStorage.setItem(seenKey(user), JSON.stringify(m)); } catch (e) { /* private mode */ } }

  function watchOrders(user, first, L) {
    var fs = client.fs, seen = readSeen(user), baseline = Object.keys(seen).length > 0;
    if (unwatch) unwatch();
    function check(orders) {
      var changed = [];
      orders.forEach(function (o) {
        var k = L.progressKey(o);
        if (baseline && seen[o.orderNo] !== k) changed.push({ o: o, k: k });
        seen[o.orderNo] = k;
      });
      baseline = true; writeSeen(user, seen);
      return changed;
    }
    // first load only records what the customer is looking at now; later changes raise an alert
    check(first);
    unwatch = fs.onSnapshot(fs.query(fs.collection(client.db, "orders"), fs.where("uid", "==", user.uid)), function (q) {
      var orders = q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      orders.sort(function (a, b) { return ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0); });
      var changed = check(orders);
      $("#me-empty").hidden = orders.length > 0;
      $("#me-orders").innerHTML = orders.map(function (o) { return orderHtml(o, L); }).join("");
      if (changed.length) announce(changed, L);
    }, function () { /* keep the page as loaded */ });
    setupAsk();
  }
  function stageText(k, L) {
    if (k === "cancelled") return T("me.cancelled");
    var hit = L.PROGRESS.filter(function (p) { return p[0] === k; })[0];
    return T("prog." + k, hit ? hit[1] : k);
  }
  function announce(changed, L) {
    var lines = changed.map(function (c) { return c.o.orderNo + "：" + stageText(c.k, L); });
    var box = $("#me-alert");
    box.innerHTML = "<b>" + esc(T("me.alert")) + "</b> " + lines.map(esc).join("；");
    box.hidden = false;
    document.title = "(" + changed.length + ") " + document.title.replace(/^\(\d+\) /, "");
    if (window.Notification && Notification.permission === "granted") {
      try { new Notification(T("me.alert"), { body: lines.join("\n"), icon: "assets/logo.png" }); } catch (e) { /* some browsers only allow this from a service worker */ }
    }
  }
  function setupAsk() {
    var b = $("#me-notify");
    if (!window.Notification || Notification.permission !== "default") { b.hidden = true; return; }
    b.hidden = false;
    b.onclick = function () { Notification.requestPermission().then(function () { b.hidden = true; }); };
  }

  function render(user, member, orders, logs, settingsRaw, L) {
    var S = L.memberSettings(settingsRaw);
    var spent = member ? Number(member.spent) || 0 : 0, points = member ? Number(member.points) || 0 : 0;
    var info = L.tierFor(S, spent);
    $("#mc-name").textContent = (member && member.name) || user.displayName || user.email;
    $("#mc-email").textContent = user.email || "";
    $("#mc-tier").textContent = info.tier.name; $("#mc-points").textContent = points; $("#mc-spent").textContent = money(spent);
    if (window.FX && window.FX.countUp && !window.FX.reduce) { window.FX.countUp($("#mc-points"), points); window.FX.countUp($("#mc-spent"), spent, money); }
    if (info.next) {
      $("#mc-next").textContent = T("me.next", { amount: money(info.next.min - spent), tier: info.next.name });
      var from = info.tier.min, pct = Math.max(0, Math.min(100, ((spent - from) / (info.next.min - from)) * 100));
      $("#mc-fill").style.width = pct + "%"; $("#mc-bar").hidden = false;
    } else { $("#mc-next").textContent = T("me.top"); $("#mc-bar").hidden = true; }
    $("#mc-rule").textContent = S.enabled ? T("me.rule", { per: S.per, mult: info.tier.mult }) : T("me.rule.off");
    $("#me-card").hidden = !S.enabled && !member;

    orders.sort(function (a, b) { return ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0); });
    $("#me-empty").hidden = orders.length > 0;
    $("#me-orders").innerHTML = orders.map(function (o) { return orderHtml(o, L); }).join("");

    logs.sort(function (a, b) { return ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0); });
    $("#me-logs-box").hidden = !logs.length;
    $("#me-logs").innerHTML = logs.map(function (l) {
      return '<div class="pl-row"><b>' + (l.points > 0 ? "+" : "") + esc(l.points) + "</b><span>" + esc(l.note || l.type) + '</span><span class="mo-date">' + esc(fmt(l.createdAt)) + "</span></div>";
    }).join("");
    show("app");
  }

  // ---------- redeem points for products ----------
  var RW = { user: null, points: 0, rewards: [], mine: [] };
  function rwMsg(t, bad) { var m = $("#rw-msg"); m.textContent = t || ""; m.hidden = !t; m.style.color = bad ? "" : "inherit"; }
  function renderRewards(user, member, rewards, mine) {
    RW.user = user; RW.points = member ? Number(member.points) || 0 : 0; RW.rewards = rewards; RW.mine = mine;
    rewards.sort(function (a, b) { return (a.points || 0) - (b.points || 0); });
    $("#me-rewards").hidden = !rewards.length && !mine.length;
    $("#rw-grid").innerHTML = rewards.map(function (r) {
      var ok = RW.points >= r.points;
      return '<div class="rw-card' + (ok ? "" : " is-short") + '"><b>' + esc(r.name) + '</b><span class="rw-pts">' + esc(T("me.rw.need", { n: r.points })) + '</span><button type="button" class="btn ' + (ok ? "btn-solid" : "btn-line") + '" data-rw="' + esc(r.id) + '"' + (ok ? "" : " disabled") + ">" + esc(ok ? T("me.rw.btn") : T("me.rw.short")) + "</button></div>";
    }).join("");
    mine.sort(function (a, b) { return ((b.createdAt && b.createdAt.seconds) || 0) - ((a.createdAt && a.createdAt.seconds) || 0); });
    $("#rw-mine-box").hidden = !mine.length;
    $("#rw-mine").innerHTML = mine.map(function (m) { return '<div class="pl-row"><b>−' + esc(m.points) + "</b><span>" + esc(m.name) + " · " + esc(T("me.rw.s." + m.status, m.status)) + '</span><span class="mo-date">' + esc(fmt(m.createdAt)) + "</span></div>"; }).join("");
  }
  $("#rw-grid").addEventListener("click", function (e) {
    var b = e.target.closest("[data-rw]"); if (!b || b.disabled || !RW.user) return;
    var r = RW.rewards.filter(function (x) { return x.id === b.dataset.rw; })[0]; if (!r) return;
    if (!window.confirm(T("me.rw.confirm", { n: r.points, name: r.name }))) return;
    var fs = client.fs, db = client.db, u = RW.user, rid = "rd-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    var batch = fs.writeBatch(db);
    batch.set(fs.doc(db, "redemptions", rid), { uid: u.uid, email: u.email || "", rewardId: r.id, name: r.name, points: r.points, status: "new", createdAt: fs.serverTimestamp() });
    batch.update(fs.doc(db, "members", u.uid), { points: fs.increment(-r.points), lastRedeem: rid, updatedAt: fs.serverTimestamp() });
    batch.set(fs.doc(db, "pointlogs", "redeem-" + rid), { uid: u.uid, points: -r.points, type: "redeem", note: "兌換：" + r.name, createdAt: fs.serverTimestamp() });
    document.querySelectorAll("#rw-grid button").forEach(function (x) { x.disabled = true; });
    batch.commit().then(function () { rwMsg(T("me.rw.done")); load(u); }).catch(function () { rwMsg(T("me.rw.fail"), true); renderRewards(u, { points: RW.points }, RW.rewards, RW.mine); });
  });

  function orderHtml(o, L) {
    var st = L.orderSteps(o), items = (o.items || []).map(function (i) {
      return "<li><span>" + (i.addon ? esc(T("me.addon")) + " " : "") + esc(dn(i.group, i.name)) + " × " + esc(i.qty) + (i.mode === "preorder" ? " · " + esc(T("chan.preorder")) : "") + "</span><span>" + money((Number(i.price) || 0) * (Number(i.qty) || 0)) + "</span></li>";
    }).join("");
    var timeline = st.cancelled
      ? '<p class="mo-cancel">' + esc(T("me.cancelled")) + "</p>"
      : '<ol class="steps-line" style="--n:' + st.steps.length + '">' + st.steps.map(function (s) { return '<li class="' + (s.current ? "current" : s.done ? "done" : "") + '"' + (s.current ? ' aria-current="step"' : "") + ">" + esc(T("prog." + s.key, s.label)) + "</li>"; }).join("") + "</ol>";
    var meta = [];
    meta.push(esc(T("me.delivery")) + "：" + esc(o.delivery || ""));
    if (o.address) meta.push(esc(T("me.address")) + "：" + esc(o.address));
    if (o.contact) meta.push(esc(T("me.contact")) + "：" + esc(o.contact));
    if (o.notes) meta.push(esc(T("me.notes")) + "：" + esc(o.notes));
    var pay = o.status === "new" ? '<div class="mo-actions"><a class="btn btn-solid" href="pay.html?o=' + encodeURIComponent(o.orderNo) + "&t=" + encodeURIComponent(o.total) + '">' + esc(T("me.pay")) + "</a></div>" : "";
    return '<article class="mo"><div class="mo-head"><div><div class="mo-no">' + esc(o.orderNo) + '</div><div class="mo-date">' + esc(fmt(o.createdAt)) + '</div></div><div class="mo-total">' + money(Number(o.total) || 0) + "</div></div>" + timeline +
      (o.tracking ? '<p class="mo-note"><b>' + esc(T("me.tracking")) + "：</b>" + esc(o.tracking) + "</p>" : "") + (o.customerNote ? '<p class="mo-note">' + esc(o.customerNote) + "</p>" : "") +
      '<ul class="mo-items">' + items + '</ul><p class="mo-meta">' + meta.join("<br>") + "</p>" + pay + "</article>";
  }
})();
