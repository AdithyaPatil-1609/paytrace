import { createHash } from "node:crypto";
import { getNeo4jDriver, neo4jDatabase } from "./client";
import { getAgentDriver, agentDatabase } from "./agent-client";
import { readLiveDashboard } from "./live";
import type { Commitment } from "@/lib/payments/types";

const SNAPSHOT_ID = "paytrace-personal";

/** Only the named profile may be mirrored into the single-user agent database. */
export function requireAgentProfile(profile: string) {
  const allowed = process.env.PERSONAL_NEO4J_PROFILE?.trim();
  if (!allowed || profile !== allowed) {
    throw new Error("Agent sync is not authorized for this profile.");
  }
  return allowed;
}

const REVISION = `
  MATCH (:PaytraceUser {profile:$profile})
  MATCH (u:LiveProfile {id:$profile})
  RETURN DISTINCT coalesce(u.revision,0) AS revision`;

/** Explicit projections: never export user/account nodes, tokens, raw messages,
 *  transaction references, or account hints. All relationship ends are scoped
 *  to the profile, including the payment candidates and merchants.
 */
const SOURCE_QUERIES = {
  payments: `MATCH (u:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment)
    WHERE p.profile=$profile
    RETURN DISTINCT p{.id,.merchant,.merchantKey,.amountPaise,.date,.sources} AS item`,
  events: `MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent)
    WHERE coalesce(e.status,'') <> 'ignored'
    RETURN DISTINCT e{.id,.source,.kind,.merchant,.amountPaise,.date,.status,.planPricePaise,.renewalDate,.renewalFrequency} AS item`,
  merchants: `MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent)-[:ABOUT]->(m:LiveMerchant)
    WHERE coalesce(e.status,'') <> 'ignored'
    RETURN DISTINCT m{.id,.name,.key} AS item`,
  about: `MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent)-[:ABOUT]->(m:LiveMerchant)
    WHERE coalesce(e.status,'') <> 'ignored'
    RETURN DISTINCT {from:e.id,to:m.id} AS item`,
  evidence: `MATCH (u:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment)-[:EVIDENCED_BY]->(e:LiveEvent)<-[:RECEIVED]-(u)
    WHERE p.profile=$profile AND coalesce(e.status,'') <> 'ignored'
    RETURN DISTINCT {from:p.id,to:e.id} AS item`,
  paidTo: `MATCH (u:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment)-[:PAID_TO]->(m:LiveMerchant)<-[:ABOUT]-(e:LiveEvent)<-[:RECEIVED]-(u)
    WHERE p.profile=$profile AND coalesce(e.status,'') <> 'ignored'
    RETURN DISTINCT {from:p.id,to:m.id} AS item`,
  candidates: `MATCH (u:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent)-[:POSSIBLE_MATCH]->(p:LivePayment)<-[:HAS_PAYMENT]-(u)
    WHERE p.profile=$profile AND e.status='review'
    RETURN DISTINCT {from:e.id,to:p.id} AS item`
} as const;

/** Derived commitments come from the same engine as the account dashboard.
 *  IDs are rehashed; only financial fields and matched evidence IDs are exported.
 */
export function projectAgentCommitment(profile: string, c: Commitment) {
  return {
    id: createHash("sha256").update(profile).update("\0").update(c.id).digest("hex"),
    merchant: c.merchant,
    product: c.product,
    category: c.category,
    cadence: c.cadence,
    amount: c.amount,
    previousAmount: c.previousAmount ?? null,
    annualCost: c.annualCost,
    spentToDate: c.spentToDate,
    currency: "INR",
    debitCount: c.debitCount,
    firstCharge: c.firstCharge,
    lastCharge: c.lastCharge,
    nextCharge: c.nextCharge ?? null,
    dateConfidence: c.dateConfidence,
    amountPattern: c.amountPattern,
    basis: c.basis ?? null,
    signals: c.signals,
    status: c.status,
    bucket: c.bucket,
    instrument: c.instrument,
    mechanism: c.mechanism,
    spendGroup: c.spendGroup,
    canCancel: c.canCancel,
    cancelMode: c.cancelMode,
    hasPriceChangeNotice: c.hasPriceChangeNotice
  };
}

/** Safe manual/reusable sync. This is not an unscoped or client-controlled copy. */
export async function syncAgentGraph(requestedProfile: string) {
  const profile = requireAgentProfile(requestedProfile);
  const destination = getAgentDriver();
  const source = getNeo4jDriver().session({ database: neo4jDatabase });
  const params = { profile };
  const { graph, summary } = await (async () => {
    try {
      const readRevision = async () => {
        const result = await source.run(REVISION, params);
        if (result.records.length !== 1) throw new Error("Authorized profile has no live graph. Sync Gmail or SMS first.");
        return Number(result.records[0].get("revision"));
      };
      const revision = await readRevision();
      const graph = await source.executeRead(async tx => {
        const rows = async (query: string) => (await tx.run(query, params)).records.map(r => r.get("item"));
        return {
          payments: await rows(SOURCE_QUERIES.payments),
          events: await rows(SOURCE_QUERIES.events),
          merchants: await rows(SOURCE_QUERIES.merchants),
          about: await rows(SOURCE_QUERIES.about),
          evidence: await rows(SOURCE_QUERIES.evidence),
          paidTo: await rows(SOURCE_QUERIES.paidTo),
          candidates: await rows(SOURCE_QUERIES.candidates)
        };
      });
      const summary = (await readLiveDashboard(profile)).summary;
      if (summary.revision !== revision || await readRevision() !== revision) {
        throw new Error("Source changed during sync. Run agent:sync again after ingestion finishes.");
      }
      return { graph, summary };
    } finally {
      await source.close();
    }
  })();

  const commitments = summary.commitments.map(c => projectAgentCommitment(profile, c));
  const paymentIds = new Set(graph.payments.map(p => p.id));
  const eventIds = new Set(graph.events.map(e => e.id));
  const commitmentPayments = summary.commitments.flatMap((c, i) =>
    c.evidenceRows.filter(e => paymentIds.has(e.txnId)).map(e => ({ from: commitments[i].id, to: e.txnId })));
  const commitmentEvents = summary.commitments.flatMap((c, i) => {
    const ids = new Set([...c.notices.map(e => e.noticeId),
      ...c.evidenceRows.filter(e => e.txnId.startsWith("notice-")).map(e => e.txnId.slice(7))]);
    return [...ids].filter(id => eventIds.has(id)).map(id => ({ from: commitments[i].id, to: id }));
  });

  const session = destination.session({ database: agentDatabase });
  try {
    // A unique singleton serializes refreshes, including across server processes.
    await session.run("CREATE CONSTRAINT agent_snapshot_id IF NOT EXISTS FOR (s:AgentSnapshot) REQUIRE s.id IS UNIQUE");
    await session.executeWrite(async tx => {
      const scope = { profile, snapshotId: SNAPSHOT_ID, revision: summary.revision, asOf: summary.asOf };
      const owner = await tx.run(`
        MERGE (s:AgentSnapshot {id:$snapshotId})
        ON CREATE SET s.profile=$profile
        SET s.lock=coalesce(s.lock,0)+1
        RETURN s.profile AS profile, coalesce(s.revision,0) AS revision`, scope);
      if (owner.records[0]?.get("profile") !== profile) throw new Error("Agent database is already bound to another profile.");
      if (Number(owner.records[0].get("revision")) > summary.revision) throw new Error("A newer snapshot already exists. Retry sync.");

      const foreign = await tx.run(`
        MATCH (n)
        WHERE NOT (n:AgentSnapshot AND coalesce(n.id,'')=$snapshotId)
          AND NOT (n:AgentMirror AND coalesce(n.owner,'')=$profile)
        RETURN count(n) AS count`, scope);
      if (Number(foreign.records[0].get("count")) !== 0) {
        throw new Error("Agent database contains unmanaged data. Refusing to modify it.");
      }

      // Replace ONLY the previously managed mirror, atomically. Never delete
      // anything in Database 1, or wipe an unrecognized/demo graph.
      await tx.run("MATCH (n:AgentMirror {owner:$profile}) DETACH DELETE n", scope);
      await tx.run(`CREATE (u:AgentMirror:LiveProfile {id:$profile,owner:$profile,revision:$revision,asOf:$asOf,coverage:'partial'})`, scope);

      const write = (query: string, rows: unknown[]) => tx.run(query, { ...scope, rows });
      await write(`MATCH (u:AgentMirror:LiveProfile {owner:$profile})
        UNWIND $rows AS row CREATE (p:AgentMirror:LivePayment)
        SET p += row, p.owner=$profile, p.profile=$profile
        CREATE (u)-[:HAS_PAYMENT]->(p)`, graph.payments);
      await write(`MATCH (u:AgentMirror:LiveProfile {owner:$profile})
        UNWIND $rows AS row CREATE (e:AgentMirror:LiveEvent)
        SET e += row, e.owner=$profile
        CREATE (u)-[:RECEIVED]->(e)`, graph.events);
      await write(`UNWIND $rows AS row CREATE (m:AgentMirror:LiveMerchant)
        SET m += row, m.owner=$profile`, graph.merchants);
      await write(`MATCH (u:AgentMirror:LiveProfile {owner:$profile})
        UNWIND $rows AS row CREATE (c:AgentMirror:AgentCommitment)
        SET c += row, c.owner=$profile
        CREATE (u)-[:HAS_COMMITMENT]->(c)`, commitments);

      // Relationship types and labels are fixed constants, not user/agent input.
      const links = (from: string, type: string, to: string, rows: unknown[]) => write(
        `UNWIND $rows AS row
         MATCH (a:AgentMirror:${from} {owner:$profile,id:row.from})
         MATCH (b:AgentMirror:${to} {owner:$profile,id:row.to})
         MERGE (a)-[:${type}]->(b)`, rows);
      await links("LiveEvent", "ABOUT", "LiveMerchant", graph.about);
      await links("LivePayment", "EVIDENCED_BY", "LiveEvent", graph.evidence);
      await links("LivePayment", "PAID_TO", "LiveMerchant", graph.paidTo);
      await links("LiveEvent", "POSSIBLE_MATCH", "LivePayment", graph.candidates);
      await links("AgentCommitment", "SUPPORTED_BY", "LivePayment", commitmentPayments);
      await links("AgentCommitment", "SUPPORTED_BY", "LiveEvent", commitmentEvents);
      await tx.run(`MATCH (s:AgentSnapshot {id:$snapshotId})
        SET s.revision=$revision, s.asOf=$asOf, s.syncedAt=datetime()`, scope);
    });
  } finally {
    await session.close();
  }
  return {
    revision: summary.revision,
    payments: graph.payments.length,
    events: graph.events.length,
    merchants: graph.merchants.length,
    commitments: commitments.length
  };
}
