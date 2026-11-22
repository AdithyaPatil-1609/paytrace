import { getNeo4jDriver, neo4jDatabase } from "./client";
import { digest, eventKey, matchPayment, merchantKey, type PaymentEvent, type MatchablePayment } from "@/server/ingestion/event";
import { detectCommitments, matchDictionary, NOTICE_CHANNEL } from "@/server/payments/engine";
import { readDictionary } from "@/data/fixtures";
import { usageMatches } from "./app-usage";
import type { Commitment, Dataset, DictionaryEntry, MandateRow, NotificationRow, StatementRow, UsageRow } from "@/server/payments/types";
import { needsCheck, splitByChecks, type StoredCheck } from "@/server/payments/recurring-check";
import { UNVERIFIED, type Provenance } from "@/server/ingestion/trust";

/** Stored Job 4 verdicts for one person (written by neo4j/recurring-checks.ts). */
export const CHECKS_QUERY = `MATCH (:LiveProfile {id:$profile})-[:HAS_RECURRING_CHECK]->(c:RecurringCheck)
RETURN c.commitmentId AS commitmentId, c.hash AS hash, c.verdict AS verdict, c.kind AS kind, c.model AS model, c.personSays AS personSays`;

export function toCheck(record: { get(key: string): unknown }): StoredCheck {
  return {
    commitmentId: String(record.get("commitmentId")),
    hash: String(record.get("hash") ?? ""),
    verdict: (record.get("verdict") ?? "unsure") as StoredCheck["verdict"],
    kind: String(record.get("kind") ?? "unknown"),
    model: String(record.get("model") ?? ""),
    personSays: (record.get("personSays") as "commitment" | null) ?? null
  };
}



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

/**
 * `provenance` comes from the caller's real checks (server/ingestion/trust.ts),
 * never from the event body. A stored level is kept: a later copy never
 * upgrades or downgrades it.
 */
export async function ingestLiveEvent(profile: string, event: PaymentEvent, grant?: { sub: string; grantId: string; lease: string }, provenance: Provenance = UNVERIFIED) {
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
      const prior = await tx.run("MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent {id:$id}) RETURN properties(e) AS item", { profile, id });
      if (prior.records.length) {
        const item=prior.records[0].get("item");
        const changed=item.status==="ignored"||event.kind!==item.kind||event.merchant!==item.merchant||(event.amountPaise??null)!==(item.amountPaise==null?null:Number(item.amountPaise))||(event.planPricePaise??null)!==(item.planPricePaise==null?null:Number(item.planPricePaise))||(event.renewalDate??null)!==(item.renewalDate??null)||(event.renewalFrequency??null)!==(item.renewalFrequency??null);
        if(item.kind!=="subscription_candidate"||!changed)return {eventId:id,status:"duplicate",paymentId:item.paymentId??null};
        // Only provisional email evidence is reclassified; never overwrite a confirmed charge.
        await tx.run("MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent {id:$id})-[r:ABOUT]->(:LiveMerchant) DELETE r",{profile,id});
      }
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
        MERGE (m:LiveMerchant {id:$merchantId}) SET m.name=$merchant, m.key=$key, m.profile=$profile
        MERGE (e:LiveEvent {id:$id}) SET e += {source:$source, kind:$kind, merchant:$merchant, amountPaise:$amount,
          date:$date, reference:$reference, paymentId:$paymentId, status:$status, receivedAt:datetime(), accountHint:$account,
          planPricePaise:$planPrice, renewalDate:$renewalDate, renewalFrequency:$renewalFrequency}
        FOREACH (_ IN CASE WHEN e.sourceTrust IS NULL THEN [1] ELSE [] END |
          SET e.sourceTrust=$trust.sourceTrust, e.verificationStatus=$trust.verificationStatus, e.verificationMethod=$trust.verificationMethod,
            e.trustReason=$trust.trustReason, e.verifiedAt=CASE WHEN $trust.verifiedAt IS NULL THEN null ELSE datetime($trust.verifiedAt) END)
        MERGE (u)-[:RECEIVED]->(e) MERGE (e)-[:ABOUT]->(m)
        WITH e,m OPTIONAL MATCH (p:LivePayment {id:$paymentId})
        FOREACH (_ IN CASE WHEN p IS NULL THEN [] ELSE [1] END | MERGE (p)-[:EVIDENCED_BY]->(e) MERGE (p)-[:PAID_TO]->(m))
        WITH e UNWIND $candidates AS candidate
        MATCH (c:LivePayment {id:candidate}) MERGE (e)-[:POSSIBLE_MATCH]->(c)`, {
        profile, merchantId, key, id, source: event.source, kind: event.kind, merchant: event.merchant, amount: event.amountPaise, date: event.date, reference: event.reference, paymentId: result.id, status: result.status, account: event.accountHint ?? null, candidates: result.candidates, planPrice:event.planPricePaise??null, renewalDate:event.renewalDate??null, renewalFrequency:event.renewalFrequency??null, trust:provenance
      });
      return { eventId: id, status: result.status, paymentId: result.id };
    });
  } finally { await session.close(); }
}

/** Reversible exclusion of a re-scanned false positive; scoped to the current Gmail grant. */
export async function ignoreSubscriptionCandidates(profile:string,sourceIds:string[],grant:{sub:string;grantId:string;lease:string}) {
  if(!sourceIds.length)return 0;
  const session=getNeo4jDriver().session({database:neo4jDatabase});
  try {
    const result=await session.run(`MATCH (u:PaytraceUser {sub:$sub}) SET u.syncLock=coalesce(u.syncLock,0)+1
      WITH u WHERE u.profile=$profile AND u.grantId=$grantId AND u.syncLease=$lease AND u.syncLeaseUntil>datetime()
      UNWIND $ids AS id MATCH (p:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent {id:id,kind:'subscription_candidate'})
      WHERE e.source='email' AND coalesce(e.status,'') <> 'ignored'
      SET e.status='ignored',p.revision=coalesce(p.revision,0)+1 RETURN e.id AS id`,{...grant,profile,ids:[...new Set(sourceIds)].map(id=>digest(profile,"email",id))});
    return result.records.length;
  } finally {await session.close();}
}

/** Read-only, profile-scoped queries suitable for fixed chatbot tools. */
export const LIVE_QUERIES = {
  payments: `MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment) RETURN properties(p) AS item ORDER BY p.date DESC`,
  evidence: `MATCH (:LiveProfile {id:$profile})-[:HAS_PAYMENT]->(p:LivePayment {id:$paymentId})-[:EVIDENCED_BY]->(e:LiveEvent) RETURN properties(e) AS item ORDER BY e.receivedAt DESC`,
  events: `MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent) WHERE coalesce(e.status,'') <> 'ignored' RETURN properties(e) AS item ORDER BY e.date DESC, e.receivedAt DESC`,
  review: `MATCH (:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent)-[:POSSIBLE_MATCH]->(p:LivePayment) WHERE e.status='review' RETURN e.id AS eventId,p.id AS candidatePaymentId`
} as const;

/** Usage facts on the person's own subscriptions: Android screen time (neo4j/app-usage.ts) or a date they confirmed. */
export const USAGE_QUERY = `MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription)
WHERE s.lastVerifiedUsageAt IS NOT NULL OR s.usageNoUseSince IS NOT NULL
RETURN s.merchant AS merchant, s.lastVerifiedUsageAt AS lastUsed, s.usageNoUseSince AS noUseSince, s.usageSource AS source`;

export type StoredUsage = { merchant: unknown; lastUsed: unknown; noUseSince: unknown; source: unknown };

/** The phone's last report, as kept on the profile by recordAppUsage. Anything unreadable is dropped. */
export function phoneReport(raw: unknown): StoredUsage[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === "object").map(item => ({ ...item, source: "android_usage_stats" }) as StoredUsage) : [];
  } catch { return []; }
}

/**
 * One usage row per payment merchant: every stored fact whose app name matches
 * the merchant (usageMatches, the same rule the phone report uses), keeping the
 * most recent last use. Only when no fact has a date does "not opened since" stand.
 */
export function usageFor(merchants: string[], stored: StoredUsage[], dictionary: DictionaryEntry[]): UsageRow[] {
  const facts = usageRows(stored, []);
  const rows: UsageRow[] = [];
  for (const merchant of merchants) {
    const found = facts.filter(fact => usageMatches(merchant, fact.brand));
    const used = found.filter(fact => fact.lastOpened).sort((a, b) => b.lastOpened!.localeCompare(a.lastOpened!))[0];
    const quiet = found.filter(fact => fact.notOpenedSince).sort((a, b) => b.notOpenedSince!.localeCompare(a.notOpenedSince!))[0];
    const best = used ?? quiet;
    if (!best) continue;
    rows.push({ ...best, brand: merchant });
    const brand = matchDictionary(merchant, dictionary)?.brand;
    if (brand && brand !== merchant && !rows.some(row => row.brand === brand)) rows.push({ ...best, brand });
  }
  return rows;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns stored usage facts into the engine's usage rows, so a payment card can
 * say when the app was last used and the "Stopped using it" rule can fire.
 * Only real facts become rows: a subscription with no usage record gets none,
 * so the card shows nothing and the payment is never called unused.
 */
export function usageRows(stored: StoredUsage[], dictionary: DictionaryEntry[]): UsageRow[] {
  const rows: UsageRow[] = [];
  for (const item of stored) {
    const merchant = typeof item.merchant === "string" ? item.merchant : "";
    const lastOpened = typeof item.lastUsed === "string" && ISO_DAY.test(item.lastUsed) ? item.lastUsed : undefined;
    const notOpenedSince = !lastOpened && typeof item.noUseSince === "string" && ISO_DAY.test(item.noUseSince) ? item.noUseSince : undefined;
    if (!merchant || (!lastOpened && !notOpenedSince)) continue;
    const source = item.source === "android_usage_stats" ? "phone" : "you";
    rows.push({ brand: matchDictionary(merchant, dictionary)?.brand ?? merchant, ...(lastOpened ? { lastOpened } : { notOpenedSince }), opensLast12Months: 0, source });
  }
  return rows;
}

/** Shared query; only the authenticated account endpoint receives the complete dataset. */
export async function readLiveDashboard(profile: string, options: { withDetected?: boolean } = {}) {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const { payments, events: allEvents, revision, checks, usage } = await session.executeRead(async tx => {
      const payments = await tx.run(LIVE_QUERIES.payments, { profile });
      const events = await tx.run(LIVE_QUERIES.events, { profile });
      const version = await tx.run("MATCH (u:LiveProfile {id:$profile}) RETURN u.revision AS revision", { profile });
      const checks = await tx.run(CHECKS_QUERY, { profile });
      const usage = await tx.run(USAGE_QUERY, { profile });
      const report = await tx.run("MATCH (u:LiveProfile {id:$profile}) RETURN u.appUsageReport AS report", { profile });
      return { payments: payments.records.map(r => r.get("item")), events: events.records.map(r => r.get("item")), revision: Number(version.records[0]?.get("revision") ?? 0), checks: checks.records.map(toCheck), usage: [...usage.records.map(r => ({ ...r.toObject(), source: r.get("source") === "user_confirmed" ? "user_confirmed" : "android_usage_stats" }) as StoredUsage), ...phoneReport(report.records[0]?.get("report"))] };
    });
    // Bank statement lines are payments, not messages: they feed the payments, never the notice list.
    const events = allEvents.filter(e => e.source !== "statement");
    const dictionary = readDictionary();
    const asOf = new Date().toISOString().slice(0, 10);
    const statement: StatementRow[] = payments.filter(p => p.date <= asOf).map(p => ({ txnId: p.id, persona: profile, date: p.date, accountId: p.accountHint || "unidentified", accountType: "unknown", narration: p.merchant, debit: Number(p.amountPaise)/100, reference: p.reference ?? "", channel: p.sources.join("+"), txnKind: "debit_purchase" }));
    const notifications: NotificationRow[] = events.map(e => ({ noticeId: e.id, sentOn: e.date, channel: e.source, sender: e.source, eventType: e.kind, brand: matchDictionary(e.merchant, dictionary)?.brand ?? e.merchant, relatedTxnId: e.paymentId ?? undefined, amount: e.amountPaise == null ? undefined : Number(e.amountPaise)/100, text: `${e.kind.replaceAll("_", " ")} · ${e.merchant}`, ...(e.planPricePaise==null?{}:{planPrice:Number(e.planPricePaise)/100}), ...(e.renewalDate==null?{}:{renewalDate:e.renewalDate as string}), ...(e.renewalFrequency==null?{}:{renewalFrequency:e.renewalFrequency}) }));
    // Keep registrations available even when older than the recent event feed.
    const subscriptionRegistrations: NotificationRow[] = [];
    const subscriptionRenewals: NotificationRow[] = [];
    const subscriptionCandidates: NotificationRow[] = [];
    const scheduledDebits: NotificationRow[] = [];
    const seenOrders = new Set<string>();
    const seenRenewals = new Set<string>();
    events.forEach((e,i) => {
      if(e.kind === "debit_scheduled" && e.date <= asOf) {
        const key=JSON.stringify([e.merchant,e.renewalDate??e.date,Number(e.amountPaise)]);
        if(!seenRenewals.has(key)){seenRenewals.add(key);scheduledDebits.push(notifications[i]);}
      }
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
    const knownSubscriptions=new Set([...subscriptionRegistrations,...subscriptionRenewals,...scheduledDebits].map(row=>merchantKey(row.brand)));
    for(const row of notifications) {
      const key=merchantKey(row.brand);
      if(row.eventType!=="subscription_candidate"||row.sentOn>asOf||knownSubscriptions.has(key))continue;
      knownSubscriptions.add(key);
      subscriptionCandidates.push(row);
    }
    // Only a creation not followed by cancellation can supply mandate evidence.
    const mandates: MandateRow[] = [];
    const lifecycle = new Map<string, typeof events[number]>();
    for (const e of events) if (e.date <= asOf && (e.kind === "mandate_created" || e.kind === "mandate_cancelled")) {
      const key = `${e.merchant}|${e.reference ?? e.accountHint ?? "unknown"}`;
      if (!lifecycle.has(key)) lifecycle.set(key, e);
    }
    for (const e of lifecycle.values()) if (e.kind === "mandate_created") mandates.push({ mandateId:e.id, createdOn:e.date, mechanism: "none", narration:e.merchant, brand:matchDictionary(e.merchant,dictionary)?.brand ?? e.merchant, maxAmount:Number(e.amountPaise)/100, frequency:"unknown", mandateRef:e.reference ?? "", accountId:e.accountHint ?? "unidentified", status:"active" });
    // Gmail often holds only notices ("Rs 9,500 will be debited on 17 Nov"), not the debit itself.
    // Repeated notices for the same merchant are real evidence of a repeating payment, so they
    // become dated rows, marked as notices; a bank debit for the same merchant, date and amount wins.
    const paidRows = statement.length;
    statement.push(...noticeRows(statement, events, profile, asOf));
    const dataset: Dataset = { asOf, statement, notifications, mandates, dictionary, usage: usageFor([...new Set(statement.map(row => row.narration))], usage, dictionary) };
    const detected = detectCommitments(dataset);
    // Job 4: a shop visited often (checked by the local model, within the rules in recurring-check.ts) is listed apart, never dropped.
    const { commitments, everyday } = splitByChecks(detected, checks);
    const everydaySpending = everyday.map(({ item, kind, model }) => ({ id: item.id, merchant: item.merchant, rawNarration: item.rawNarration, kind, model, debitCount: item.debitCount, amount: item.amount, amountPattern: item.amountPattern, lastCharge: item.lastCharge, spentToDate: item.spentToDate }));
    const recurringChecksPending = needsCheck(detected, checks).length;
    const summary = { revision, asOf, counts: { payments: paidRows, sms: events.filter(e=>e.source==="sms").length, email:events.filter(e=>e.source==="email").length, statement:allEvents.filter(e=>e.source==="statement").length, review:allEvents.filter(e=>e.status==="review").length }, commitments, everydaySpending, recurringChecksPending, subscriptionRegistrations, subscriptionRenewals, subscriptionCandidates, scheduledDebits, recentEvents: notifications.slice(0, 20), coverage: "partial", note: "Only imported events are covered. Missing notices or account identity are uncertain; candidate matches are excluded from payment totals." };
    return { dataset, summary, ...(options.withDetected ? { detected: detected as Commitment[], checks: checks as StoredCheck[] } : {}) };
  } finally { await session.close(); }
}

export async function readLiveSummary(profile: string) {
  return (await readLiveDashboard(profile)).summary;
}

/**
 * Gmail gives debit and renewal notices, not bank debits. Each dated notice
 * becomes one statement row marked NOTICE_CHANNEL, so a Gmail-only account
 * still shows its repeating payments, labelled "not confirmed". A notice is
 * skipped when a real debit with the same merchant, day and amount exists,
 * when it is a repeat of another notice, or when its day is still ahead.
 */
/** The stored event fields noticeRows reads. Amounts may arrive as Neo4j integers. */
export type NoticeEvent = { id: string; kind: string; merchant: string; date: string; amountPaise?: unknown; renewalDate?: unknown; accountHint?: string | null; reference?: string | null };

export function noticeRows(paid: StatementRow[], events: NoticeEvent[], profile: string, asOf: string): StatementRow[] {
  const dayMs = 86_400_000;
  const confirmedBy = (key: string, day: string) =>
    paid.some(row => merchantKey(row.narration) === key && Math.abs(Date.parse(row.date) - Date.parse(day)) <= 3 * dayMs);
  // Notices rarely name the account; borrow it from a real debit to the same
  // merchant so both land in one repeating payment, not two.
  const accountOf = new Map(paid.map(row => [merchantKey(row.narration), row.accountId] as const));
  const seen = new Set<string>();
  const rows: StatementRow[] = [];
  for (const e of events) {
    if ((e.kind !== "debit_scheduled" && e.kind !== "subscription_renewal") || e.amountPaise == null || Number(e.amountPaise) <= 0) continue;
    const day = typeof e.renewalDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.renewalDate) ? e.renewalDate : e.date;
    if (typeof day !== "string" || day > asOf) continue;
    const amount = Number(e.amountPaise) / 100;
    const key = JSON.stringify([merchantKey(e.merchant), day, amount]);
    if (confirmedBy(merchantKey(e.merchant), day) || seen.has(key)) continue;
    seen.add(key);
    rows.push({ txnId: `notice-${e.id}`, persona: profile, date: day, accountId: e.accountHint || accountOf.get(merchantKey(e.merchant)) || "unidentified", accountType: "unknown", narration: e.merchant, debit: amount, reference: e.reference ?? "", channel: NOTICE_CHANNEL, txnKind: "debit_notice" } as StatementRow);
  }
  return rows;
}
