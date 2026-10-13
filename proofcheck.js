// Automatic payment-screenshot check on the admin page. The picture is read in the browser (OCR, files in /vendor/tesseract)
// and compared with the order. Nothing is sent to another company. The result is saved on the proof as `check`.
import { analyzeProof } from "./shoplib.js";

export function setupProofCheck({ db, fb, getProofs, getOrders, onUpdate }) {
  const { doc, updateDoc } = fb;
  let worker = null, loading = null, running = false;
  const pending = new Set(), live = {};   // live: proofId -> result computed in this session

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (window.Tesseract) return resolve();
      const s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("tesseract script"));
      document.head.appendChild(s);
    });
  }
  function getWorker() {
    if (worker) return Promise.resolve(worker);
    if (!loading) {
      loading = loadScript("/vendor/tesseract/tesseract.min.js").then(() => window.Tesseract.createWorker(["eng", "chi_tra"], 1, {
        workerPath: "/vendor/tesseract/worker.min.js", corePath: "/vendor/tesseract/", langPath: "/vendor/tesseract/lang/", workerBlobURL: false, gzip: true
      })).then((w) => (worker = w)).catch((e) => { loading = null; throw e; });
    }
    return loading;
  }
  async function sha(str) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  const toDate = (o) => (o && o.createdAt && o.createdAt.toDate ? o.createdAt.toDate() : new Date());

  // shrink big phone screenshots before reading them (faster, same accuracy)
  function scaled(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => resolve(src); img.src = src;
    });
  }

  async function check(proof) {
    const order = getOrders().find((o) => o.orderNo === proof.orderNo) || { orderNo: proof.orderNo, total: 0 };
    const hash = await sha(proof.image);
    // the same picture used for another order earlier = reused screenshot (the earlier upload is the original)
    const when = (p) => (p.createdAt && p.createdAt.toDate ? p.createdAt.toDate().getTime() : 0);
    let dup = null;
    for (const p of getProofs()) {
      if (p.id === proof.id || p.orderNo === proof.orderNo || !p.image || when(p) > when(proof) || p.image.length !== proof.image.length) continue;
      if ((p.check && p.check.hash === hash) || (await sha(p.image)) === hash) { dup = p; break; }
    }
    let text = "", failed = "";
    try {
      const w = await getWorker();
      const r = await w.recognize(await scaled(proof.image));
      text = (r && r.data && r.data.text) || "";
    } catch (e) { failed = "OCR 讀圖功能未能啟動（" + (e && e.message || e) + "）"; }
    const res = failed
      ? { verdict: "error", checks: [{ key: "ocr", state: "bad", label: failed }] }
      : analyzeProof(text, order, { now: toDate(order), duplicateOf: dup ? dup.orderNo : "" });
    const out = { verdict: res.verdict, checks: res.checks.slice(0, 8), hash, at: Date.now(), text: text.replace(/\s+/g, " ").trim().slice(0, 300) };
    live[proof.id] = out;
    if (res.verdict !== "error") await updateDoc(doc(db, "proofs", proof.id), { check: out }).catch(() => {});
    onUpdate();
    return out;
  }
  async function drain() {
    if (running) return; running = true;
    try {
      while (pending.size) {
        const id = pending.values().next().value; pending.delete(id);
        const p = getProofs().find((x) => x.id === id); if (p) await check(p);
      }
    } finally { running = false; }
  }
  return {
    resultOf: (p) => live[p.id] || p.check || null,
    // read every screenshot that has not been checked yet (one by one, so the page stays smooth)
    scan() { getProofs().forEach((p) => { if (!p.check && !live[p.id] && p.image) pending.add(p.id); }); drain(); },
    recheck(id) { pending.add(id); delete live[id]; drain(); },
    busy: () => running || pending.size > 0
  };
}
