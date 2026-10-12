// ===================================================================
//  店舖設定  SHOP SETTINGS
//  This is the only file you need to edit for shop details.
//  Change the text between the quote marks " ". Keep the quotes and commas.
//  Products, payment methods and every word on the pages are changed on the admin page (/admin).
//  The values here are only used until you save your own on the admin page.
// ===================================================================

window.SETTINGS = {

  // ---------- 1. 後備商品 ----------
  // Leave "" (products are managed on the admin page). Only used if the products cannot be loaded.
  sheetCsvUrl: "",

  // ---------- 3. 店舖資料 SHOP DETAILS ----------
  instagram: "mh.kpop.sell",
  hours: "星期一至日 12:00 – 20:00",
  addressLines: ["新界西貢坑口常寧路厚德邨", "TKO Gateway 東翼一樓 E171 號舖"],
  addressShort: "將軍澳 TKO Gateway 東翼 1/F E171",
  stall: ["別樹一格", "A24 & B24 格位"],
  enquiryNote: "查詢時請表示有意購買 xx，並不接受語音訊息。",
  claims: "持有效商業登記 · 營運超過 2 年 · 將軍澳區最強質素及最強格價保證",

  // ---------- 4. 首頁文字 HOMEPAGE TEXT ----------
  headline: "專輯價錢低至市價 3 折",
  intro: "睇價目，填寫落單表格，我們確認貨量後再聯絡你。可選順豐到付，或到將軍澳門市自取。",
  shelfNote: "價錢為港幣。售完即止，不設預留。",

  // ---------- 5a. 付款頁面 PAYMENT PAGE ----------
  // After the customer confirms the order, the website opens a payment page.
  // Add, change or switch off payment methods on the admin page (付款方式 tab).
  // These two are used until you save your own list there.
  paymentNote: "付款時請在備註寫上訂單編號。付款後可在此頁上傳付款截圖，我們收到款項並核對後會確認訂單。",
  defaultPayments: [
    { name: "PayMe", type: "qr", image: "assets/payme-qr.jpg", details: "打開 PayMe，掃描二維碼付款，並在備註寫上訂單編號。", link: "" },
    { name: "支付寶 Alipay", type: "qr", image: "assets/alipay-qr.jpg", details: "打開支付寶，掃描二維碼付款，並在備註寫上訂單編號。", link: "" },
  ],

  // ---------- 5. 交收方式 DELIVERY ----------
  // Shown in the order form. "pickup: true" means no address is needed.
  delivery: [
    { name: "順豐到付", note: "運費由你在收件時付給順豐，網上不收運費。" },
    { name: "門市自取（將軍澳）", note: "到將軍澳門市自取，營業時間 12:00 – 20:00。", pickup: true },
  ],

  // ---------- 6. 後備商品 SAMPLE PRODUCTS ----------
  // Used only when sheetCsvUrl is empty or the sheet cannot be read.
  // status: "" = available, "售罄" = sold out, "只限門市" = in-store only
  defaultProducts: [
    { group: "CORTIS",      name: "CORTIS Album (PB ver)",  price: 109, tag: "獨家優惠價",   image: "", status: "" },
    { group: "CORTIS",      name: "CORTIS Album (WVS ver)", price: 69,  tag: "獨家優惠價",   image: "", status: "" },
    { group: "BABYMONSTER", name: "-CHOOM PB",              price: 109, tag: "期間限定",     image: "", status: "" },
    { group: "BABYMONSTER", name: "JEWEL VER",              price: 79,  tag: "期間限定",     image: "", status: "" },
    { group: "TXT",         name: "最新 PB 補貨",            price: 85,  tag: "低過市價 $30", image: "", status: "" },
    { group: "BOYNEXTDOOR", name: "THE ACTION PB",          price: 35,  tag: "震撼價",       image: "", status: "" },
    { group: "ZEROBASEONE", name: "NEVER SAY NEVER PB",     price: 49,  tag: "只限門市",     image: "", status: "只限門市" },
    { group: "BLACKPINK",   name: "Album 首批 (PB ver)",     price: 125, tag: "送預售禮",     image: "", status: "" },
  ],
};
