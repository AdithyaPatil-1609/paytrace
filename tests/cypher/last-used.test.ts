/**
 * Screen time on payment cards against a real Neo4j: an app usage report from
 * the phone gives the card its "Last used" date, and the CSV engine (payment
 * cards) and the graph warnings agree on "Stopped using it" after 2 months.
 * No usage record means no date and no unused warning.
 */
import "../../scripts/load-env-local";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../db/neo4j/client";
import { ingestLiveEvent, readLiveSummary } from "../../db/neo4j/live";
import { recordAppUsage } from "../../db/neo4j/app-usage";
import { readGraphWarnings } from "../../db/neo4j/warnings";
import type { PaymentEvent } from "../../lib/ingestion/event";

const skip = !hasNeo4jConfig();
const DAY = 86_400_000;
const today = new Date().toISOString().slice(0, 10);
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
const profiles: string[] = [];
let seq = 0;
const debit = (merchant: string, date: string): PaymentEvent =>
  ({ source: "email", kind: "debit_posted", merchant, amountPaise: 19900, date, reference: null, sourceId: `last-used-${++seq}` } as PaymentEvent);

after(async () => {
  if (skip) return;
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    for (const profile of profiles) await session.run(
      `MATCH (u:LiveProfile {id:$profile}) OPTIONAL MATCH (u)-[*1..2]->(n) WHERE n:LivePayment OR n:LiveEvent OR n:LiveMerchant OR n:LiveSubscription DETACH DELETE n, u`, { profile });
  } finally { await session.close(); await getNeo4jDriver().close(); }
});

test("screen time: card dates and the 2-month unused rule agree between the cards and the graph warnings", { skip }, async () => {
  const profile = `test-last-used-${randomUUID()}`;
  profiles.push(profile);
  for (const merchant of ["IDLEFLIX", "BUSYFLIX", "QUIETFLIX", "UNKNOWNFLIX"])
    for (const days of [95, 65, 35, 5]) await ingestLiveEvent(profile, debit(merchant, ago(days)));
  await readGraphWarnings(profile, today); // builds the subscription chains
  await recordAppUsage(profile, [
    { package: "com.idle.flix", merchant: "IDLEFLIX", lastUsed: ago(75), minutes30d: 0 },
    { package: "com.busy.flix", merchant: "BUSYFLIX", lastUsed: ago(3), minutes30d: 240 },
    { package: "com.quiet.flix", merchant: "QUIETFLIX", lastUsed: null, minutes30d: 0 }
  ], ago(180), today);

  const { commitments } = await readLiveSummary(profile);
  const card = (merchant: string) => commitments.find((item) => item.rawNarration === merchant)!;
  const { unused } = await readGraphWarnings(profile, today);
  const warning = (merchant: string) => unused.find((w) => w.merchant === merchant)!;

  assert.equal(card("IDLEFLIX").lastOpened, ago(75));
  assert.equal(card("IDLEFLIX").usageSource, "phone");
  assert.equal(card("IDLEFLIX").status, "Stopped using it");
  assert.equal(warning("IDLEFLIX").status, "UNUSED");

  assert.equal(card("BUSYFLIX").lastOpened, ago(3));
  assert.notEqual(card("BUSYFLIX").kind, "unused");
  assert.equal(warning("BUSYFLIX").status, "USAGE_UNAVAILABLE");

  assert.equal(card("QUIETFLIX").lastOpened, undefined);
  assert.equal(card("QUIETFLIX").notOpenedSince, ago(180));
  assert.equal(card("QUIETFLIX").kind, "unused");
  assert.equal(warning("QUIETFLIX").status, "UNUSED");

  assert.equal(card("UNKNOWNFLIX").lastOpened, undefined);
  assert.equal(card("UNKNOWNFLIX").notOpenedSince, undefined);
  assert.notEqual(card("UNKNOWNFLIX").kind, "unused");
  assert.equal(warning("UNKNOWNFLIX").status, "USAGE_UNAVAILABLE");
});

test("a payment with no subscription chain still gets its last use from the phone report", { skip }, async () => {
  const profile = `test-last-used-${randomUUID()}`;
  profiles.push(profile);
  for (const days of [65, 35, 5]) await ingestLiveEvent(profile, debit("LATEFLIX", ago(days)));
  // No readGraphWarnings first: the report lands before any chain exists.
  await recordAppUsage(profile, [{ package: "com.late.flix", merchant: "LATEFLIX", lastUsed: ago(90), minutes30d: 0 }], ago(180), today);
  const { commitments } = await readLiveSummary(profile);
  const item = commitments.find((entry) => entry.rawNarration === "LATEFLIX")!;
  assert.equal(item.lastOpened, ago(90));
  assert.equal(item.kind, "unused");
});
