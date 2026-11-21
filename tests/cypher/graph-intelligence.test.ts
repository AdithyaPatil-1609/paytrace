/**
 * Tasks 2-6 on a real, throwaway Neo4j with made-up people and payments only:
 * SIMILAR merchant links, source trust, cross-source de-duplication, the
 * Cypher metadata shown to the person, and that none of it crosses accounts.
 */
import "../../scripts/load-env-local";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../db/neo4j/client";
import { ingestLiveEvent } from "../../db/neo4j/live";
import { ensureChains } from "../../db/neo4j/chains";
import { decideSimilarLink, readSimilarLinks, refreshSimilarLinksFor } from "../../db/neo4j/merchant-links";
import { readEvidenceTrust } from "../../db/neo4j/evidence-trust";
import { readGraphWarnings, WARNING_QUERIES } from "../../db/neo4j/warnings";
import { createSession } from "../../db/neo4j/accounts";
import { deleteAllUserData } from "../../db/neo4j/delete-user";
import { profileFor, SESSION } from "../../lib/accounts/security";
import { emailProvenance, LEGACY_REASON, smsProvenance, statementProvenance } from "../../lib/ingestion/trust";
import type { PaymentEvent } from "../../lib/ingestion/event";

const skip = !hasNeo4jConfig();
const TODAY = "2026-11-21";
const profiles: string[] = [];
const subs: string[] = [];
const fresh = () => { const id = `test-intel-${randomUUID()}`; profiles.push(id); return id; };
let seq = 0;
const debit = (merchant: string, date: string, amountPaise: number, extra: Partial<PaymentEvent> = {}): PaymentEvent =>
  ({ source: "email", kind: "debit_posted", merchant, amountPaise, date, reference: null, sourceId: `src-${++seq}`, ...extra });

async function one(query: string, params: Record<string, unknown>) {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try { return (await session.run(query, params)).records.map(r => r.toObject()); } finally { await session.close(); }
}
const count = async (query: string, params: Record<string, unknown>) => Number(Object.values((await one(query, params))[0])[0]);
const payments = (profile: string) => count("MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment) RETURN count(p)", { profile });

after(async () => {
  if (skip) return;
  for (const sub of subs) await deleteAllUserData(sub, profileFor(sub)).catch(() => undefined);
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    for (const profile of profiles) await session.run(
      `MATCH (u:LiveProfile {id:$profile}) OPTIONAL MATCH (u)-[*1..2]->(n) WHERE n:LivePayment OR n:LiveEvent OR n:LiveMerchant OR n:LiveSubscription DETACH DELETE n, u`, { profile });
  } finally { await session.close(); await getNeo4jDriver().close(); }
});

test("SIMILAR links two of one person's merchants once, ordered, with score, method and reason", { skip }, async () => {
  const profile = fresh();
  await ingestLiveEvent(profile, debit("ZEPHYR MUSIC", "2026-09-01", 9900));
  await ingestLiveEvent(profile, debit("POS ZEPHYR MUSIC STOCKHOLM", "2026-10-01", 9900));
  await ingestLiveEvent(profile, debit("CORNER BAKERY", "2026-10-02", 25000));
  await ensureChains(profile, TODAY, true);
  await ensureChains(profile, TODAY, true);
  await refreshSimilarLinksFor(profile);
  const links = await readSimilarLinks(profile);
  assert.equal(links.length, 1, "one link, however often it is rebuilt");
  const [link] = links;
  assert.ok(link.a.id < link.b.id);
  assert.deepEqual([link.a.name, link.b.name].sort(), ["POS ZEPHYR MUSIC STOCKHOLM", "ZEPHYR MUSIC"]);
  assert.equal(link.status, "candidate");
  assert.equal(link.band, "strong");
  assert.ok(link.score >= 0.9 && link.score <= 1);
  assert.equal(link.method, "word_overlap");
  assert.ok(link.reason.length > 0 && link.algorithmVersion === "merchant-match-v1" && link.detectedAt);
  assert.equal(await count("MATCH (m:LiveMerchant)-[r:SIMILAR]->(m) RETURN count(r)", {}), 0, "no self-links anywhere");
  assert.equal(await payments(profile), 3, "a SIMILAR link never merges payments");
});

test("a decision sticks across rebuilds, and only the owner can make it", { skip }, async () => {
  const owner = fresh(), other = fresh();
  for (const p of [owner, other]) {
    await ingestLiveEvent(p, debit("ORBIT CLOUD", "2026-09-01", 9900));
    await ingestLiveEvent(p, debit("ORBIT CLOUD STORAGE", "2026-10-01", 9900));
    await ensureChains(p, TODAY, true);
  }
  const [link] = await readSimilarLinks(owner);
  assert.equal(await decideSimilarLink(other, link.a.id, link.b.id, "rejected"), false, "another person cannot decide on my link");
  assert.equal(await decideSimilarLink(owner, link.b.id, link.a.id, "rejected"), true, "order of ids does not matter");
  await ensureChains(owner, TODAY, true);
  assert.equal((await readSimilarLinks(owner))[0].status, "rejected", "a rebuild never resets a decision");
  assert.equal((await readSimilarLinks(other))[0].status, "candidate");
});

test("SIMILAR never connects two people, even with identical merchant names", { skip }, async () => {
  const a = fresh(), b = fresh();
  await ingestLiveEvent(a, debit("NIMBUS FIT", "2026-09-01", 50000));
  await ingestLiveEvent(b, debit("NIMBUS FIT CLUB", "2026-09-01", 50000));
  await ensureChains(a, TODAY, true); await ensureChains(b, TODAY, true);
  assert.equal((await readSimilarLinks(a)).length, 0);
  assert.equal((await readSimilarLinks(b)).length, 0);
  assert.equal(await count(`MATCH (pa:LiveProfile)-[:RECEIVED]->(:LiveEvent)-[:ABOUT]->(x:LiveMerchant)-[:SIMILAR]-(y:LiveMerchant)<-[:ABOUT]-(:LiveEvent)<-[:RECEIVED]-(pb:LiveProfile)
    WHERE pa <> pb AND NOT EXISTS { (pa)-[:RECEIVED]->(:LiveEvent)-[:ABOUT]->(y) } RETURN count(*)`, {}), 0, "no SIMILAR link anywhere joins two profiles");
});

test("trust is stored per event from the real check, never upgraded by a later copy", { skip }, async () => {
  const profile = fresh();
  const mail = debit("TESTFLIX", "2026-10-05", 49900, { reference: "UPI633011112222", sourceId: "mail-trust-1" });
  await ingestLiveEvent(profile, mail, undefined, emailProvenance("unknown"));
  await ingestLiveEvent(profile, mail, undefined, emailProvenance("pass"));
  await ingestLiveEvent(profile, { ...mail, source: "sms", sourceId: "sms-trust-1" }, undefined, smsProvenance("signed_device"));
  await ingestLiveEvent(profile, debit("TESTFLIX", "2026-09-05", 49900, { source: "statement", sourceId: "stmt-trust-1" }), undefined, statementProvenance());
  const levels = await one("MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent) RETURN e.source AS source, e.sourceTrust AS trust, e.verificationMethod AS method ORDER BY source", { profile });
  assert.deepEqual(levels.map(r => [r.source, r.trust, r.method]), [
    ["email", "unverified", "none"],
    ["sms", "authenticated_source", "device_signature"],
    ["statement", "user_provided", "user_upload"]
  ]);
  assert.equal(await payments(profile), 2, "the email and SMS copies of one debit are one payment");
  const trust = await readEvidenceTrust(profile);
  assert.equal(trust.corroborated.length, 1);
  assert.deepEqual(trust.corroborated[0].sources, ["email", "sms"]);
  assert.ok(trust.runs.every(r => r.ok));
});

test("older records with no level read as not verified", { skip }, async () => {
  const profile = fresh();
  await ingestLiveEvent(profile, debit("OLDSTREAM", "2026-08-01", 19900), undefined, emailProvenance("pass"));
  await ingestLiveEvent(profile, debit("OLDSTREAM", "2026-09-01", 19900));
  await ingestLiveEvent(profile, debit("OLDSTREAM", "2026-10-01", 21900));
  await one("MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent) WHERE e.date >= '2026-09-01' REMOVE e.sourceTrust, e.trustReason", { profile });
  const warnings = await readGraphWarnings(profile, TODAY);
  const rise = warnings.price.find(w => w.merchant === "OLDSTREAM");
  assert.ok(rise, "the 10% rise is warned");
  assert.equal(rise.latest.evidence[0].sourceTrust, "unverified");
  assert.equal(rise.latest.evidence[0].trustReason, LEGACY_REASON);
  assert.deepEqual((await readEvidenceTrust(profile)).bySource.map(r => r.trust).sort(), ["legacy", "verified_origin"]);
});

test("repeated Gmail syncs, ambiguous matches and real repeats", { skip }, async () => {
  const profile = fresh();
  const mail = debit("STREAMBOX", "2026-10-10", 29900, { reference: "UPI633099990000", sourceId: "gmail-msg-1" });
  assert.equal((await ingestLiveEvent(profile, mail)).status, "created");
  for (let i = 0; i < 3; i++) assert.equal((await ingestLiveEvent(profile, mail)).status, "duplicate", "the same Gmail message again");
  assert.equal(await payments(profile), 1);

  // Two SMS debits, same merchant, day and amount, different references: two real payments.
  await ingestLiveEvent(profile, debit("COFFEEHUT", "2026-10-11", 15000, { source: "sms", reference: "UPI1111", sourceId: "sms-c1" }));
  await ingestLiveEvent(profile, debit("COFFEEHUT", "2026-10-11", 15000, { source: "sms", reference: "UPI2222", sourceId: "sms-c2" }));
  // An email with no reference could be either one: held for review, not merged.
  const review = await ingestLiveEvent(profile, debit("COFFEEHUT", "2026-10-11", 15000, { sourceId: "mail-c" }));
  assert.equal(review.status, "review");
  assert.equal(review.paymentId, null);
  assert.equal(await count("MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent {status:'review'})-[:POSSIBLE_MATCH]->(p:LivePayment) RETURN count(p)", { profile }), 2);

  // Two identical statement lines (two real coffees) stay two payments.
  await ingestLiveEvent(profile, debit("TEA STALL", "2026-10-12", 2000, { source: "statement", sourceId: "stmt-t1" }));
  await ingestLiveEvent(profile, debit("TEA STALL", "2026-10-12", 2000, { source: "statement", sourceId: "stmt-t2" }));
  assert.equal(await count("MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment {merchantKey:'TEASTALL'}) RETURN count(p)", { profile }), 2);
});

test("the Cypher shown is the Cypher that ran, with counts and no private values", { skip }, async () => {
  const profile = fresh();
  for (const [date, amount] of [["2026-07-01", 10000], ["2026-08-01", 10000], ["2026-09-01", 10500]] as const) await ingestLiveEvent(profile, debit("METERFLIX", date, amount));
  const warnings = await readGraphWarnings(profile, TODAY);
  assert.deepEqual(warnings.queries.map(q => q.key), WARNING_QUERIES.map(q => q.key));
  assert.ok(warnings.queries.every(q => q.ok));
  assert.equal(warnings.incomplete, false);
  const price = warnings.queries.find(q => q.key === "price")!;
  assert.equal(price.cypher, WARNING_QUERIES[0].cypher);
  assert.equal(price.rows, 1);
  assert.equal(price.warnings, 1);
  assert.equal(price.records[0].merchant, "METERFLIX");
  assert.equal(price.settings.priceRisePct, 2);
  assert.ok(price.parameters.includes("profile") && !("profile" in price.settings));
  assert.ok(!JSON.stringify(warnings.queries).includes(profile), "the profile id is never sent to the browser");
});

test("routes take the person from the session: a changed profile id or another person's merchant gets nothing", { skip }, async () => {
  Object.assign(process.env, { GOOGLE_WEB_CLIENT_ID: "test-client", GOOGLE_WEB_CLIENT_SECRET: "test-secret", PAYTRACE_APP_URL: "http://localhost:3000", PAYTRACE_AUTH_KEY: "ab".repeat(32) });
  const { GET } = await import("../../app/api/account/graph/route");
  const { POST } = await import("../../app/api/account/merchants/similar/route");
  const a = `test-${randomUUID()}`, b = `test-${randomUUID()}`;
  subs.push(a, b);
  const sessionA = await createSession({ sub: a, email: "a@example.com", name: "A" });
  await createSession({ sub: b, email: "b@example.com", name: "B" });
  for (const sub of [b]) {
    await ingestLiveEvent(profileFor(sub), debit("VAULT PLUS", "2026-09-01", 9900));
    await ingestLiveEvent(profileFor(sub), debit("VAULT PLUS PREMIUM", "2026-10-01", 9900));
    await ensureChains(profileFor(sub), TODAY, true);
  }
  await ingestLiveEvent(profileFor(a), debit("MINE ONLY", "2026-10-01", 1000));
  const [bLink] = await readSimilarLinks(profileFor(b));
  assert.ok(bLink, "B has a link to aim at");

  const cookie = `${SESSION}=${sessionA}`;
  const response = await GET(new NextRequest(`http://localhost:3000/api/account/graph?profile=${encodeURIComponent(profileFor(b))}`, { headers: { cookie } }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.similar.length, 0, "A sees none of B's links, whatever profile the URL names");
  assert.ok(!JSON.stringify(body).includes("VAULT"), "none of B's merchants");

  const tamper = await POST(new NextRequest("http://localhost:3000/api/account/merchants/similar", { method: "POST", headers: { cookie, origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ a: bLink.a.id, b: bLink.b.id, decision: "confirmed" }) }));
  assert.equal(tamper.status, 404, "A cannot decide on B's link");
  assert.equal((await readSimilarLinks(profileFor(b)))[0].status, "candidate");

  const noCookie = await GET(new NextRequest("http://localhost:3000/api/account/graph"));
  assert.equal(noCookie.status, 401);
  const crossSite = await POST(new NextRequest("http://localhost:3000/api/account/merchants/similar", { method: "POST", headers: { cookie, origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ a: bLink.a.id, b: bLink.b.id, decision: "confirmed" }) }));
  assert.equal(crossSite.status, 403);
});
