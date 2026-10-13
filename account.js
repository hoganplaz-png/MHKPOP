// Customer accounts. Customers need an account to place an order.
// window.MHA.init() starts it; window.MHA.user is the signed-in user (or null); window.MHA.onChange(fn) listens.
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var T = function (k, v) { return window.MHT.t(k, undefined, v); };
  var listeners = [], client = null, mode = "in", started = null;
  var A = { user: null, ready: false };

  function notify() {
    A.ready = true;
    renderBtn();
    listeners.forEach(function (fn) { try { fn(A.user); } catch (e) { /* keep going */ } });
  }
  A.onChange = function (fn) { listeners.push(fn); if (A.ready) fn(A.user); };

  function label(u) { return u ? (u.displayName || u.email || T("acct.btn.me")) : T("acct.btn.in"); }
  function renderBtn() {
    var b = $("#acct-btn");
    if (b) b.textContent = A.user ? label(A.user) : T("acct.btn.in");
  }

  // every registered account is a member: create the member record the first time the customer signs in
  function ensureMember(c, u) {
    var ref = c.fs.doc(c.db, "members", u.uid);
    c.fs.getDoc(ref).then(function (d) {
      if (d.exists()) return;
      return c.fs.setDoc(ref, { uid: u.uid, email: u.email || "", name: u.displayName || "", points: 0, spent: 0, joinedAt: c.fs.serverTimestamp() });
    }).catch(function () { /* the admin page creates it with the first order instead */ });
  }

  A.init = function () {
    if (started) return started;
    started = window.MHFB.load().then(function (c) {
      client = c;
      if (!c) { notify(); return; }
      return new Promise(function (resolve) {
        var first = true;
        c.au.onAuthStateChanged(c.auth, function (u) {
          A.user = u || null;
          if (u && u.emailVerified) ensureMember(c, u);
          notify();
          if (first) { first = false; resolve(); if (location.hash === "#login" && !u) A.open("in"); }
        });
        setTimeout(resolve, 5000);
      });
    }).catch(function () { notify(); });
    return started;
  };

  // ---------- dialog ----------
  var dlg = $("#acct");
  function showErr(msg) { var e = $("#acct-error"); e.textContent = msg || ""; e.hidden = !msg; if (msg) $("#acct-info").hidden = true; }
  function showInfo(msg) { var e = $("#acct-info"); e.textContent = msg || ""; e.hidden = !msg; if (msg) $("#acct-error").hidden = true; }

  function setMode(m) {
    mode = m;
    var up = m === "up";
    $("#acct-tab-in").setAttribute("aria-selected", String(!up));
    $("#acct-tab-up").setAttribute("aria-selected", String(up));
    $("#acct-name-wrap").hidden = !up; $("#acct-agree-wrap").hidden = !up; $("#acct-pw-hint").hidden = !up;
    $("#acct-forgot").hidden = up;
    $("#a-pw").setAttribute("autocomplete", up ? "new-password" : "current-password");
    $("#acct-submit").textContent = T(up ? "acct.submit.up" : "acct.submit.in");
    $("#acct-title").textContent = T(up ? "acct.title.up" : "acct.title.in");
    showErr(""); showInfo("");
  }

  function open(m) {
    if (A.user) {
      $("#acct-out").hidden = true; $("#acct-in").hidden = false;
      $("#acct-title").textContent = T("acct.title.me");
      $("#acct-me").textContent = A.user.displayName ? A.user.displayName + " · " + A.user.email : A.user.email;
      $("#acct-verify").hidden = !!A.user.emailVerified;
      verifyTools(!A.user.emailVerified);
    } else {
      $("#acct-out").hidden = false; $("#acct-in").hidden = true;
      setMode(m || "in");
    }
    if (!dlg.open) dlg.showModal();
  }
  // Unverified accounts can browse but not order, so offer "send again" and "I have verified" right in the dialog.
  function verifyTools(show) {
    var box = $("#acct-verify-tools");
    if (!box) {
      box = document.createElement("div"); box.id = "acct-verify-tools";
      var again = document.createElement("button"); again.type = "button"; again.className = "btn btn-line"; again.textContent = T("acct.verify.resend");
      var done = document.createElement("button"); done.type = "button"; done.className = "btn btn-solid"; done.textContent = T("acct.verify.done");
      box.appendChild(done); box.appendChild(again);
      $("#acct-verify").insertAdjacentElement("afterend", box);
      again.addEventListener("click", function () {
        if (!client || !A.user) return;
        client.au.sendEmailVerification(A.user).then(function () { again.textContent = T("acct.verify.sent"); }, function () { again.textContent = T("acct.err.many"); });
      });
      done.addEventListener("click", function () {
        if (!client || !A.user) return;
        A.user.reload().then(function () { return A.user.getIdToken(true); }).then(function () {
          A.user = client.auth.currentUser;
          if (A.user.emailVerified) { ensureMember(client, A.user); notify(); open(); } else { done.textContent = T("acct.verify.notyet"); }
        }).catch(function () { done.textContent = T("acct.err.net"); });
      });
    }
    box.hidden = !show;
  }
  A.open = open;
  A.close = function () { if (dlg.open) dlg.close(); };
  A.refresh = renderBtn;
  A.signOut = function () { return client ? client.au.signOut(client.auth) : Promise.resolve(); };

  function errText(e) {
    var c = e && e.code || "";
    if (c === "auth/email-already-in-use") return T("acct.err.exists");
    if (c === "auth/invalid-email") return T("acct.err.email");
    if (c === "auth/weak-password") return T("acct.err.weak");
    if (c === "auth/invalid-credential" || c === "auth/user-not-found" || c === "auth/wrong-password" || c === "auth/invalid-login-credentials") return T("acct.err.cred");
    if (c === "auth/too-many-requests") return T("acct.err.many");
    if (c === "auth/network-request-failed") return T("acct.err.net");
    return T("acct.err.other");
  }

  $("#acct-btn").addEventListener("click", function () { open("in"); });
  $("#acct-close").addEventListener("click", A.close);
  $("#acct-tab-in").addEventListener("click", function () { setMode("in"); });
  $("#acct-tab-up").addEventListener("click", function () { setMode("up"); });

  $("#acct-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!client) { showErr(T("acct.err.other")); return; }
    var email = $("#a-email").value.trim(), pw = $("#a-pw").value, name = $("#a-name").value.trim();
    var up = mode === "up", btn = $("#acct-submit");
    showErr(""); showInfo("");
    if (up && !name) return showErr(T("acct.err.name"));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr(T("acct.err.email"));
    if (!pw) return showErr(T("acct.err.pw"));
    if (up && pw.length < 8) return showErr(T("acct.err.weak"));
    if (up && !$("#a-agree").checked) return showErr(T("acct.err.agree"));
    btn.disabled = true; btn.textContent = T("acct.busy");
    var au = client.au, job;
    if (up) {
      job = au.createUserWithEmailAndPassword(client.auth, email, pw).then(function (cred) {
        return au.updateProfile(cred.user, { displayName: name }).catch(function () {}).then(function () {
          return au.sendEmailVerification(cred.user).catch(function () {});
        }).then(function () { A.user = client.auth.currentUser; notify(); });
      });
    } else {
      job = au.signInWithEmailAndPassword(client.auth, email, pw);
    }
    job.then(function () {
      $("#a-pw").value = ""; A.close();
    }).catch(function (err) { showErr(errText(err)); })
      .then(function () { btn.disabled = false; btn.textContent = T(up ? "acct.submit.up" : "acct.submit.in"); });
  });

  $("#acct-forgot").addEventListener("click", function () {
    var email = $("#a-email").value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr(T("acct.reset.need"));
    if (!client) return showErr(T("acct.err.other"));
    client.au.sendPasswordResetEmail(client.auth, email)
      .then(function () { showInfo(T("acct.reset.sent")); })
      .catch(function (err) {
        // do not reveal whether the address is registered
        if (err && err.code === "auth/network-request-failed") showErr(errText(err)); else showInfo(T("acct.reset.sent"));
      });
  });

  $("#acct-signout").addEventListener("click", function () {
    A.signOut().then(A.close);
  });

  window.MHA = A;
})();
