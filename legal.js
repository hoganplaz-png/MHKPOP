// Terms and privacy pages: wording saved on the admin page, and the Instagram link.
(function () {
  "use strict";
  var S = window.SETTINGS || {};
  function setIg(ig) {
    document.querySelectorAll("[data-s-ig]").forEach(function (a) { a.href = "https://www.instagram.com/" + ig + "/"; a.textContent = "@" + ig; });
  }
  setIg(S.instagram);
  window.MHT.init();
  window.MHFB.load().then(function (c) {
    if (!c) return;
    return c.fs.getDoc(c.fs.doc(c.db, "settings", "site")).then(function (d) {
      if (d.exists() && d.data().instagram) setIg(d.data().instagram);
    });
  }).catch(function () {});
})();
