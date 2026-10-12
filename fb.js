// Loads Firebase once per page and shares it between the other scripts.
// window.MHFB.load() resolves to { app, db, auth, fs, au } or to null when Firebase is not set up.
(function () {
  "use strict";
  var FB = "https://www.gstatic.com/firebasejs/10.14.1/";
  var p = null;
  window.MHFB = {
    load: function () {
      if (!window.FIREBASE_CONFIG) return Promise.resolve(null);
      if (!p) {
        p = Promise.all([import(FB + "firebase-app.js"), import(FB + "firebase-firestore.js"), import(FB + "firebase-auth.js")]).then(function (m) {
          var app = m[0].initializeApp(window.FIREBASE_CONFIG), au = m[2];
          // initializeAuth (not getAuth) keeps the sign-in code small and loads no extra frames or scripts,
          // so the strict Content-Security-Policy in firebase.json can stay strict.
          var auth = au.initializeAuth(app, { persistence: [au.indexedDBLocalPersistence, au.browserLocalPersistence] });
          return { app: app, fs: m[1], au: au, db: m[1].getFirestore(app), auth: auth };
        });
        p.catch(function () { p = null; });
      }
      return p;
    }
  };
})();
