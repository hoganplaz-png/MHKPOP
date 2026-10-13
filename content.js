// ===================================================================
//  網站內容  SITE CONTENT
//  Lists shown on the public pages: the announcement bar, the perks strip, the hero numbers,
//  the little album cards floating around the logo and the product-page information tabs.
//  Change the text between the quote marks " ". Keep the quotes, commas and brackets.
//  Add or remove a line { ... }, to add or remove an item.
//  Colours, corners and fonts are in styles.css (the THEME block at the top).
//  Shop details are in settings.js; every other word can be changed on the admin page (全部文字).
// ===================================================================

window.CONTENT = {

  // ---------- 頂部公告 ANNOUNCEMENT BAR ----------
  // Rotates at the very top of every shop page. "link" is optional.
  announcements: [
    { text: "專輯價錢低至市價 3 折 · 售完即止", link: "#shelf" },
    { text: "順豐到付 · 運費收件時付給順豐" },
    { text: "將軍澳 TKO Gateway 門市自取 · 星期一至日 12:00 – 20:00", link: "#store" },
    { text: "註冊會員 · 每次消費都賺積分", link: "me.html" },
  ],

  // ---------- 首頁優點 PERKS STRIP ----------
  // icon: one of "tag", "box", "store", "star", "heart", "truck"
  perks: [
    { icon: "tag",   title: "低至 3 折",  text: "比市價平，價錢清楚列明" },
    { icon: "truck", title: "順豐到付",   text: "標明「可寄順豐」即可寄" },
    { icon: "store", title: "門市自取",   text: "將軍澳 TKO Gateway" },
    { icon: "star",  title: "會員積分",   text: "每次消費自動累積" },
  ],

  // ---------- 首頁數字 HERO NUMBERS ----------
  // "num" counts up when the page opens. "suffix" is written after the number.
  heroStats: [
    { num: 2,   suffix: "年+", label: "營運經驗" },
    { num: 3,   suffix: "折",  label: "低至市價" },
    { num: 7,   suffix: "天",  label: "每星期營業" },
  ],

  // ---------- 標誌旁的小卡 FLOATING CARDS BY THE LOGO ----------
  // Two small album cards that float next to the big logo.
  heroCards: [
    { kicker: "NEW IN", title: "最新到貨" },
    { kicker: "SALE",   title: "期間限定" },
  ],

  // ---------- 商品頁資料 PRODUCT PAGE TABS ----------
  productTabs: [
    { title: "交收方式", text: "順豐到付：運費由你在收件時付給順豐，只有標明「可寄順豐」的貨品才可以寄。\n門市自取：將軍澳 TKO Gateway 東翼一樓 E171 號舖（別樹一格 A24 & B24 格位）。" },
    { title: "落單須知", text: "售完即止，不設預留。落單前需要登入帳戶，確認訂單後會開啟付款頁面。" },
    { title: "現貨及訂購", text: "格仔舖現貨：貨品已在門市。\n訂購：需要向供應商訂購，到貨日期是預計。" },
  ],
};
