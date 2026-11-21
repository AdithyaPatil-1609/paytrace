/**
 * The assistant must see everything the dashboard shows. These cover a SIP
 * whose emails use several names and skip months, subscriptions seen only in
 * emails, and a follow-up like "that's wrong". Every amount and date is made up.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readDictionary } from "../data/fixtures";
import { detectCommitments, foldMissedCycles, NOTICE_CHANNEL } from "../lib/payments/engine";
import type { NotificationRow, StatementRow } from "../lib/payments/types";
import { factsFor } from "../lib/assistant/facts";
import { CHALLENGE, complete, explain } from "../lib/assistant/assistant";
import { isCurrent, watchDates, watchItems, type WatchItem } from "../lib/assistant/watchlist";

const ASOF = "2026-11-21";
const row = (narration: string, date: string, debit: number): StatementRow =>
  ({ txnId: `${narration}-${date}`, persona: "p", date, accountId: "unidentified", accountType: "unknown", narration, debit, reference: "", channel: NOTICE_CHANNEL, txnKind: "debit_notice" } as StatementRow);
const dataset = (statement: StatementRow[]) => ({ asOf: ASOF, statement, notifications: [], mandates: [], dictionary: readDictionary(), usage: [] });
const notice = (brand: string, sentOn: string, extra: Partial<NotificationRow> = {}): NotificationRow =>
  ({ noticeId: `${brand}-${sentOn}`, sentOn, channel: "email", sender: "email", eventType: "subscription_candidate", brand, text: "", ...extra });

test("missed months fold back into one cycle; scattered gaps do not", () => {
  assert.deepEqual(foldMissedCycles([243, 38, 23, 31]).map(Math.round), [35, 38, 23, 31]);
  assert.deepEqual(foldMissedCycles([30, 90]), [30, 90], "two gaps are too few to know the usual one");
  assert.deepEqual(foldMissedCycles([30, 47, 31, 29]), [30, 47, 31, 29], "47 days is not two months");
});

test("a SIP under its brand name and its scheme name is one monthly payment, next due on the same day", () => {
  const items = detectCommitments(dataset([
    row("HDFC MUTUAL FUND", "2025-12-17", 4100), row("HDFC MUTUAL FUND", "2026-08-17", 4100),
    row("HDFC FLEXI CAP FUND-GROWTH", "2026-09-17", 4100), row("HDFC FLEXI CAP FUND - REGULAR PLAN - GROWTH", "2026-10-17", 4100),
    row("HDFC FLEXI CAP FUND - REGULAR PLAN - GROWTH", "2026-11-17", 4100)
  ]));
  assert.equal(items.length, 1);
  assert.equal(items[0].cadence, "monthly");
  assert.equal(items[0].nextCharge, "2026-12-17");
});

const lists = {
  candidates: [
    notice("DEMOTUBE PREMIUM", "2026-06-08", { planPrice: 77, renewalDate: "2026-07-08", renewalFrequency: "monthly" }),
    notice("DEMOTUBE PREMIUM", "2026-10-11", { planPrice: 77, renewalDate: "2026-11-11", renewalFrequency: "monthly" }),
    notice("EMAIL.DEMO.COM", "2026-10-01", { planPrice: 50, renewalFrequency: "monthly" }),
    notice("Oldmatch", "2026-05-04", { planPrice: 399, renewalDate: "2026-05-10", renewalFrequency: "monthly" })
  ],
  renewals: [notice("Democloud", "2026-11-14", { eventType: "subscription_renewal", amount: 300, renewalDate: "2026-11-20", renewalFrequency: "monthly" })]
};
const tableItems = detectCommitments(dataset([row("Democloud", "2026-09-20", 300), row("Democloud", "2026-10-20", 300), row("Democloud", "2026-11-20", 300)]));
const watch = watchItems(lists, tableItems);

test("email-only subscriptions: one per merchant, not the table's, not a bare sender domain", () => {
  assert.deepEqual(watch.map((item) => item.name), ["Demotube Premium", "Oldmatch"]);
  const tube = watch[0];
  assert.equal(tube.emails, 2);
  assert.equal(tube.lastRenewal, "2026-11-11");
  assert.equal(isCurrent(tube, ASOF), true);
  assert.equal(isCurrent(watch[1], ASOF), false, "no email since May: may have stopped");
  assert.deepEqual(watchDates(tube, "2026-12-01", "2026-12-31", ASOF), ["2026-12-11"]);
  assert.deepEqual(watchDates(watch[1], "2026-12-01", "2026-12-31", ASOF), []);
});

const NEXT_MONTH = { intent: "upcoming_total" as const, merchant: null, amount: null, period: "next month" };

test("next month's total keeps confirmed payments apart from email-only ones, and names the stale ones", () => {
  const { facts, fallback } = factsFor(NEXT_MONTH, tableItems, ASOF, watch);
  assert.equal(facts.total, "₹300");
  assert.deepEqual(facts.seen_only_in_emails_not_confirmed, [{ name: "Demotube Premium", amount: "₹77", date: "11 Dec 2026" }]);
  assert.equal(facts.total_if_these_also_go_out, "₹377");
  assert.deepEqual(facts.older_subscriptions_not_counted, ["Oldmatch, last email 4 May 2026"]);
  assert.match(fallback, /Demotube Premium ₹77 on 11 Dec 2026 may also go out/);
  assert.match(fallback, /₹377/);
  assert.match(fallback, /Not counted: Oldmatch/);
});

test("a question about an email-only subscription is answered, not 'not found'", () => {
  const when = factsFor({ intent: "upcoming_total", merchant: "demotube", amount: null, period: null }, tableItems, ASOF, watch);
  assert.match(when.fallback, /^No confirmed payment is due in the next 30 days\. Demotube Premium ₹77 on 11 Dec 2026 is expected/);
  const status = factsFor({ intent: "mandate_status", merchant: "demotube", amount: null, period: null }, tableItems, ASOF, watch);
  assert.equal(status.facts.found, true);
  assert.equal(status.facts.next_expected, "11 Dec 2026");
  assert.match(status.fallback, /seen only in your emails/);
});

test("'that's wrong' shows every line behind the previous total", () => {
  for (const text of ["the calculation is wrong", "youtube is missing", "how did you get that", "explain"]) assert.ok(CHALLENGE.test(text), text);
  assert.ok(!CHALLENGE.test("how much will go out next month"));
  const reply = explain(factsFor(NEXT_MONTH, tableItems, ASOF, watch));
  assert.match(reply, /^₹300 for December 2026 is Democloud ₹300 on 20 Dec 2026\./);
  assert.match(reply, /Seen only in emails, so not in that total: Demotube Premium ₹77 on 11 Dec 2026\. With it, ₹377\./);
  assert.match(reply, /Rescan last 12 months/);
});

test("a worded total that drops the email-only subscription or a total is not used", () => {
  const { facts } = factsFor(NEXT_MONTH, tableItems, ASOF, watch);
  assert.equal(complete("₹300 goes out in December 2026, for Democloud.", facts), false);
  assert.equal(complete("₹300 goes out in December 2026, for Democloud. Demotube Premium ₹77 may also go out, so ₹377 in all.", facts), true);
  const empty: WatchItem[] = [];
  const plainTotal = factsFor(NEXT_MONTH, tableItems, ASOF, empty).facts;
  assert.equal(complete("₹300 goes out in December 2026.", plainTotal), false, "no payment named");
  assert.equal(complete("₹300 goes out in December 2026, all of it Democloud.", plainTotal), true);
});
