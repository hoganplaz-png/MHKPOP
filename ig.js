// IG post maker: draws a 1080×1350 Instagram post for one product and writes its caption.
// The admin page's "IG 帖" button saves the product to localStorage("mhkpop-ig") and opens this page.
import { igDeal, igCaption } from "./iglib.js";

const $ = (s) => document.querySelector(s);
const W = 1080, H = 1350, M = 84;
const css = getComputedStyle(document.documentElement);
const v = (name) => css.getPropertyValue(name).trim();
const T = {
  ink: v("--ink"), cream: v("--cream"), ground: v("--ground"), panel: v("--panel"), grey: v("--grey"),
  muted: v("--muted"), accent: v("--accent"), accentInk: v("--accent-ink"),
  cd: [v("--cd-1"), v("--cd-2"), v("--cd-3"), v("--cd-4")],
  display: v("--font-display"), body: v("--font-body"), hand: '"LXGW WenKai TC", ' + v("--font-body")
};
const canvas = $("#ig-canvas"), ctx = canvas.getContext("2d");
const logo = new Image(); logo.src = "assets/logo.png";
let photo = null;

// ---------- data in ----------
let item = { group: "", name: "", price: "", oldPrice: "", tag: "", image: "" };
try { const saved = JSON.parse(localStorage.getItem("mhkpop-ig") || "null"); if (saved) item = Object.assign(item, saved); } catch (e) {}
$("#f-group").value = item.group; $("#f-name").value = item.name; $("#f-price").value = item.price;
$("#f-old").value = item.oldPrice; $("#f-tag").value = item.tag;
if (item.image) loadPhoto(item.image);

function read() {
  return {
    group: $("#f-group").value.trim(), name: $("#f-name").value.trim(), price: $("#f-price").value.trim(),
    oldPrice: $("#f-old").value.trim(), tag: $("#f-tag").value.trim(), note: $("#f-note").value.trim(),
    dark: document.querySelector('input[name="theme"]:checked').value === "dark"
  };
}
function loadPhoto(src) { const im = new Image(); im.onload = () => { photo = im; draw(); }; im.src = src; }

// ---------- drawing helpers ----------
function font(w, size, fam) { ctx.font = w + " " + size + "px " + fam; }
function spaced(text, x, y, em, align) {
  ctx.letterSpacing = em ? Math.round(parseFloat(ctx.font.match(/(\d+)px/)[1]) * em) + "px" : "0px";
  ctx.textAlign = align || "left"; ctx.fillText(text, x, y); ctx.letterSpacing = "0px"; ctx.textAlign = "left";
}
function fit(text, w, size, min, fam) { font(500, size, fam); while (size > min && ctx.measureText(text).width > w) { size -= 4; font(500, size, fam); } return size; }
function wrap(text, x, y, maxW, lh, maxLines) {
  const lines = []; let cur = "";
  for (const ch of Array.from(text)) { if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch.trimStart(); } else cur += ch; }
  if (cur) lines.push(cur);
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}
function rotated(cx, cy, deg, fn) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(deg * Math.PI / 180); fn(); ctx.restore(); }
function shadow(blur, oy, a) { ctx.shadowColor = "rgba(18,37,33," + a + ")"; ctx.shadowBlur = blur; ctx.shadowOffsetY = oy; }
function noShadow() { ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; }
let grain = null;
function makeGrain() {
  const g = document.createElement("canvas"); g.width = 240; g.height = 240;
  const c = g.getContext("2d"), d = c.createImageData(240, 240);
  for (let i = 0; i < d.data.length; i += 4) { const n = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = n; d.data[i + 3] = 22; }
  c.putImageData(d, 0, 0); return g;
}

// ---------- the post ----------
function draw() {
  const it = read(), dark = it.dark;
  const fg = dark ? T.cream : T.ink, soft = dark ? "#A9B8B2" : T.muted, line = dark ? "rgba(254,253,251,.2)" : "rgba(18,37,33,.18)";
  const handColor = dark ? "#E8A898" : "#B0432E";
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = dark ? T.ink : T.ground; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = fg; ctx.textBaseline = "alphabetic";

  // header
  if (logo.complete && logo.naturalWidth) { ctx.save(); if (dark) ctx.filter = "invert(1)"; ctx.drawImage(logo, M, 66, 58, 57); ctx.restore(); }
  font(500, 26, T.display); spaced("MHKPOP", M + 76, 104, .28);
  font(400, 22, T.display); ctx.globalAlpha = .7; spaced("mhkpop.web.app", W - M, 104, .08, "right"); ctx.globalAlpha = 1;

  // titles
  ctx.fillStyle = soft; font(500, 26, T.display); spaced((it.tag || "NEW IN") + " · 今期推介", M, 232, .3);
  ctx.fillStyle = fg;
  const artist = (it.group || "MHKPOP").toUpperCase();
  fit(artist, W - 2 * M, 150, 72, T.display); spaced(artist, M, 380, .01);
  font(900, 52, T.body); wrap(it.name || "[商品名稱]", M, 460, W - 2 * M, 64, 2);

  // sleeve with the CD sliding out
  rotated(M + 230, 600 + 245, -4, () => {
    const x = -230, y = -245, w = 460, h = 490;
    shadow(40, 24, .45);
    const g = ctx.createConicGradient(0, x + 415, y + 245);
    [0, .25, .5, .75, 1].forEach((s, i) => g.addColorStop(s, T.cd[i % 4]));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + 415, y + 245, 225, 0, Math.PI * 2); ctx.fill(); noShadow();
    ctx.fillStyle = dark ? T.ink : T.ground; ctx.beginPath(); ctx.arc(x + 415, y + 245, 86, 0, Math.PI * 2); ctx.fill();
    shadow(50, 30, .55);
    ctx.fillStyle = dark ? T.cream : T.ink; ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill(); noShadow();
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.clip();
    if (photo) {
      const s = Math.max(w / photo.width, h / photo.height);
      ctx.drawImage(photo, x + (w - photo.width * s) / 2, y + (h - photo.height * s) / 2, photo.width * s, photo.height * s);
    } else {
      ctx.fillStyle = dark ? T.ink : T.cream;
      font(700, 18, T.body); ctx.globalAlpha = .7; ctx.fillText("相片位 · 上載實物相", x + 34, y + 54); ctx.globalAlpha = 1;
      font(500, 40, T.display); spaced(artist.slice(0, 18), x + 34, y + h - 70, .04);
      font(400, 18, T.display); ctx.globalAlpha = .7; spaced((it.name || "").toUpperCase().slice(0, 30), x + 34, y + h - 36, .2); ctx.globalAlpha = 1;
    }
    ctx.restore();
    rotated(x + 235, y - 2, 3, () => { ctx.fillStyle = "rgba(233,226,200,.88)"; shadow(6, 2, .15); ctx.fillRect(-75, -22, 150, 44); noShadow(); });
  });

  // price sticker
  rotated(W - M - 150, 910, 8, () => {
    shadow(40, 24, .5); ctx.fillStyle = T.accent; ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI * 2); ctx.fill(); noShadow();
    ctx.fillStyle = T.accentInk; ctx.textAlign = "center";
    if (it.tag) { font(700, 24, T.body); ctx.fillText(it.tag.slice(0, 8), 0, -58); }
    const price = it.price || "[價錢]";
    let size = 104; font(500, size, T.display); while (ctx.measureText("$" + price).width > 240) { size -= 6; font(500, size, T.display); }
    ctx.fillText("$" + price, 0, 34);
    if (it.oldPrice) {
      font(400, 24, T.display); const t = "原價 $" + it.oldPrice; ctx.fillText(t, 0, 82);
      const tw = ctx.measureText(t).width; ctx.fillRect(-tw / 2, 73, tw, 2);
    }
    ctx.textAlign = "left";
  });

  // hand-drawn arrow and note
  ctx.strokeStyle = handColor; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(600, 1160); ctx.bezierCurveTo(650, 1170, 720, 1140, 750, 1080); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(725, 1088); ctx.lineTo(750, 1078); ctx.lineTo(758, 1105); ctx.stroke();
  ctx.fillStyle = handColor;
  rotated(820, 1150, -6, () => { font(700, 56, T.hand); ctx.fillText(igDeal(it.price, it.oldPrice), 0, 0); });
  rotated(M, 1212, -2, () => { font(700, 44, T.hand); ctx.fillText(it.note.slice(0, 18), 0, 0); });

  // footer
  ctx.fillStyle = line; ctx.fillRect(M, 1262, W - 2 * M, 2);
  ctx.fillStyle = soft; font(400, 24, T.body);
  spaced("售完即止 · 不設預留", M, 1308, .14); spaced("順豐到付 / 將軍澳門市自取", W - M, 1308, .14, "right");

  if (!grain) grain = makeGrain();
  ctx.save(); ctx.globalCompositeOperation = "multiply"; ctx.globalAlpha = .5; ctx.fillStyle = ctx.createPattern(grain, "repeat"); ctx.fillRect(0, 0, W, H); ctx.restore();

  if (!captionEdited) $("#f-caption").value = igCaption(it);
}

// ---------- controls ----------
let captionEdited = false;
$("#f-caption").addEventListener("input", () => { captionEdited = true; });
$("#ig-form").addEventListener("input", (e) => { if (e.target.id !== "f-caption" && e.target.type !== "file") { captionEdited = false; draw(); } });
$("#ig-form").addEventListener("change", (e) => { if (e.target.name === "theme") draw(); });
$("#ig-form").addEventListener("submit", (e) => e.preventDefault());
$("#f-photo").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => loadPhoto(r.result); r.readAsDataURL(f);
});
$("#ig-download").addEventListener("click", () => {
  canvas.toBlob((b) => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(b);
    a.download = "mhkpop-" + (read().group || "post").replace(/[^\p{L}\p{N}]+/gu, "-") + ".png";
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "image/png");
});
$("#ig-copy").addEventListener("click", async () => {
  const b = $("#ig-copy");
  try { await navigator.clipboard.writeText($("#f-caption").value); b.textContent = "已複製 ✓"; }
  catch (e) { $("#f-caption").select(); b.textContent = "請手動複製"; }
  setTimeout(() => { b.textContent = "複製文案"; }, 2000);
});

logo.onload = draw;
Promise.all(['500 40px Jost', '900 40px "Noto Sans TC"', '700 40px "Noto Sans TC"', '700 40px "LXGW WenKai TC"']
  .map((f) => document.fonts.load(f, "MHKPOP 價錢快啲嚟搶啦慳抵原價"))).catch(() => {}).then(draw);
draw();
