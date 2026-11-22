/**
 * "Delete my data" (plan card G8, privacy notice): removes everything Paytrace
 * holds about one person, in one transaction: their payments, events,
 * merchants and subscriptions, paired phones, pairing codes, sessions, iPhone
 * token, Gmail token, family invites, family access both ways (CAN_VIEW goes
 * with DETACH DELETE) and the account itself.
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
        OPTIONAL MATCH (u)-[:HAS_SUBSCRIPTION]->(sub:LiveSubscription)
        WITH u, events, merchants, payments, collect(DISTINCT sub) AS subscriptions
        FOREACH (n IN events | DETACH DELETE n)
        FOREACH (n IN merchants | DETACH DELETE n)
        FOREACH (n IN payments | DETACH DELETE n)
        FOREACH (n IN subscriptions | DETACH DELETE n)
        DETACH DELETE u`, { profile });
      // A sweep for anything keyed by the profile but no longer linked to it
      // (payment chains and subscriptions carry the profile in their id or property).
      await tx.run("MATCH (n:LivePayment {profile:$profile}) DETACH DELETE n", { profile });
      await tx.run("MATCH (n:LiveSubscription) WHERE n.id STARTS WITH $prefix DETACH DELETE n", { prefix: `${profile}|` });
      await tx.run(`MATCH (u:PaytraceUser {sub:$sub})
        OPTIONAL MATCH (u)-[:HAS_SESSION|HAS_DEVICE|HAS_PAIRING|CREATED_INVITE]->(n)
        WITH u, collect(n) AS owned
        FOREACH (n IN owned | DETACH DELETE n)
        DETACH DELETE u`, { sub });
      return { found: true, token: (user.records[0].get("token") as string | null) ?? null };
    });
  } finally { await s.close(); }
}

/**
 * The Aura Agent database mirrors one authorized profile (neo4j/agent-sync.ts).
 * When that person deletes their data, the mirror goes too. Other profiles are
 * never mirrored, so for them there is nothing to remove.
 */
export async function deleteAgentMirror(profile: string) {
  const { hasAgentNeo4jConfig, getAgentDriver, agentDatabase } = await import("./agent-client");
  if (!hasAgentNeo4jConfig() || process.env.PERSONAL_NEO4J_PROFILE?.trim() !== profile) return false;
  const s = getAgentDriver().session({ database: agentDatabase });
  try { await s.run("MATCH (n:AgentMirror {owner:$profile}) DETACH DELETE n", { profile }); return true; }
  finally { await s.close(); }
}
