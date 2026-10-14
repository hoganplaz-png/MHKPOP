// IG post maker: turns a shop product into the words for an Instagram post.
// Pure functions only (no page), so they can be tested on their own.
import { effectivePrice, dn } from "./shoplib.js";

// what the IG page needs from a product (sale price wins; the normal price becomes the crossed-out one)
export function igFromProduct(p, today) {
  const now = effectivePrice(p, today), was = Number(p.price) || 0;
  return {
    group: String(p.group || "").trim(),
    name: String(p.name || "").trim(),
    price: String(now),
    oldPrice: was > now ? String(was) : "",
    tag: String(p.tag || "").trim(),
    image: typeof p.image === "string" && /^data:image\//.test(p.image) ? p.image : ""
  };
}

// "慳 $30！" when there is a saving, otherwise a plain "抵！"
export function igDeal(price, oldPrice) {
  const p = Number(price), o = Number(oldPrice);
  return o > p && p > 0 ? "慳 $" + (o - p) + "！" : "抵！";
}

export function igCaption(it, site = "mhkpop.web.app") {
  const title = dn(it.group, it.name);
  const tagWord = it.group ? "#" + it.group.replace(/[^\p{L}\p{N}]/gu, "") + " " : "";
  return title + " 到貨 💿\n" +
    (it.tag ? it.tag + "，" : "") + "只係 HK$" + it.price + (it.oldPrice ? "（原價 $" + it.oldPrice + "）" : "") + "\n" +
    "售完即止，唔好等冇貨先嚟搵我哋～\n\n" +
    "網站直接落單 👉 " + site + "（link in bio）\n順豐到付或者將軍澳門市自取\n\n" +
    "#MHKPOP " + tagWord + "#KPOP專輯 #韓國專輯 #香港KPOP #將軍澳";
}
