// Every word on the website can be changed on the admin page (全部文字 tab).
//  - Text written in the HTML pages carries data-t="key"; the words in the page are the default.
//  - Text made by the scripts (messages, buttons, labels) is listed below as the default for its key.
// The admin page saves your changes in the database (settings/texts). A copy is kept in the browser so
// the page shows your wording straight away on the next visit.
(function () {
  "use strict";

  var DEFAULTS = {
    // ----- 價目及貨品 -----
    "shelf.all": "全部",
    "shelf.soldTag": "售罄",
    "shelf.soldFoot": "已售罄",
    "shelf.storeFoot": "只限門市購買",
    "shelf.orderLink": "我要訂購 →",
    "shelf.empty": "暫時未有商品。",
    "chan.stock": "格仔舖現貨",
    "chan.preorder": "訂購",
    "chan.sf": "可寄順豐",
    "chan.eta": "預計到貨：{eta}",
    "shelf.left": "只剩 {n} 件",
    "promo.more": "查看詳情 →",
    "soon.storeOnly": "只限格仔舖現貨",
    "soon.released": "已發售",
    "soon.when": "發售日：{date}",
    "soon.tbd": "發售日待定",
    "soon.price": "預計售價 HK${price}",
    "soon.d": "日", "soon.h": "時", "soon.m": "分", "soon.s": "秒",
    "pg.copy": "按一下複製優惠碼",
    "pg.copied": "已複製",
    "shelf.saleTag": "特價",
    "shelf.pendingTag": "未到貨",
    "shelf.pendingFoot": "未到貨",
    "addon.limit": "加購數量不可以多過所買專輯的數量。",
    "addon.card": "加購優惠：{name} 只需 HK${price}",
    "addon.line": "加購 {name}（特價 HK${price}）",
    "addon.dec": "減少加購 {name}",
    "addon.inc": "增加加購 {name}",
    "err.stock": "{name} 存貨只剩 {n} 件，請減少數量。",
    "me.next": "再消費 {amount} 即可升級為 {tier}",
    "me.top": "你已達最高會員等級。",
    "me.rule": "每消費 HK${per} 得 1 分（你的等級積分倍率 ×{mult}）。積分會在訂單確認後加入。",
    "me.rule.off": "會員積分暫時未開放。",
    "me.addon": "加購",
    "me.cancelled": "這張訂單已取消。",
    "me.delivery": "交收方式",
    "me.address": "收件地址",
    "me.contact": "聯絡方式",
    "me.notes": "備註",
    "me.alert": "訂單有新進度",
    "me.notify": "開啟訂單通知（網頁開著時提醒你）",
    "me.pay": "前往付款",
    "me.tracking": "順豐單號",
    "prog.received": "已收到訂單",
    "prog.paid": "已確認收款",
    "prog.ordering": "訂購中／備貨中",
    "prog.arrived": "貨品已到",
    "prog.shipped": "已寄出",
    "prog.ready": "可到門市取貨",
    "prog.done": "已完成",
    "item.dec": "減少 {name}",
    "item.inc": "增加 {name}",
    "item.mode": "{name} 的供應方式",
    "item.modeStock": "格仔舖現貨",
    "item.modePreorder": "訂購（需等待到貨）",
    "item.modeSf": "順豐寄送",

    // ----- 購物車及商品頁 -----
    "cart.title": "購物車",
    "cart.close": "關閉購物車",
    "cart.open": "打開購物車",
    "cart.subtotal": "貨品總額（未計運費）",
    "cart.checkout": "前往結帳",
    "cart.hint": "下一步填寫聯絡資料及交收方式，確認後進入付款。",
    "cart.empty": "購物車仲係空嘅。",
    "cart.browse": "去睇價目",
    "cart.remove": "移除",
    "cart.unavailable": "暫時不能購買",
    "cart.add": "加入購物車",
    "cart.added": "已把 {name} 加入購物車",
    "cart.view": "查看",
    "shelf.quick": "快速加入",
    "shelf.view": "查看詳情",
    "shelf.off": "-{n}%",
    "prod.qty": "數量",
    "prod.buy": "立即結帳",
    "prod.mode": "供應方式",
    "prod.related": "你可能都鍾意",
    "prod.home": "首頁",
    "prod.shelf": "價目",
    "prod.missing": "找不到這件商品，可能已下架。",
    "prod.back": "返回價目",
    "prod.save": "慳 HK${n}",

    // ----- 落單表格訊息 -----
    "err.login": "請先登入或註冊，才可以落單。",
    "err.name": "請填寫姓名。",
    "err.contact": "請填寫 Instagram 帳號或電話，方便我們聯絡你。",
    "err.items": "請最少揀選一款貨品。",
    "err.address": "請填寫收件地址。",
    "err.agree": "請先剔選同意服務條款及私隱政策。",
    "err.mixed": "你揀選的貨品不能用同一個交收方式（例如有些只可門市自取，有些只可寄順豐），請分開落單。",
    "err.submit": "提交失敗。請檢查網絡後再試，或在 Instagram 私訊 @{ig}。",
    "delivery.blocked": "部分交收方式因你揀選的貨品而暫時不能選擇。",
    "form.account": "登入帳戶：",

    // ----- 核對訂單 -----
    "review.total": "貨品總額（未計運費）",
    "review.name": "姓名",
    "review.contact": "聯絡方式",
    "review.email": "帳戶電郵",
    "review.delivery": "交收方式",
    "review.address": "收件地址",
    "review.notes": "備註",
    "review.sending": "提交中…",
    "review.ok": "確認訂單，前往付款",

    // ----- 帳戶 -----
    "acct.btn.in": "登入 / 註冊",
    "acct.btn.me": "我的帳戶",
    "acct.submit.in": "登入",
    "acct.submit.up": "建立帳戶",
    "acct.busy": "請稍候…",
    "acct.title.in": "登入帳戶",
    "acct.title.up": "註冊新帳戶",
    "acct.title.me": "我的帳戶",
    "acct.err.name": "請填寫姓名。",
    "acct.err.email": "請填寫正確的電郵地址。",
    "acct.err.pw": "請輸入密碼。",
    "acct.err.weak": "密碼至少要 8 個字元。",
    "acct.err.agree": "請先剔選同意服務條款及私隱政策。",
    "acct.err.exists": "這個電郵已經註冊過，請改用「登入」。",
    "acct.err.cred": "電郵或密碼不正確。",
    "acct.err.many": "嘗試次數太多，請稍後再試。",
    "acct.err.net": "網絡連線有問題，請稍後再試。",
    "acct.err.other": "發生錯誤，請稍後再試。",
    "acct.reset.sent": "如果這個電郵已註冊，我們已寄出重設密碼的電郵，請查看收件箱及垃圾郵件。",
    "acct.reset.need": "請先在上面填寫電郵地址，再按「忘記密碼」。",
    "err.verify": "請先到電郵信箱按驗證連結，驗證電郵後才可以落單。",
    "err.verified": "電郵已驗證，請再按一次提交訂單。",
    "acct.verify.resend": "重新寄出驗證電郵",
    "acct.verify.done": "我已驗證電郵",
    "acct.verify.notyet": "仍未驗證，請先按電郵內的連結。",
    "acct.verify.sent": "我們已寄出驗證電郵，請查看收件箱及垃圾郵件。",

    // ----- 結帳 -----
    "co.ship.v": "順豐到付／自取免運費",
    "co.ship.pickup": "自取免運費",
    "co.paid": "我已付款，完成",
    "co.place": "確認訂單，前往付款",
    "co.done.h": "多謝你的訂單！",
    "co.done.lead": "我們已收到你的訂單和付款截圖。核對收款後會確認訂單，並用你留下的聯絡方式通知你。",
    "co.done.pending": "如果還未付款，請完成付款後上傳截圖；我們收到款項後才會確認訂單。",

    // ----- 付款頁面 -----
    "pay.order": "訂單 {no}",
    "pay.total": "貨品總額（未計運費）",
    "pay.delivery": "交收：{delivery}",
    "pay.needLogin": "請先登入你落單時使用的帳戶（並已驗證電郵），才會顯示付款二維碼及收款資料。",
    "pay.none": "暫時未有付款方式。請在 Instagram 私訊我們。",
    "pay.qrAlt": "{name} 付款二維碼",
    "pay.download": "下載二維碼",
    "pay.copyDetails": "複製付款資料",
    "pay.go": "前往付款 {amount}",
    "pay.phone": "用手機瀏覽？長按二維碼儲存圖片，再在 {name} 的掃描頁面選擇相簿圖片。",
    "pay.copied": "已複製",
    "pay.copyManual": "請長按文字自行複製",
    "pay.proof.need": "請先選擇付款截圖。",
    "pay.proof.bad": "這張圖片無法使用，請試另一張。",
    "pay.proof.sending": "傳送中…",
    "pay.proof.send": "傳送付款截圖",
    "pay.proof.fail": "傳送失敗。請稍後再試，或把截圖傳到 Instagram。",
    "pay.proof.login": "請先登入你落單時使用的帳戶，才可以上傳付款截圖。",
    "pay.proof.loginLink": "返回網站登入"
  };

  var map = {};
  try { map = JSON.parse(localStorage.getItem("mh-texts") || "{}") || {}; } catch (e) { map = {}; }
  if (typeof map !== "object" || Array.isArray(map)) map = {};

  function fill(s, vars) {
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }
  // t("key", defaultText?, {variables}?)  The default comes from DEFAULTS when not given.
  function t(key, def, vars) {
    var v = map[key];
    var s = typeof v === "string" && v !== "" ? v : (def != null ? def : (DEFAULTS[key] != null ? DEFAULTS[key] : ""));
    return fill(s, vars);
  }

  function apply(root) {
    root = root || document;
    var els = root.querySelectorAll("[data-t]"), i, el, v;
    for (i = 0; i < els.length; i++) {
      el = els[i]; v = map[el.getAttribute("data-t")];
      if (typeof v === "string" && v !== "") el.textContent = v;
    }
    els = root.querySelectorAll("[data-tp]");
    for (i = 0; i < els.length; i++) {
      el = els[i]; v = map[el.getAttribute("data-tp")];
      if (typeof v === "string" && v !== "") el.setAttribute("placeholder", v);
    }
  }

  var readyP = null;
  // Loads the wording saved on the admin page. Resolves (never rejects) after at most 7 seconds.
  function init() {
    if (readyP) return readyP;
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 7000); });
    var work = (window.MHFB ? window.MHFB.load() : Promise.resolve(null)).then(function (c) {
      if (!c) return;
      return c.fs.getDoc(c.fs.doc(c.db, "settings", "texts")).then(function (d) {
        var data = d.exists() ? d.data() : null, next = {};
        var src = data && data.t && typeof data.t === "object" ? data.t : {};
        Object.keys(src).forEach(function (k) { if (typeof src[k] === "string") next[k] = src[k]; });
        map = next;
        try { localStorage.setItem("mh-texts", JSON.stringify(map)); } catch (e) { /* private mode */ }
        apply(document);
      });
    }).catch(function () { /* keep the wording from the page */ });
    readyP = Promise.race([work, timeout]);
    return readyP;
  }

  window.MHT = { t: t, apply: apply, init: init, DEFAULTS: DEFAULTS };
  apply(document);
})();
