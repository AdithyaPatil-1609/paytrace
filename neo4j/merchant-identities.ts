import { getNeo4jDriver, neo4jDatabase } from "./client";
import { readDictionary } from "@/data/fixtures";
import { matchDictionary } from "@/server/payments/engine";
import { merchantAiEnabled, merchantIdentityInput, MERCHANT_IDENTITY_BATCH, MERCHANT_IDENTITY_VERSION, suggestMerchantIdentities } from "@/server/payments/merchant-identity";
import type { MerchantIdentity } from "@/server/payments/types";

export const MERCHANT_IDENTITY_READ = `MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent)-[:ABOUT]->(m:LiveMerchant {profile:$profile})
WHERE coalesce(e.status,'') <> 'ignored'
RETURN DISTINCT m.id AS id, m.name AS descriptor, m.aiName AS name, m.aiCategory AS category,
  m.aiStatus AS status, m.aiVersion AS version`;

type MerchantRecord = { id: string; descriptor: string; name: string | null; category: string | null; status: string | null; version: string | null };
export function identityRecords(rows: { get(key: string): unknown }[]): MerchantRecord[] {
  return rows.map(row => ({ id: String(row.get("id")), descriptor: String(row.get("descriptor")), name: row.get("name") as string | null,
    category: row.get("category") as string | null, status: row.get("status") as string | null, version: row.get("version") as string | null }));
}
export function visibleIdentities(rows: MerchantRecord[]): MerchantIdentity[] {
  return rows.flatMap(row => row.name && row.category && (row.status === "suggested" || row.status === "confirmed")
    ? [{ id: row.id, descriptor: row.descriptor, name: row.name, category: row.category, status: row.status }] : []);
}
export function pendingIdentities(rows: MerchantRecord[], descriptors: string[]) {
  const dictionary = readDictionary();
  return merchantAiEnabled() ? rows.filter(row => descriptors.includes(row.descriptor) && (!row.status || row.status === "unknown" && row.version !== MERCHANT_IDENTITY_VERSION) && !matchDictionary(row.descriptor, dictionary) && merchantIdentityInput(row.descriptor)).slice(0, MERCHANT_IDENTITY_BATCH) : [];
}

const active = new Set<string>();
let retryAfter = 0;

/** Enrich existing and new merchants in the background, never in a payment
 * write transaction. One bounded local model call; failures leave data intact. */
export async function refreshMerchantIdentities(profile: string, descriptors: string[]) {
  if (!merchantAiEnabled() || active.has(profile) || active.size > 0 || Date.now() < retryAfter || !descriptors.length) return;
  active.add(profile);
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const result = await session.run(MERCHANT_IDENTITY_READ, { profile });
    const rows = pendingIdentities(identityRecords(result.records), descriptors);
    if (!rows.length) return;
    const suggestions = await suggestMerchantIdentities(rows.map(row => row.descriptor), readDictionary());
    for (const [index, suggestion] of suggestions) {
      const row = rows[index];
      await session.run(`MATCH (u:LiveProfile {id:$profile})-[:RECEIVED]->(:LiveEvent)-[:ABOUT]->(m:LiveMerchant {id:$id,profile:$profile})
        WHERE (m.aiStatus IS NULL OR (m.aiStatus='unknown' AND coalesce(m.aiVersion,'') <> $version)) AND m.name=$descriptor
        WITH DISTINCT u,m SET m.aiName=$name, m.aiCategory=$category, m.aiStatus=$status, m.aiVersion=$version, m.aiCheckedAt=datetime(),
          u.revision=coalesce(u.revision,0)+1`, { profile, id: row.id, descriptor: row.descriptor, name: suggestion?.name ?? null, category: suggestion?.category ?? null,
        status: suggestion ? "suggested" : "unknown", version: MERCHANT_IDENTITY_VERSION });
    }
    if (suggestions.size < rows.length) retryAfter = Date.now() + 60_000;
  } catch { retryAfter = Date.now() + 60_000; }
  finally { active.delete(profile); await session.close(); }
}

/** Only the owner can accept or reject an existing suggestion. It never
 * changes bank evidence, payment grouping, or the global dictionary. */
export async function decideMerchantIdentity(profile: string, id: string, decision: "confirmed" | "rejected") {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const result = await session.run(`MATCH (u:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent)-[:ABOUT]->(m:LiveMerchant {id:$id,profile:$profile})
      WHERE coalesce(e.status,'') <> 'ignored' AND m.aiStatus IN ['suggested','confirmed'] AND m.aiName IS NOT NULL
      WITH DISTINCT u,m SET m.aiStatus=$decision, m.aiDecidedAt=datetime(), u.revision=coalesce(u.revision,0)+1 RETURN m.id AS id`, { profile, id, decision });
    return result.records.length > 0;
  } finally { await session.close(); }
}
