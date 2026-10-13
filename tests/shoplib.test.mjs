// Run: node tests/shoplib.test.mjs
import assert from "node:assert/strict";
import { profitReport } from "../shoplib.js";

const purchases = [
  { id: "p1", date: "2026-10-01", currency: "HKD", shipping: 20, otherFees: 0, allocate: "qty", lines: [{ id: "L1", group: "TXT", name: "PB", qty: 10, unitPrice: 50 }] },
  { id: "p2", date: "2026-09-01", currency: "HKD", shipping: 0, otherFees: 0, lines: [{ id: "L2", group: "IVE", name: "CD", qty: 5, unitPrice: 30 }] }
];
const sales = [
  { date: "2026-10-02", source: "pos", total: 170, items: [{ lineId: "L1", group: "TXT", name: "PB", qty: 2, price: 85 }] },
  { date: "2026-10-03", source: "import", total: 85, items: [{ lineId: "L1", group: "TXT", name: "PB", qty: 1, price: 85 }] },
  { date: "2026-10-04", source: "web", total: 60, items: [{ lineId: "L2", group: "IVE", name: "CD", qty: 1, price: 60 }] },
  { date: "2026-11-01", source: "pos", total: 999, items: [] }
];
const expenses = [
  { date: "2026-01-01", category: "rent", name: "租金", amount: 3100, repeat: "monthly" },
  { date: "2026-10-10", category: "other", name: "包裝", amount: 40, repeat: "none" }
];

const r = profitReport({ sales, purchases, expenses, from: "2026-10-01", to: "2026-10-31" });
assert.equal(r.revenue, 315);
assert.deepEqual(r.revenueBySource, { pos: 170, import: 85, web: 60 });
assert.equal(r.cogs, 3 * 52 + 30);                  // 52 = 50 + 20 shipping / 10 albums
assert.equal(Math.round(r.rentTotal), 3100);
assert.equal(r.otherExpenseTotal, 40);
assert.equal(Math.round(r.totalCost), 186 + 3100 + 40);
assert.equal(Math.round(r.netProfit), 315 - 3326);
assert.equal(r.stockBought, 520);                   // only the October purchase, shipping included
assert.equal(Math.round(r.cashNet), 315 - 520 - 3140);
console.log("shoplib profit tests passed");

// a pre-order sold before its purchase was recorded still gets its cost
const pre = profitReport({
  sales: [{ date: "2026-10-05", source: "pos", total: 100, items: [{ lineId: "", group: "IVE", name: "CD", qty: 2, price: 50 }] }],
  purchases, expenses: [], from: "2026-10-01", to: "2026-10-31"
});
assert.equal(pre.cogs, 60);
assert.equal(pre.unknownItems, 0);
assert.equal(pre.guessedItems, 1);
console.log("pre-order cost test passed");
