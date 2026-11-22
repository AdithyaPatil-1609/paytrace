/**
 * (LiveMerchant)-[:SIMILAR]->(LiveMerchant): "these two names may be one
 * merchant". Only between merchants of the same person, never a merchant to
 * itself, and never proof: payments stay apart until the person decides, and
 * links are never followed in a chain (A~B and B~C says nothing about A and C).
 */
import neo4j, { type ManagedTransaction } from "neo4j-driver";
import { getNeo4jDriver, neo4jDatabase } from "./client";
import { readDictionary } from "@/data/fixtures";
import { similarPairs, type SimilarPair } from "@/server/payments/merchant-match";
import { MERCHANT_MATCH } from "@/server/payments/rules";

export type SimilarStatus = "candidate" | "confirmed" | "rejected";
export type SimilarLink = {
  a: { id: string; name: string; payments: number }; b: { id: string; name: string; payments: number };
  score: number; method: string; reason: string; band: string; status: SimilarStatus; detectedAt: string | null; decidedAt: string | null; algorithmVersion: string;
};

/** A merchant belongs to a person when one of that person's events is about it. */
const OWNED = (alias: string) => `EXISTS { (u)-[:RECEIVED]->(:LiveEvent)-[:ABOUT]->(${alias}) }`;

/** The person's merchants, newest first, at most MERCHANT_MATCH.maxProfileMerchants. */
export const SIMILAR_MERCHANTS_QUERY = `
MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent)-[:ABOUT]->(m:LiveMerchant)
WITH m, max(e.date) AS lastSeen ORDER BY lastSeen DESC, m.id LIMIT $limit
RETURN m.id AS id, m.name AS name`;

/** One link per ordered pair (a.id < b.id). A decision the person made is never overwritten. */
export const SIMILAR_WRITE_QUERY = `
MATCH (u:LiveProfile {id:$profile})
UNWIND $pairs AS l
MATCH (a:LiveMerchant {id:l.a}) WHERE ${OWNED("a")}
MATCH (b:LiveMerchant {id:l.b}) WHERE l.a < l.b AND a <> b AND ${OWNED("b")}
MERGE (a)-[r:SIMILAR]->(b)
  ON CREATE SET r.status = 'candidate', r.detectedAt = datetime(), r.profile = $profile
WITH r, l WHERE r.status = 'candidate' AND r.profile = $profile
SET r.score = l.score, r.method = l.method, r.reason = l.reason, r.band = l.band, r.algorithmVersion = $version
RETURN count(r) AS links`;

/** Candidates that no longer reach the threshold go; confirmed and rejected links stay. */
export const SIMILAR_PRUNE_QUERY = `
MATCH (u:LiveProfile {id:$profile})-[:RECEIVED]->(:LiveEvent)-[:ABOUT]->(a:LiveMerchant)
WITH DISTINCT u, a WHERE a.id IN $compared
MATCH (a)-[r:SIMILAR {status:'candidate'}]->(b:LiveMerchant)
WHERE r.profile = $profile AND b.id IN $compared AND NOT a.id + '|' + b.id IN $keep
DELETE r`;

export const SIMILAR_READ_QUERY = `
MATCH (u:LiveProfile {id:$profile})-[:RECEIVED]->(:LiveEvent)-[:ABOUT]->(a:LiveMerchant)
WITH DISTINCT u, a
MATCH (a)-[r:SIMILAR]->(b:LiveMerchant)
WHERE r.profile = $profile AND ${OWNED("b")}
RETURN a {.id, .name, payments: COUNT { (u)-[:HAS_PAYMENT]->(:LivePayment)-[:PAID_TO]->(a) }} AS a,
  b {.id, .name, payments: COUNT { (u)-[:HAS_PAYMENT]->(:LivePayment)-[:PAID_TO]->(b) }} AS b,
  r {.score, .method, .reason, .band, .status, .algorithmVersion, detectedAt: toString(r.detectedAt), decidedAt: toString(r.decidedAt)} AS link
ORDER BY CASE link.status WHEN 'candidate' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END, link.score DESC
LIMIT $limit`;

export const SIMILAR_DECIDE_QUERY = `
MATCH (u:LiveProfile {id:$profile})
MATCH (a:LiveMerchant {id:$a})-[r:SIMILAR]->(b:LiveMerchant {id:$b})
WHERE r.profile = $profile AND ${OWNED("a")} AND ${OWNED("b")}
SET r.status = $decision, r.decidedAt = datetime(), r.decidedBy = 'owner'
RETURN r.status AS status`;

/** Pure part of a refresh: which pairs to keep, given the person's merchants. */
export function planSimilarLinks(merchants: { id: string; name: string }[]): { pairs: SimilarPair[]; compared: string[]; keep: string[] } {
  const pairs = similarPairs(merchants, readDictionary());
  return { pairs, compared: merchants.map(m => m.id), keep: pairs.map(p => `${p.a}|${p.b}`) };
}

/** Recomputes one person's SIMILAR candidates inside a write transaction. Safe to repeat. */
export async function refreshSimilarLinks(tx: ManagedTransaction, profile: string) {
  const merchants = (await tx.run(SIMILAR_MERCHANTS_QUERY, { profile, limit: neo4j.int(MERCHANT_MATCH.maxProfileMerchants) })).records.map(r => ({ id: String(r.get("id")), name: String(r.get("name") ?? "") }));
  const plan = planSimilarLinks(merchants);
  if (plan.pairs.length) await tx.run(SIMILAR_WRITE_QUERY, { profile, pairs: plan.pairs, version: MERCHANT_MATCH.algorithmVersion });
  await tx.run(SIMILAR_PRUNE_QUERY, { profile, compared: plan.compared, keep: plan.keep });
  return { merchants: merchants.length, links: plan.pairs.length };
}

/** Same as above in its own transaction (backfill script, tests). */
export async function refreshSimilarLinksFor(profile: string) {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try { return await session.executeWrite(tx => refreshSimilarLinks(tx, profile)); } finally { await session.close(); }
}

export async function readSimilarLinks(profile: string, limit = 50): Promise<SimilarLink[]> {
  const session = getNeo4jDriver().session({ database: neo4jDatabase, defaultAccessMode: "READ" });
  try {
    const result = await session.executeRead(tx => tx.run(SIMILAR_READ_QUERY, { profile, limit: neo4j.int(limit) }));
    return result.records.map(record => {
      const a = record.get("a"), b = record.get("b"), link = record.get("link");
      return { a: { id: a.id, name: a.name, payments: Number(a.payments) }, b: { id: b.id, name: b.name, payments: Number(b.payments) }, score: Number(link.score), method: String(link.method), reason: String(link.reason), band: String(link.band), status: link.status, detectedAt: link.detectedAt ?? null, decidedAt: link.decidedAt ?? null, algorithmVersion: String(link.algorithmVersion ?? "") };
    });
  } finally { await session.close(); }
}

/** The owner confirms or rejects one link. Returns false when the pair is not theirs. */
export async function decideSimilarLink(profile: string, first: string, second: string, decision: Exclude<SimilarStatus, "candidate">) {
  if (first === second) return false;
  const [a, b] = first < second ? [first, second] : [second, first];
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const result = await session.executeWrite(tx => tx.run(SIMILAR_DECIDE_QUERY, { profile, a, b, decision }));
    return result.records.length > 0;
  } finally { await session.close(); }
}
