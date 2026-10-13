// Order emails: which stage an order is at, and the wording of each email (Traditional Chinese + English line).
// Pure functions, no Firebase, so they can be tested: node tests/emails.test.mjs
"use strict";

const PROGRESS = ["received", "paid", "ordering", "arrived", "shipped", "ready", "done"];
// progress steps that send an email (ordering is internal and sends nothing)
const SEND = ["received", "paid", "arrived", "shipped", "ready", "done"];

// same rule as progressKey() in shoplib.js
function stageOf(o) {
  if (o.status === "cancelled") return "cancelled";
  if (o.progress && PROGRESS.includes(o.progress)) return o.progress;
  return o.status === "done" ? "done" : o.status === "confirmed" ? "paid" : "received";
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const WORDS = {
  received: ["我們已收到你的訂單", "We have received your order.", "請按訂單頁面付款，我們核對款項後會確認訂單。", "Please pay on the payment page. We will confirm your order once the payment is checked."],
  paid: ["你的訂單已確認", "Your order has been accepted.", "我們已確認收到款項，會盡快為你處理。", "We have confirmed your payment and will prepare your order."],
  arrived: ["你訂購的貨品已到", "Your ordered items have arrived.", "我們會盡快安排寄出或通知你取貨。", "We will arrange shipping or let you know when it is ready to collect."],
  shipped: ["你的訂單已寄出", "Your order has been shipped.", "請留意順豐到付，收件時請準備運費。", "It is sent by SF Express (freight collect). Please have the shipping fee ready."],
  ready: ["你的訂單可到門市取貨", "Your order is ready to collect in store.", "請到將軍澳 TKO Gateway 東翼 1/F E171 取貨，並出示訂單編號。", "Please collect at TKO Gateway East Wing 1/F E171 and show your order number."],
  done: ["你的訂單已完成", "Your order is completed.", "多謝惠顧，期待再次為你服務！", "Thank you for shopping with us!"]
};

function build(stage, o, shop) {
  const w = WORDS[stage];
  if (!w) return null;
  const items = (o.items || []).map((i) => `${i.group ? i.group + " " : ""}${i.name} × ${i.qty}`);
  const track = o.tracking && stage === "shipped" ? [`順豐單號 SF tracking: ${o.tracking}`] : [];
  const note = o.customerNote ? [`備註 Note: ${o.customerNote}`] : [];
  const text = [
    `${o.name || ""} 你好，`, "", `${w[0]}。`, w[2], "",
    `訂單編號 Order: ${o.orderNo}`, ...items, `總額 Total: HK$${o.total}`, ...track, ...note, "",
    w[1], w[3], "", `${shop} · https://mhkpop.web.app/me`
  ].join("\n");
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:auto;color:#122521">` +
    `<h2>${esc(w[0])}</h2><p>${esc(o.name)} 你好，${esc(w[2])}</p>` +
    `<p><b>訂單編號 Order:</b> ${esc(o.orderNo)}</p><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` +
    `<p><b>總額 Total:</b> HK$${esc(o.total)}</p>` +
    [...track, ...note].map((l) => `<p>${esc(l)}</p>`).join("") +
    `<p style="color:#5E6F68">${esc(w[1])}<br>${esc(w[3])}</p>` +
    `<p><a href="https://mhkpop.web.app/me">查看訂單 View your order</a></p><p style="color:#5E6F68">${esc(shop)}</p></div>`;
  return { subject: `${w[0]} · ${w[1]} (${o.orderNo})`, text, html };
}

module.exports = { SEND, stageOf, build };
