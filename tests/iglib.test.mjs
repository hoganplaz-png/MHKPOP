// Run: node tests/iglib.test.mjs
import assert from "node:assert/strict";
import { igFromProduct, igDeal, igCaption } from "../iglib.js";

const sale = igFromProduct({ group: "TXT", name: "最新 PB", price: 115, salePrice: 85, tag: "補貨", image: "https://x/y.png" }, "2026-10-14");
assert.equal(sale.price, "85");
assert.equal(sale.oldPrice, "115");
assert.equal(sale.image, "", "only uploaded photos are used");
const plain = igFromProduct({ group: "CORTIS", name: "Album (PB ver)", price: 109 }, "2026-10-14");
assert.equal(plain.oldPrice, "");
assert.equal(igDeal("85", "115"), "慳 $30！");
assert.equal(igDeal("109", ""), "抵！");
const c = igCaption(sale);
assert.ok(c.startsWith("TXT 最新 PB 到貨"));
assert.ok(c.includes("HK$85（原價 $115）"));
assert.ok(c.includes("#TXT "));
console.log("iglib tests passed");
