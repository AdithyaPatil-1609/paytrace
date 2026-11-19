import "../../scripts/load-env-local";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../db/neo4j/client";
import { ingestLiveEvent, readLiveSummary, LIVE_QUERIES } from "../../db/neo4j/live";
import type { PaymentEvent } from "../../lib/ingestion/event";

test("live graph writes, deduplicates and exposes recurring commitments in a scoped summary", { skip: !hasNeo4jConfig() }, async () => {
  const profile = `test-${randomUUID()}`;
  const event: PaymentEvent = {source:"sms",kind:"debit_posted",merchant:"TEST STREAMING",amountPaise:19900,date:"2026-01-01",reference:"REF123",accountHint:"TEST-1234"};
  const driver = getNeo4jDriver();
  const session = driver.session({ database:neo4jDatabase });
  try {
    const first = await ingestLiveEvent(profile,event);
    assert.equal(first.status,"created");
    assert.equal((await ingestLiveEvent(profile,event)).status,"duplicate");
    assert.equal((await ingestLiveEvent(profile,{...event,source:"email",sourceId:"mail1",accountHint:undefined})).status,"matched");
    assert.equal((await ingestLiveEvent(profile,{...event,source:"email",sourceId:"mail2",reference:"OTHER"})).status,"created");
    // Distinct source, no shared reference: only a candidate, never a new charge.
    assert.equal((await ingestLiveEvent(profile,{...event,date:"2026-02-01",reference:"REF456"})).status,"created");
    assert.equal((await ingestLiveEvent(profile,{...event,source:"email",sourceId:"mail3",date:"2026-02-01",reference:"OTHER2"})).status,"review");
    const registration:PaymentEvent={source:"email",kind:"subscription_registered",merchant:"TEST PLAN",date:"2026-02-02",amountPaise:0,planPricePaise:169407,renewalDate:"2026-03-02",reference:"TESTORDER",sourceId:"registration1"};
    const registered=await ingestLiveEvent(profile,registration);
    assert.equal(registered.status,"recorded");
    assert.equal(registered.paymentId,null);
    assert.equal((await ingestLiveEvent(profile,registration)).status,"duplicate");
    await ingestLiveEvent(profile,{...registration,sourceId:"registration2"});
    const summary = await readLiveSummary(profile);
    assert.equal(summary.counts.payments,3);
    assert.equal(summary.counts.review,1);
    assert.ok(summary.commitments.some(c=>c.merchant==="TEST STREAMING"));
    assert.equal(summary.subscriptionRegistrations.length,1);
    assert.equal(summary.subscriptionRegistrations[0].amount,0);
    assert.equal(summary.subscriptionRegistrations[0].planPrice,1694.07);
    assert.equal(summary.subscriptionRegistrations[0].renewalDate,"2026-03-02");
    assert.ok(!summary.commitments.some(c=>c.merchant==="TEST PLAN"));
    assert.equal((await readLiveSummary(profile+"-other")).subscriptionRegistrations.length,0);
    const evidence = await session.run(LIVE_QUERIES.evidence,{profile,paymentId:first.paymentId});
    assert.equal(evidence.records.length,2);
    assert.equal((await readLiveSummary(profile+"-other")).counts.payments,0);
  } finally {
    // Remove only this test's dedicated graph, not demo or real records.
    await session.run(`MATCH (u:LiveProfile {id:$profile})-[:RECEIVED|HAS_PAYMENT]->(n) OPTIONAL MATCH (n)-[:ABOUT|PAID_TO]->(m:LiveMerchant) WITH collect(DISTINCT n)+collect(DISTINCT m)+collect(DISTINCT u) AS nodes UNWIND nodes AS node DETACH DELETE node`,{profile});
    await session.close(); await driver.close();
  }
});
