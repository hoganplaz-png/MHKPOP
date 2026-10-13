// Automatic check of the payment screenshots customers upload on the payment page.
// The admin page reads each screenshot (English and Traditional Chinese) with Tesseract (self-hosted in /vendor/tesseract, runs in the admin's browser,
// nothing is sent anywhere) and compares what it finds with the order:
//   - amount:  a money amount in the screenshot equals the order total
//   - date:    the payment date is on or after the order date and not after the upload date
//   - order:   the order number appears in the screenshot (customers often type it in the payment message)
//   - reuse:   the same screenshot (or the same transaction number) was not uploaded for another order
// Anything that does not match, or cannot be read, is flagged for a manual check. Nothing is confirmed automatically:
// a screenshot can be edited, so the owner still checks the PayMe / Alipay app before pressing 已確認.

const VERSION = 1;                       // bump to re-read every screenshot after changing the reader
const CACHE = "mh-proofcheck:";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// ---------- reading the text (pure, also used by the tests) ----------

// OCR often mixes up letters and digits; this makes order numbers and transaction numbers comparable.
const squash = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8");

// Money amounts. Numbers with a currency mark (HK$, $, HKD, 港幣, ¥, RMB) or with two decimals count;
// plain whole numbers do not, since times, phone numbers and dates are full of them.
export function findAmounts(text) {
  const out = [];
  const t = String(text || "").replace(/[，]/g, ",").replace(/[．。]/g, ".");
  const re = /(HK\s*[$S5]|HKD|港幣|港元|RMB|CNY|[$¥￥])?\s*(-?\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?(?!\d)/gi;
  let m;
  while ((m = re.exec(t))) {
    const cur = !!m[1], dec = m[3] !== undefined;
    if (!cur && !dec) continue;
    const n = Number(m[2].replace(/,/g, "") + (dec ? "." + m[3] : ""));
    if (!isFinite(n) || n <= 0 || n >= 1000000) continue;
    out.push(Math.abs(n));
  }
  return [...new Set(out)];
}

const ymd = (y, m, d) => {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2020 || y > 2100) return null;
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 ? y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0") : null;
};

// Dates, as "YYYY-MM-DD". A date like 03/04/2026 could be 3 April or 4 March, so both are returned.
export function findDates(text) {
  const out = new Set(), t = String(text || "");
  const add = (v) => { if (v) out.add(v); };
  let m;
  const iso = /(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/g;
  while ((m = iso.exec(t))) add(ymd(+m[1], +m[2], +m[3]));
  const dmy = /(?<!\d)(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(20\d{2}|\d{2})(?!\d)/g;
  while ((m = dmy.exec(t))) { add(ymd(+m[3], +m[2], +m[1])); add(ymd(+m[3], +m[1], +m[2])); }
  const mon = "(" + MONTHS.join("|") + ")[a-z]*\\.?";
  const dMy = new RegExp("(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+" + mon + ",?\\s+(20\\d{2})", "gi");
  while ((m = dMy.exec(t))) add(ymd(+m[3], MONTHS.indexOf(m[2].toLowerCase().slice(0, 3)) + 1, +m[1]));
  const Mdy = new RegExp(mon + "\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})", "gi");
  while ((m = Mdy.exec(t))) add(ymd(+m[3], MONTHS.indexOf(m[1].toLowerCase().slice(0, 3)) + 1, +m[2]));
  return [...out].sort();
}

// Long letter-and-digit codes (transaction / reference numbers). Used to spot one payment shown for two orders.
export function findRefs(text, ignore) {
  const skip = new Set((ignore || []).map(squash));
  const out = new Set();
  (String(text || "").match(/[A-Za-z0-9][A-Za-z0-9-]{9,}/g) || []).forEach((w) => {
    const s = squash(w);
    if (s.length >= 10 && /\d{6,}/.test(s) && !/^20\d{6}$/.test(s) && !skip.has(s)) out.add(s);
  });
  return [...out];
}

export function hasOrderNo(text, orderNo) {
  const want = squash(orderNo), tail = want.replace(/^MH/, "");
  const got = squash(text);
  return !!want && (got.includes(want) || (tail.length >= 5 && got.includes(tail)));
}

const dayOf = (v) => {
  const d = v && v.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null;
  return d && !isNaN(d) ? ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()) : null;
};
const fmtMoney = (n) => "HK$" + (Number.isInteger(n) ? n : n.toFixed(2));

// Compares what was read with the order. `read` is { text, hash } for this screenshot,
// `others` lists the other screenshots as { orderNo, read, createdAt }.
// Returns { status: "pass" | "review", checks: [{ key, state: "ok" | "bad" | "info", text }] }.
export function judge(order, proof, read, others) {
  const checks = [], text = read.text || "";
  const add = (key, state, t) => checks.push({ key, state, text: t });

  if (text.replace(/\s/g, "").length < 8) {
    add("read", "bad", "讀不到截圖上的文字（可能太模糊或不是付款截圖）");
    return { status: "review", checks };
  }

  const total = Number(order.total) || 0, amounts = findAmounts(text);
  if (amounts.some((a) => Math.abs(a - total) < 0.005)) add("amount", "ok", "金額 " + fmtMoney(total) + " 相符");
  else if (amounts.length) add("amount", "bad", "截圖金額 " + amounts.slice(0, 3).map(fmtMoney).join("、") + "，訂單是 " + fmtMoney(total));
  else add("amount", "bad", "截圖上找不到金額");

  const from = dayOf(order.createdAt), to = dayOf(proof.createdAt) || dayOf(new Date());
  const dates = findDates(text);
  if (!dates.length) add("date", "bad", "截圖上找不到付款日期");
  else if (dates.some((d) => (!from || d >= from) && (!to || d <= to))) add("date", "ok", "付款日期 " + dates.find((d) => (!from || d >= from) && (!to || d <= to)) + " 合理");
  else if (from && dates.every((d) => d < from)) add("date", "bad", "付款日期 " + dates[dates.length - 1] + " 早於訂單日期 " + from + "（可能是舊截圖）");
  else add("date", "bad", "付款日期 " + dates[0] + " 不在訂單日期 " + (from || "?") + " 至上傳日期 " + (to || "?") + " 之間");

  if (hasOrderNo(text, order.orderNo)) add("order", "ok", "截圖有訂單編號 " + order.orderNo);
  else add("order", "info", "截圖沒有訂單編號（客人未必有填，不算錯）");

  // only the later upload is flagged: the first order to show a payment is most likely the real one
  const mine = findRefs(text, [order.orderNo]), at = (v) => { const d = v && v.toDate ? v.toDate() : v ? new Date(v) : null; return d && !isNaN(d) ? +d : null; };
  const t0 = at(proof.createdAt);
  const reused = (others || []).filter((o) => o.orderNo !== order.orderNo && o.read && !(t0 && at(o.createdAt) && at(o.createdAt) > t0) &&
    ((read.hash && o.read.hash === read.hash) || findRefs(o.read.text, [o.orderNo]).some((r) => mine.includes(r))));
  if (reused.length) add("reuse", "bad", "同一張截圖／交易編號亦用於訂單 " + [...new Set(reused.map((o) => o.orderNo))].join("、"));

  return { status: checks.some((c) => c.state === "bad") ? "review" : "pass", checks };
}

// ---------- running the reader in the admin's browser ----------

const cacheGet = (id) => {
  try { const v = JSON.parse(localStorage.getItem(CACHE + id) || "null"); return v && v.v === VERSION ? v : null; } catch (e) { return null; }
};
const cacheSet = (id, v) => { try { localStorage.setItem(CACHE + id, JSON.stringify(v)); } catch (e) { /* storage full or blocked: read again next time */ } };

async function sha256(s) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

let libP = null;
function loadLib() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!libP) libP = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/vendor/tesseract/tesseract.min.js";
    s.onload = () => resolve(window.Tesseract);
    s.onerror = () => { libP = null; reject(new Error("load")); };
    document.head.appendChild(s);
  });
  return libP;
}

// Reads screenshots one at a time, newest first, and calls onChange after each one.
export function setupProofCheck({ onChange }) {
  const results = new Map();     // proof id -> { text, hash } | { error: true }
  let queue = [], busy = false, worker = null;

  const ensureWorker = async () => {
    if (worker) return worker;
    const T = await loadLib();
    worker = await T.createWorker(["eng", "chi_tra"], 1, {
      workerPath: "/vendor/tesseract/worker.min.js",
      corePath: "/vendor/tesseract/tesseract-core-simd-lstm.js",
      langPath: "/vendor/tesseract",
      workerBlobURL: false            // keeps the Content-Security-Policy strict: no blob: workers
    });
    // sparse text: payment screenshots are scattered lines of very different sizes (the amount is huge)
    await worker.setParameters({ tessedit_pageseg_mode: "11" });
    return worker;
  };

  const next = async () => {
    if (busy || !queue.length) return;
    busy = true;
    const p = queue.shift();
    try {
      const w = await ensureWorker();
      const [hash, r] = await Promise.all([sha256(p.image), w.recognize(p.image)]);
      const v = { v: VERSION, text: (r.data.text || "").slice(0, 4000), hash };
      cacheSet(p.id, v); results.set(p.id, v);
    } catch (e) {
      results.set(p.id, { error: true });
    }
    busy = false;
    onChange();
    next();
  };

  return {
    // Call with the current list of screenshots; new ones are queued.
    update(proofs) {
      proofs.forEach((p) => {
        if (results.has(p.id) || queue.some((q) => q.id === p.id)) return;
        const c = cacheGet(p.id);
        if (c) results.set(p.id, c); else if (p.image) queue.push(p);
      });
      next();
    },
    // { state: "pending" } while waiting, { state: "error" } if the reader failed, otherwise the judge() result.
    resultFor(order, proof, allProofs) {
      const r = results.get(proof.id);
      if (!r) return { state: "pending" };
      if (r.error) return { state: "error" };
      const others = allProofs.filter((x) => x.id !== proof.id).map((x) => ({ orderNo: x.orderNo, read: results.get(x.id), createdAt: x.createdAt }));
      return { state: "done", ...judge(order, proof, r, others) };
    },
    textOf(id) { const r = results.get(id); return r && r.text ? r.text : ""; },
    recheck(proof) {
      try { localStorage.removeItem(CACHE + proof.id); } catch (e) { /* ignore */ }
      results.delete(proof.id); queue.unshift(proof); onChange(); next();
    }
  };
}
