// Run with: node tests/proofcheck.test.mjs
import assert from "node:assert/strict";
import { findAmounts, findDates, findRefs, hasOrderNo, judge } from "../proofcheck.js";

const order = { orderNo: "MH-K7Q2XZ", total: 268, createdAt: new Date(2026, 9, 12, 21, 5) };
const proof = { createdAt: new Date(2026, 9, 13, 9, 0) };

// a typical PayMe receipt, as read by OCR
const payme = `PayMe\nPayment sent\nHK$268.00\nTo MH KPOP SELL\nMessage MH-K7Q2XZ\n12 Oct 2026, 21:14\nTransaction ID 2610122114PM88317265`;
assert.deepEqual(findAmounts(payme), [268]);
assert.deepEqual(findDates(payme), ["2026-10-12"]);
assert.ok(hasOrderNo(payme, "MH-K7Q2XZ"));
assert.ok(hasOrderNo("message mh k7q2xz", "MH-K7Q2XZ"));
assert.ok(hasOrderNo("MH-K7Q2X2", "MH-K7Q2XZ") === false);
assert.equal(judge(order, proof, { text: payme }, []).status, "pass");

// amounts: commas, HKD, no currency with decimals, plain integers ignored
assert.deepEqual(findAmounts("HKD 1,280.00"), [1280]);
assert.deepEqual(findAmounts("Amount 99.50"), [99.5]);
assert.deepEqual(findAmounts("Call 91234567 at 21:14"), []);
assert.deepEqual(findAmounts("支付 ¥120"), [120]);

// dates in other formats
assert.deepEqual(findDates("2026/10/12 21:14"), ["2026-10-12"]);
assert.deepEqual(findDates("2026年10月12日"), ["2026-10-12"]);
assert.deepEqual(findDates("日 期 : 2026 年 10 月 12 日 21:14"), ["2026-10-12"]);
assert.deepEqual(findAmounts("已 付款 HK$1,280.00"), [1280]);
assert.deepEqual(findDates("Oct 12, 2026"), ["2026-10-12"]);
assert.deepEqual(findDates("03/04/2026"), ["2026-03-04", "2026-04-03"]);

// wrong amount -> review
let r = judge(order, proof, { text: payme.replace("268.00", "168.00") }, []);
assert.equal(r.status, "review");
assert.equal(r.checks.find((c) => c.key === "amount").state, "bad");

// old screenshot -> review
r = judge(order, proof, { text: payme.replace("12 Oct 2026", "2 Sep 2026") }, []);
assert.equal(r.status, "review");
assert.match(r.checks.find((c) => c.key === "date").text, /早於/);

// no order number is only information
r = judge(order, proof, { text: payme.replace("Message MH-K7Q2XZ", "") }, []);
assert.equal(r.status, "pass");
assert.equal(r.checks.find((c) => c.key === "order").state, "info");

// the same transaction reused for another order -> review
const other = { orderNo: "MH-AAAA11", read: { text: "HK$268.00 12 Oct 2026 Transaction ID 2610122114PM88317265" } };
r = judge(order, proof, { text: payme }, [other]);
assert.equal(r.status, "review");
assert.match(r.checks.find((c) => c.key === "reuse").text, /MH-AAAA11/);
// the earlier upload is not flagged, only the later one
assert.equal(judge(order, proof, { text: payme }, [{ ...other, createdAt: new Date(2026, 9, 13, 12) }]).status, "pass");
assert.equal(judge(order, proof, { text: payme }, [{ ...other, createdAt: new Date(2026, 9, 13, 8) }]).status, "review");
// identical image -> review
r = judge(order, proof, { text: payme, hash: "abc" }, [{ orderNo: "MH-BBBB22", read: { text: "x", hash: "abc" } }]);
assert.equal(r.status, "review");
// another screenshot for the same order is fine
r = judge(order, proof, { text: payme }, [{ orderNo: order.orderNo, read: { text: payme } }]);
assert.equal(r.status, "pass");

// unreadable
assert.equal(judge(order, proof, { text: "  ~ " }, []).status, "review");
assert.deepEqual(findRefs(payme, [order.orderNo]), ["2610122114PM88317265".replace(/O/g,"0")]);
console.log("proofcheck: all tests passed");
