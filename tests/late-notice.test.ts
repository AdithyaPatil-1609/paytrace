/**
 * Plan card G4, the 24-hour notice check: a debit notice that arrives less
 * than 24 hours before the debit says "This notice may have come late". The
 * CSV engine and the Neo4j warnings share one rule and must agree.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SubscriptionWatchlist } from "../web/components/insights/subscription-watchlist";
import { headsUp, priceAheadWarnings, upcomingWarnings } from "../neo4j/warnings";
import { isLateDebitNotice, isLateNotice, LATE_NOTICE_MESSAGE, maxNoticeHours } from "../server/payments/notice-timing";
import { NOTICE_TIMING_LIMITS } from "../server/payments/rules";
import { sandboxView } from "../server/sandbox/dataset";
import type { Sandbox } from "../server/sandbox/store";
import type { NotificationRow } from "../server/payments/types";

const TODAY = "2026-11-22";

test("a notice on the debit day, or after it, is late; the day before is not certain, so it is not flagged", () => {
  assert.equal(NOTICE_TIMING_LIMITS.minNoticeHours, 24);
  assert.equal(maxNoticeHours("2026-11-24", "2026-11-24"), 24);
  assert.equal(maxNoticeHours("2026-11-23", "2026-11-24"), 48);
  assert.equal(isLateNotice("2026-11-24", "2026-11-24"), true, "same day: under 24 hours");
  assert.equal(isLateNotice("2026-11-25", "2026-11-24"), true, "after the debit");
  assert.equal(isLateNotice("2026-11-23", "2026-11-24"), false, "the day before may still be 24 hours");
  assert.equal(isLateNotice("2026-11-20", "2026-11-24"), false);
  assert.equal(isLateNotice("2026-11-24T08:15:00+05:30", "2026-11-24"), true, "a timestamp is read as its day");
  for (const [sent, due] of [[null, "2026-11-24"], ["2026-11-24", null], ["2026-11-24", undefined], ["", ""], ["soon", "2026-11-24"]] as const)
    assert.equal(isLateNotice(sent, due), false, "no readable date: say nothing");
});

test("the message is the plan's words and never says 'violation'", () => {
  assert.equal(LATE_NOTICE_MESSAGE, "This notice may have come late. Check your other messages and your bank.");
  assert.doesNotMatch(LATE_NOTICE_MESSAGE, /violat/i);
});

test("only debit and renewal notices with a stated date are checked", () => {
  const row = (eventType: string, sentOn: string, renewalDate?: string) => ({ eventType, sentOn, renewalDate });
  assert.equal(isLateDebitNotice(row("debit_scheduled", "2026-11-24", "2026-11-24")), true);
  assert.equal(isLateDebitNotice(row("subscription_renewal", "2026-11-24", "2026-11-24")), true);
  assert.equal(isLateDebitNotice(row("debit_scheduled", "2026-11-24")), false, "no due date");
  assert.equal(isLateDebitNotice(row("subscription_registered", "2026-11-24", "2026-11-24")), false);
});

// The same four notices, as the graph query returns them and as CSV notification rows.
const NOTICES = [
  { merchant: "LATEFLIX", sentOn: "2026-11-24", dueOn: "2026-11-24", amountPaise: 19900 },
  { merchant: "ONTIMEFLIX", sentOn: "2026-11-21", dueOn: "2026-11-25", amountPaise: 9900 },
  { merchant: "EDGEFLIX", sentOn: "2026-11-23", dueOn: "2026-11-24", amountPaise: 14900 },
  { merchant: "UNDATEDFLIX", sentOn: "2026-11-23", dueOn: null, amountPaise: 4900 }
];
const graphRows = NOTICES.map((x, i) => ({ merchantKey: x.merchant, merchant: x.merchant, day: x.dueOn ?? x.sentOn, sentOn: x.sentOn, dueOn: x.dueOn, amountPaise: x.amountPaise, frequency: null,
  evidence: { id: `e${i}`, source: "sms", kind: "debit_scheduled", date: x.sentOn } }));
const csvRows: NotificationRow[] = NOTICES.map((x, i) => ({ noticeId: `e${i}`, sentOn: x.sentOn, channel: "sms", sender: "sms", eventType: "debit_scheduled", brand: x.merchant, amount: x.amountPaise / 100, ...(x.dueOn ? { renewalDate: x.dueOn } : {}), text: "Scheduled" }));

test("the Neo4j warnings and the CSV engine flag the same notices", () => {
  const upcoming = upcomingWarnings([], graphRows, TODAY, "2026-11-29");
  const graphLate = upcoming.filter((w) => w.lateNotice).map((w) => w.merchant).sort();
  const csvLate = csvRows.filter(isLateDebitNotice).map((r) => r.brand).sort();
  assert.deepEqual(graphLate, ["LATEFLIX"]);
  assert.deepEqual(csvLate, graphLate);
  const late = upcoming.find((w) => w.merchant === "LATEFLIX")!;
  assert.ok(late.why.endsWith(LATE_NOTICE_MESSAGE));
  for (const w of upcoming.filter((x) => x.merchant !== "LATEFLIX")) assert.ok(!w.why.includes(LATE_NOTICE_MESSAGE), w.merchant);
});

test("an estimated date is never called late, and the heads-up carries the message", () => {
  const cycle = { subscriptionId: "s1", merchant: "CYCLEFLIX", merchantKey: "CYCLEFLIX", latestDate: "2026-10-23", amountPaise: 19900, gaps: [31, 30, 31],
    history: [{ date: "2026-10-23", amountPaise: 19900 }] };
  const upcoming = upcomingWarnings([cycle], graphRows, TODAY, "2026-11-29");
  assert.equal(upcoming.find((w) => w.merchant === "CYCLEFLIX")!.lateNotice, false);
  const alerts = headsUp({ priceAhead: [], upcoming }, 3);
  assert.ok(alerts.find((a) => a.merchant === "LATEFLIX")!.body.endsWith(LATE_NOTICE_MESSAGE));
  assert.ok(!alerts.find((a) => a.merchant === "EDGEFLIX")!.body.includes(LATE_NOTICE_MESSAGE));
});

test("a late pre-debit notice with a higher amount is flagged on the price-rise warning too", () => {
  const row = (date: string) => ({ subscriptionId: "s2", merchant: "Spotify", latestDate: "2026-10-24", currentPaise: 11900, gaps: [30],
    notice: { id: "e2", source: "sms", kind: "debit_scheduled", date, renewalDate: "2026-11-24", amountPaise: 13900 } });
  const [late] = priceAheadWarnings([row("2026-11-24")], TODAY);
  const [early] = priceAheadWarnings([row("2026-11-21")], TODAY);
  assert.equal(late.lateNotice, true); assert.ok(late.why.endsWith(LATE_NOTICE_MESSAGE));
  assert.equal(early.lateNotice, false); assert.ok(!early.why.includes(LATE_NOTICE_MESSAGE));
  assert.ok(headsUp({ priceAhead: [late], upcoming: [] }, 3)[0].body.endsWith(LATE_NOTICE_MESSAGE));
  const [estimated] = priceAheadWarnings([{ ...row("2026-11-24"), notice: { ...row("2026-11-24").notice, kind: "price_change", renewalDate: null } }], TODAY);
  assert.equal(estimated.lateNotice, false, "no announced date: nothing to compare");
});

test("the dashboard's scheduled-debit list shows the message only for the late notice", () => {
  const html = renderToStaticMarkup(createElement(SubscriptionWatchlist, { asOf: TODAY, registrations: [], scheduled: csvRows }));
  assert.equal(html.split(LATE_NOTICE_MESSAGE).length - 1, 1);
});

test("the sandbox alert for a same-day debit SMS says the notice may have come late", () => {
  const sms = (n: number, receivedOn: string, due: string, merchant: string) => ({ n, receivedOn, channel: "sms" as const, sender: "AX-ARCBNK", text: "NACH debit", key: `k${n}`,
    event: { source: "sms" as const, kind: "debit_scheduled" as const, merchant, amountPaise: 120000, date: due, reference: null } });
  const box: Sandbox = { id: "b", created: 0, touched: 0, counter: 2, log: [], events: [sms(1, "2026-11-24", "2026-11-24", "HDFC LIFE"), sms(2, "2026-11-20", "2026-11-24", "LIC")] };
  const upcoming = sandboxView(box).alerts.filter((a) => a.kind === "upcoming");
  assert.equal(upcoming.length, 2);
  assert.ok(upcoming.find((a) => a.n === 1)!.detail.endsWith(LATE_NOTICE_MESSAGE));
  assert.ok(!upcoming.find((a) => a.n === 2)!.detail.includes(LATE_NOTICE_MESSAGE));
});
