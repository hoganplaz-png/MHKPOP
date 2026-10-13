// Calculations and the POS-text reader for the shop-management pages of the admin site.
// Pure functions only (no page, no Firebase), so they can be tested on their own.

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const money = (n) => (n < 0 ? "-" : "") + "HK$" + Math.abs(round2(n || 0)).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const pad = (n) => String(n).padStart(2, "0");

// ---------- numbers, dates, times ----------
const NUMCELL = /^[-(]?\s*(?:HK)?[$¥￥]?\s*[-]?\s*\d[\d,]*(?:\.\d+)?\s*\)?-?\s*(?:元|蚊|pcs|pc|件|個|隻)?$/i;
export const isNumCell = (s) => NUMCELL.test(String(s == null ? "" : s).trim());

export function num(v) {
  if (typeof v === "number") return v;
  let s = String(v == null ? "" : v).trim();
  if (!s) return NaN;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s) || /^[$¥]\s*-/.test(s);
  s = s.replace(/[^0-9.]/g, "");
  if (!s || s === ".") return NaN;
  const n = parseFloat(s);
  return neg ? -n : n;
}

function ymd(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return y + "-" + pad(m) + "-" + pad(d);
}
export function parseDate(s) {
  s = String(s == null ? "" : s);
  let m = s.match(/(\d{4})\s*[-\/.年]\s*(\d{1,2})\s*[-\/.月]\s*(\d{1,2})/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/(?<!\d)(\d{1,2})\s*[-\/.]\s*(\d{1,2})\s*[-\/.]\s*(\d{4}|\d{2})(?!\d)/);
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    // Hong Kong writes day first; if that is impossible but month-first works, use month-first
    if (b > 12 && a <= 12) return ymd(y, a, b);
    return ymd(y, b, a);
  }
  return null;
}
export function parseTime(s) {
  const m = String(s == null ? "" : s).match(/(am|pm|上午|下午)?\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm|上午|下午)?/i);
  if (!m) return "";
  let h = +m[2]; const ap = (m[1] || m[4] || "").toLowerCase();
  if ((ap === "pm" || ap === "下午") && h < 12) h += 12;
  if ((ap === "am" || ap === "上午") && h === 12) h = 0;
  if (h > 23 || +m[3] > 59) return "";
  return pad(h) + ":" + m[3];
}
export const todayStr = (d = new Date()) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

const dayNum = (s) => { const [y, m, d] = s.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const addDays = (s, n) => { const t = new Date(dayNum(s) * 86400000 + n * 86400000); return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate()); };

// ---------- matching names ----------
export const normName = (s) => String(s == null ? "" : s).toLowerCase().replace(/[\s\-_.,:;'"`~!@#$%^&*()+=<>?/\\|{}\[\]（）【】「」『』《》“”‘’：，。！？、·・]+/g, "");
// "TXT" + "TXT 最新 PB" shows as "TXT 最新 PB", not "TXT TXT 最新 PB"
export const dn = (group, name) => { const g = String(group || "").trim(), n = String(name || "").trim(); return !g || normName(n).includes(normName(g)) ? n : g + " " + n; };
const bigrams = (s) => { const out = []; for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2)); return out; };
export function similarity(a, b) {
  a = normName(a); b = normName(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && long.includes(short)) return 0.9;
  if (short.length < 2) return 0;
  const A = bigrams(a), B = bigrams(b), used = new Array(B.length).fill(false);
  let hit = 0;
  A.forEach((x) => { const i = B.findIndex((y, k) => !used[k] && y === x); if (i >= 0) { used[i] = true; hit++; } });
  return (2 * hit) / (A.length + B.length);
}

// ---------- purchases (bulk orders) ----------
// purchase = { date, supplier, currency, rate, shipping, otherFees, allocate: "qty"|"value", lines: [{ id, group, name, qty, unitPrice, sellPrice, adjust }] }
// All money inside a purchase is in the purchase currency; results are in HKD (× rate).
export function calcPurchase(p) {
  const rate = p.currency && p.currency !== "HKD" ? Number(p.rate) || 0 : 1;
  const lines = p.lines || [];
  const goods = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
  const qty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const extras = (Number(p.shipping) || 0) + (Number(p.otherFees) || 0);
  const byValue = p.allocate === "value" && goods > 0;
  const out = lines.map((l) => {
    const q = Number(l.qty) || 0, u = Number(l.unitPrice) || 0;
    const share = byValue ? (q * u) / goods : (qty > 0 ? q / qty : 0);
    const extra = extras * share;                       // shipping + fees given to this line (purchase currency)
    const landed = q > 0 ? (u + extra / q) * rate : 0;  // cost per album in HKD, shipping included
    const sell = Number(l.sellPrice) || 0;
    return { ...l, baseUnit: u * rate, extraTotal: extra * rate, unitCost: landed, margin: sell - landed, marginPct: sell > 0 ? (sell - landed) / sell : 0 };
  });
  return { rate, goods: goods * rate, extras: extras * rate, total: (goods + extras) * rate, qty, lines: out, rateMissing: p.currency && p.currency !== "HKD" && !(Number(p.rate) > 0) };
}

// sold quantity per purchase line, from the sales records
export function soldMap(sales) {
  const m = {};
  (sales || []).forEach((s) => (s.items || []).forEach((i) => { if (i.lineId) m[i.lineId] = (m[i.lineId] || 0) + (Number(i.qty) || 0); }));
  return m;
}
export const stockLeft = (line, sold) => (Number(line.qty) || 0) + (Number(line.adjust) || 0) - ((sold && sold[line.id]) || 0);

// flat list of every purchase line with its cost and stock, oldest purchase first
export function allLines(purchases, sales) {
  const sold = soldMap(sales), out = [];
  (purchases || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((p) => {
    calcPurchase(p).lines.forEach((l) => out.push({ ...l, purchaseId: p.id, purchaseDate: p.date, supplier: p.supplier || "", sold: sold[l.id] || 0, left: stockLeft(l, sold) }));
  });
  return out;
}

export function matchLines(name, lines, minScore = 0.6) {
  const scored = lines.map((l) => ({ l, s: Math.max(similarity(name, (l.group || "") + " " + l.name), similarity(name, l.name)) })).filter((x) => x.s >= minScore);
  if (!scored.length) return [];
  const best = Math.max(...scored.map((x) => x.s));
  return scored.filter((x) => x.s >= best - 0.02).map((x) => x.l);
}

// Split a sold quantity over purchase lines, oldest first. Anything beyond the recorded stock goes on the newest line (stock then shows negative).
export function allocateFrom(cands, qty) {
  if (!cands.length) return [{ lineId: "", qty }];
  if (qty <= 0) return [{ lineId: cands[cands.length - 1].id, qty }]; // a refund goes back on the newest line
  const parts = []; let need = qty;
  cands.forEach((l) => { if (need <= 0) return; const take = Math.min(Math.max(l.left, 0), need); if (take > 0) { parts.push({ lineId: l.id, qty: take }); need -= take; } });
  if (need > 0) {
    const last = cands[cands.length - 1], ex = parts.find((p) => p.lineId === last.id);
    if (ex) ex.qty += need; else parts.push({ lineId: last.id, qty: need });
  }
  return parts;
}
export function allocate(name, qty, lines, forceLineId) {
  return allocateFrom(forceLineId ? lines.filter((l) => l.id === forceLineId) : matchLines(name, lines), qty);
}
// after allocating, take the stock off the working copy so the next item in the same batch sees it
export function consume(lines, parts) { parts.forEach((p) => { const l = lines.find((x) => x.id === p.lineId); if (l) l.left -= p.qty; }); }

// ---------- expenses ----------
// expense = { date, name, category: "rent"|"other"|..., amount, repeat: "none"|"monthly"|"yearly", endDate }
export function expenseInRange(e, from, to) {
  const amount = Number(e.amount) || 0;
  const start = e.date || from;
  if (!e.repeat || e.repeat === "none") return e.date && e.date >= from && e.date <= to ? amount : 0;
  const end = e.endDate || "9999-12-31";
  const lo = start > from ? start : from, hi = end < to ? end : to;
  if (lo > hi) return 0;
  let total = 0;
  if (e.repeat === "monthly") {
    let [y, m] = lo.split("-").map(Number);
    const [ey, em] = hi.split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      const dim = daysInMonth(y, m), ms = y + "-" + pad(m) + "-01", me = y + "-" + pad(m) + "-" + pad(dim);
      const a = ms > lo ? ms : lo, b = me < hi ? me : hi;
      if (a <= b) total += (amount * (dayNum(b) - dayNum(a) + 1)) / dim;
      m++; if (m > 12) { m = 1; y++; }
    }
  } else {
    let y = +lo.slice(0, 4); const ey = +hi.slice(0, 4);
    for (; y <= ey; y++) {
      const dy = (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 366 : 365, ys = y + "-01-01", ye = y + "-12-31";
      const a = ys > lo ? ys : lo, b = ye < hi ? ye : hi;
      if (a <= b) total += (amount * (dayNum(b) - dayNum(a) + 1)) / dy;
    }
  }
  return total;
}

// ---------- profit ----------
export function profitReport({ sales, purchases, expenses, from, to }) {
  const lineCost = {}, allPl = [];
  (purchases || []).forEach((p) => calcPurchase(p).lines.forEach((l) => { lineCost[l.id] = l.unitCost; allPl.push(l); }));
  // An item sold before its purchase was recorded (a pre-order that has not arrived yet) has no purchase line.
  // Match it by name to the purchases now, so its cost still counts; averaged over the matching lines by quantity.
  const byName = {};
  const nameCost = (name) => {
    if (byName[name] !== undefined) return byName[name];
    const m = matchLines(name, allPl.filter((l) => l.unitCost > 0 || Number(l.qty) > 0));
    const q = m.reduce((t, l) => t + (Number(l.qty) || 0), 0);
    return (byName[name] = m.length ? (q > 0 ? m.reduce((t, l) => t + l.unitCost * (Number(l.qty) || 0), 0) / q : m[0].unitCost) : null);
  };
  const inRange = (sales || []).filter((s) => s.date >= from && s.date <= to);
  const byProduct = {}, byDay = {};
  let revenue = 0, cogs = 0, unknownRevenue = 0, unknownItems = 0, itemQty = 0, guessedItems = 0, guessedCost = 0;
  const bySource = { pos: 0, import: 0, web: 0 };
  inRange.forEach((s) => {
    const items = s.items || [];
    const gross = items.reduce((t, i) => t + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
    const total = Number.isFinite(Number(s.total)) ? Number(s.total) : gross;
    const factor = gross !== 0 ? total / gross : 1; // spreads a discount over the items
    let saleCogs = 0;
    items.forEach((i) => {
      const q = Number(i.qty) || 0, rev = (Number(i.price) || 0) * q * factor;
      let unit = i.lineId && lineCost[i.lineId] != null ? lineCost[i.lineId] : (Number.isFinite(Number(i.cost)) && i.cost !== "" && i.cost != null ? Number(i.cost) : null);
      let guessed = false;
      if (unit == null && i.lineId !== "none") { unit = nameCost(dn(i.group, i.name)); if (unit == null) unit = nameCost(i.name); guessed = unit != null; }
      if (guessed) { guessedItems++; guessedCost += unit * q; }
      const key = dn(i.group, i.name);
      const row = byProduct[key] || (byProduct[key] = { name: key, qty: 0, revenue: 0, cost: 0, unknownRevenue: 0 });
      row.qty += q; row.revenue += rev; itemQty += q;
      if (unit == null) { row.unknownRevenue += rev; unknownRevenue += rev; unknownItems++; }
      else { row.cost += unit * q; saleCogs += unit * q; }
    });
    revenue += total; cogs += saleCogs;
    const src = bySource[s.source] != null ? s.source : "pos";
    bySource[src] += total;
    const d = byDay[s.date] || (byDay[s.date] = { date: s.date, sales: 0, revenue: 0, cost: 0 });
    d.sales++; d.revenue += total; d.cost += saleCogs;
  });
  const exp = {};
  let expenseTotal = 0, rentTotal = 0;
  (expenses || []).forEach((e) => {
    const v = expenseInRange(e, from, to);
    if (!v) return;
    const k = e.category === "rent" ? "租金" : (e.name || "其他");
    exp[k] = (exp[k] || 0) + v; expenseTotal += v;
    if (e.category === "rent") rentTotal += v;
  });
  // money paid for stock bought in this period (cash out), whether or not it has been sold yet
  let stockBought = 0;
  (purchases || []).forEach((p) => { if (p.date && p.date >= from && p.date <= to) stockBought += calcPurchase(p).total; });
  const gross = revenue - cogs;
  return {
    from, to, saleCount: inRange.length, itemQty, revenue, cogs, grossProfit: gross, expenseTotal, netProfit: gross - expenseTotal,
    revenueBySource: bySource, rentTotal, otherExpenseTotal: expenseTotal - rentTotal, totalCost: cogs + expenseTotal,
    stockBought, cashNet: revenue - stockBought - expenseTotal,
    unknownRevenue, unknownItems, guessedItems, guessedCost,
    products: Object.values(byProduct).map((r) => ({ ...r, profit: r.revenue - r.unknownRevenue - r.cost })).sort((a, b) => b.profit - a.profit),
    days: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
    expenses: Object.entries(exp).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
  };
}

export function periodRange(kind, today = todayStr(), custom = {}) {
  const [y, m, d] = today.split("-").map(Number);
  const monthStart = (yy, mm) => yy + "-" + pad(mm) + "-01";
  const monthEnd = (yy, mm) => yy + "-" + pad(mm) + "-" + pad(daysInMonth(yy, mm));
  if (kind === "today") return { from: today, to: today };
  if (kind === "yesterday") { const t = addDays(today, -1); return { from: t, to: t }; }
  if (kind === "week") { const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; return { from: addDays(today, -dow), to: today }; }
  if (kind === "month") return { from: monthStart(y, m), to: monthEnd(y, m) };
  if (kind === "lastmonth") { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return { from: monthStart(yy, mm), to: monthEnd(yy, mm) }; }
  if (kind === "year") return { from: y + "-01-01", to: y + "-12-31" };
  if (kind === "all") return { from: "2000-01-01", to: "2100-12-31" };
  return { from: custom.from || today, to: custom.to || today };
}

// ---------- reading pasted POS records ----------
const PAY = [[/現金|cash/i, "現金"], [/payme/i, "PayMe"], [/alipay|支付寶|支付宝/i, "支付寶"], [/fps|轉數快|转数快/i, "轉數快"], [/八達通|octopus/i, "八達通"], [/信用卡|visa|master|credit|card|銀聯|unionpay/i, "信用卡"], [/wechat|微信|weixin/i, "微信支付"]];
export function normPayment(s) {
  s = String(s == null ? "" : s).trim();
  if (!s) return "";
  const hit = PAY.find(([re]) => re.test(s));
  return hit ? hit[1] : s;
}
const isPayText = (s) => PAY.some(([re]) => re.test(String(s)));

const HEAD = [
  ["receipt", ["單號", "收據", "發票", "單據", "receipt", "invoice", "bill", "交易編號", "訂單編號", "order no", "order #", "order id", "transaction"]],
  ["datetime", ["日期時間", "日期/時間", "date time", "datetime", "date/time", "交易時間", "交易日期"]],
  ["date", ["日期", "營業日", "date"]],
  ["time", ["時間", "time"]],
  ["payment", ["付款", "支付", "payment", "method", "結帳方式", "結算方式"]],
  ["discount", ["折扣", "優惠", "discount"]],
  ["qty", ["數量", "qty", "quantity", "件數"]],
  ["price", ["單價", "售價", "unit price", "price", "價錢", "價格"]],
  ["amount", ["小計", "金額", "總額", "合計", "總計", "實收", "應收", "amount", "total", "subtotal", "sum"]],
  ["name", ["商品", "品名", "產品", "名稱", "貨品", "項目", "item", "product", "description", "name"]]
];
const CODEWORDS = /編號|代碼|條碼|code|sku|barcode|類別|分類|category/i;
function headerField(cell) {
  const c = String(cell || "").trim().toLowerCase();
  if (!c || c.length > 30) return null;
  for (const [field, words] of HEAD) {
    if (field !== "receipt" && CODEWORDS.test(c)) { if (HEAD[0][1].some((w) => c.includes(w))) return "receipt"; return null; }
    if (words.some((w) => c.includes(w))) return field;
  }
  return null;
}

function csvSplit(line, delim) {
  const out = []; let cell = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { out.push(cell.trim()); cell = ""; }
    else cell += c;
  }
  out.push(cell.trim());
  return out;
}
const modeOf = (arr) => { const c = {}; arr.forEach((x) => { c[x] = (c[x] || 0) + 1; }); let best = 0, k = 0; Object.entries(c).forEach(([key, v]) => { if (v > best) { best = v; k = +key; } }); return { value: k, share: arr.length ? best / arr.length : 0 }; };

function detectDelimiter(lines) {
  const n = lines.length;
  if (lines.filter((l) => l.includes("\t")).length >= n * 0.6) return { delim: "\t", split: (l) => l.split("\t").map((x) => x.trim()) };
  for (const d of [",", "|", ";"]) {
    const m = modeOf(lines.map((l) => csvSplit(l, d).length));
    if (m.value >= 3 && m.share >= 0.6) return { delim: d, split: (l) => csvSplit(l, d) };
  }
  const m = modeOf(lines.map((l) => l.split(/\s{2,}/).length));
  if (m.value >= 3 && m.share >= 0.6) return { delim: "  ", split: (l) => l.split(/\s{2,}/).map((x) => x.trim()) };
  return null;
}

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const idx = {}; let hits = 0;
    rows[i].forEach((cell, j) => { const f = headerField(cell); if (f && idx[f] == null) { idx[f] = j; hits++; } });
    if (idx.datetime != null) { if (idx.date == null) idx.date = idx.datetime; if (idx.time == null) idx.time = idx.datetime; }
    if (hits >= 2 && (idx.name != null || idx.amount != null)) return { row: i, idx };
  }
  return null;
}

function inferColumns(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const info = [];
  for (let j = 0; j < cols; j++) {
    const cells = rows.map((r) => (r[j] == null ? "" : String(r[j]).trim())).filter(Boolean);
    const n = cells.length || 1;
    const dates = cells.filter((c) => parseDate(c)).length / n, times = cells.filter((c) => /\d{1,2}:\d{2}/.test(c)).length / n;
    const nums = cells.filter((c) => isNumCell(c)).length / n;
    const pays = cells.filter(isPayText).length / n;
    const ints = cells.every((c) => /^-?\d+$/.test(c.replace(/,/g, "")));
    info.push({ j, cells, dates, times, nums, pays, ints, avgLen: cells.reduce((s, c) => s + c.length, 0) / n, hasData: cells.length > 0 });
  }
  const idx = {};
  const used = new Set();
  const take = (f, c) => { if (c && !used.has(c.j)) { idx[f] = c.j; used.add(c.j); return true; } return false; };
  const dateCol = info.find((c) => c.dates >= 0.5); if (dateCol) { take("date", dateCol); if (dateCol.times >= 0.5) idx.time = dateCol.j; }
  const timeCol = info.find((c) => !used.has(c.j) && c.times >= 0.5 && c.dates < 0.5); if (timeCol) take("time", timeCol);
  const payCol = info.find((c) => !used.has(c.j) && c.pays >= 0.6 && c.nums < 0.5); if (payCol) take("payment", payCol);
  const rec = info.find((c) => !used.has(c.j) && c.nums >= 0.9 && c.ints && c.cells.every((x) => x.replace(/\D/g, "").length >= 5)) ||
    info.find((c) => !used.has(c.j) && c.nums < 0.5 && c.hasData && c.cells.every((x) => /^[A-Za-z0-9\-_#]{4,24}$/.test(x) && /\d/.test(x)));
  if (rec) take("receipt", rec);
  const textCols = info.filter((c) => !used.has(c.j) && c.nums < 0.5 && c.hasData).sort((a, b) => b.avgLen - a.avgLen);
  if (textCols[0]) take("name", textCols[0]);
  const numCols = info.filter((c) => !used.has(c.j) && c.nums >= 0.7 && c.hasData);
  const vals = (c) => rows.map((r) => num(r[c.j]));
  if (numCols.length === 1) take("amount", numCols[0]);
  else if (numCols.length === 2) {
    const [a, b] = numCols, small = (c) => c.ints && Math.max(...vals(c).map(Math.abs)) <= 99;
    if (small(a)) { take("qty", a); take("amount", b); } else if (small(b)) { take("amount", a); take("qty", b); } else { take("price", a); take("amount", b); }
  } else if (numCols.length >= 3) {
    let best = null;
    numCols.forEach((q) => numCols.forEach((p) => numCols.forEach((a) => {
      if (q === p || q === a || p === a || !q.ints) return;
      const hit = rows.filter((r) => { const x = num(r[q.j]), y = num(r[p.j]), z = num(r[a.j]); return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && Math.abs(x * y - z) <= 0.01 + Math.abs(z) * 0.01; }).length;
      if (!best || hit > best.hit) best = { q, p, a, hit };
    })));
    if (best && best.hit >= rows.length * 0.6) { take("qty", best.q); take("price", best.p); take("amount", best.a); }
    else { take("qty", numCols[0]); take("price", numCols[1]); take("amount", numCols[numCols.length - 1]); }
  }
  return idx;
}

const SUMMARY = /^(合計|總計|小計|總額|找續|找零|找贖|應收|實收|折扣|優惠|服務費|total|subtotal|change|tendered|discount|tax|rounding|grand total|共)/i;

// Turns pasted text into sales. Understands tab / comma / spaced columns (with or without a header row) and plain receipt lines.
export function parsePosText(text, opts = {}) {
  const defaultDate = opts.defaultDate || todayStr();
  const freePriceIsUnit = opts.freePrice === "unit";
  // keep leading tabs: empty first columns matter in tab-separated records
  const lines = String(text || "").split(/\r?\n/).map((l) => { l = l.replace(/\u00a0/g, " "); return l.includes("\t") ? l.replace(/\s+$/, "") : l.trim(); }).filter((l) => l.trim());
  const result = { sales: [], skipped: [], mode: "", header: null };
  if (!lines.length) return result;
  const det = detectDelimiter(lines);
  const sales = []; const byKey = new Map();
  const finish = () => {
    sales.forEach((s) => {
      const sum = s.items.reduce((t, i) => t + i.price * i.qty, 0);
      s.total = round2(Number.isFinite(s.headerTotal) && s.items.length ? s.headerTotal : sum - (s.discount || 0));
      s.items.forEach((i) => { i.price = round2(i.price); });
      delete s.headerTotal;
    });
    result.sales = sales.filter((s) => s.items.length);
    return result;
  };
  const newSale = (o) => { const s = { date: o.date || defaultDate, time: o.time || "", receipt: o.receipt || "", payment: o.payment || "", discount: 0, items: [], headerTotal: NaN }; sales.push(s); return s; };

  if (det) {
    let rows = lines.map((l) => det.split(l));
    let hdr = findHeader(rows), idx;
    if (hdr) { idx = hdr.idx; result.mode = "header"; result.header = rows[hdr.row]; rows = rows.slice(hdr.row + 1); }
    else { idx = inferColumns(rows); result.mode = "guess"; }
    if (idx.name == null && idx.amount == null) { result.skipped = lines.slice(); return finish(); }
    const get = (r, f) => (idx[f] != null && r[idx[f]] != null ? String(r[idx[f]]).trim() : "");
    let cur = null;
    rows.forEach((r, ri) => {
      const raw = r.join(" | ");
      if (hdr && findHeader([r])) return;                              // repeated header row
      const name = get(r, "name"), dateCell = get(r, "date"), timeCell = get(r, "time");
      const date = parseDate(dateCell) || "", time = parseTime(timeCell) || parseTime(dateCell);
      const receipt = get(r, "receipt"), payment = normPayment(get(r, "payment"));
      const hasName = name && !isNumCell(name) && !SUMMARY.test(name);
      const amountCell = get(r, "amount"), qtyCell = get(r, "qty"), priceCell = get(r, "price");
      if (!hasName) {
        if (name && SUMMARY.test(name)) { result.skipped.push(raw); return; }
        if ((receipt || date) && (amountCell || payment)) {          // a line that starts a receipt (receipt number, date, total)
          cur = newSale({ date, time, receipt, payment });
          const t = num(amountCell); if (Number.isFinite(t)) cur.headerTotal = t;
          return;
        }
        result.skipped.push(raw); return;
      }
      let qty = num(qtyCell); if (!Number.isFinite(qty) || qty === 0) qty = Number.isFinite(qty) && qtyCell !== "" ? 0 : 1;
      let price = num(priceCell), amount = num(amountCell);
      if (!Number.isFinite(price) && Number.isFinite(amount)) price = qty ? amount / qty : amount;
      if (!Number.isFinite(price)) { result.skipped.push(raw); return; }
      if (!qty) { result.skipped.push(raw); return; }
      let sale;
      if (cur && !receipt && !date) sale = cur;
      else {
        const key = receipt ? (date || "") + "|" + receipt : (time ? (date || "") + "|" + time : "row" + ri);
        sale = byKey.get(key);
        if (!sale) { sale = newSale({ date, time, receipt, payment }); byKey.set(key, sale); }
        if (receipt || date) cur = null;
      }
      if (!sale.payment && payment) sale.payment = payment;
      const disc = num(get(r, "discount")); if (Number.isFinite(disc)) sale.discount += Math.abs(disc);
      sale.items.push({ name, qty, price });
    });
    return finish();
  }

  // plain receipt text
  result.mode = "text";
  let cur = null, curDate = "", curTime = "";
  const ensure = () => cur || (cur = newSale({ date: curDate, time: curTime }));
  lines.forEach((line) => {
    const d = parseDate(line), t = parseTime(line);
    const rec = line.match(/(?:單號|收據|發票|receipt|invoice|bill)\s*(?:no\.?|number|#)?\s*[:：#]?\s*([A-Za-z0-9\-_]{3,})/i);
    if (rec) { cur = newSale({ date: d || curDate, time: t || curTime, receipt: rec[1] }); if (d) curDate = d; return; }
    const rest = line.replace(/\d{4}\s*[-\/.年]\s*\d{1,2}\s*[-\/.月]\s*\d{1,2}日?|\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}|\d{1,2}:\d{2}(?::\d{2})?\s*(am|pm|上午|下午)?/gi, "").replace(/[\s:：,，]+/g, "");
    if ((d || t) && rest.length <= 2) { if (d) { curDate = d; if (cur && cur.items.length) cur = null; } if (t) curTime = t; return; }
    const pay = isPayText(line) && !/\d/.test(line.replace(/payme|fps|alipay|visa|master/gi, "")) ? normPayment(line) : "";
    if (pay) { if (cur) cur.payment = pay; return; }
    if (SUMMARY.test(line)) { const t2 = num(line.replace(/^[^\d(-]*/, "")); if (/^(合計|總計|total|grand total|應收|實收)/i.test(line) && cur && Number.isFinite(t2)) cur.headerTotal = t2; result.skipped.push(line); return; }
    let m = line.match(/^(.+?)\s*[x×*]\s*(\d+)\s*(?:@|=|[:：]|\s)?\s*(?:HK)?[$¥]?\s*(-?\d[\d,]*(?:\.\d+)?)\s*(?:元|蚊)?$/i);
    let name, qty, price;
    if (m) { name = m[1]; qty = +m[2]; const v = num(m[3]); price = freePriceIsUnit ? v : v / (qty || 1); }
    else if ((m = line.match(/^(\d+)\s*[x×*件個]?\s+(.+?)\s+(?:HK)?[$¥]?\s*(-?\d[\d,]*(?:\.\d+)?)\s*(?:元|蚊)?$/i)) && +m[1] <= 99) { name = m[2]; qty = +m[1]; const v = num(m[3]); price = freePriceIsUnit ? v : v / qty; }
    else if ((m = line.match(/^(.+?)\s+(?:HK)?[$¥]?\s*(-?\d[\d,]*(?:\.\d+)?)\s*(?:元|蚊)?$/i))) { name = m[1]; qty = 1; price = num(m[2]); }
    if (!name || !Number.isFinite(price) || !qty) { result.skipped.push(line); return; }
    name = name.replace(/[:：\-–—.]+$/, "").trim();
    if (!name || SUMMARY.test(name)) { result.skipped.push(line); return; }
    ensure().items.push({ name, qty, price });
  });
  return finish();
}

// id for an imported sale, so pasting the same record twice never doubles it
export function saleKey(s) {
  const base = s.receipt ? s.date + "-" + s.receipt : s.date + "-" + s.time + "-" + (s.items || []).map((i) => i.name + "x" + i.qty + "@" + i.price).join("~");
  let h = 5381; for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) | 0;
  return "P-" + s.date + "-" + (s.receipt ? s.receipt.replace(/[^A-Za-z0-9_-]/g, "") : (h >>> 0).toString(36));
}

// ================= website products: matching and shared stock =================
// product = { id, group, name, price, stock?: number, aliases?: string[], addons?: [{ id, price }] }
// A product with no `stock` number is not counted. A product with one has a single stock number that every way of selling it
// (收銀, pasted POS record, website order) takes from.
export function matchProducts(name, products, min = 0.6) {
  return (products || []).map((p) => {
    let s = Math.max(similarity(name, dn(p.group, p.name)), similarity(name, p.name));
    (p.aliases || []).forEach((a) => { s = Math.max(s, normName(a) === normName(name) ? 1 : similarity(name, a) * 0.98); });
    return { p, s };
  }).filter((x) => x.s >= min).sort((a, b) => b.s - a.s);
}
export const bestProduct = (name, products) => { const m = matchProducts(name, products); return m.length ? m[0].p : null; };

// purchase lines that belong to a product (oldest first, as allLines returns them)
export function candidateLines(product, lines) {
  const label = dn(product.group, product.name);
  return (lines || []).filter((l) => similarity(dn(l.group, l.name), label) >= 0.85 || similarity(l.name, product.name) >= 0.9);
}

// Turns one sold item into sale items: finds the product (its stock) and the purchase lines (its cost).
// item: { name, qty, price, productId?: "" (auto) | "none" | id, candIds?: [lineId], lineId?: "auto" | "none" | id, addon?: bool }
// env: { products, lines } are working copies; stock and line stock are taken off them so the next item sees the change.
export function buildItems(item, env) {
  const qty = Number(item.qty) || 0, price = Number(item.price) || 0;
  let product = null;
  if (item.productId && item.productId !== "none") product = env.products.find((p) => p.id === item.productId) || null;
  else if (!item.productId) product = bestProduct(item.name, env.products);
  let cands;
  if (item.candIds) cands = env.lines.filter((l) => item.candIds.includes(l.id));
  else if (item.lineId && item.lineId !== "auto" && item.lineId !== "none") cands = env.lines.filter((l) => l.id === item.lineId);
  else if (item.lineId === "none") cands = [];
  else cands = product ? candidateLines(product, env.lines) : matchLines(item.name, env.lines);
  const parts = allocateFrom(cands, qty); consume(env.lines, parts);
  const tracked = !!product && typeof product.stock === "number";
  if (tracked) product.stock -= qty;
  const items = parts.map((pt) => {
    const l = env.lines.find((x) => x.id === pt.lineId), base = product || l;
    const it = { name: base ? base.name : item.name, group: base ? base.group || "" : "", qty: pt.qty, price, lineId: pt.lineId, productId: product ? product.id : "", stk: tracked };
    if (item.name && it.name !== item.name) it.posName = item.name;
    if (item.addon) it.addon = true;
    if (item.cost != null && Number.isFinite(Number(item.cost)) && !pt.lineId) it.cost = Number(item.cost);
    return it;
  });
  return { items, delta: tracked ? { [product.id]: qty } : {}, product, tracked };
}

// stock to give back when a sale is removed: { productId: qty } for items that took stock
export function stockToRestore(sale) {
  const m = {};
  (sale.items || []).forEach((i) => { if (i.stk && i.productId) m[i.productId] = (m[i.productId] || 0) + (Number(i.qty) || 0); });
  return m;
}

// ================= add-on (加購) =================
export function addonsOf(product, products) {
  return (product.addons || []).map((a) => { const t = products.find((p) => p.id === a.id); return t ? { product: t, price: Number(a.price) || 0 } : null; }).filter(Boolean);
}

// ================= membership =================
export const DEFAULT_MEMBER = { enabled: true, per: 10, tiers: [{ name: "一般會員", min: 0, mult: 1 }, { name: "銀卡會員", min: 1500, mult: 1.2 }, { name: "金卡會員", min: 5000, mult: 1.5 }] };
export const memberSettings = (s) => ({ enabled: s && s.enabled !== undefined ? !!s.enabled : DEFAULT_MEMBER.enabled, per: s && Number(s.per) > 0 ? Number(s.per) : DEFAULT_MEMBER.per, tiers: s && Array.isArray(s.tiers) && s.tiers.length ? s.tiers : DEFAULT_MEMBER.tiers });
export function tierFor(settings, spent) {
  const t = (settings.tiers || []).slice().sort((a, b) => a.min - b.min);
  let cur = t[0] || { name: "會員", min: 0, mult: 1 };
  t.forEach((x) => { if (spent >= x.min) cur = x; });
  return { tier: cur, next: t.find((x) => x.min > spent) || null };
}
export function pointsFor(total, settings, spentBefore) {
  if (!settings.enabled || !(settings.per > 0) || !(total > 0)) return 0;
  return Math.max(0, Math.floor((total / settings.per) * (tierFor(settings, spentBefore || 0).tier.mult || 1)));
}

// ================= order progress =================
export const PROGRESS = [["received", "已收到訂單"], ["paid", "已確認收款"], ["ordering", "訂購中／備貨中"], ["arrived", "貨品已到"], ["shipped", "已寄出"], ["ready", "可到門市取貨"], ["done", "已完成"]];
const pIdx = (k) => PROGRESS.findIndex((p) => p[0] === k);
export function progressKey(order) {
  if (order.status === "cancelled") return "cancelled";
  return order.progress && pIdx(order.progress) >= 0 ? order.progress : order.status === "done" ? "done" : order.status === "confirmed" ? "paid" : "received";
}
// the steps this order goes through, and which one it is at
export function orderSteps(order) {
  const hasPre = (order.items || []).some((i) => i.mode === "preorder");
  const pickup = !order.address;
  const keys = ["received", "paid"].concat(hasPre ? ["ordering", "arrived"] : [], [pickup ? "ready" : "shipped", "done"]);
  const cur = progressKey(order), ci = pIdx(cur);
  let at = -1;
  keys.forEach((k, i) => { if (pIdx(k) <= ci) at = i; });
  return { cancelled: cur === "cancelled", steps: keys.map((k, i) => ({ key: k, label: PROGRESS[pIdx(k)][1], done: i < at, current: i === at })) };
}

// ================= sale price =================
// A product can have a sale price (特價) that is used until its last day (saleEnds, inclusive; empty = no end).
export function effectivePrice(p, today = todayStr()) {
  const sp = p.salePrice;
  if (sp !== undefined && sp !== null && sp !== "" && Number.isFinite(Number(sp)) && (!p.saleEnds || today <= p.saleEnds)) return Number(sp);
  return Number(p.price) || 0;
}
export const onSale = (p, today = todayStr()) => effectivePrice(p, today) < (Number(p.price) || 0);
