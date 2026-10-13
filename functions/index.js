// Sends the customer an email at each order stage. Runs on Firebase (Cloud Functions), not in the browser,
// so customers cannot trigger emails to other people. Needs the secrets SMTP_USER and SMTP_PASS (see README).
"use strict";
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const { SEND, stageOf, build } = require("./emails");

admin.initializeApp();
const SMTP_USER = defineSecret("SMTP_USER");   // e.g. the shop's Gmail address
const SMTP_PASS = defineSecret("SMTP_PASS");   // a Gmail "app password", never the real password
const SHOP = "MH KPOP SELL";
const opts = { document: "orders/{id}", region: "asia-east2", secrets: [SMTP_USER, SMTP_PASS] };

async function notify(ref, order) {
  const stage = stageOf(order);
  if (!SEND.includes(stage) || !order.email) return;
  if (order.emailsSent && order.emailsSent[stage]) return;     // each stage is sent once
  const mail = build(stage, order, SHOP);
  const tx = nodemailer.createTransport({ service: "gmail", auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() } });
  await tx.sendMail({ from: `"${SHOP}" <${SMTP_USER.value()}>`, to: order.email, subject: mail.subject, text: mail.text, html: mail.html });
  await ref.update({ ["emailsSent." + stage]: admin.firestore.FieldValue.serverTimestamp() });
}

exports.orderCreated = onDocumentCreated(opts, (e) => notify(e.data.ref, e.data.data()));
exports.orderUpdated = onDocumentUpdated(opts, (e) => {
  const before = e.data.before.data(), after = e.data.after.data();
  if (stageOf(before) === stageOf(after)) return;               // ignore tracking/note-only edits and our own emailsSent write
  return notify(e.data.after.ref, after);
});
