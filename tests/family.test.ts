/**
 * Family View sharing rules that need no database: the allowlist of fields a
 * viewer may see, the totals, and the shape of an invite token.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { familyAlerts, familyPayments, familyTotals, firstName } from "../lib/accounts/family";
import type { CancelWarning, Evidence, MandateWarning, PaymentRef, PriceAheadWarning, PriceWarning, UnusedWarning, UpcomingWarning } from "../db/neo4j/warnings";
import { Token } from "../lib/accounts/family-route";
import { randomToken } from "../lib/accounts/security";
import { detectCommitments } from "../lib/payments/engine";
import { loadFixtures } from "../data/fixtures";

test("a viewer gets only the allowlisted fields, never descriptors, accounts or evidence", () => {
  const commitments = detectCommitments(loadFixtures());
  assert.ok(commitments.length > 0);
  const shared = familyPayments(commitments);
  for (const row of shared) assert.deepEqual(Object.keys(row).sort(), ["amount", "annualCost", "cadence", "merchant", "nextCharge", "product", "spendGroup"]);
  const text = JSON.stringify(shared);
  for (const c of commitments) {
    for (const e of c.evidenceRows) assert.ok(!text.includes(e.account) || e.account === "", "no account ids");
    if (c.rawNarration !== c.merchant) assert.ok(!text.includes(`"${c.rawNarration}"`), "no raw bank descriptors");
  }
});

test("totals add the yearly cost and round the monthly share", () => {
  const rows = [{ merchant: "A", product: "a", cadence: "monthly" as const, amount: 100, annualCost: 1200, nextCharge: null, spendGroup: "subscriptions" as const }, { merchant: "B", product: "b", cadence: "annual" as const, amount: 999, annualCost: 999, nextCharge: null, spendGroup: "subscriptions" as const }];
  assert.deepEqual(familyTotals(rows), { count: 2, annual: 2199, monthly: 183 });
});

test("only a first name is shown to the other person", () => {
  assert.equal(firstName("Asha Rao Kumar"), "Asha");
  assert.equal(firstName(""), "Paytrace user");
  assert.equal(firstName(null), "Paytrace user");
});

test("invite tokens are 32 random bytes and anything else is refused before the database", () => {
  assert.ok(Token.safeParse(randomToken()).success);
  for (const bad of ["", "short", "x".repeat(44), "a".repeat(42) + "=", "../../etc/passwd" + "a".repeat(30)]) assert.equal(Token.safeParse(bad).success, false, bad);
});

const proof: Evidence = { id: "msg-SECRET-1", source: "email", kind: "debit_posted", date: "2026-10-05", sourceTrust: "verified_origin", trustReason: "DKIM pass" };
const paid = (date: string, amountPaise: number): PaymentRef => ({ id: `pay-SECRET-${date}`, date, amountPaise, evidence: [proof], sources: ["email"], corroborated: false });
const warnings = {
  price: [
    { subscriptionId: "sub-SECRET-1", merchant: "QUIETFLIX", previous: paid("2026-09-05", 49900), latest: paid("2026-10-05", 64900), deltaPaise: 15000, pctChange: 30.06, gapDays: 30, classification: "POSSIBLE_SILENT_PRICE_INCREASE", notices: [], severity: "high", why: "Your own words for the owner" },
    { subscriptionId: "sub-SECRET-2", merchant: "TOLDFLIX", previous: paid("2026-09-05", 49900), latest: paid("2026-10-05", 64900), deltaPaise: 15000, pctChange: 30.06, gapDays: 30, classification: "NOTIFIED_PRICE_INCREASE", notices: [proof], severity: "high", why: "x" },
    { subscriptionId: "sub-SECRET-3", merchant: "SMSFLIX", previous: paid("2026-09-05", 49900), latest: paid("2026-10-05", 64900), deltaPaise: 15000, pctChange: 30.06, gapDays: 30, classification: "INSUFFICIENT_EVIDENCE", notices: [], severity: "high", why: "x" }
  ] satisfies PriceWarning[],
  priceAhead: [{ subscriptionId: "sub-SECRET-4", merchant: "RISEFLIX", currentPaise: 19900, lastPaidOn: "2026-10-25", newPaise: 24900, pctChange: 25.13, chargeOn: "2026-11-25", daysRemaining: 3, dateConfirmed: true, lateNotice: false, evidence: [proof], why: "x" }] satisfies PriceAheadWarning[],
  mandate: [
    { subscriptionId: "sub-SECRET-5", merchant: "CAPFLIX", kind: "LIMIT_EXCEEDED", violation: true, mandateId: "MNDT-SECRET", limitPaise: 50000, status: "active", createdOn: "2026-07-01", cancelledOn: null, typicalPaise: 49900, amountPaise: 64900, date: "2026-09-05", evidence: [proof], why: "x" },
    { subscriptionId: "sub-SECRET-5", merchant: "CAPFLIX", kind: "HIGH_LIMIT", violation: false, mandateId: "MNDT-SECRET", limitPaise: 500000, status: "active", createdOn: "2026-07-01", cancelledOn: null, typicalPaise: 49900, amountPaise: 49900, date: null, evidence: [proof], why: "x" }
  ] satisfies MandateWarning[],
  unused: [
    { subscriptionId: "sub-SECRET-6", merchant: "IDLEGYM", status: "UNUSED", lastVerifiedUsageAt: "2026-06-01", usageSource: "user_confirmed", usageEvidenceId: "use-SECRET", usageCoverage: "user_confirmed", daysSinceLastUsage: 174, amountPaise: 150000, frequency: "monthly", annualSavingsPaise: 1800000, why: "x" },
    { subscriptionId: "sub-SECRET-7", merchant: "MAYBEFLIX", status: "USAGE_UNAVAILABLE", lastVerifiedUsageAt: null, usageSource: null, usageEvidenceId: null, usageCoverage: null, daysSinceLastUsage: null, amountPaise: 19900, frequency: "monthly", annualSavingsPaise: null, why: "x" }
  ] satisfies UnusedWarning[],
  cancellation: [
    { subscriptionId: "sub-SECRET-8", merchant: "GONEFLIX", kind: "UNEXPECTED_AFTER_CANCELLATION", cancelledWhat: "subscription", requestedOn: "2026-08-25", effectiveOn: "2026-09-10", payment: paid("2026-10-05", 19900), cancellationEvidence: [proof], why: "x" },
    { subscriptionId: "sub-SECRET-8", merchant: "GONEFLIX", kind: "FINAL_BILLING", cancelledWhat: "subscription", requestedOn: "2026-08-25", effectiveOn: "2026-09-10", payment: paid("2026-09-05", 19900), cancellationEvidence: [proof], why: "x" }
  ] satisfies CancelWarning[],
  upcoming: [
    { merchant: "RISEFLIX", subscriptionId: "sub-SECRET-4", amountPaise: 19900, expectedOn: "2026-11-25", daysRemaining: 3, frequency: "monthly", confidence: "high", confirmed: false, history: [], lateNotice: false, evidence: [], why: "x" },
    { merchant: "SIPFUND", subscriptionId: null, amountPaise: 950000, expectedOn: "2026-11-23", daysRemaining: 1, frequency: "monthly", confidence: "high", confirmed: true, history: [], lateNotice: true, evidence: [proof], why: "x" },
    { merchant: "LATERFLIX", subscriptionId: null, amountPaise: 9900, expectedOn: "2026-11-28", daysRemaining: 6, frequency: "monthly", confidence: "high", confirmed: false, history: [], lateNotice: false, evidence: [], why: "x" }
  ] satisfies UpcomingWarning[]
};

test("a viewer sees the warnings that matter, most urgent first, in plain words", () => {
  const alerts = familyAlerts(warnings);
  assert.deepEqual(alerts.map(a => [a.level, a.kind, a.merchant]), [
    ["review", "over_limit", "CAPFLIX"],
    ["review", "charged_after_cancel", "GONEFLIX"],
    ["review", "silent_rise", "QUIETFLIX"],
    ["soon", "debit_due", "SIPFUND"],
    ["soon", "price_rise_ahead", "RISEFLIX"],
    ["note", "unused", "IDLEGYM"],
    ["note", "price_rise", "TOLDFLIX"]
  ]);
  const by = (kind: string) => alerts.find(a => a.kind === kind)!;
  assert.equal(by("charged_after_cancel").title, "GONEFLIX charged after it was cancelled");
  assert.match(by("charged_after_cancel").detail, /after the subscription was cancelled on 2026-09-10.*not proof of fraud/);
  assert.match(by("silent_rise").detail, /No price-change message was found/);
  assert.match(by("price_rise_ahead").detail, /taken on 2026-11-25/);
  assert.match(by("debit_due").title, /tomorrow$/);
  assert.match(by("debit_due").detail, /may have been missed/, "a late notice is called out");
  assert.match(by("unused").detail, /174 days.* a month\. Stopping it would save about/);
});

test("a viewer's warnings skip guesses and the owner's private details", () => {
  const alerts = familyAlerts(warnings);
  assert.ok(!alerts.some(a => a.merchant === "SMSFLIX"), "a rise with too little evidence is not shown");
  assert.ok(!alerts.some(a => a.merchant === "MAYBEFLIX"), "unknown usage is not called unused");
  assert.ok(!alerts.some(a => a.merchant === "LATERFLIX"), "debits further out than the heads-up window wait");
  assert.equal(alerts.filter(a => a.merchant === "RISEFLIX").length, 1, "a price rise ahead is not also a plain debit due");
  assert.equal(alerts.filter(a => a.merchant === "GONEFLIX").length, 1, "a final bill is not a warning");
  assert.equal(alerts.filter(a => a.merchant === "CAPFLIX").length, 1, "a high limit alone is not shown");
  for (const a of alerts) assert.deepEqual(Object.keys(a).sort(), ["date", "detail", "kind", "level", "merchant", "title"]);
  const text = JSON.stringify(alerts);
  assert.ok(!text.includes("SECRET"), "no evidence, payment, mandate, usage or subscription ids");
  assert.ok(!/\byour\b/i.test(text), "never the owner's own wording");
  assert.deepEqual(familyAlerts({ price: [], priceAhead: [], mandate: [], unused: [], cancellation: [], upcoming: [] }), []);
});
