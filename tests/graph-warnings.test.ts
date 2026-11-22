/** Pure helpers behind the live graph warnings: cycle names, next dates, savings, classes. */
import assert from "node:assert/strict";
import test from "node:test";
import { annualPaise, classifyPrice, frequencyOf, headsUp, nextDate, priceAheadWarnings, severityOf, type UpcomingWarning } from "../db/neo4j/warnings";

test("cycle lengths are named, odd ones are 'other'", () => {
  assert.deepEqual([7, 30, 91, 182, 365, 45, null].map(frequencyOf), ["weekly", "monthly", "quarterly", "half-yearly", "yearly", "other", "unknown"]);
});

test("monthly and longer cycles step by calendar month and clamp short months", () => {
  assert.equal(nextDate("2026-10-25", 30), "2026-11-25");
  assert.equal(nextDate("2026-01-31", 31), "2026-02-28");
  assert.equal(nextDate("2026-02-15", 91), "2026-05-15");
  assert.equal(nextDate("2026-03-01", 365), "2027-03-01");
  assert.equal(nextDate("2026-11-20", 7), "2026-11-27");
});

test("annual cost uses the named cycle, else 365 / gap", () => {
  assert.equal(annualPaise(19900, 30), 238800);
  assert.equal(annualPaise(10000, 45), Math.round(10000 * 365 / 45));
  assert.equal(annualPaise(10000, null), null);
});

test("a rise is notified only with a notice; silent needs visible email; else unknown", () => {
  const notice = [{ id: "n", source: "email", kind: "price_change", date: "2026-08-20" }];
  assert.equal(classifyPrice(notice, 0), "NOTIFIED_PRICE_INCREASE");
  assert.equal(classifyPrice([], 2), "POSSIBLE_SILENT_PRICE_INCREASE");
  assert.equal(classifyPrice([], 1), "INSUFFICIENT_EVIDENCE");
  assert.deepEqual([2, 10, 20].map(severityOf), ["low", "medium", "high"]);
});

test("a higher price announced but not yet charged becomes a 'price rise coming' warning with a date", () => {
  const [w] = priceAheadWarnings([{
    subscriptionId: "s1", merchant: "Netflix", latestDate: "2026-11-05", currentPaise: 64900, gaps: [31, 30, 31],
    notice: { id: "e1", source: "email", kind: "price_change", date: "2026-11-18", renewalDate: null, amountPaise: 79900 }
  }], "2026-11-22");
  assert.equal(w.newPaise, 79900);
  assert.equal(w.pctChange, 23.1);
  assert.equal(w.chargeOn, "2026-12-05", "estimated from the monthly cycle");
  assert.equal(w.daysRemaining, 13);
  assert.equal(w.dateConfirmed, false);
});

test("a bank pre-debit notice fixes the date; the heads-up merges it with the due debit and drops far-off ones", () => {
  const priceAhead = priceAheadWarnings([{
    subscriptionId: "s2", merchant: "Spotify", latestDate: "2026-10-24", currentPaise: 11900, gaps: [30],
    notice: { id: "e2", source: "sms", kind: "debit_scheduled", date: "2026-11-21", renewalDate: "2026-11-24", amountPaise: 13900 }
  }], "2026-11-22");
  assert.equal(priceAhead[0].chargeOn, "2026-11-24");
  assert.equal(priceAhead[0].dateConfirmed, true);
  const upcoming = [
    { merchant: "Spotify", subscriptionId: "s2", amountPaise: 13900, expectedOn: "2026-11-24", daysRemaining: 2, frequency: "monthly", confidence: "high", confirmed: true, lateNotice: false, history: [], evidence: [], why: "" },
    { merchant: "HDFC Life", subscriptionId: "s3", amountPaise: 120000, expectedOn: "2026-11-25", daysRemaining: 3, frequency: "monthly", confidence: "high", confirmed: false, lateNotice: false, history: [], evidence: [], why: "" },
    { merchant: "BESCOM", subscriptionId: "s4", amountPaise: 128500, expectedOn: "2026-11-28", daysRemaining: 6, frequency: "monthly", confidence: "medium", confirmed: false, lateNotice: false, history: [], evidence: [], why: "" }
  ] as UpcomingWarning[];
  const alerts = headsUp({ priceAhead, upcoming }, 3);
  assert.deepEqual(alerts.map((a) => `${a.kind}:${a.merchant}`), ["price_rise_ahead:Spotify", "debit_due:HDFC Life"]);
  assert.match(alerts[0].title, /Spotify is going up to ₹139/);
  assert.match(alerts[1].title, /in 3 days/);
});
