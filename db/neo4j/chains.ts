/**
 * Chronological payment chains in the personal graph (Phase 2):
 *   (LiveProfile)-[:HAS_SUBSCRIPTION]->(LiveSubscription)-[:FIRST]->(LivePayment)
 *   (LivePayment)-[:NEXT {gapDays, deltaPaise, pctChange}]->(LivePayment)
 *   (LiveSubscription)-[:LATEST]->(LivePayment)
 * One subscription per profile and merchant key. Chains are derived data:
 * they are rebuilt from the payments whenever the profile's revision moved, so
 * older payments arriving in a later sync land in the right place, and running
 * it twice changes nothing. The same rebuild refreshes SIMILAR merchant
 * candidates (merchant-links.ts).
 */
import { getNeo4jDriver, neo4jDatabase } from "./client";
import { refreshSimilarLinks } from "./merchant-links";

export const CHAIN_SCHEMA = [
  "CREATE CONSTRAINT live_subscription_id IF NOT EXISTS FOR (n:LiveSubscription) REQUIRE n.id IS UNIQUE",
  "CREATE INDEX live_payment_profile_merchant IF NOT EXISTS FOR (n:LivePayment) ON (n.profile, n.merchantKey)",
  "CREATE INDEX live_event_kind_date IF NOT EXISTS FOR (n:LiveEvent) ON (n.kind, n.date)",
  "CREATE INDEX live_subscription_profile IF NOT EXISTS FOR (n:LiveSubscription) ON (n.profile)"
];

/** Every statement is scoped to one profile; payments of two people can never meet. */
const CLEAR = [
  `MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription)-[r:FIRST|LATEST]->() DELETE r`,
  `MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(:LivePayment)-[r:NEXT]->() DELETE r`
];

/**
 * Eligible payments: confirmed debits (refunds and failed debits never become
 * LivePayment; Gmail and SMS copies of one debit are already one payment),
 * with a positive amount, ordered by date then id so ties are stable.
 */
const BUILD = `
MATCH (u:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment)
WHERE p.profile = $profile AND p.amountPaise > 0 AND p.date <= $today
WITH u, p ORDER BY p.date, p.id
WITH u, p.merchantKey AS key, collect(p) AS payments
MERGE (s:LiveSubscription {id: $profile + '|' + key})
  ON CREATE SET s.profile = $profile, s.merchantKey = key, s.currency = 'INR'
SET s.merchant = payments[size(payments) - 1].merchant,
    s.paymentCount = size(payments),
    s.firstDate = payments[0].date,
    s.latestDate = payments[size(payments) - 1].date
MERGE (u)-[:HAS_SUBSCRIPTION]->(s)
WITH s, payments, payments[0] AS first, payments[size(payments) - 1] AS last
MERGE (s)-[:FIRST]->(first)
MERGE (s)-[:LATEST]->(last)
WITH payments
UNWIND range(0, size(payments) - 2) AS i
WITH payments[i] AS a, payments[i + 1] AS b
MERGE (a)-[n:NEXT]->(b)
SET n.gapDays = duration.inDays(date(a.date), date(b.date)).days,
    n.deltaPaise = toInteger(b.amountPaise) - toInteger(a.amountPaise),
    n.pctChange = CASE WHEN a.amountPaise > 0 THEN round(10000.0 * (b.amountPaise - a.amountPaise) / a.amountPaise) / 100.0 END`;

/** Subscriptions whose payments are all gone (none should be, but keep the graph honest). */
const PRUNE = `
MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription)
WHERE NOT (s)-[:FIRST]->()
DETACH DELETE s`;

let schemaReady: Promise<void> | undefined;
async function ensureChainSchema() {
  if (!schemaReady) schemaReady = (async () => {
    const session = getNeo4jDriver().session({ database: neo4jDatabase });
    try { for (const query of CHAIN_SCHEMA) await session.run(query); } finally { await session.close(); }
  })().catch((error) => { schemaReady = undefined; throw error; });
  return schemaReady;
}

/**
 * Rebuilds this profile's chains when payments changed since the last build.
 * The first statement locks the profile node, so two requests cannot rebuild
 * at once. Returns true when a rebuild ran.
 */
export async function ensureChains(profile: string, today = new Date().toISOString().slice(0, 10), force = false) {
  await ensureChainSchema();
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    return await session.executeWrite(async (tx) => {
      const state = await tx.run(
        `MATCH (u:LiveProfile {id:$profile}) SET u.chainLock = coalesce(u.chainLock, 0) + 1
         RETURN coalesce(u.revision, 0) AS revision, u.chainRevision AS built, u.chainDay AS day`,
        { profile }
      );
      const row = state.records[0];
      if (!row) return false;
      const revision = Number(row.get("revision"));
      const fresh = row.get("built") !== null && Number(row.get("built")) === revision && row.get("day") === today;
      if (fresh && !force) return false;
      for (const query of CLEAR) await tx.run(query, { profile });
      await tx.run(BUILD, { profile, today });
      await tx.run(PRUNE, { profile });
      // Derived like the chains: SIMILAR candidates follow the same revision.
      await refreshSimilarLinks(tx, profile);
      await tx.run("MATCH (u:LiveProfile {id:$profile}) SET u.chainRevision = $revision, u.chainDay = $today", { profile, revision, today });
      return true;
    });
  } finally {
    await session.close();
  }
}
