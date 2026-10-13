// Run: node tests/emails.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { SEND, stageOf, build } = createRequire(import.meta.url)("../functions/emails.js");

assert.equal(stageOf({ status: "new" }), "received");
assert.equal(stageOf({ status: "confirmed" }), "paid");
assert.equal(stageOf({ status: "confirmed", progress: "shipped" }), "shipped");
assert.equal(stageOf({ status: "done", progress: "done" }), "done");
assert.equal(stageOf({ status: "cancelled", progress: "paid" }), "cancelled");
assert.ok(!SEND.includes("ordering") && !SEND.includes("cancelled"));
const o = { orderNo: "MH-ABC123", name: "<b>Amy</b>", total: 200, tracking: "SF123", items: [{ group: "TXT", name: "PB", qty: 2 }] };
for (const s of SEND) { const m = build(s, o, "Shop"); assert.ok(m.subject.includes("MH-ABC123") && m.text.includes("Order") && /[一-鿿]/.test(m.text)); }
assert.ok(build("shipped", o, "Shop").text.includes("SF123"));
assert.ok(!build("done", o, "Shop").text.includes("SF123"));
assert.ok(!build("received", o, "Shop").html.includes("<b>Amy"));
assert.equal(build("cancelled", o, "Shop"), null);
console.log("email tests passed");
