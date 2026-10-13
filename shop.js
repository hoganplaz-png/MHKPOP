// Shop management pages of the admin site: POS (收銀), sales records and POS paste-in (銷售紀錄),
// bulk orders and costs (進貨及成本), rent and other costs (租金及開支), and the profit report (利潤).
import {
  money, round2, todayStr, periodRange, num, calcPurchase, allLines, soldMap, matchLines, profitReport, parsePosText, saleKey,
  normName, addDays, dn, effectivePrice, onSale, buildItems, bestProduct, matchProducts, candidateLines, stockToRestore, addonsOf
} from "./shoplib.js";

export function setupShop(ctx) {
  const { db, fb, $, esc, notice } = ctx;
  const { collection, doc, onSnapshot, query, orderBy, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, increment, arrayUnion } = fb;

  let purchases = [], sales = [], expenses = [], unsubs = [];
  let cart = [], imp = null, salesKind = "month", profitKind = "month";
  let editingPurchase = null, editingExpense = null;
  const SOURCE = { pos: "收銀", import: "POS 貼上", web: "網站訂單" };
  const MODE = { stock: "格仔舖現貨", preorder: "訂購", sf: "順豐" };
  const RANGES = [["today", "今日"], ["yesterday", "昨日"], ["week", "本週"], ["month", "本月"], ["lastmonth", "上月"], ["year", "今年"], ["all", "全部"]];
  const uid = () => "L" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fail = (msg) => notice(msg);
  const nowTime = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const lines = () => allLines(purchases, sales);
  const costMap = () => { const m = {}; purchases.forEach((p) => calcPurchase(p).lines.forEach((l) => { m[l.id] = l.unitCost; })); return m; };
  const dateOf = (ts) => { const d = ts && ts.toDate ? ts.toDate() : new Date(); return todayStr(d); };
  const timeOf = (ts) => { const d = ts && ts.toDate ? ts.toDate() : new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };

  function download(name, rows) {
    const q = (s) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
    const blob = new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

  // ================= data =================
  function start() {
    stop();
    const sub = (name, setter) => unsubs.push(onSnapshot(query(collection(db, name), orderBy("date", "desc")),
      (snap) => { setter(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); scheduleRender(); },
      (err) => { if (!err || err.code !== "permission-denied") fail("載入店舖資料失敗，請稍後再試。"); }));
    sub("purchases", (v) => { purchases = v; });
    sub("sales", (v) => { sales = v; });
    sub("expenses", (v) => { expenses = v; });
    if (!$("#pos-date").value) $("#pos-date").value = todayStr();
    if (!$("#imp-date").value) $("#imp-date").value = todayStr();
    scheduleRender();
  }
  function stop() { clearTimeout(renderTimer); unsubs.forEach((u) => u()); unsubs = []; purchases = []; sales = []; expenses = []; cart = []; imp = null; }
  // draw after the current event has finished (an edit box that loses focus must not be replaced while it is still handling its own change)
  let renderTimer = 0;
  function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(renderAll, 0); }
  function renderAll() { renderPOS(); renderSales(); renderPurchases(); renderExpenses(); renderProfit(); }

  // ================= 收銀 POS =================
  const prods = () => ctx.getWebProducts() || [];
  const stockLabel = (p) => (typeof p.stock === "number" ? (p.stock > 0 ? "存庫 " + p.stock : "存庫 0") : "未追蹤存庫");
  // tiles: every website product, plus purchased goods that are not on the website
  function tiles() {
    const ps = prods(), out = ps.map((p) => ({ kind: "p", key: "p:" + p.id, id: p.id, group: p.group || "", name: p.name, price: effectivePrice(p), was: onSale(p) ? Number(p.price) || 0 : 0, stock: p.stock, hidden: p.status === "hidden", sold: p.status === "sold", pending: p.status === "pending" }));
    const seen = new Set();
    lines().forEach((l) => {
      if (ps.some((p) => candidateLines(p, [l]).length)) return;
      const key = normName(dn(l.group, l.name));
      if (seen.has(key)) return; seen.add(key);
      const same = lines().filter((x) => normName(dn(x.group, x.name)) === key);
      const priced = same.filter((x) => x.sellPrice > 0).pop();
      out.push({ kind: "l", key: "l:" + key, group: l.group || "", name: l.name, price: priced ? priced.sellPrice : 0, stock: same.reduce((t, x) => t + x.left, 0), candIds: same.map((x) => x.id) });
    });
    return out;
  }
  const inCartQty = (key) => cart.filter((c) => c.key === key).reduce((t, c) => t + c.qty, 0);
  function renderPOS() {
    const q = $("#pos-search").value.trim().toLowerCase();
    const list = tiles().filter((e) => !q || (e.group + " " + e.name).toLowerCase().includes(q));
    $("#pos-products").innerHTML = list.length ? list.map((e) =>
      '<button type="button" class="pos-tile' + (typeof e.stock === "number" && e.stock <= 0 ? " out" : "") + '" data-key="' + esc(e.key) + '"><span class="pt-group">' + esc(e.group) + (e.hidden ? " · 隱藏" : "") + (e.pending ? " · 未到貨" : "") + "</span><b>" + esc(e.name) + '</b><span class="pt-price">' +
      (e.was ? "<s>" + money(e.was) + "</s> " : "") + (e.price ? money(e.price) : "未設售價") + '</span><span class="pt-left">' + (typeof e.stock === "number" ? (e.stock > 0 ? "存庫 " + e.stock : "存庫 0") : "未追蹤存庫") + "</span></button>").join("")
      : '<p class="empty">未有商品。請先在「商品」分頁新增商品，或用「其他項目」手動輸入。</p>';
    renderCart();
    const today = todayStr();
    const mine = sales.filter((s) => s.date === today).sort((a, b) => String(b.time || "").localeCompare(String(a.time || "")));
    const total = mine.reduce((t, s) => t + (Number(s.total) || 0), 0);
    $("#pos-today").innerHTML = mine.length
      ? '<p class="hint">今日 ' + mine.length + " 單，營業額 <b>" + money(total) + "</b></p>" + mine.map((s) => saleCard(s)).join("")
      : '<p class="empty">今日未有銷售。</p>';
  }
  function renderCart() {
    const ps = prods();
    $("#pos-cart").innerHTML = cart.length ? cart.map((c, i) => {
      const p = c.productId ? ps.find((x) => x.id === c.productId) : null;
      const warn = p && typeof p.stock === "number" && inCartQty(c.key) > p.stock ? '<div class="o-warn">存庫只有 ' + Math.max(p.stock, 0) + " 件</div>" : "";
      const adds = !c.addon && p ? addonsOf(p, ps).map((a, k) => '<button type="button" class="btn btn-line addon-btn" data-act="addon" data-k="' + k + '">＋ 加購 ' + esc(a.product.name) + "（" + money(a.price) + "）</button>").join("") : "";
      return '<div class="cart-line" data-i="' + i + '"><div class="cl-name"><b>' + (c.addon ? "↳ 加購：" : "") + esc(c.name) + "</b><small>" + esc(c.group || (c.custom ? "手動項目" : "")) + "</small>" + warn + "</div>" +
        '<div class="qty"><button type="button" data-act="dec" aria-label="減少">−</button><output>' + c.qty + '</output><button type="button" data-act="inc" aria-label="增加">+</button></div>' +
        '<label class="mini cl-price">單價<input class="field" type="number" step="any" inputmode="decimal" data-act="price" value="' + esc(c.price) + '"></label>' +
        '<div class="cl-total">' + money(c.price * c.qty) + '</div><button type="button" class="icon" data-act="del" aria-label="移除">✕</button>' + (adds ? '<div class="cl-addons">' + adds + "</div>" : "") + "</div>";
    }).join("") : '<p class="empty">按左邊的商品加入本單。</p>';
    updateCartTotal();
  }
  function cartGross() { return cart.reduce((t, c) => t + (Number(c.price) || 0) * c.qty, 0); }
  function updateCartTotal() {
    const disc = Math.max(0, Number($("#pos-discount").value) || 0);
    $("#pos-total").textContent = money(round2(cartGross() - disc));
  }
  $("#pos-search").addEventListener("input", renderPOS);
  $("#pos-products").addEventListener("click", (e) => {
    const b = e.target.closest("[data-key]"); if (!b) return;
    const ex = cart.find((c) => c.key === b.dataset.key && !c.addon);
    if (ex) ex.qty++;
    else {
      const t = tiles().find((x) => x.key === b.dataset.key);
      if (t) cart.push({ key: t.key, productId: t.kind === "p" ? t.id : "", candIds: t.candIds || null, name: t.name, group: t.group, price: t.price || 0, qty: 1 });
    }
    renderCart();
  });
  $("#pos-cart").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); const row = e.target.closest(".cart-line"); if (!b || !row || b.tagName === "INPUT") return;
    const i = +row.dataset.i, c = cart[i]; if (!c) return;
    if (b.dataset.act === "inc") c.qty++;
    else if (b.dataset.act === "dec") c.qty = Math.max(1, c.qty - 1);
    else if (b.dataset.act === "del") { cart.splice(i, 1); for (let j = cart.length - 1; j >= 0; j--) if (cart[j].addon && cart[j].addonOf === c.key && !cart.some((x) => !x.addon && x.key === c.key)) cart.splice(j, 1); }
    else if (b.dataset.act === "addon") {
      const p = prods().find((x) => x.id === c.productId), a = p ? addonsOf(p, prods())[+b.dataset.k] : null;
      if (a) { const ex = cart.find((x) => x.addon && x.addonOf === c.key && x.productId === a.product.id); if (ex) ex.qty++; else cart.splice(i + 1, 0, { key: "p:" + a.product.id, productId: a.product.id, name: a.product.name, group: a.product.group || "", price: a.price, qty: 1, addon: true, addonOf: c.key }); }
    }
    renderCart();
  });
  $("#pos-cart").addEventListener("input", (e) => {
    const inp = e.target.closest('input[data-act="price"]'); const row = e.target.closest(".cart-line"); if (!inp || !row) return;
    const c = cart[+row.dataset.i]; c.price = Number(inp.value) || 0;
    row.querySelector(".cl-total").textContent = money(c.price * c.qty); updateCartTotal();
  });
  $("#pos-discount").addEventListener("input", updateCartTotal);
  $("#pos-clear").addEventListener("click", () => { cart = []; $("#pos-discount").value = 0; $("#pos-note").value = ""; $("#pos-error").hidden = true; renderCart(); });

  const cdlg = $("#cdlg");
  $("#pos-custom").addEventListener("click", () => { $("#cform").reset(); cdlg.showModal(); });
  $("#c-cancel").addEventListener("click", () => cdlg.close());
  $("#cform").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#c-name").value.trim(), price = Number($("#c-price").value), cost = $("#c-cost").value;
    if (!name || !Number.isFinite(price)) return;
    cart.push({ key: "", productId: "", name, group: "", price, qty: 1, custom: true, cost: cost === "" ? null : Number(cost) });
    cdlg.close(); renderCart();
  });

  // Saves sales and takes the sold quantity off each product's shared stock in the same step.
  // docs: [{ id?, data, deltas: { productId: qty } }]
  async function commitSales(docs) {
    for (const part of chunk(docs, 150)) {
      const b = writeBatch(db), deltas = {};
      part.forEach((d) => {
        b.set(d.id ? doc(db, "sales", d.id) : doc(collection(db, "sales")), d.data);
        Object.entries(d.deltas || {}).forEach(([pid, q]) => { deltas[pid] = (deltas[pid] || 0) + q; });
      });
      Object.entries(deltas).forEach(([pid, q]) => { if (q) b.update(doc(db, "products", pid), { stock: increment(-q) }); });
      await b.commit();
    }
  }
  const workEnv = () => ({ products: prods().map((p) => ({ ...p })), lines: lines().map((l) => ({ ...l })) });

  $("#pos-done").addEventListener("click", async () => {
    const err = $("#pos-error"), btn = $("#pos-done"), msg = $("#pos-msg");
    err.hidden = true; msg.textContent = "";
    if (!cart.length) { err.textContent = "請先加入商品。"; err.hidden = false; return; }
    const date = $("#pos-date").value || todayStr();
    const gross = cartGross(), disc = Math.max(0, Number($("#pos-discount").value) || 0);
    if (disc > gross) { err.textContent = "折扣不可以多過貨品總額。"; err.hidden = false; return; }
    const env = workEnv(), items = [], deltas = {};
    cart.forEach((c) => {
      const item = c.custom ? { name: c.name, qty: c.qty, price: c.price, productId: "none", lineId: "none", cost: c.cost }
        : c.productId ? { name: c.name, qty: c.qty, price: c.price, productId: c.productId, addon: !!c.addon }
        : { name: c.name, qty: c.qty, price: c.price, productId: "none", candIds: c.candIds || [] };
      const r = buildItems(item, env); items.push(...r.items);
      Object.entries(r.delta).forEach(([pid, q]) => { deltas[pid] = (deltas[pid] || 0) + q; });
    });
    const n = sales.filter((s) => s.date === date && s.source === "pos").length + 1;
    const receipt = "POS-" + date.replace(/-/g, "") + "-" + String(n).padStart(3, "0");
    const total = round2(gross - disc);
    btn.disabled = true;
    try {
      await commitSales([{ data: { date, time: nowTime(), receipt, payment: $("#pos-payment").value, source: "pos", items, total, discount: disc, note: $("#pos-note").value.trim(), createdAt: serverTimestamp() }, deltas }]);
      msg.textContent = "已記錄 " + money(total) + "（" + receipt + "）" + (Object.keys(deltas).length ? "，存庫已自動減少" : "");
      cart = []; $("#pos-discount").value = 0; $("#pos-note").value = ""; renderCart();
    } catch (e2) { err.textContent = "儲存失敗。請確認已發布最新的安全規則，或稍後再試。"; err.hidden = false; }
    btn.disabled = false;
  });

  // ================= 銷售紀錄 =================
  function saleCard(s, opts = {}) {
    const cm = opts.costs || costMap();
    const items = (s.items || []).map((i) => {
      const u = i.lineId && cm[i.lineId] != null ? cm[i.lineId] : (Number.isFinite(Number(i.cost)) && i.cost !== "" && i.cost != null ? Number(i.cost) : null);
      return "<li><span>" + esc(dn(i.group, i.name)) + " × " + esc(i.qty) + '</span><span>@ ' + money(i.price) + "</span><span class=\"o-mode\">" +
        (u == null ? "⚠ 未配對成本" : "成本 " + money(u * i.qty)) + "</span></li>";
    }).join("");
    return '<article class="sale" data-id="' + esc(s.id) + '"><div class="s-head"><b>' + esc(s.receipt || "（無單號）") + "</b><span>" + esc(s.date) + " " + esc(s.time || "") + '</span>' +
      (s.payment ? '<span class="badge">' + esc(s.payment) + "</span>" : "") + '<span class="badge">' + esc(SOURCE[s.source] || s.source) + "</span>" +
      '<b class="s-total">' + money(s.total) + '</b><button type="button" class="icon" data-del="' + esc(s.id) + '" aria-label="刪除這張單">✕</button></div><ul class="s-items">' + items + "</ul>" +
      (s.discount ? '<p class="hint">已折扣 ' + money(s.discount) + "</p>" : "") + (s.note ? '<p class="hint">備註：' + esc(s.note) + "</p>" : "") + "</article>";
  }
  // removing a sale gives the stock back
  function deleteSale(id, silent) {
    const s = sales.find((x) => x.id === id); if (!s) return Promise.resolve();
    if (!silent && !confirm("確定刪除這張銷售單？賣出的貨品會自動回到存庫。")) return Promise.resolve();
    const b = writeBatch(db);
    b.delete(doc(db, "sales", id));
    Object.entries(stockToRestore(s)).forEach(([pid, q]) => { const p = prods().find((x) => x.id === pid); if (p && typeof p.stock === "number" && q) b.update(doc(db, "products", pid), { stock: increment(q) }); });
    return b.commit().catch(() => fail("刪除失敗，請再試。"));
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]"); if (!b || !b.closest(".sale")) return;
    deleteSale(b.dataset.del);
  });

  function salesRange() {
    if (salesKind === "custom") return { from: $("#sl-from").value || "2000-01-01", to: $("#sl-to").value || "2100-12-31" };
    return periodRange(salesKind);
  }
  function chips(boxId, kind) {
    $(boxId).innerHTML = RANGES.map(([k, t]) => '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (kind === k) + '">' + t + "</button>").join("");
  }
  function visibleSales() {
    const r = salesRange(), q = $("#sl-search").value.trim().toLowerCase();
    return sales.filter((s) => s.date >= r.from && s.date <= r.to && (!q || [s.receipt, s.payment, s.note, (s.items || []).map((i) => i.name).join(" ")].join(" ").toLowerCase().includes(q)))
      .sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
  }
  function renderSales() {
    chips("#sl-chips", salesKind);
    if (salesKind !== "custom") { const r = salesRange(); $("#sl-from").value = r.from.startsWith("2000") ? "" : r.from; $("#sl-to").value = r.to.startsWith("2100") ? "" : r.to; }
    const list = visibleSales(), cm = costMap();
    $("#sl-empty").hidden = list.length > 0;
    const days = new Map();
    list.forEach((s) => { if (!days.has(s.date)) days.set(s.date, []); days.get(s.date).push(s); });
    $("#sl-list").innerHTML = [...days.entries()].map(([d, arr]) => {
      const rev = arr.reduce((t, s) => t + (Number(s.total) || 0), 0);
      return '<h3 class="day">' + esc(d) + " · " + arr.length + " 單 · 營業額 " + money(rev) + "</h3>" + arr.map((s) => saleCard(s, { costs: cm })).join("");
    }).join("");
    renderWebBox();
  }
  $("#sl-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; salesKind = b.dataset.k; renderSales(); });
  ["#sl-from", "#sl-to"].forEach((id) => $(id).addEventListener("change", () => { salesKind = "custom"; renderSales(); }));
  $("#sl-search").addEventListener("input", renderSales);
  $("#sl-csv").addEventListener("click", () => {
    const rows = [["日期", "時間", "單號", "付款", "來源", "貨品", "數量", "單價", "小計", "單總額"]];
    visibleSales().forEach((s) => (s.items || []).forEach((i) => rows.push([s.date, s.time, s.receipt, s.payment, SOURCE[s.source] || s.source, dn(i.group, i.name), i.qty, i.price, round2(i.price * i.qty), s.total])));
    download("mhkpop-sales.csv", rows);
  });

  // ---- paste in a POS record ----
  const productOptions = () => prods().map((p) => '<option value="p:' + esc(p.id) + '">' + esc(dn(p.group, p.name) + " · " + stockLabel(p)) + "</option>").join("");
  $("#imp-parse").addEventListener("click", () => {
    const text = $("#imp-text").value;
    if (!text.trim()) { $("#imp-result").innerHTML = '<p class="error">請先貼上銷售紀錄。</p>'; return; }
    const res = parsePosText(text, { defaultDate: $("#imp-date").value || todayStr(), freePrice: $("#imp-free").value });
    const ps = prods(), ls = lines(), have = new Set(sales.map((s) => s.id));
    imp = {
      skipped: res.skipped, mode: res.mode,
      sales: res.sales.map((s) => {
        const id = saleKey(s);
        return { ...s, id, dup: have.has(id), include: !have.has(id), items: s.items.map((i) => {
          const p = bestProduct(i.name, ps), m = p ? null : matchLines(i.name, ls);
          return { ...i, sel: "auto", label: p ? dn(p.group, p.name) : m && m.length ? dn(m[0].group, m[0].name) : "" };
        }) };
      })
    };
    renderImport();
  });
  $("#imp-clear").addEventListener("click", () => { $("#imp-text").value = ""; imp = null; renderImport(); });

  function impTotal(s) { return round2(s.items.reduce((t, i) => t + i.price * i.qty, 0) - (s.discount || 0)); }
  function renderImport() {
    const box = $("#imp-result");
    if (!imp) { box.innerHTML = ""; return; }
    if (!imp.sales.length) {
      box.innerHTML = '<p class="error">未能辨識出任何銷售。請確認貼上的內容包含貨品名稱和金額。' + (imp.skipped.length ? "（略過 " + imp.skipped.length + " 行）" : "") + "</p>";
      return;
    }
    const opts = productOptions();
    const inc = imp.sales.filter((s) => s.include);
    const totalAll = inc.reduce((t, s) => t + impTotal(s), 0), nItems = inc.reduce((t, s) => t + s.items.length, 0);
    const unmatched = inc.reduce((t, s) => t + s.items.filter((i) => i.sel === "auto" && !i.label).length, 0);
    box.innerHTML = '<div class="imp-sum"><b>辨識到 ' + imp.sales.length + " 張單</b>（" + ({ header: "按表頭", guess: "自動推測欄位", text: "純文字單據" }[imp.mode] || "") + "）" +
      (imp.sales.some((s) => s.dup) ? "，其中 " + imp.sales.filter((s) => s.dup).length + " 張已記錄過" : "") + "。將加入 " + inc.length + " 張單、" + nItems + " 項貨品，共 <b>" + money(totalAll) + "</b>。加入後，配對到的商品存庫會自動減少。" +
      (unmatched ? ' <span class="o-warn-inline">⚠ ' + unmatched + " 項未能配對到商品。請在下面揀選對應的商品，系統會記住這個 POS 名稱，下次自動配對。</span>" : "") + "</div>" +
      imp.sales.map((s, si) => '<article class="sale imp' + (s.dup ? " is-dup" : "") + '" data-si="' + si + '"><div class="s-head"><label class="check"><input type="checkbox" data-inc ' + (s.include ? "checked" : "") + (s.dup ? " disabled" : "") + "><span><b>" +
        esc(s.receipt || "（無單號）") + "</b> " + esc(s.date) + " " + esc(s.time) + "</span></label>" + (s.payment ? '<span class="badge">' + esc(s.payment) + "</span>" : "") + (s.dup ? '<span class="badge">已記錄過</span>' : "") +
        '<b class="s-total">' + money(impTotal(s)) + "</b></div>" + s.items.map((i, ii) =>
          '<div class="imp-item" data-ii="' + ii + '"><span class="ii-name">' + esc(i.name) + '</span><label class="mini">數量<input class="field" type="number" step="any" data-f="qty" value="' + esc(i.qty) + '"></label>' +
          '<label class="mini">單價<input class="field" type="number" step="any" data-f="price" value="' + esc(i.price) + '"></label>' +
          '<label class="mini grow">對應商品<select class="field" data-f="sel"><option value="auto"' + (i.sel === "auto" ? " selected" : "") + ">自動：" + esc(i.label || "未能配對") + '</option><option value="none"' + (i.sel === "none" ? " selected" : "") + ">不配對（只記銷售）</option>" +
          opts.replace('value="' + esc(i.sel) + '"', 'value="' + esc(i.sel) + '" selected') + '</select></label><button type="button" class="icon" data-rm aria-label="移除這項">✕</button></div>').join("") + "</article>").join("") +
      (imp.skipped.length ? '<details class="skipped"><summary>略過了 ' + imp.skipped.length + " 行（不是貨品，例如合計、找續）</summary><pre>" + esc(imp.skipped.join("\n")) + "</pre></details>" : "") +
      '<div class="dlg-actions"><button type="button" class="btn btn-solid btn-lg" id="imp-save"' + (inc.length ? "" : " disabled") + ">加入 " + inc.length + " 張單到銷售紀錄</button></div><p class=\"saving\" id=\"imp-msg\" aria-live=\"polite\"></p>";
  }
  $("#imp-result").addEventListener("change", (e) => {
    const art = e.target.closest(".sale.imp"); if (!art || !imp) return;
    const s = imp.sales[+art.dataset.si];
    if (e.target.matches("[data-inc]")) { s.include = e.target.checked; renderImport(); return; }
    const row = e.target.closest(".imp-item"); if (!row) return;
    if (e.target.dataset.f === "sel") { s.items[+row.dataset.ii].sel = e.target.value; renderImport(); }
  });
  $("#imp-result").addEventListener("input", (e) => {
    const art = e.target.closest(".sale.imp"); const row = e.target.closest(".imp-item"); if (!art || !row || !imp) return;
    const s = imp.sales[+art.dataset.si], i = s.items[+row.dataset.ii], f = e.target.dataset.f;
    if (f === "qty" || f === "price") { const v = Number(e.target.value); if (Number.isFinite(v)) i[f] = v; art.querySelector(".s-total").textContent = money(impTotal(s)); }
  });
  $("#imp-result").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]");
    if (rm && imp) {
      const art = rm.closest(".sale.imp"), s = imp.sales[+art.dataset.si];
      s.items.splice(+rm.closest(".imp-item").dataset.ii, 1);
      if (!s.items.length) imp.sales.splice(+art.dataset.si, 1);
      renderImport(); return;
    }
    if (e.target.id === "imp-save") saveImport();
  });
  async function saveImport() {
    const btn = $("#imp-save"), msg = $("#imp-msg");
    const env = workEnv(), docs = [], learn = {};
    imp.sales.filter((s) => s.include && !s.dup && s.items.length).forEach((s) => {
      const items = [], deltas = {};
      s.items.forEach((i) => {
        const q = Number(i.qty), p = Number(i.price);
        if (!Number.isFinite(q) || !Number.isFinite(p)) return;
        const sel = i.sel === "none" ? { productId: "none", lineId: "none" } : i.sel && i.sel.startsWith("p:") ? { productId: i.sel.slice(2) } : { productId: "" };
        const r = buildItems({ name: i.name, qty: q, price: p, ...sel }, env);
        items.push(...r.items); Object.entries(r.delta).forEach(([pid, n]) => { deltas[pid] = (deltas[pid] || 0) + n; });
        if (sel.productId && sel.productId !== "none" && r.product && normName(r.product.name) !== normName(i.name) && !(r.product.aliases || []).some((a) => normName(a) === normName(i.name))) {
          (learn[r.product.id] = learn[r.product.id] || new Set()).add(i.name);
        }
      });
      docs.push({ id: s.id, deltas, data: { date: s.date, time: s.time || "", receipt: s.receipt || "", payment: s.payment || "", source: "import", items, total: impTotal(s), discount: round2(s.discount || 0), note: "", createdAt: serverTimestamp() } });
    });
    if (!docs.length) return;
    btn.disabled = true; msg.textContent = "儲存中…";
    try {
      await commitSales(docs);
      let learned = 0;
      for (const [pid, names] of Object.entries(learn)) { await updateDoc(doc(db, "products", pid), { aliases: arrayUnion(...names) }).then(() => { learned += names.size; }).catch(() => {}); }
      $("#imp-text").value = ""; imp = null;
      $("#imp-result").innerHTML = '<p class="saving">已加入 ' + docs.length + " 張銷售單，存庫、成本和利潤已更新。" + (learned ? "已記住 " + learned + " 個 POS 名稱，下次自動配對。" : "") + "</p>";
    } catch (e2) { msg.textContent = ""; btn.disabled = false; $("#imp-result").insertAdjacentHTML("afterbegin", '<p class="error">儲存失敗。請確認已發布最新的安全規則，或稍後再試。</p>'); }
  }

  // ---- website orders -> sales (also done automatically when an order is set to 已確認) ----
  const saleIdOf = (o) => "W-" + o.orderNo;
  function webSaleDoc(o, env) {
    const items = [], deltas = {};
    (o.items || []).forEach((i) => {
      const r = buildItems({ name: dn(i.group, i.name), qty: Number(i.qty) || 0, price: Number(i.price) || 0, addon: !!i.addon }, env);
      items.push(...r.items); Object.entries(r.delta).forEach(([pid, q]) => { deltas[pid] = (deltas[pid] || 0) + q; });
    });
    return { id: saleIdOf(o), deltas, data: { date: dateOf(o.createdAt), time: timeOf(o.createdAt), receipt: o.orderNo, payment: "網站訂單", source: "web", items, total: Number(o.total) || 0, discount: 0, orderNo: o.orderNo, note: "", createdAt: serverTimestamp() } };
  }
  function pendingWebOrders() {
    const have = new Set(sales.map((s) => s.id));
    return (ctx.getOrders() || []).filter((o) => (o.status === "confirmed" || o.status === "done") && !have.has(saleIdOf(o)));
  }
  function renderWebBox() {
    const list = pendingWebOrders();
    $("#web-box").hidden = !list.length;
    $("#web-list").innerHTML = list.map((o) => "<div class=\"web-row\"><b>" + esc(o.orderNo) + "</b><span>" + esc(o.name) + "</span><span>" + money(o.total) + "</span><span class=\"o-mode\">" + esc(dateOf(o.createdAt)) + "</span></div>").join("");
  }
  $("#web-add").addEventListener("click", async () => {
    const list = pendingWebOrders(); if (!list.length) return;
    const env = workEnv();
    try { await commitSales(list.map((o) => webSaleDoc(o, env))); } catch (e) { fail("加入失敗。請確認已發布最新的安全規則，或稍後再試。"); }
  });
  // called by the orders tab when the status of an order changes: confirmed/done = counted as a sale (stock taken); anything else = not counted
  async function syncOrderSale(order, status) {
    const id = saleIdOf(order), exists = sales.some((s) => s.id === id);
    try {
      if ((status === "confirmed" || status === "done") && !exists) await commitSales([webSaleDoc(order, workEnv())]);
      else if ((status === "new" || status === "cancelled") && exists) await deleteSale(id, true);
    } catch (e) { fail("訂單已更新，但未能同步銷售紀錄和存庫，請到「銷售紀錄」檢查。"); }
  }

  function webOrdersChanged() { renderWebBox(); }

  // ================= 進貨及成本 =================
  const curLabel = (p) => (p.currency && p.currency !== "HKD" ? p.currency : "HK$");
  function renderPurchases() {
    const q = $("#pu-search").value.trim().toLowerCase();
    const sold = soldMap(sales);
    const list = purchases.filter((p) => !q || [p.supplier, p.note, (p.lines || []).map((l) => l.group + " " + l.name).join(" ")].join(" ").toLowerCase().includes(q));
    $("#pu-empty").hidden = purchases.length > 0;
    // overall stock numbers
    const all = lines();
    const spent = purchases.reduce((t, p) => t + calcPurchase(p).total, 0);
    const units = all.reduce((t, l) => t + Math.max(l.left, 0), 0);
    const stockCost = all.reduce((t, l) => t + Math.max(l.left, 0) * l.unitCost, 0), stockSell = all.reduce((t, l) => t + Math.max(l.left, 0) * (Number(l.sellPrice) || 0), 0);
    $("#pu-stats").innerHTML = purchases.length ? [["總進貨成本", money(spent)], ["進貨批次剩餘", units + " 件"], ["批次剩餘成本", money(stockCost)], ["全部售出可得", money(stockSell)], ["預計毛利", money(stockSell - stockCost)]]
      .map(([k, v]) => '<div class="stat"><small>' + k + "</small><b>" + v + "</b></div>").join("") : "";
    $("#pu-list").innerHTML = list.map((p) => {
      const c = calcPurchase(p), perUnit = c.qty ? c.total / c.qty : 0;
      const rows = c.lines.map((l) => {
        const s = sold[l.id] || 0, left = (Number(l.qty) || 0) + (Number(l.adjust) || 0) - s;
        return "<tr><td>" + esc(dn(l.group, l.name)) + "</td><td>" + esc(l.qty) + "</td><td>" + esc(curLabel(p)) + " " + esc(l.unitPrice) + "</td><td><b>" + money(l.unitCost) + '</b></td><td><input class="inl" type="number" step="any" min="0" data-pid="' + esc(p.id) + '" data-lid="' + esc(l.id) + '" data-f="sell" value="' + esc(l.sellPrice || 0) +
          '" aria-label="售價"></td><td class="' + (l.margin < 0 ? "neg" : "pos") + '">' + money(l.margin) + " (" + Math.round(l.marginPct * 100) + '%)</td><td>' + s + '</td><td class="' + (left < 0 ? "neg" : "") + '">' + left + "</td></tr>";
      }).join("");
      return '<article class="pur" data-id="' + esc(p.id) + '"><div class="pu-head"><div><b>' + esc(p.date) + "</b>" + (p.supplier ? " · " + esc(p.supplier) : "") +
        (p.currency && p.currency !== "HKD" ? ' <span class="badge">' + esc(p.currency) + " @ " + esc(p.rate) + "</span>" : "") + (c.rateMissing ? ' <span class="o-warn-inline">⚠ 未填匯率</span>' : "") +
        '</div><button type="button" class="btn btn-line" data-edit="' + esc(p.id) + '">編輯</button></div>' +
        '<p class="pu-sum">貨品 ' + money(c.goods) + " · 運費及費用 " + money(c.extras) + " · <b>總成本 " + money(c.total) + "</b> · 共 " + c.qty + " 件 · 平均每件 " + money(perUnit) + "</p>" +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>貨品</th><th>數量</th><th>進貨價</th><th>每件成本（連運費）</th><th>售價</th><th>每件毛利</th><th>已售</th><th>批次剩餘</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
        (p.note ? '<p class="hint">備註：' + esc(p.note) + "</p>" : "") + "</article>";
    }).join("");
  }
  $("#pu-search").addEventListener("input", renderPurchases);
  $("#pu-list").addEventListener("click", (e) => { const b = e.target.closest("[data-edit]"); if (b) openPurchase(purchases.find((p) => p.id === b.dataset.edit)); });
  $("#pu-list").addEventListener("change", (e) => {
    const inp = e.target.closest("input.inl"); if (!inp) return;
    const p = purchases.find((x) => x.id === inp.dataset.pid); if (!p) return;
    const v = Number(inp.value); if (!Number.isFinite(v)) return;
    const sold = soldMap(sales);
    const next = p.lines.map((l) => {
      if (l.id !== inp.dataset.lid) return l;
      if (inp.dataset.f === "sell") return { ...l, sellPrice: Math.max(0, v) };
      return { ...l, adjust: Math.round(v - ((Number(l.qty) || 0) - (sold[l.id] || 0))) };
    });
    updateDoc(doc(db, "purchases", p.id), { lines: next, updatedAt: serverTimestamp() }).catch(() => fail("儲存失敗，請再試。"));
  });

  // purchase dialog
  const bdlg = $("#bdlg");
  function lineRow(l) {
    l = l || {};
    return '<div class="bl" data-id="' + esc(l.id || uid()) + '" data-adjust="' + esc(l.adjust || 0) + '">' +
      '<label class="mini">組合<input class="field bl-group" maxlength="60" value="' + esc(l.group || "") + '"></label>' +
      '<label class="mini grow">商品名稱<input class="field bl-name" list="prodnames" maxlength="100" value="' + esc(l.name || "") + '"></label>' +
      '<label class="mini">數量<input class="field bl-qty" type="number" min="0" step="1" inputmode="numeric" value="' + esc(l.qty == null ? "" : l.qty) + '"></label>' +
      '<label class="mini">進貨單價<input class="field bl-unit" type="number" min="0" step="any" inputmode="decimal" value="' + esc(l.unitPrice == null ? "" : l.unitPrice) + '"></label>' +
      '<label class="mini">售價（HK$）<input class="field bl-sell" type="number" min="0" step="any" inputmode="decimal" value="' + esc(l.sellPrice == null ? "" : l.sellPrice) + '"></label>' +
      '<div class="bl-calc" aria-live="polite"></div><button type="button" class="icon bl-del" aria-label="刪除這一行">✕</button></div>';
  }
  function fillNames() {
    const set = new Set();
    (ctx.getWebProducts() || []).forEach((p) => set.add(p.name));
    purchases.forEach((p) => (p.lines || []).forEach((l) => set.add(l.name)));
    $("#prodnames").innerHTML = [...set].map((n) => '<option value="' + esc(n) + '">').join("");
  }
  function collectPurchase(keepEmpty) {
    const cur = $("#b-currency").value;
    const rows = [...document.querySelectorAll("#b-lines .bl")].map((r) => ({
      id: r.dataset.id, adjust: Number(r.dataset.adjust) || 0, group: r.querySelector(".bl-group").value.trim(), name: r.querySelector(".bl-name").value.trim(),
      qty: Number(r.querySelector(".bl-qty").value) || 0, unitPrice: Number(r.querySelector(".bl-unit").value) || 0, sellPrice: Number(r.querySelector(".bl-sell").value) || 0
    }));
    return {
      date: $("#b-date").value, supplier: $("#b-supplier").value.trim(), currency: cur, rate: cur === "HKD" ? 1 : Number($("#b-rate").value) || 0,
      shipping: Number($("#b-ship").value) || 0, otherFees: Number($("#b-other").value) || 0, allocate: $("#b-alloc").value, note: $("#b-note").value.trim(),
      lines: keepEmpty ? rows : rows.filter((r) => r.name || r.qty || r.unitPrice)
    };
  }
  function previewPurchase() {
    const p = collectPurchase(true), c = calcPurchase(p);
    document.querySelectorAll("#b-lines .bl").forEach((row, i) => {
      const l = c.lines[i]; if (!l) return;
      row.querySelector(".bl-calc").innerHTML = l.qty > 0 ? "每件成本 <b>" + money(l.unitCost) + "</b>" + (l.sellPrice ? " · 毛利 " + money(l.margin) : "") : "";
    });
    $("#b-summary").innerHTML = "貨品 <b>" + money(c.goods) + "</b> + 運費及費用 <b>" + money(c.extras) + "</b> = 總成本 <b>" + money(c.total) + "</b>　共 " + c.qty + " 件" + (c.qty ? "，平均每件 <b>" + money(c.total / c.qty) + "</b>" : "") + (c.rateMissing ? '<br><span class="o-warn-inline">⚠ 請填寫匯率</span>' : "");
  }
  function openPurchase(p) {
    editingPurchase = p || null;
    $("#bdlg-title").textContent = p ? "編輯進貨單" : "新增進貨單";
    fillNames();
    $("#b-date").value = p ? p.date : todayStr(); $("#b-supplier").value = p ? p.supplier || "" : "";
    $("#b-currency").value = p ? p.currency : "HKD"; $("#b-rate").value = p && p.currency !== "HKD" ? p.rate : "";
    $("#b-rate-wrap").hidden = $("#b-currency").value === "HKD";
    $("#b-ship").value = p ? p.shipping : 0; $("#b-other").value = p ? p.otherFees : 0; $("#b-alloc").value = p ? p.allocate : "qty"; $("#b-note").value = p ? p.note || "" : "";
    $("#b-lines").innerHTML = (p && p.lines && p.lines.length ? p.lines : [null]).map(lineRow).join("");
    $("#b-error").hidden = true; $("#b-delete").hidden = !p; $("#b-addstock-wrap").hidden = !!p;
    previewPurchase(); bdlg.showModal();
  }
  $("#pu-add").addEventListener("click", () => openPurchase(null));
  $("#b-cancel").addEventListener("click", () => bdlg.close());
  $("#b-addline").addEventListener("click", () => { $("#b-lines").insertAdjacentHTML("beforeend", lineRow(null)); previewPurchase(); const r = document.querySelectorAll("#b-lines .bl"); r[r.length - 1].querySelector(".bl-group").focus(); });
  $("#b-currency").addEventListener("change", () => { $("#b-rate-wrap").hidden = $("#b-currency").value === "HKD"; previewPurchase(); });
  $("#bform").addEventListener("input", previewPurchase);
  $("#b-lines").addEventListener("click", (e) => {
    const d = e.target.closest(".bl-del"); if (!d) return;
    d.closest(".bl").remove();
    if (!document.querySelector("#b-lines .bl")) $("#b-lines").innerHTML = lineRow(null);
    previewPurchase();
  });
  $("#b-lines").addEventListener("change", (e) => {         // choosing a website product fills in its group and price
    if (!e.target.classList.contains("bl-name")) return;
    const row = e.target.closest(".bl"), name = e.target.value.trim();
    const hit = (ctx.getWebProducts() || []).find((p) => p.name === name);
    if (hit) {
      const g = row.querySelector(".bl-group"), s = row.querySelector(".bl-sell");
      if (!g.value) g.value = hit.group || ""; if (!s.value) s.value = hit.price || "";
      previewPurchase();
    }
  });
  $("#bform").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#b-error"), btn = $("#b-save"), p = collectPurchase(false);
    const bad = (m) => { err.textContent = m; err.hidden = false; };
    if (!p.date) return bad("請填寫進貨日期。");
    if (!p.lines.length) return bad("請最少填寫一項貨品。");
    if (p.lines.some((l) => !l.name)) return bad("每一行都要填寫商品名稱。");
    if (p.lines.some((l) => !(l.qty > 0))) return bad("每一行的數量要大於 0。");
    if (p.lines.length > 80) return bad("一張進貨單最多 80 行。");
    if (p.currency !== "HKD" && !(p.rate > 0)) return bad("請填寫匯率（1 單位外幣 = 多少港幣）。");
    err.hidden = true; btn.disabled = true;
    const data = { ...p, updatedAt: serverTimestamp() };
    let job;
    if (editingPurchase) job = updateDoc(doc(db, "purchases", editingPurchase.id), data);
    else if ($("#b-addstock").checked) {
      // new purchase: also add the quantities to the stock of matching website products that track stock
      const b = writeBatch(db), add = {};
      b.set(doc(collection(db, "purchases")), data);
      p.lines.forEach((l) => { const m = matchProducts(dn(l.group, l.name), prods()).find((x) => x.s >= 0.85); if (m && typeof m.p.stock === "number") add[m.p.id] = (add[m.p.id] || 0) + l.qty; });
      Object.entries(add).forEach(([pid, q]) => b.update(doc(db, "products", pid), { stock: increment(q) }));
      job = b.commit();
    } else job = addDoc(collection(db, "purchases"), data);
    job.then(() => bdlg.close()).catch(() => bad("儲存失敗。請確認已發布最新的安全規則，或稍後再試。")).then(() => { btn.disabled = false; });
  });
  $("#b-delete").addEventListener("click", () => {
    if (!editingPurchase) return;
    const ids = new Set((editingPurchase.lines || []).map((l) => l.id));
    const n = sales.reduce((t, s) => t + (s.items || []).filter((i) => ids.has(i.lineId)).length, 0);
    if (!confirm("確定刪除這張進貨單？" + (n ? "已有 " + n + " 項銷售連結了這張進貨單，刪除後這些銷售的成本會變成未知。" : "") + "此動作無法還原。")) return;
    deleteDoc(doc(db, "purchases", editingPurchase.id)).then(() => bdlg.close()).catch(() => { $("#b-error").textContent = "刪除失敗，請再試。"; $("#b-error").hidden = false; });
  });

  // ================= 租金及開支 =================
  const REPEAT = { none: "只此一次", monthly: "每月", yearly: "每年" };
  function expenseRow(e) {
    const per = e.repeat === "monthly" ? " / 月" : e.repeat === "yearly" ? " / 年" : "";
    const span = e.repeat && e.repeat !== "none" ? "由 " + esc(e.date) + (e.endDate ? " 到 " + esc(e.endDate) : " 起，持續中") : esc(e.date);
    return '<div class="ex-row"><div class="ex-main"><b>' + esc(e.name) + "</b><small>" + span + (e.note ? " · " + esc(e.note) : "") + '</small></div><b class="ex-amt">' + money(e.amount) + per + '</b><button type="button" class="btn btn-line" data-edit="' + esc(e.id) + '">編輯</button></div>';
  }
  function renderExpenses() {
    const rent = expenses.filter((e) => e.category === "rent"), other = expenses.filter((e) => e.category !== "rent");
    $("#ex-rent-empty").hidden = rent.length > 0; $("#ex-other-empty").hidden = other.length > 0;
    $("#ex-rent").innerHTML = rent.map(expenseRow).join(""); $("#ex-other").innerHTML = other.map(expenseRow).join("");
  }
  const edlg = $("#edlg");
  function syncExpenseForm() {
    const rent = $("#e-cat").value === "rent", rep = rent ? "monthly" : $("#e-repeat").value;
    $("#e-repeat-wrap").hidden = rent; $("#e-end-wrap").hidden = rep === "none";
    $("#e-date-label").textContent = rep === "none" ? "日期" : "開始日期";
    if (rent && !$("#e-name").value.trim()) $("#e-name").value = "租金";
  }
  function openExpense(e, cat) {
    editingExpense = e || null;
    $("#edlg-title").textContent = e ? "編輯" + (e.category === "rent" ? "租金" : "開支") : cat === "rent" ? "新增租金" : "新增開支";
    $("#e-cat").value = e ? e.category : cat || "other";
    $("#e-name").value = e ? e.name : ""; $("#e-amount").value = e ? e.amount : ""; $("#e-date").value = e ? e.date : todayStr();
    $("#e-repeat").value = e ? e.repeat : "none"; $("#e-end").value = e ? e.endDate || "" : ""; $("#e-note").value = e ? e.note || "" : "";
    $("#e-error").hidden = true; $("#e-delete").hidden = !e;
    syncExpenseForm(); edlg.showModal();
  }
  $("#ex-add-rent").addEventListener("click", () => openExpense(null, "rent"));
  $("#ex-add").addEventListener("click", () => openExpense(null, "other"));
  $("#e-cancel").addEventListener("click", () => edlg.close());
  $("#e-cat").addEventListener("change", syncExpenseForm); $("#e-repeat").addEventListener("change", syncExpenseForm);
  ["#ex-rent", "#ex-other"].forEach((id) => $(id).addEventListener("click", (ev) => { const b = ev.target.closest("[data-edit]"); if (b) openExpense(expenses.find((x) => x.id === b.dataset.edit)); }));
  $("#eform").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const err = $("#e-error"), btn = $("#e-save"), rent = $("#e-cat").value === "rent";
    const repeat = rent ? "monthly" : $("#e-repeat").value, amount = Number($("#e-amount").value);
    const bad = (m) => { err.textContent = m; err.hidden = false; };
    if (!$("#e-name").value.trim()) return bad("請填寫項目名稱。");
    if (!Number.isFinite(amount) || amount < 0 || $("#e-amount").value === "") return bad("請填寫正確的金額。");
    if (!$("#e-date").value) return bad("請填寫日期。");
    if (repeat !== "none" && $("#e-end").value && $("#e-end").value < $("#e-date").value) return bad("結束日期不可以早過開始日期。");
    err.hidden = true; btn.disabled = true;
    const data = { date: $("#e-date").value, name: $("#e-name").value.trim(), category: rent ? "rent" : "other", amount, repeat, endDate: repeat === "none" ? "" : $("#e-end").value, note: $("#e-note").value.trim() };
    const job = editingExpense ? updateDoc(doc(db, "expenses", editingExpense.id), data) : addDoc(collection(db, "expenses"), data);
    job.then(() => edlg.close()).catch(() => bad("儲存失敗。請確認已發布最新的安全規則，或稍後再試。")).then(() => { btn.disabled = false; });
  });
  $("#e-delete").addEventListener("click", () => {
    if (!editingExpense || !confirm("確定刪除這項？此動作無法還原。")) return;
    deleteDoc(doc(db, "expenses", editingExpense.id)).then(() => edlg.close()).catch(() => { $("#e-error").textContent = "刪除失敗，請再試。"; $("#e-error").hidden = false; });
  });

  // ================= 利潤 =================
  function profitRange() {
    if (profitKind === "custom") return { from: $("#pr-from").value || "2000-01-01", to: $("#pr-to").value || "2100-12-31" };
    return periodRange(profitKind);
  }
  let lastReport = null;
  function renderProfit() {
    chips("#pr-chips", profitKind);
    const r = profitRange();
    if (profitKind !== "custom") { $("#pr-from").value = r.from.startsWith("2000") ? "" : r.from; $("#pr-to").value = r.to.startsWith("2100") ? "" : r.to; }
    const rep = profitReport({ sales, purchases, expenses, from: r.from, to: r.to });
    lastReport = rep;
    const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 + "%" : "–");
    const card = (k, v, cls) => '<div class="stat ' + (cls || "") + '"><small>' + k + "</small><b>" + v + "</b></div>";
    let html = '<div class="stat-row big">' + card("營業額", money(rep.revenue)) + card("銷貨成本", money(rep.cogs)) + card("毛利", money(rep.grossProfit) + " <small>" + pct(rep.grossProfit, rep.revenue - rep.unknownRevenue) + "</small>") +
      card("租金及開支", money(rep.expenseTotal)) + card("淨利潤", money(rep.netProfit), rep.netProfit < 0 ? "neg" : "pos") + "</div>" +
      '<p class="hint">' + rep.saleCount + " 單，售出 " + rep.itemQty + " 件。淨利潤 = 營業額 − 銷貨成本（連運費）− 租金及開支（按日數分攤）。</p>";
    if (rep.unknownItems) html += '<p class="o-warn">⚠ 有 ' + rep.unknownItems + " 項銷售（共 " + money(rep.unknownRevenue) + "）找不到進貨成本，未計入成本，毛利會偏高。請在「進貨及成本」補上進貨單，或在銷售紀錄刪除後重新輸入。</p>";
    if (purchases.some((p) => calcPurchase(p).rateMissing)) html += '<p class="o-warn">⚠ 有進貨單未填匯率，成本未能計算。</p>';
    html += "<h2 class=\"sec\">各貨品利潤</h2>" + (rep.products.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>貨品</th><th>售出</th><th>營業額</th><th>成本</th><th>利潤</th><th>利潤率</th></tr></thead><tbody>' +
      rep.products.map((p) => "<tr><td>" + esc(p.name) + "</td><td>" + p.qty + "</td><td>" + money(p.revenue) + "</td><td>" + (p.unknownRevenue ? "⚠ " : "") + money(p.cost) + '</td><td class="' + (p.profit < 0 ? "neg" : "pos") + '"><b>' + money(p.profit) + "</b></td><td>" + pct(p.profit, p.revenue - p.unknownRevenue) + "</td></tr>").join("") + "</tbody></table></div>" : '<p class="empty">這段時間沒有銷售。</p>');
    html += "<h2 class=\"sec\">每日</h2>" + (rep.days.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>日期</th><th>單數</th><th>營業額</th><th>成本</th><th>毛利</th></tr></thead><tbody>' +
      rep.days.slice().reverse().map((d) => "<tr><td>" + esc(d.date) + "</td><td>" + d.sales + "</td><td>" + money(d.revenue) + "</td><td>" + money(d.cost) + "</td><td>" + money(d.revenue - d.cost) + "</td></tr>").join("") + "</tbody></table></div>" : '<p class="empty">沒有資料。</p>');
    html += "<h2 class=\"sec\">租金及開支</h2>" + (rep.expenses.length ? '<div class="tbl-wrap"><table class="tbl"><tbody>' + rep.expenses.map((e) => "<tr><td>" + esc(e.name) + "</td><td>" + money(e.amount) + "</td></tr>").join("") +
      "<tr><td><b>合計</b></td><td><b>" + money(rep.expenseTotal) + "</b></td></tr></tbody></table></div>" : '<p class="empty">這段時間沒有開支。</p>');
    $("#pr-body").innerHTML = html;
  }
  $("#pr-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; profitKind = b.dataset.k; renderProfit(); });
  ["#pr-from", "#pr-to"].forEach((id) => $(id).addEventListener("change", () => { profitKind = "custom"; renderProfit(); }));
  $("#pr-csv").addEventListener("click", () => {
    if (!lastReport) return;
    const rows = [["貨品", "售出", "營業額", "成本", "利潤"]];
    lastReport.products.forEach((p) => rows.push([p.name, p.qty, round2(p.revenue), round2(p.cost), round2(p.profit)]));
    rows.push([], ["營業額", round2(lastReport.revenue)], ["銷貨成本", round2(lastReport.cogs)], ["毛利", round2(lastReport.grossProfit)], ["租金及開支", round2(lastReport.expenseTotal)], ["淨利潤", round2(lastReport.netProfit)]);
    download("mhkpop-profit.csv", rows);
  });

  return { start, stop, ordersChanged: webOrdersChanged, productsChanged: scheduleRender, syncOrderSale };
}
