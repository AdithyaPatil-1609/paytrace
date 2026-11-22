/**
 * A demo visitor's own Neo4j graph. When a visitor loads a sample statement or
 * sends messages, the same data is written to a private profile
 * (:LiveProfile {id:"sandbox-<id>", sandbox:true}) so GraphRAG, Ask AI and the
 * graph warnings run on Neo4j exactly as for a signed-in person. Only the data
 * is synthetic. Every sandbox profile is deleted 2 hours after it was last
 * written, by a sweep that runs on each sandbox write and on a timer.
 */
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "./client";
import { ingestLiveEvent } from "./live";
import type { PaymentEvent } from "@/lib/ingestion/event";
import { SANDBOX_LIMITS } from "@/lib/payments/rules";
import type { Sandbox } from "@/lib/sandbox/store";
import { statementEvents } from "@/lib/statements/events";

/** The most events one visitor may write: a 12-month sample is about 230. */
const MAX_EVENTS = 600;

export const sandboxProfile = (boxId: string) => `sandbox-${boxId}`;

/** Deletes one profile and everything under it (same shape as "Delete my data"). */
export async function deleteProfileGraph(profile: string) {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(`MATCH (u:LiveProfile {id:$profile})
        OPTIONAL MATCH (u)-[:RECEIVED]->(e:LiveEvent)
        OPTIONAL MATCH (e)-[:ABOUT]->(m:LiveMerchant)
        WITH u, collect(DISTINCT e) AS events, collect(DISTINCT m) AS merchants
        OPTIONAL MATCH (u)-[:HAS_PAYMENT]->(p:LivePayment)
        WITH u, events, merchants, collect(DISTINCT p) AS payments
        OPTIONAL MATCH (u)-[:HAS_SUBSCRIPTION]->(s:LiveSubscription)
        WITH u, events, merchants, payments, collect(DISTINCT s) AS subscriptions
        OPTIONAL MATCH (u)-[:HAS_RECURRING_CHECK]->(c)
        WITH u, events, merchants, payments, subscriptions, collect(DISTINCT c) AS checks
        FOREACH (n IN events | DETACH DELETE n)
        FOREACH (n IN merchants | DETACH DELETE n)
        FOREACH (n IN payments | DETACH DELETE n)
        FOREACH (n IN subscriptions | DETACH DELETE n)
        FOREACH (n IN checks | DETACH DELETE n)
        DETACH DELETE u`, { profile });
      await tx.run("MATCH (n:LivePayment {profile:$profile}) DETACH DELETE n", { profile });
      await tx.run("MATCH (n:LiveSubscription) WHERE n.id STARTS WITH $prefix DETACH DELETE n", { prefix: `${profile}|` });
    });
  } finally {
    await session.close();
  }
}

/** Deletes sandbox profiles not written for 2 hours. Never touches a real person's profile. */
export async function sweepSandboxGraphs(now = Date.now()) {
  if (!hasNeo4jConfig()) return 0;
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  let stale: string[] = [];
  try {
    const found = await session.run(
      "MATCH (u:LiveProfile {sandbox:true}) WHERE u.expiresAt < $now AND u.id STARTS WITH 'sandbox-' RETURN u.id AS id LIMIT 25",
      { now }
    );
    stale = found.records.map((r) => String(r.get("id")));
  } finally {
    await session.close();
  }
  for (const id of stale) await deleteProfileGraph(id);
  return stale.length;
}

/** The visitor's statement, notices and accepted messages, as payment events. */
export function sandboxEvents(box: Sandbox): PaymentEvent[] {
  const out: PaymentEvent[] = [];
  if (box.statement) {
    out.push(...statementEvents(box.statement.lines).events);
    for (const notice of box.statement.notices) {
      if (notice.eventType === "mandate_cancelled") out.push({ source: "email", kind: "mandate_cancelled", merchant: notice.brand, amountPaise: null, date: notice.sentOn, reference: null, sourceId: `sandbox-notice-${notice.noticeId}` });
    }
  }
  for (const item of box.events) out.push(item.event);
  return out.slice(0, MAX_EVENTS);
}

const running = new Map<string, Promise<void>>();

/**
 * Rewrites the visitor's graph from their sandbox: clears the old one, writes
 * every event, then marks the profile as a sandbox with its expiry time.
 * One rewrite per visitor at a time; a newer one waits for the older one.
 */
export function syncSandboxGraph(box: Sandbox): Promise<void> {
  if (!hasNeo4jConfig()) return Promise.resolve();
  const profile = sandboxProfile(box.id);
  const previous = running.get(profile) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    box.graph = "syncing";
    await deleteProfileGraph(profile);
    for (const event of sandboxEvents(box)) await ingestLiveEvent(profile, event);
    const session = getNeo4jDriver().session({ database: neo4jDatabase });
    try {
      await session.run("MERGE (u:LiveProfile {id:$profile}) SET u.sandbox = true, u.expiresAt = $expiresAt", { profile, expiresAt: Date.now() + SANDBOX_LIMITS.idleMs });
    } finally {
      await session.close();
    }
    box.graph = "ready";
  }).catch(() => { box.graph = "error"; });
  running.set(profile, next);
  void next.finally(() => { if (running.get(profile) === next) running.delete(profile); });
  void sweepSandboxGraphs().catch(() => undefined);
  return next;
}

/** Forgets a visitor's graph at once (Reset). */
export async function dropSandboxGraph(boxId: string) {
  if (!hasNeo4jConfig()) return;
  await deleteProfileGraph(sandboxProfile(boxId));
}

// Sweep every 10 minutes while the server runs, so expired graphs go even if nobody visits.
const holder = globalThis as unknown as { __paytraceSandboxSweep?: ReturnType<typeof setInterval> };
if (!holder.__paytraceSandboxSweep && hasNeo4jConfig()) {
  holder.__paytraceSandboxSweep = setInterval(() => void sweepSandboxGraphs().catch(() => undefined), 10 * 60_000);
  holder.__paytraceSandboxSweep.unref?.();
}
