// Admin tabs for website content: 即將發售 (coming-soon products) and 活動頁面 (any number of extra pages: discounts, events...).
import { money, effectivePrice } from "./shoplib.js";

export function setupContent(ctx) {
  const { db, fb, $, esc, notice, shrink } = ctx;
  const { collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, deleteField } = fb;
  let upcoming = [], pages = [], unsubs = [], editingUp = null, editingPg = null, upPhoto = "", pgPhoto = "";
  const prods = () => ctx.getWebProducts() || [];
  const uid = () => "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const safeLink = (v) => /^(https:\/\/|\/|#)/.test(v);

  function start() {
    stop();
    const err = (e) => { if (!e || e.code !== "permission-denied") notice("載入內容失敗，請稍後再試。"); };
    unsubs.push(onSnapshot(collection(db, "upcoming"), (snap) => { upcoming = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderUpcoming(); }, err));
    unsubs.push(onSnapshot(collection(db, "pages"), (snap) => { pages = snap.docs.map((d) => ({ id: d.id, ...d.data() })); renderPages(); }, err));
  }
  function stop() { unsubs.forEach((u) => u()); unsubs = []; upcoming = []; pages = []; }

  // ================= 即將發售 =================
  const dateKey = (u) => u.releaseDate || "9999-99-99";
  function renderUpcoming() {
    $("#up-empty").hidden = upcoming.length > 0;
    const today = (function () { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); })();
    $("#up-list").innerHTML = upcoming.slice().sort((a, b) => dateKey(a).localeCompare(dateKey(b)) || String(a.title).localeCompare(String(b.title))).map((u) => {
      const thumb = u.image && /^data:image\//.test(u.image) ? '<img src="' + esc(u.image) + '" alt="">' : "<span>" + esc((u.group || u.title || "?").slice(0, 2)) + "</span>";
      const when = u.releaseDate ? u.releaseDate + (u.releaseDate <= today ? "（已到發售日）" : "") : (u.releaseText || "發售日待定");
      return '<article class="prod' + (u.published ? "" : " is-hidden") + '" data-id="' + esc(u.id) + '"><div class="thumb">' + thumb + "</div>" +
        '<div class="p-main"><div class="p-group">' + esc(u.group || "") + '</div><div class="p-name">' + esc(u.title) + '</div><div class="p-meta">' + esc(when) + (u.price ? " · " + money(u.price) : "") + (u.published ? "" : " · 已隱藏") + "</div>" +
        (u.storeOnly ? '<div class="badges"><span class="badge">只限格仔舖現貨</span></div>' : "") + "</div>" +
        '<div class="p-actions"><button type="button" class="btn btn-line" data-edit-up="' + esc(u.id) + '">編輯</button></div></article>';
    }).join("");
  }
  const updlg = $("#updlg");
  const setUpPhoto = (v) => {
    upPhoto = v || ""; const pv = $("#u-preview"); pv.innerHTML = "";
    if (upPhoto) { const im = document.createElement("img"); im.src = upPhoto; im.alt = ""; pv.appendChild(im); }
    $("#u-photo-remove").hidden = !upPhoto;
  };
  function openUp(u) {
    editingUp = u || null;
    $("#updlg-title").textContent = u ? "編輯即將發售商品" : "新增即將發售商品";
    $("#u-group").value = u ? u.group || "" : ""; $("#u-title").value = u ? u.title : ""; $("#u-date").value = u ? u.releaseDate || "" : "";
    $("#u-text").value = u ? u.releaseText || "" : ""; $("#u-price").value = u && u.price != null ? u.price : ""; $("#u-note").value = u ? u.note || "" : "";
    $("#u-store").checked = !!(u && u.storeOnly); $("#u-linklabel").value = u ? u.linkLabel || "" : ""; $("#u-link").value = u ? u.link || "" : "";
    $("#u-pub").checked = u ? !!u.published : true; $("#u-photo").value = ""; setUpPhoto(u ? u.image : "");
    $("#u-error").hidden = true; $("#u-delete").hidden = !u; updlg.showModal();
  }
  $("#up-add").addEventListener("click", () => openUp(null));
  $("#up-list").addEventListener("click", (e) => { const b = e.target.closest("[data-edit-up]"); if (b) openUp(upcoming.find((x) => x.id === b.dataset.editUp)); });
  $("#u-cancel").addEventListener("click", () => updlg.close());
  $("#u-photo-remove").addEventListener("click", () => { $("#u-photo").value = ""; setUpPhoto(""); });
  $("#u-photo").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    shrink(f, 900).then(setUpPhoto).catch(() => { $("#u-error").textContent = "這張相片無法使用，請試另一張。"; $("#u-error").hidden = false; });
  });
  $("#upform").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#u-error"), btn = $("#u-save"), bad = (m) => { err.textContent = m; err.hidden = false; };
    const title = $("#u-title").value.trim(), link = $("#u-link").value.trim(), priceRaw = $("#u-price").value.trim();
    if (!title) return bad("請填寫名稱。");
    if (link && !safeLink(link)) return bad("按鈕連結要以 https://、/ 或 # 開頭。");
    if (priceRaw !== "" && !(Number(priceRaw) >= 0)) return bad("售價請填寫正確的數字。");
    const data = { title, group: $("#u-group").value.trim(), releaseDate: $("#u-date").value, releaseText: $("#u-text").value.trim(), note: $("#u-note").value.trim(), storeOnly: $("#u-store").checked,
      linkLabel: $("#u-linklabel").value.trim(), link, published: $("#u-pub").checked, image: upPhoto, updatedAt: serverTimestamp() };
    if (priceRaw !== "") data.price = Number(priceRaw); else if (editingUp && editingUp.price != null) data.price = deleteField();
    err.hidden = true; btn.disabled = true;
    const job = editingUp ? updateDoc(doc(db, "upcoming", editingUp.id), data) : addDoc(collection(db, "upcoming"), data);
    job.then(() => updlg.close()).catch(() => bad("儲存失敗。請確認已發布最新的安全規則，或稍後再試。")).then(() => { btn.disabled = false; });
  });
  $("#u-delete").addEventListener("click", () => {
    if (!editingUp || !confirm("確定刪除這個預告？此動作無法還原。如只想暫時不顯示，可取消「在網站顯示」。")) return;
    deleteDoc(doc(db, "upcoming", editingUp.id)).then(() => updlg.close()).catch(() => { $("#u-error").textContent = "刪除失敗，請再試。"; $("#u-error").hidden = false; });
  });

  // ================= 活動頁面 =================
  const sortedPages = () => pages.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.title).localeCompare(String(b.title)));
  function renderPages() {
    $("#pg-empty").hidden = pages.length > 0;
    const list = sortedPages();
    $("#pg-list").innerHTML = list.map((p, i) => {
      const thumb = p.banner && /^data:image\//.test(p.banner) ? '<img src="' + esc(p.banner) + '" alt="">' : "<span>" + esc((p.title || "?").slice(0, 2)) + "</span>";
      return '<article class="prod' + (p.published ? "" : " is-hidden") + '" data-id="' + esc(p.id) + '"><div class="thumb">' + thumb + "</div>" +
        '<div class="p-main"><div class="p-name"><b>' + esc(p.title) + '</b></div><div class="p-meta">/p/' + esc(p.id) + " · " + (p.blocks || []).length + " 項內容" + (p.published ? "" : " · 草稿") + (p.showInNav ? " · 在選單" : "") + (p.homeButton ? " · 在首頁" : "") + "</div></div>" +
        '<div class="p-actions"><a class="btn btn-line" href="p/' + esc(p.id) + '" target="_blank" rel="noopener">查看</a>' +
        '<button type="button" class="btn btn-line" data-copy-pg="' + esc(p.id) + '">複製連結</button><button type="button" class="btn btn-line" data-dup-pg="' + esc(p.id) + '">複製版面</button>' +
        '<button type="button" class="icon" data-mv-pg="up" aria-label="向上移" ' + (i === 0 ? "disabled" : "") + '>▲</button><button type="button" class="icon" data-mv-pg="down" aria-label="向下移" ' + (i === list.length - 1 ? "disabled" : "") + ">▼</button>" +
        '<button type="button" class="btn btn-solid" data-edit-pg="' + esc(p.id) + '">編輯</button></div></article>';
    }).join("");
  }
  $("#pg-list").addEventListener("click", async (e) => {
    const card = e.target.closest(".prod");
    const ed = e.target.closest("[data-edit-pg]"); if (ed) return openPg(pages.find((x) => x.id === ed.dataset.editPg));
    const cp = e.target.closest("[data-copy-pg]");
    if (cp) { const url = location.origin + "/p/" + cp.dataset.copyPg; try { await navigator.clipboard.writeText(url); cp.textContent = "已複製"; } catch (x) { prompt("複製這個連結：", url); } return; }
    const dp = e.target.closest("[data-dup-pg]");
    if (dp) {
      const src = pages.find((x) => x.id === dp.dataset.dupPg); if (!src) return;
      const slug = (prompt("新版面的網址名稱（英文細楷、數字、-）：", src.id + "-2") || "").trim().toLowerCase();
      if (!/^[a-z0-9-]{1,40}$/.test(slug)) return notice("網址名稱只可以用英文細楷、數字和 -。");
      if (pages.some((x) => x.id === slug)) return notice("這個網址名稱已經有版面使用。");
      const copy = { ...src }; delete copy.id; copy.slug = slug; copy.title = src.title + "（複製）"; copy.published = false; copy.order = pages.reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1; copy.updatedAt = serverTimestamp();
      return setDoc(doc(db, "pages", slug), copy).catch(() => notice("複製失敗，請再試。"));
    }
    const mv = e.target.closest("[data-mv-pg]");
    if (mv && card) {
      const list = sortedPages(), i = list.findIndex((x) => x.id === card.dataset.id), j = mv.dataset.mvPg === "up" ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) return;
      const b = writeBatch(db);
      list.forEach((p, k) => { const pos = k === i ? j : k === j ? i : k; if ((Number(p.order) || 0) !== pos + 1) b.update(doc(db, "pages", p.id), { order: pos + 1 }); });
      b.commit().catch(() => notice("移動失敗，請再試。"));
    }
  });

  // ----- page dialog -----
  const pgdlg = $("#pgdlg");
  const setPgPhoto = (v) => {
    pgPhoto = v || ""; const pv = $("#pg-preview"); pv.innerHTML = "";
    if (pgPhoto) { const im = document.createElement("img"); im.src = pgPhoto; im.alt = ""; pv.appendChild(im); }
    $("#pg-photo-remove").hidden = !pgPhoto;
  };
  const TYPES = { heading: "大標題", text: "文字", image: "圖片", products: "商品", button: "按鈕", countdown: "倒數計時", code: "優惠碼", divider: "分隔線" };
  function targetOptions(cur) {
    const base = [["#order", "結帳頁"], ["/soon", "即將發售頁"], ["/", "首頁"]].concat(pages.filter((p) => !editingPg || p.id !== editingPg.id).map((p) => ["/p/" + p.id, "版面：" + p.title]), [["ig", "Instagram"], ["custom", "自訂網址…"]]);
    const known = base.some((o) => o[0] === cur);
    return base.map((o) => '<option value="' + esc(o[0]) + '"' + ((known ? o[0] === cur : o[0] === "custom") ? " selected" : "") + ">" + esc(o[1]) + "</option>").join("");
  }
  function blockHtml(b) {
    const head = '<div class="blk-head"><b>' + TYPES[b.type] + '</b><span class="blk-tools"><button type="button" class="icon" data-bk="up" aria-label="向上移">▲</button><button type="button" class="icon" data-bk="down" aria-label="向下移">▼</button><button type="button" class="icon" data-bk="dup" aria-label="複製這項">⧉</button><button type="button" class="icon" data-bk="del" aria-label="刪除這項">✕</button></span></div>';
    const sel = (cls, label, cur, opts) => '<label class="mini">' + label + '<select class="field ' + cls + '">' + opts.map((o) => '<option value="' + o[0] + '"' + (cur === o[0] ? " selected" : "") + ">" + o[1] + "</option>").join("") + "</select></label>";
    let body = "";
    if (b.type === "heading") body = '<label class="mini grow">標題文字<input class="field b-text" maxlength="150" value="' + esc(b.text || "") + '"></label>' + sel("b-size", "大小", b.size || "l", [["l", "大"], ["m", "中"]]) + sel("b-align", "對齊", b.align || "left", [["left", "靠左"], ["center", "置中"]]);
    else if (b.type === "text") body = '<label class="mini grow wide">內容（可以分行）<textarea class="field b-text" rows="4" maxlength="3000">' + esc(b.text || "") + "</textarea></label>" + sel("b-align", "對齊", b.align || "left", [["left", "靠左"], ["center", "置中"]]);
    else if (b.type === "image") body = '<div class="photo-row"><div class="preview b-preview" aria-hidden="true">' + (b.image ? '<img alt="" src="' + esc(b.image) + '">' : "") + '</div><div class="photo-actions"><input class="b-file" type="file" accept="image/*"></div></div>' +
      '<label class="mini grow">圖片說明（選填）<input class="field b-caption" maxlength="200" value="' + esc(b.caption || "") + '"></label>' + sel("b-w", "大小", b.w || "full", [["full", "全寬"], ["wide", "較闊"], ["half", "一半"]]) +
      '<label class="mini grow">按圖片連去（選填）<input class="field b-link" maxlength="300" placeholder="https://… 或 /p/名稱" value="' + esc(b.link || "") + '"></label>';
    else if (b.type === "products") {
      const ids = new Set(b.ids || []);
      body = '<label class="mini grow">標題（選填）<input class="field b-title" maxlength="100" value="' + esc(b.title || "") + '"></label>' + sel("b-cols", "每行", String(b.cols || 3), [["2", "2 件"], ["3", "3 件"], ["4", "4 件"]]) +
        '<div class="chk-list wide">' + (prods().map((p) => '<label class="check"><input type="checkbox" class="b-prod" value="' + esc(p.id) + '"' + (ids.has(p.id) ? " checked" : "") + "><span>" + esc(p.group + " " + p.name) + "<small>" + money(effectivePrice(p)) + "</small></span></label>").join("") || '<p class="hint">未有商品。</p>') + "</div>";
    } else if (b.type === "button") body = '<label class="mini grow">按鈕文字<input class="field b-label" maxlength="40" value="' + esc(b.label || "") + '"></label>' +
      '<label class="mini grow">連去<select class="field b-ttype">' + targetOptions(b.target || "#order") + '</select></label><label class="mini grow b-custom-wrap"><span>網址</span><input class="field b-target" maxlength="300" placeholder="https://…" value="' + esc(b.target || "") + '"></label>' +
      sel("b-style", "樣式", b.style || "solid", [["solid", "實心"], ["line", "線框"]]) + sel("b-align", "對齊", b.align || "left", [["left", "靠左"], ["center", "置中"]]);
    else if (b.type === "countdown") body = '<label class="mini grow">說明文字<input class="field b-label" maxlength="100" placeholder="例如 優惠倒數" value="' + esc(b.label || "") + '"></label><label class="mini">完結時間<input class="field b-ends" type="datetime-local" value="' + esc(b.endsAt || "") + '"></label>' +
      '<label class="mini grow">完結後顯示（選填）<input class="field b-ended" maxlength="100" placeholder="例如 優惠已完結" value="' + esc(b.endedText || "") + '"></label>';
    else if (b.type === "code") body = '<label class="mini grow">說明（選填）<input class="field b-label" maxlength="100" placeholder="例如 落單輸入優惠碼" value="' + esc(b.label || "") + '"></label><label class="mini">優惠碼<input class="field b-code" maxlength="40" value="' + esc(b.code || "") + '"></label>';
    else body = '<p class="hint">分隔線，不用設定。</p>';
    return '<div class="blk" data-type="' + b.type + '" data-id="' + esc(b.id || uid()) + '">' + head + '<div class="blk-body">' + body + "</div></div>";
  }
  function addBlock(b, at) {
    const box = $("#pg-blocks"); box.insertAdjacentHTML("beforeend", blockHtml(b));
    const el = box.lastElementChild;
    syncButtonRow(el);
    if (at != null && box.children[at]) box.insertBefore(el, box.children[at]);
    return el;
  }
  function syncButtonRow(el) {
    const t = el.querySelector(".b-ttype"); if (!t) return;
    const wrap = el.querySelector(".b-custom-wrap"); wrap.hidden = t.value !== "custom";
    if (t.value !== "custom") el.querySelector(".b-target").value = t.value;
  }
  function collectBlocks() {
    return [...document.querySelectorAll("#pg-blocks .blk")].map((el) => {
      const t = el.dataset.type, g = (c) => { const x = el.querySelector(c); return x ? x.value.trim() : ""; }, b = { id: el.dataset.id, type: t };
      if (t === "heading") Object.assign(b, { text: g(".b-text"), size: g(".b-size"), align: g(".b-align") });
      else if (t === "text") Object.assign(b, { text: el.querySelector(".b-text").value.trim(), align: g(".b-align") });
      else if (t === "image") Object.assign(b, { image: el.dataset.image || "", caption: g(".b-caption"), w: g(".b-w"), link: g(".b-link") });
      else if (t === "products") Object.assign(b, { title: g(".b-title"), cols: Number(g(".b-cols")) || 3, ids: [...el.querySelectorAll(".b-prod:checked")].map((x) => x.value) });
      else if (t === "button") Object.assign(b, { label: g(".b-label"), target: g(".b-target"), style: g(".b-style"), align: g(".b-align") });
      else if (t === "countdown") Object.assign(b, { label: g(".b-label"), endsAt: g(".b-ends"), endedText: g(".b-ended") });
      else if (t === "code") Object.assign(b, { label: g(".b-label"), code: g(".b-code") });
      return b;
    });
  }
  function openPg(p) {
    editingPg = p || null;
    $("#pgdlg-title").textContent = p ? "編輯版面" : "新增版面";
    $("#pg-slug").value = p ? p.id : ""; $("#pg-slug").disabled = !!p; $("#pg-title").value = p ? p.title : ""; $("#pg-sub").value = p ? p.subtitle || "" : "";
    $("#pg-pub").checked = p ? !!p.published : true; $("#pg-nav").checked = !!(p && p.showInNav); $("#pg-navlabel").value = p ? p.navLabel || "" : "";
    $("#pg-home").checked = !!(p && p.homeButton); $("#pg-homelabel").value = p ? p.homeLabel || "" : ""; $("#pg-photo").value = ""; setPgPhoto(p ? p.banner : "");
    $("#pg-blocks").innerHTML = ""; (p && p.blocks ? p.blocks : []).forEach((b) => { const el = addBlock(b); if (b.image) el.dataset.image = b.image; });
    $("#pg-error").hidden = true; $("#pg-delete").hidden = !p; syncUrl(); pgdlg.showModal();
  }
  const syncUrl = () => { $("#pg-url").textContent = "網址：" + location.origin + "/p/" + ($("#pg-slug").value.trim() || "…"); };
  $("#pg-slug").addEventListener("input", syncUrl);
  $("#pg-add").addEventListener("click", () => openPg(null));
  $("#pg-cancel").addEventListener("click", () => pgdlg.close());
  $("#pg-photo-remove").addEventListener("click", () => { $("#pg-photo").value = ""; setPgPhoto(""); });
  $("#pg-photo").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    shrink(f, 1400).then(setPgPhoto).catch(() => { $("#pg-error").textContent = "這張圖片無法使用，請試另一張。"; $("#pg-error").hidden = false; });
  });
  document.querySelectorAll("#pgdlg [data-add]").forEach((b) => b.addEventListener("click", () => {
    const type = b.dataset.add, init = { type, id: uid() };
    if (type === "button") Object.assign(init, { target: "#order", label: "前往結帳" });
    const el = addBlock(init); el.scrollIntoView({ block: "nearest" });
    const first = el.querySelector("input,textarea"); if (first) first.focus();
  }));
  $("#pg-blocks").addEventListener("click", (e) => {
    const k = e.target.closest("[data-bk]"); if (!k) return;
    const el = k.closest(".blk"), box = $("#pg-blocks");
    if (k.dataset.bk === "del") el.remove();
    else if (k.dataset.bk === "up" && el.previousElementSibling) box.insertBefore(el, el.previousElementSibling);
    else if (k.dataset.bk === "down" && el.nextElementSibling) box.insertBefore(el.nextElementSibling, el);
    else if (k.dataset.bk === "dup") { const b = collectBlocks().find((x) => x.id === el.dataset.id); const copy = { ...b, id: uid() }; const n = addBlock(copy); if (b.image) n.dataset.image = b.image; box.insertBefore(n, el.nextElementSibling); }
  });
  $("#pg-blocks").addEventListener("change", (e) => {
    const el = e.target.closest(".blk"); if (!el) return;
    if (e.target.classList.contains("b-ttype")) syncButtonRow(el);
    if (e.target.classList.contains("b-file")) {
      const f = e.target.files[0]; if (!f) return;
      shrink(f, 1100).then((d) => { el.dataset.image = d; el.querySelector(".b-preview").innerHTML = '<img alt="" src="' + d + '">'; })
        .catch(() => { $("#pg-error").textContent = "這張圖片無法使用，請試另一張。"; $("#pg-error").hidden = false; });
    }
  });
  $("#pgform").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("#pg-error"), btn = $("#pg-save"), bad = (m) => { err.textContent = m; err.hidden = false; };
    const slug = ($("#pg-slug").value || "").trim().toLowerCase(), title = $("#pg-title").value.trim();
    if (!editingPg) {
      if (!/^[a-z0-9-]{1,40}$/.test(slug)) return bad("網址名稱只可以用英文細楷、數字和 -，最多 40 個字。");
      if (pages.some((x) => x.id === slug)) return bad("這個網址名稱已經有版面使用，請改一個。");
    }
    if (!title) return bad("請填寫版面標題。");
    const blocks = collectBlocks();
    if (blocks.length > 40) return bad("一個版面最多 40 項內容。");
    for (const b of blocks) {
      if (b.type === "button") { if (!b.label) return bad("每個按鈕都要填寫文字。"); if (!safeLink(b.target) && b.target !== "ig") return bad("按鈕的網址要以 https://、/ 或 # 開頭。"); }
      if (b.type === "image" && !b.image) return bad("有圖片項目未上載圖片。");
      if (b.type === "image" && b.link && !safeLink(b.link)) return bad("圖片連結要以 https://、/ 或 # 開頭。");
      if (b.type === "countdown" && !b.endsAt) return bad("倒數計時要填寫完結時間。");
      if (b.type === "code" && !b.code) return bad("優惠碼項目未填寫優惠碼。");
    }
    const data = { slug: editingPg ? editingPg.id : slug, title, subtitle: $("#pg-sub").value.trim(), banner: pgPhoto, published: $("#pg-pub").checked, showInNav: $("#pg-nav").checked, navLabel: $("#pg-navlabel").value.trim(),
      homeButton: $("#pg-home").checked, homeLabel: $("#pg-homelabel").value.trim(), order: editingPg ? Number(editingPg.order) || 0 : pages.reduce((m, x) => Math.max(m, Number(x.order) || 0), 0) + 1, blocks, updatedAt: serverTimestamp() };
    if (JSON.stringify(data).length > 950000) return bad("圖片太大，整個版面超出儲存上限。請減少圖片或用較細的圖片。");
    err.hidden = true; btn.disabled = true;
    setDoc(doc(db, "pages", data.slug), data).then(() => pgdlg.close()).catch(() => bad("儲存失敗。請確認已發布最新的安全規則，或稍後再試。")).then(() => { btn.disabled = false; });
  });
  $("#pg-delete").addEventListener("click", () => {
    if (!editingPg || !confirm("確定刪除這個版面？此動作無法還原。如只想暫時不顯示，可取消「發佈」。")) return;
    deleteDoc(doc(db, "pages", editingPg.id)).then(() => pgdlg.close()).catch(() => { $("#pg-error").textContent = "刪除失敗，請再試。"; $("#pg-error").hidden = false; });
  });

  return { start, stop, productsChanged: () => {} };
}
