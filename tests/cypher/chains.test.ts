/**
 * Payment chains (Phase 2) on a real Neo4j, with made-up payments only:
 * order, gapDays and deltaPaise, an older payment arriving later, repeated
 * syncs, a Gmail and SMS copy of one debit, and two people with one merchant.
 */
import "../../scripts/load-env-local";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../db/neo4j/client";
import { ingestLiveEvent } from "../../db/neo4j/live";
import { ensureChains } from "../../db/neo4j/chains";
import type { PaymentEvent } from "../../lib/ingestion/event";

const skip = !hasNeo4jConfig();
const profiles: string[] = [];
const fresh = () => { const id = `test-chain-${randomUUID()}`; profiles.push(id); return id; };
const debit = (merchant: string, date: string, amountPaise: number, extra: Partial<PaymentEvent> = {}): PaymentEvent =>
  ({ source: "email", kind: "debit_posted", merchant, amountPaise, date, reference: `REF${date.replaceAll("-", "")}${amountPaise}`, sourceId: `${merchant}-${date}-${amountPaise}`, ...extra });

async function chain(profile: string, merchant = "TESTFLIX") {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const rows = await session.run(
      `MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription {merchantKey:$key})-[:FIRST]->(f)
       MATCH path = (f)-[:NEXT*0..]->(last) WHERE NOT (last)-[:NEXT]->()
       MATCH (s)-[:LATEST]->(latest)
       RETURN [p IN nodes(path) | p.date] AS dates, [r IN relationships(path) | [r.gapDays, r.deltaPaise, r.pctChange]] AS links,
              latest.date AS latest, COUNT { (s)-[:FIRST]->() } AS firsts, COUNT { (s)-[:LATEST]->() } AS latests`,
      { profile, key: merchant }
    );
    const r = rows.records[0];
    return r ? { dates: r.get("dates"), links: r.get("links").map((l: unknown[]) => l.map(Number)), latest: r.get("latest"), firsts: Number(r.get("firsts")), latests: Number(r.get("latests")) } : null;
  } finally { await session.close(); }
}

async function count(query: string, params: Record<string, unknown>) {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try { return Number((await session.run(query, params)).records[0].get(0)); } finally { await session.close(); }
}

after(async () => {
  if (skip) return;
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    for (const profile of profiles) await session.run(
      `MATCH (u:LiveProfile {id:$profile}) OPTIONAL MATCH (u)-[*1..2]->(n) WHERE n:LivePayment OR n:LiveEvent OR n:LiveMerchant OR n:LiveSubscription DETACH DELETE n, u`,
      { profile });
  } finally { await session.close(); await getNeo4jDriver().close(); }
});

test("a chain runs FIRST to LATEST in date order with gapDays and deltaPaise", { skip }, async () => {
  const profile = fresh();
  await ingestLiveEvent(profile, debit("TESTFLIX", "2026-01-01", 49900));
  await ingestLiveEvent(profile, debit("TESTFLIX", "2026-02-01", 64900));
  await ingestLiveEvent(profile, debit("TESTFLIX", "2026-03-01", 64900));
  assert.equal(await ensureChains(profile, "2026-03-10"), true);
  const c = await chain(profile);
  assert.deepEqual(c?.dates, ["2026-01-01", "2026-02-01", "2026-03-01"]);
  assert.deepEqual(c?.links, [[31, 15000, 30.06], [28, 0, 0]]);
  assert.equal(c?.latest, "2026-03-01");
  assert.equal(c?.firsts, 1); assert.equal(c?.latests, 1);
});

test("an older payment from a later sync is placed in order, and rebuilding twice changes nothing", { skip }, async () => {
  const profile = fresh();
  await ingestLiveEvent(profile, debit("TESTFLIX", "2026-02-01", 49900));
  await ingestLiveEvent(profile, debit("TESTFLIX", "2026-03-01", 49900));
  await ensureChains(profile, "2026-03-10");
  await ingestLiveEvent(profile, debit("TESTFLIX", "2026-01-01", 49900));
  await ingestLiveEvent(profile, debit("TESTFLIX", "2026-01-01", 49900)); // same email synced again
  assert.equal(await ensureChains(profile, "2026-03-10"), true);
  assert.equal(await ensureChains(profile, "2026-03-10"), false, "nothing changed, nothing rebuilt");
  await ensureChains(profile, "2026-03-10", true);
  const c = await chain(profile);
  assert.deepEqual(c?.dates, ["2026-01-01", "2026-02-01", "2026-03-01"]);
  assert.equal(await count("MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment) RETURN count(p)", { profile }), 3);
  assert.equal(await count("MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(:LivePayment)-[r:NEXT]->() RETURN count(r)", { profile }), 2);
  assert.equal(await count("MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s) RETURN count(s)", { profile }), 1);
});

test("a Gmail and an SMS copy of one debit are one payment with two pieces of evidence", { skip }, async () => {
  const profile = fresh();
  await ingestLiveEvent(profile, debit("TESTFLIX", "2026-01-01", 49900, { reference: "UPI633012345678", sourceId: "mail-1" }));
  await ingestLiveEvent(profile, debit("TESTFLIX", "2026-01-01", 49900, { source: "sms", reference: "UPI633012345678", sourceId: "sms-1" }));
  await ensureChains(profile, "2026-01-10");
  assert.equal(await count("MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment) RETURN count(p)", { profile }), 1);
  assert.equal(await count("MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(:LivePayment)-[:EVIDENCED_BY]->(e) RETURN count(e)", { profile }), 2);
  assert.deepEqual((await chain(profile))?.dates, ["2026-01-01"]);
});

test("two people paying the same merchant get separate chains that never touch", { skip }, async () => {
  const a = fresh(), b = fresh();
  for (const [profile, amount] of [[a, 49900], [b, 19900]] as const) {
    await ingestLiveEvent(profile, debit("TESTFLIX", "2026-01-01", amount));
    await ingestLiveEvent(profile, debit("TESTFLIX", "2026-02-01", amount));
    await ensureChains(profile, "2026-02-10");
  }
  assert.deepEqual((await chain(a))?.links, [[31, 0, 0]]);
  assert.deepEqual((await chain(b))?.links, [[31, 0, 0]]);
  assert.equal(await count(
    `MATCH (p:LivePayment)-[:NEXT]->(q:LivePayment) WHERE p.profile IN $ids AND p.profile <> q.profile RETURN count(*)`, { ids: [a, b] }), 0);
  assert.equal(await count(
    `MATCH (s:LiveSubscription)-[:FIRST|LATEST]->(p:LivePayment) WHERE s.profile IN $ids AND s.profile <> p.profile RETURN count(*)`, { ids: [a, b] }), 0);
});
