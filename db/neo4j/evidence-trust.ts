/**
 * Trust levels across one person's evidence, and the payments that two or more
 * independent channels confirm. Read-only and scoped to (:LiveProfile {id:$profile}).
 * Older events with no stored level are counted as "legacy", not upgraded.
 */
import neo4j from "neo4j-driver";
import { getNeo4jDriver, neo4jDatabase } from "./client";
import { toEvidence, type Evidence } from "./warnings";
import { SIMILAR_READ_QUERY } from "./merchant-links";

export const TRUST_BY_SOURCE_QUERY = `
MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent)
WHERE coalesce(e.status, '') <> 'ignored'
RETURN e.source AS source, coalesce(e.sourceTrust, 'legacy') AS trust, count(*) AS events
ORDER BY source, trust`;

/** Distinct channels only: two copies of one email are one event, and two emails are one channel. */
export const CORROBORATED_QUERY = `
MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment)-[:EVIDENCED_BY]->(e:LiveEvent)
WITH p, collect(DISTINCT e.source) AS sources, collect(e {.id, .source, .kind, .date, .sourceTrust, .trustReason}) AS evidence
WHERE size(sources) >= 2
RETURN p {.id, .merchant, .date, amountPaise: toInteger(p.amountPaise)} AS payment, sources, evidence
ORDER BY payment.date DESC LIMIT $limit`;

export type TrustRow = { source: string; trust: string; events: number };
export type Corroborated = { id: string; merchant: string; date: string; amountPaise: number; sources: string[]; evidence: Evidence[] };
export type ExtraRun = { key: string; name: string; purpose: string; cypher: string; ok: boolean; rows: number; ms: number };

export const TRUST_QUERIES = [
  { key: "trust", name: "Evidence trust levels", purpose: "Counts your stored messages and statement lines by channel and trust level.", cypher: TRUST_BY_SOURCE_QUERY },
  { key: "corroborated", name: "Payments confirmed by two channels", purpose: "Finds payments whose EVIDENCED_BY events come from two or more different channels (for example SMS and email).", cypher: CORROBORATED_QUERY },
  { key: "similar", name: "Possibly the same merchant", purpose: "Reads SIMILAR links between your own merchants with their score, method and your decision.", cypher: SIMILAR_READ_QUERY }
] as const;

export async function readEvidenceTrust(profile: string) {
  const session = getNeo4jDriver().session({ database: neo4jDatabase, defaultAccessMode: "READ" });
  const runs: ExtraRun[] = [];
  const run = async <T>(index: 0 | 1, values: Record<string, unknown>, map: (r: { get(k: string): unknown }) => T): Promise<T[]> => {
    const query = TRUST_QUERIES[index], started = Date.now();
    try {
      const out = (await session.executeRead((tx) => tx.run(query.cypher, values))).records.map(map);
      runs.push({ ...query, ok: true, rows: out.length, ms: Date.now() - started });
      return out;
    } catch {
      runs.push({ ...query, ok: false, rows: 0, ms: Date.now() - started });
      return [];
    }
  };
  try {
    const bySource = await run(0, { profile }, (r) => ({ source: String(r.get("source")), trust: String(r.get("trust")), events: Number(r.get("events")) }));
    const corroborated = await run(1, { profile, limit: neo4j.int(20) }, (r) => {
      const p = r.get("payment") as Record<string, unknown>;
      return { id: String(p.id), merchant: String(p.merchant), date: String(p.date), amountPaise: Number(p.amountPaise), sources: (r.get("sources") as string[]).sort(), evidence: (r.get("evidence") as unknown[]).map(toEvidence) };
    });
    return { bySource, corroborated, runs };
  } finally {
    await session.close();
  }
}
