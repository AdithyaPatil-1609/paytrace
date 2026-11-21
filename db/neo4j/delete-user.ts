/**
 * "Delete my data" (plan card G8, privacy notice): removes everything Paytrace
 * holds about one person, in one transaction: their payments, events and
 * merchants, paired phones, pairing codes, sessions and the account itself.
 * Returns the encrypted Gmail token (if any) so the caller can revoke it at
 * Google. Every match starts from the person's own nodes.
 */
import { getNeo4jDriver, neo4jDatabase } from "./client";

export async function deleteAllUserData(sub: string, profile: string) {
  const s = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    return await s.executeWrite(async tx => {
      const user = await tx.run("MATCH (u:PaytraceUser {sub:$sub}) RETURN u.gmailToken AS token", { sub });
      if (!user.records.length) return { found: false, token: null as string | null };
      await tx.run(`MATCH (u:LiveProfile {id:$profile})
        OPTIONAL MATCH (u)-[:RECEIVED]->(e:LiveEvent)
        OPTIONAL MATCH (e)-[:ABOUT]->(m:LiveMerchant)
        WITH u, collect(DISTINCT e) AS events, collect(DISTINCT m) AS merchants
        OPTIONAL MATCH (u)-[:HAS_PAYMENT]->(p:LivePayment)
        WITH u, events, merchants, collect(DISTINCT p) AS payments
        FOREACH (n IN events | DETACH DELETE n)
        FOREACH (n IN merchants | DETACH DELETE n)
        FOREACH (n IN payments | DETACH DELETE n)
        DETACH DELETE u`, { profile });
      await tx.run(`MATCH (u:PaytraceUser {sub:$sub})
        OPTIONAL MATCH (u)-[:HAS_SESSION|HAS_DEVICE|HAS_PAIRING]->(n)
        WITH u, collect(n) AS owned
        FOREACH (n IN owned | DETACH DELETE n)
        DETACH DELETE u`, { sub });
      return { found: true, token: (user.records[0].get("token") as string | null) ?? null };
    });
  } finally { await s.close(); }
}
