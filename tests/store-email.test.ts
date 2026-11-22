/**
 * App-store emails (receipts, renewals, price changes) and what the screens
 * make of them. Every product, name and amount here is made up.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseGmailReceipt } from "../lib/accounts/sync";
import { parseStorePriceChange, parseStoreReceipt } from "../lib/ingestion/store-email";
import { detectCommitments } from "../lib/payments/engine";
import { issueGroups } from "../lib/presentation/issue-cards";
import { SubscriptionWatchlist } from "../components/insights/subscription-watchlist";
import { readDictionary } from "../data/fixtures";
import type { NotificationRow, StatementRow } from "../lib/payments/types";

const mail = (subject: string, text: string) => ({ id: "store123", from: "Store <no_reply@example.com>", subject, date: "2026-11-09", payload: { mimeType: "text/plain", body: { data: Buffer.from(text).toString("base64url") } } });

const receipt = "Tax Invoice\n9 November 2026\nOrder ID:\nAB12CD34EF\nDemoTunes\nIndividual (Monthly)\nSAC: 998439\nRenews 9 December 2026\n₹69.00\nSubtotal\n₹58.48\nIGST charged at 18%\n₹10.52\n₹69.00\nYou may contact us for a full refund within 15 days.";

test("a one-product store receipt is a paid debit named after the product, not the sender", () => {
  const { event } = parseGmailReceipt(mail("Your receipt.", receipt), [".com"]);
  assert.equal(event?.kind, "debit_posted");
  assert.equal(event?.merchant, "DEMOTUNES");
  assert.equal(event?.amountPaise, 6900);
  assert.equal(event?.date, "2026-11-09");
});

test("a receipt with two products or a different total is not guessed", () => {
  const two = receipt.replace("Renews 9 December 2026\n₹69.00", "Renews 9 December 2026\n₹69.00\nDemoCloud\nPlus (Monthly)\nRenews 10 December 2026\n₹75.00");
  assert.equal(parseStoreReceipt(two, { id: "x123", date: "2026-11-09" }), null);
  assert.equal(parseStoreReceipt(receipt.replace(/₹69\.00\nYou may/, "₹99.00\nYou may"), { id: "x123", date: "2026-11-09" }), null);
});

test("a store price-change notice gives the new price for the product", () => {
  const notice = "Subscription price increase\nDemoTunes\nStudent (Monthly)\nNew Price ₹69.00\nPrevious Price ₹59.00\nYour plan will automatically renew at ₹69.00 per month starting 9 November 2026.";
  const event = parseStorePriceChange(notice, { id: "pc123", date: "2026-10-10" });
  assert.equal(event?.kind, "price_change");
  assert.equal(event?.merchant, "DEMOTUNES");
  assert.equal(event?.amountPaise, 6900);
  const confirmed = parseStorePriceChange("Subscription price change confirmed\nDemoTunes\nStudent (Monthly)\n₹69.00 per month, starting 9 November 2026", { id: "pc124", date: "2026-10-12" });
  assert.equal(confirmed?.amountPaise, 6900);
});

test("a renewal card with a plan line like 'Student (1 month)' is read as that product", () => {
  const text = "Subscription renewal\nDemoTunes\nStudent (1 month)\n₹69.00/month\nStarting from 09 November 2026, your subscription automatically renews for ₹69.00/month.";
  const { event } = parseGmailReceipt(mail("Your Subscription Renewal", text), [".com"]);
  assert.equal(event?.kind, "subscription_renewal");
  assert.equal(event?.merchant, "DEMOTUNES");
  assert.equal(event?.renewalDate, "2026-11-09");
});

const row = (date: string, debit: number): StatementRow => ({ txnId: `t-${date}`, persona: "p1", date, accountId: "unidentified", accountType: "unknown", narration: "DEMOTUNES", debit, reference: "", channel: "email", txnKind: "debit_purchase" });
const notice = (sentOn: string, amount: number): NotificationRow => ({ noticeId: `n-${sentOn}`, sentOn, channel: "email", sender: "email", eventType: "price_change", brand: "DEMOTUNES", amount, text: "price change · DEMOTUNES" });
const data = (statement: StatementRow[], notifications: NotificationRow[] = []) => ({ asOf: "2026-11-21", statement, notifications, mandates: [], dictionary: readDictionary(), usage: [] });

test("a price rise with a notice is listed under 'told about', not as silent", () => {
  const rows = ["2026-07-09", "2026-08-09", "2026-09-09", "2026-10-09"].map((d) => row(d, 59)).concat(row("2026-11-09", 69));
  const [item] = detectCommitments(data(rows, [notice("2026-10-10", 69)]));
  assert.equal(item.hasPriceChangeNotice, true);
  const groups = Object.fromEntries(issueGroups([item]).map((group) => [group.id, group.rows.length]));
  assert.equal(groups.announced, 1);
  assert.equal(groups.price, 0);
  const [silent] = detectCommitments(data(rows));
  assert.equal(Object.fromEntries(issueGroups([silent]).map((group) => [group.id, group.rows.length])).price, 1);
});

test("after a plan change, three equal charges are the price now", () => {
  const rows = ["2026-04-22", "2026-05-22", "2026-06-22"].map((d) => row(d, 219)).concat(row("2026-07-20", 727.1), ...["2026-08-19", "2026-09-19", "2026-10-19"].map((d) => row(d, 749)));
  const [item] = detectCommitments(data(rows));
  assert.equal(item.amount, 749);
  assert.equal(item.annualCost, 749 * 12);
});

test("the watchlist shows one row per merchant, skips the table's merchants and bare sender domains", () => {
  const renewal = (id: string, brand: string, sentOn: string): NotificationRow => ({ noticeId: id, sentOn, channel: "email", sender: "email", eventType: "subscription_renewal", brand, amount: 1699, renewalDate: "2026-06-07", renewalFrequency: "monthly", text: "Renewal" });
  const html = renderToStaticMarkup(createElement(SubscriptionWatchlist, {
    asOf: "2026-11-21",
    registrations: [],
    renewals: [renewal("a", "DEMODATE", "2026-05-02"), renewal("b", "DEMODATE", "2026-06-02"), renewal("c", "DemoTunes", "2026-06-02")],
    candidates: [{ noticeId: "d", sentOn: "2026-06-09", channel: "email", sender: "email", eventType: "subscription_candidate", brand: "EMAIL.EXAMPLE.COM", text: "Invoice" }],
    exclude: ["DEMOTUNES"]
  }));
  assert.equal(html.split("DEMODATE").length - 1, 1);
  assert.ok(html.includes("2 emails"));
  assert.ok(!html.includes("DemoTunes"));
  assert.ok(!html.includes("EMAIL.EXAMPLE.COM"));
});
