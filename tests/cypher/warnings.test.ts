/**
 * Live graph warnings (Phase 3) against a real Neo4j, one fresh made-up
 * profile per scenario. Covers the price, mandate, unused, upcoming and
 * post-cancellation cases from the hackathon brief.
 */
import "../../scripts/load-env-local";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../neo4j/client";
import { ingestLiveEvent } from "../../neo4j/live";
import { readGraphWarnings, recordSubscriptionFact } from "../../neo4j/warnings";
import type { PaymentEvent } from "../../server/ingestion/event";

const skip = !hasNeo4jConfig();
const TODAY = "2026-11-21";
const profiles: string[] = [];
const fresh = () => { const id = `test-warn-${randomUUID()}`; profiles.push(id); return id; };
let seq = 0;
const event = (kind: PaymentEvent["kind"], merchant: string, date: string, amountPaise: number | null, extra: Partial<PaymentEvent> = {}): PaymentEvent =>
  ({ source: "email", kind, merchant, amountPaise, date, reference: null, sourceId: `src-${++seq}`, ...extra } as PaymentEvent);
const debit = (merchant: string, date: string, amountPaise: number, extra: Partial<PaymentEvent> = {}) => event("debit_posted", merchant, date, amountPaise, extra);
async function load(profile: string, events: PaymentEvent[]) { for (const e of events) await ingestLiveEvent(profile, e); }
async function subscriptionId(profile: string, merchant: string) {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try { return String((await session.run("MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s {merchantKey:$merchant}) RETURN s.id", { profile, merchant })).records[0].get(0)); }
  finally { await session.close(); }
}

after(async () => {
  if (skip) return;
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    for (const profile of profiles) await session.run(
      `MATCH (u:LiveProfile {id:$profile}) OPTIONAL MATCH (u)-[*1..2]->(n) WHERE n:LivePayment OR n:LiveEvent OR n:LiveMerchant OR n:LiveSubscription DETACH DELETE n, u`, { profile });
  } finally { await session.close(); await getNeo4jDriver().close(); }
});

test("1-3: a rise below 2% is ignored; exactly 2% and above are warned", { skip }, async () => {
  const profile = fresh();
  await load(profile, [debit("BELOWFLIX", "2026-08-05", 100000), debit("BELOWFLIX", "2026-09-05", 101900),
    debit("EXACTFLIX", "2026-08-05", 100000), debit("EXACTFLIX", "2026-09-05", 102000),
    debit("ABOVEFLIX", "2026-08-05", 49900), debit("ABOVEFLIX", "2026-09-05", 64900)]);
  const { price } = await readGraphWarnings(profile, TODAY);
  assert.deepEqual(price.map((w) => w.merchant).sort(), ["ABOVEFLIX", "EXACTFLIX"]);
  const above = price.find((w) => w.merchant === "ABOVEFLIX")!;
  assert.equal(above.deltaPaise, 15000); assert.equal(above.pctChange, 30.06); assert.equal(above.severity, "high");
  assert.equal(price.find((w) => w.merchant === "EXACTFLIX")!.pctChange, 2);
  assert.ok(above.previous.evidence.length && above.latest.evidence.length, "both payments carry their evidence");
});

test("4-5: a rise with a matching notice is notified; without one it is possibly silent or unknown", { skip }, async () => {
  const profile = fresh();
  await load(profile, [debit("TOLDFLIX", "2026-08-05", 49900), event("price_change", "TOLDFLIX", "2026-08-20", 64900), debit("TOLDFLIX", "2026-09-05", 64900),
    debit("QUIETFLIX", "2026-08-05", 49900), debit("QUIETFLIX", "2026-09-05", 64900),
    debit("SMSFLIX", "2026-08-05", 49900, { source: "sms" }), debit("SMSFLIX", "2026-09-05", 64900, { source: "sms" })]);
  const { price } = await readGraphWarnings(profile, TODAY);
  const by = (m: string) => price.find((w) => w.merchant === m)!;
  assert.equal(by("TOLDFLIX").classification, "NOTIFIED_PRICE_INCREASE");
  assert.equal(by("TOLDFLIX").notices.length, 1);
  assert.equal(by("QUIETFLIX").classification, "POSSIBLE_SILENT_PRICE_INCREASE", "its emails are visible, yet no notice");
  assert.equal(by("SMSFLIX").classification, "INSUFFICIENT_EVIDENCE", "only SMS: no view of its mail");
});

test("6-7: a debit above a verified mandate is a violation; no mandate means the limit stays unknown", { skip }, async () => {
  const profile = fresh();
  await load(profile, [event("mandate_created", "CAPFLIX", "2026-07-01", 50000, { reference: "MNDT1" }),
    debit("CAPFLIX", "2026-08-05", 49900), debit("CAPFLIX", "2026-09-05", 64900),
    debit("OPENFLIX", "2026-08-05", 19900), debit("OPENFLIX", "2026-09-05", 19900)]);
  const { mandate, mandateUnknown } = await readGraphWarnings(profile, TODAY);
  const violation = mandate.find((w) => w.kind === "LIMIT_EXCEEDED")!;
  assert.equal(violation.merchant, "CAPFLIX"); assert.equal(violation.violation, true);
  assert.equal(violation.limitPaise, 50000); assert.equal(violation.amountPaise, 64900); assert.equal(violation.mandateId, "MNDT1");
  assert.ok(!mandate.some((w) => w.merchant === "OPENFLIX"), "no limit is invented");
  assert.deepEqual(mandateUnknown, ["OPENFLIX"]);
});

test("a mandate far above the usual charge is a risk, not a violation", { skip }, async () => {
  const profile = fresh();
  await load(profile, [event("mandate_created", "HIGHFLIX", "2026-07-01", 1500000), debit("HIGHFLIX", "2026-08-05", 19900), debit("HIGHFLIX", "2026-09-05", 19900)]);
  const { mandate } = await readGraphWarnings(profile, TODAY);
  assert.deepEqual(mandate.map((w) => [w.kind, w.violation]), [["HIGH_LIMIT", false]]);
});

test("8-9: verified 90 days unused is warned with savings; no usage record is never called unused", { skip }, async () => {
  const profile = fresh();
  await load(profile, [debit("IDLEFLIX", "2026-09-10", 19900), debit("IDLEFLIX", "2026-10-10", 19900), debit("IDLEFLIX", "2026-11-10", 19900),
    debit("UNKNOWNFLIX", "2026-09-12", 9900), debit("UNKNOWNFLIX", "2026-10-12", 9900), debit("UNKNOWNFLIX", "2026-11-12", 9900)]);
  await readGraphWarnings(profile, TODAY);
  assert.equal(await recordSubscriptionFact(profile, await subscriptionId(profile, "IDLEFLIX"), { usedOn: "2026-07-01" }), true);
  const { unused } = await readGraphWarnings(profile, TODAY);
  const idle = unused.find((w) => w.merchant === "IDLEFLIX")!;
  assert.equal(idle.status, "UNUSED"); assert.equal(idle.daysSinceLastUsage, 143);
  assert.equal(idle.frequency, "monthly"); assert.equal(idle.annualSavingsPaise, 238800);
  const unknown = unused.find((w) => w.merchant === "UNKNOWNFLIX")!;
  assert.equal(unknown.status, "USAGE_UNAVAILABLE"); assert.equal(unknown.annualSavingsPaise, null);
  assert.match(unknown.why, /Usage unavailable/);
});

test("10: a debit due within 7 days is warned, confirmed by a notice or estimated from history", { skip }, async () => {
  const profile = fresh();
  await load(profile, [debit("SOONFLIX", "2026-08-25", 19900), debit("SOONFLIX", "2026-09-25", 19900), debit("SOONFLIX", "2026-10-25", 19900),
    event("debit_scheduled", "SIPFUND", "2026-11-20", 950000, { renewalDate: "2026-11-24" }),
    debit("LATERFLIX", "2026-10-10", 9900), debit("LATERFLIX", "2026-11-10", 9900)]);
  const { upcoming } = await readGraphWarnings(profile, TODAY);
  const soon = upcoming.find((w) => w.merchant === "SOONFLIX")!;
  assert.equal(soon.expectedOn, "2026-11-25"); assert.equal(soon.daysRemaining, 4); assert.equal(soon.confirmed, false);
  assert.equal(soon.frequency, "monthly"); assert.equal(soon.history.length, 3);
  const sip = upcoming.find((w) => w.merchant === "SIPFUND")!;
  assert.equal(sip.confirmed, true); assert.equal(sip.expectedOn, "2026-11-24"); assert.equal(sip.amountPaise, 950000);
  assert.ok(!upcoming.some((w) => w.merchant === "LATERFLIX"), "due 10 Dec, outside the window");
});

test("10b: a debit notice that arrives on the debit day may have come late; one sent days before is fine (card G4)", { skip }, async () => {
  const profile = fresh();
  await load(profile, [
    event("debit_scheduled", "LATEFUND", "2026-11-23", 500000, { source: "sms", renewalDate: "2026-11-23" }),
    event("debit_scheduled", "EARLYFUND", "2026-11-20", 300000, { source: "sms", renewalDate: "2026-11-24" })]);
  const { upcoming, headsUp: alerts } = await readGraphWarnings(profile, TODAY);
  const late = upcoming.find((w) => w.merchant === "LATEFUND")!;
  assert.equal(late.lateNotice, true);
  assert.match(late.why, /This notice may have come late\. Check your other messages and your bank\./);
  assert.doesNotMatch(late.why, /violat/i);
  const early = upcoming.find((w) => w.merchant === "EARLYFUND")!;
  assert.equal(early.lateNotice, false);
  assert.ok(alerts.find((a) => a.merchant === "LATEFUND")!.body.includes("may have come late"));
});

test("11: a payment after an effective cancellation is unexpected; one before it is the final bill", { skip }, async () => {
  const profile = fresh();
  await load(profile, [debit("GONEFLIX", "2026-08-05", 19900), debit("GONEFLIX", "2026-09-05", 19900), debit("GONEFLIX", "2026-10-05", 19900),
    debit("MANDFLIX", "2026-08-05", 9900), event("mandate_cancelled", "MANDFLIX", "2026-08-20", null), debit("MANDFLIX", "2026-09-05", 9900)]);
  await readGraphWarnings(profile, TODAY);
  await recordSubscriptionFact(profile, await subscriptionId(profile, "GONEFLIX"), { cancelRequestedOn: "2026-08-25", cancelEffectiveOn: "2026-09-10", cancelConfirmed: true });
  const { cancellation, upcoming } = await readGraphWarnings(profile, TODAY);
  const gone = cancellation.filter((w) => w.merchant === "GONEFLIX").map((w) => [w.payment.date, w.kind]);
  assert.deepEqual(gone, [["2026-09-05", "FINAL_BILLING"], ["2026-10-05", "UNEXPECTED_AFTER_CANCELLATION"]]);
  const mandate = cancellation.find((w) => w.merchant === "MANDFLIX")!;
  assert.equal(mandate.kind, "UNEXPECTED_AFTER_CANCELLATION"); assert.equal(mandate.cancelledWhat, "mandate");
  assert.equal(mandate.cancellationEvidence.length, 1);
  assert.ok(!upcoming.some((w) => w.merchant === "GONEFLIX"), "no upcoming warning for a cancelled subscription");
});

test("15: two people with the same merchant never see each other's warnings", { skip }, async () => {
  const a = fresh(), b = fresh();
  await load(a, [debit("SHAREDFLIX", "2026-08-05", 49900), debit("SHAREDFLIX", "2026-09-05", 64900)]);
  await load(b, [debit("SHAREDFLIX", "2026-08-05", 49900), debit("SHAREDFLIX", "2026-09-05", 49900)]);
  assert.equal((await readGraphWarnings(a, TODAY)).price.length, 1);
  assert.equal((await readGraphWarnings(b, TODAY)).price.length, 0);
  const other = await subscriptionId(a, "SHAREDFLIX");
  assert.equal(await recordSubscriptionFact(b, other, { usedOn: "2026-01-01" }), false, "B cannot write to A's subscription");
});

test("a price-change notice before the next debit is warned ahead; once the new price is paid it is not", { skip }, async () => {
  const profile = fresh();
  await load(profile, [debit("AHEADFLIX", "2026-09-05", 64900), debit("AHEADFLIX", "2026-10-05", 64900), debit("AHEADFLIX", "2026-11-05", 64900),
    event("price_change", "AHEADFLIX", "2026-11-18", 79900),
    debit("PAIDFLIX", "2026-09-05", 64900), event("price_change", "PAIDFLIX", "2026-09-20", 79900), debit("PAIDFLIX", "2026-10-05", 79900), debit("PAIDFLIX", "2026-11-05", 79900),
    debit("SCHEDFLIX", "2026-09-24", 11900), debit("SCHEDFLIX", "2026-10-24", 11900),
    event("debit_scheduled", "SCHEDFLIX", "2026-11-21", 13900, { source: "sms", renewalDate: "2026-11-24" })]);
  const { priceAhead, headsUp: alerts } = await readGraphWarnings(profile, TODAY);
  const ahead = priceAhead.find((w) => w.merchant === "AHEADFLIX");
  assert.ok(ahead, "the announced rise is warned before it is charged");
  assert.equal(ahead.newPaise, 79900);
  assert.equal(ahead.chargeOn, "2026-12-05");
  assert.ok(!priceAhead.some((w) => w.merchant === "PAIDFLIX"), "already charged at the new price: nothing ahead");
  const sched = priceAhead.find((w) => w.merchant === "SCHEDFLIX");
  assert.ok(sched && sched.chargeOn === "2026-11-24" && sched.dateConfirmed, "a pre-debit notice fixes the date");
  assert.ok(alerts.some((a) => a.kind === "price_rise_ahead" && a.merchant === "SCHEDFLIX"), "due in 3 days: it is a heads-up");
});
