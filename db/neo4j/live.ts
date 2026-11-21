import { getNeo4jDriver, neo4jDatabase } from "./client";
import { digest, eventKey, matchPayment, merchantKey, type PaymentEvent, type MatchablePayment } from "@/lib/ingestion/event";
import { detectCommitments, matchDictionary } from "@/lib/payments/engine";
import { readDictionary } from "@/data/fixtures";
import type { Dataset, MandateRow, NotificationRow, StatementRow } from "@/lib/payments/types";

/** Separate labels deliberately protect personal data from unscoped demo reads and seed. */
export const LIVE_SCHEMA = [
  "CREATE CONSTRAINT live_profile_id IF NOT EXISTS FOR (n:LiveProfile) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT live_event_id IF NOT EXISTS FOR (n:LiveEvent) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT live_payment_id IF NOT EXISTS FOR (n:LivePayment) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT live_merchant_id IF NOT EXISTS FOR (n:LiveMerchant) REQUIRE n.id IS UNIQUE",
  "CREATE INDEX live_payment_match IF NOT EXISTS FOR (n:LivePayment) ON (n.profile, n.merchantKey, n.date, n.amountPaise)"
];
let initialized: Promise<void> | undefined;
async function ensureSchema() {
  if (!initialized) initialized = (async () => {
    const session = getNeo4jDriver().session({ database: neo4jDatabase });
    try { for (const query of LIVE_SCHEMA) await session.run(query); }
    finally { await session.close(); }
  })().catch(error => { initialized = undefined; throw error; });
  return initialized;
}

export async function ingestLiveEvent(profile: string, event: PaymentEvent, grant?: { sub: string; grantId: string; lease: string }) {
  await ensureSchema();
  const dictionary = readDictionary();
  const alias = matchDictionary(event.merchant, dictionary);
  if (alias) event = { ...event, merchant: alias.brand.toUpperCase() };
  const id = eventKey(profile, event);
  const key = merchantKey(event.merchant);
  const merchantId = digest(profile, key);
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    return await session.executeWrite(async tx => {
      // A revoke or replacement must stop a previously started mailbox sync.
      if (grant) {
        const check = await tx.run(`MATCH (u:PaytraceUser {sub:$sub}) SET u.syncLock=coalesce(u.syncLock,0)+1 WITH u WHERE u.profile=$profile AND u.grantId=$grantId AND u.syncLease=$lease AND u.syncLeaseUntil > datetime() RETURN u.sub AS sub`, { ...grant, profile });
        if (!check.records.length) throw new Error("Gmail connection changed");
      }
      // The write lock serializes concurrent events for one profile (including SMS/Email races).
      await tx.run("MERGE (u:LiveProfile {id:$profile}) SET u.revision=coalesce(u.revision,0)+1", { profile });
      const prior = await tx.run("MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent {id:$id}) RETURN e.status AS status, e.paymentId AS paymentId", { profile, id });
      if (prior.records.length) return { eventId: id, status: "duplicate", paymentId: prior.records[0].get("paymentId") ?? null };
      let result: { status: "recorded" | "created" | "matched" | "review"; id: string | null; candidates: string[] } = { status: "recorded", id: null, candidates: [] };
      if (event.kind === "debit_posted") {
        const rows = await tx.run(`MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment)
          WHERE p.merchantKey=$key AND p.date=$date AND p.amountPaise=$amount
          RETURN properties(p) AS payment`, { profile, key, date: event.date, amount: event.amountPaise });
        const candidates = rows.records.map(r => { const p = r.get("payment"); return { ...p, amountPaise: Number(p.amountPaise) } as MatchablePayment; });
        result = matchPayment(event, candidates);
        if (result.status === "created") result.id = digest(profile, id, "payment");
        if (result.id) {
          await tx.run(`MATCH (u:LiveProfile {id:$profile})
            MERGE (p:LivePayment {id:$paymentId})
            ON CREATE SET p.profile=$profile, p.merchantKey=$key, p.merchant=$merchant, p.amountPaise=$amount,
              p.date=$date, p.reference=$reference, p.sources=[], p.accountHint=$account
            SET p.sources=CASE WHEN $source IN p.sources THEN p.sources ELSE p.sources+[$source] END,
              p.accountHint=coalesce(p.accountHint,$account), p.reference=coalesce(p.reference,$reference)
            MERGE (u)-[:HAS_PAYMENT]->(p)`, { profile, paymentId: result.id, key, merchant: event.merchant, amount: event.amountPaise, date: event.date, reference: event.reference, source: event.source, account: event.accountHint ?? null });
        }
      }
      await tx.run(`MATCH (u:LiveProfile {id:$profile})
        MERGE (m:LiveMerchant {id:$merchantId}) SET m.name=$merchant, m.key=$key
        CREATE (e:LiveEvent {id:$id, source:$source, kind:$kind, merchant:$merchant, amountPaise:$amount,
          date:$date, reference:$reference, paymentId:$paymentId, status:$status, receivedAt:datetime(), accountHint:$account,
          planPricePaise:$planPrice, renewalDate:$renewalDate, renewalFrequency:$renewalFrequency})
        MERGE (u)-[:RECEIVED]->(e) MERGE (e)-[:ABOUT]->(m)
        WITH e,m OPTIONAL MATCH (p:LivePayment {id:$paymentId})
        FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END | MERGE (p)-[:EVIDENCED_BY]->(e) MERGE (p)-[:PAID_TO]->(m))
        WITH e UNWIND $candidates AS candidate
        MATCH (c:LivePayment {id:candidate}) MERGE (e)-[:POSSIBLE_MATCH]->(c)`, {
        profile, merchantId, key, id, source: event.source, kind: event.kind, merchant: event.merchant, amount: event.amountPaise, date: event.date, reference: event.reference, paymentId: result.id, status: result.status, account: event.accountHint ?? null, candidates: result.candidates, planPrice:event.planPricePaise??null, renewalDate:event.renewalDate??null, renewalFrequency:event.renewalFrequency??null
      });
      return { eventId: id, status: result.status, paymentId: result.id };
    });
  } finally { await session.close(); }
}

/** Read-only, profile-scoped queries suitable for fixed chatbot tools. */
export const LIVE_QUERIES = {
  payments: `MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment) RETURN properties(p) AS item ORDER BY p.date DESC`,
  evidence: `MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment {id:$paymentId})-[:EVIDENCED_BY]->(e:LiveEvent) RETURN properties(e) AS item ORDER BY e.receivedAt DESC`,
  events: `MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent) RETURN properties(e) AS item ORDER BY e.date DESC, e.receivedAt DESC`,
  review: `MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent)-[:POSSIBLE_MATCH]->(p:LivePayment) WHERE e.status='review' RETURN e.id AS eventId,p.id AS candidatePaymentId`
} as const;

/** Shared query; only the authenticated account endpoint receives the complete dataset. */
export async function readLiveDashboard(profile: string) {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const { payments, events, revision } = await session.executeRead(async tx => {
      const payments = await tx.run(LIVE_QUERIES.payments, { profile });
      const events = await tx.run(LIVE_QUERIES.events, { profile });
      const version = await tx.run("MATCH (u:LiveProfile {id:$profile}) RETURN u.revision AS revision", { profile });
      return { payments: payments.records.map(r => r.get("item")), events: events.records.map(r => r.get("item")), revision: Number(version.records[0]?.get("revision") ?? 0) };
    });
    const dictionary = readDictionary();
    const asOf = new Date().toISOString().slice(0, 10);
    const statement: StatementRow[] = payments.filter(p => p.date <= asOf).map(p => ({ txnId: p.id, persona: profile, date: p.date, accountId: p.accountHint || "unidentified", accountType: "unknown", narration: p.merchant, debit: Number(p.amountPaise)/100, reference: p.reference ?? "", channel: p.sources.join("+"), txnKind: "debit_purchase" }));
    const notifications: NotificationRow[] = events.map(e => ({ noticeId: e.id, sentOn: e.date, channel: e.source, sender: e.source, eventType: e.kind, brand: matchDictionary(e.merchant, dictionary)?.brand ?? e.merchant, relatedTxnId: e.paymentId ?? undefined, amount: e.amountPaise == null ? undefined : Number(e.amountPaise)/100, text: `${e.kind.replaceAll("_", " ")} · ${e.merchant}`, ...(e.planPricePaise==null?{}:{planPrice:Number(e.planPricePaise)/100}), ...(e.renewalDate==null?{}:{renewalDate:e.renewalDate as string}), ...(e.renewalFrequency==null?{}:{renewalFrequency:e.renewalFrequency}) }));
    // Keep registrations available even when older than the recent event feed.
    const subscriptionRegistrations: NotificationRow[] = [];
    const subscriptionRenewals: NotificationRow[] = [];
    const seenOrders = new Set<string>();
    const seenRenewals = new Set<string>();
    events.forEach((e,i) => {
      if(e.kind === "subscription_renewal" && e.date <= asOf) {
        const key=JSON.stringify([e.merchant,e.renewalDate,Number(e.amountPaise),e.renewalFrequency]);
        if(!seenRenewals.has(key)) { seenRenewals.add(key); subscriptionRenewals.push(notifications[i]); }
      }
      if (e.kind !== "subscription_registered" || e.date > asOf) return;
      const key = `${e.merchant}|${e.reference ?? e.id}`;
      if (seenOrders.has(key)) return;
      seenOrders.add(key);
      subscriptionRegistrations.push(notifications[i]);
    });
    // Only a creation not followed by cancellation can supply mandate evidence.
    const mandates: MandateRow[] = [];
    const lifecycle = new Map<string, typeof events[number]>();
    for (const e of events) if (e.date <= asOf && (e.kind === "mandate_created" || e.kind === "mandate_cancelled")) {
      const key = `${e.merchant}|${e.reference ?? e.accountHint ?? "unknown"}`;
      if (!lifecycle.has(key)) lifecycle.set(key, e);
    }
    for (const e of lifecycle.values()) if (e.kind === "mandate_created") mandates.push({ mandateId:e.id, createdOn:e.date, mechanism: "none", narration:e.merchant, brand:matchDictionary(e.merchant,dictionary)?.brand ?? e.merchant, maxAmount:Number(e.amountPaise)/100, frequency:"unknown", mandateRef:e.reference ?? "", accountId:e.accountHint ?? "unidentified", status:"active" });
    const dataset: Dataset = { asOf, statement, notifications, mandates, dictionary, usage: [] };
    const commitments = detectCommitments(dataset);
    const summary = { revision, asOf, counts: { payments: statement.length, sms: events.filter(e=>e.source==="sms").length, email:events.filter(e=>e.source==="email").length, review:events.filter(e=>e.status==="review").length }, commitments, subscriptionRegistrations, subscriptionRenewals, recentEvents: notifications.slice(0, 20), coverage: "partial", note: "Only imported events are covered. Missing notices or account identity are uncertain; candidate matches are excluded from payment totals." };
    return { dataset, summary };
  } finally { await session.close(); }
}

export async function readLiveSummary(profile: string) {
  return (await readLiveDashboard(profile)).summary;
}
