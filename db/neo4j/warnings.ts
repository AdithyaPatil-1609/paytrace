/**
 * Live graph warnings (Phase 3): parameterized Cypher over one person's
 * payment chains and evidence. Every query starts at (:LiveProfile {id:$profile}),
 * so it can only see that person's records. Nothing here is invented: a
 * missing notice, mandate, usage record or cancellation is reported as
 * unknown, never as proof.
 */
import type { ManagedTransaction } from "neo4j-driver";
import { getNeo4jDriver, neo4jDatabase } from "./client";
import { ensureChains } from "./chains";
import { GRAPH_WARNING_LIMITS as L } from "@/lib/payments/rules";

export type Evidence = { id: string; source: string; kind: string; date: string };
export type PaymentRef = { id: string; date: string; amountPaise: number; evidence: Evidence[] };
export type PriceClass = "NOTIFIED_PRICE_INCREASE" | "POSSIBLE_SILENT_PRICE_INCREASE" | "INSUFFICIENT_EVIDENCE";
export type Severity = "low" | "medium" | "high";

export type PriceWarning = {
  subscriptionId: string; merchant: string; previous: PaymentRef; latest: PaymentRef;
  deltaPaise: number; pctChange: number; gapDays: number; classification: PriceClass;
  notices: Evidence[]; severity: Severity; why: string;
};
export type MandateWarning = {
  subscriptionId: string; merchant: string; kind: "LIMIT_EXCEEDED" | "UPCOMING_OVER_LIMIT" | "HIGH_LIMIT";
  violation: boolean; mandateId: string | null; limitPaise: number; status: "active" | "cancelled";
  createdOn: string; cancelledOn: string | null; typicalPaise: number; amountPaise: number; date: string | null;
  evidence: Evidence[]; why: string;
};
export type UnusedWarning = {
  subscriptionId: string; merchant: string; status: "UNUSED" | "USAGE_UNAVAILABLE";
  lastVerifiedUsageAt: string | null; usageSource: string | null; usageEvidenceId: string | null; usageCoverage: string | null;
  daysSinceLastUsage: number | null; amountPaise: number; frequency: Frequency; annualSavingsPaise: number | null; why: string;
};
export type CancelWarning = {
  subscriptionId: string; merchant: string; kind: "UNEXPECTED_AFTER_CANCELLATION" | "FINAL_BILLING" | "UNCONFIRMED_CANCELLATION";
  cancelledWhat: "subscription" | "mandate"; requestedOn: string | null; effectiveOn: string | null;
  payment: PaymentRef; cancellationEvidence: Evidence[]; why: string;
};
export type Frequency = "weekly" | "monthly" | "quarterly" | "half-yearly" | "yearly" | "other" | "unknown";
export type UpcomingWarning = {
  merchant: string; subscriptionId: string | null; amountPaise: number | null; expectedOn: string; daysRemaining: number;
  frequency: Frequency; confidence: "high" | "medium" | "low"; confirmed: boolean; history: { date: string; amountPaise: number }[];
  evidence: Evidence[]; why: string;
};
export type GraphWarnings = {
  asOf: string; price: PriceWarning[]; mandate: MandateWarning[]; mandateUnknown: string[];
  unused: UnusedWarning[]; cancellation: CancelWarning[]; upcoming: UpcomingWarning[];
};

const n = (value: unknown) => (value == null ? null : Number(value));
const params = (profile: string, today: string, extra: Record<string, unknown> = {}) => ({ profile, today, ...L, ...extra });

/** A cycle length in days, named. */
export function frequencyOf(gapDays: number | null): Frequency {
  if (gapDays == null) return "unknown";
  if (gapDays >= 5 && gapDays <= 9) return "weekly";
  if (gapDays >= 26 && gapDays <= 35) return "monthly";
  if (gapDays >= 84 && gapDays <= 97) return "quarterly";
  if (gapDays >= 170 && gapDays <= 195) return "half-yearly";
  if (gapDays >= 350 && gapDays <= 380) return "yearly";
  return "other";
}

const PER_YEAR: Record<Frequency, number | null> = { weekly: 52, monthly: 12, quarterly: 4, "half-yearly": 2, yearly: 1, other: null, unknown: null };
export function annualPaise(amountPaise: number, gapDays: number | null) {
  const per = PER_YEAR[frequencyOf(gapDays)] ?? (gapDays && gapDays > 0 ? 365 / gapDays : null);
  return per == null ? null : Math.round(amountPaise * per);
}

const MONTHS: Partial<Record<Frequency, number>> = { monthly: 1, quarterly: 3, "half-yearly": 6, yearly: 12 };
/** The next date in a cycle: calendar months for monthly and longer bills (same day, clamped), days otherwise. */
export function nextDate(lastDate: string, gapDays: number) {
  const months = MONTHS[frequencyOf(gapDays)];
  const last = new Date(`${lastDate}T00:00:00Z`);
  if (!months) return new Date(last.getTime() + gapDays * 86_400_000).toISOString().slice(0, 10);
  const target = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(last.getUTCDate(), lastDay));
  return target.toISOString().slice(0, 10);
}

export function severityOf(pct: number): Severity {
  return pct >= L.severityHighPct ? "high" : pct >= L.severityMediumPct ? "medium" : "low";
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

/** The evidence of a payment, as a map projection. */
const PAYMENT = (alias: string) => `${alias} {.id, .date, amountPaise: toInteger(${alias}.amountPaise),
  evidence: [(${alias})-[:EVIDENCED_BY]->(e) | e {.id, .source, .kind, .date}]}`;

const toPayment = (row: Record<string, unknown>): PaymentRef => ({
  id: String(row.id), date: String(row.date), amountPaise: Number(row.amountPaise), evidence: (row.evidence as Evidence[]) ?? []
});

/** Query 1: consecutive payments up by at least priceRisePct, with matching price notices. */
export const PRICE_QUERY = `
MATCH (u:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription)-[:FIRST]->(:LivePayment)-[:NEXT*0..]->(a:LivePayment)-[n:NEXT]->(b:LivePayment)
WHERE n.deltaPaise > 0 AND n.deltaPaise * 100 >= $priceRisePct * toInteger(a.amountPaise)
  AND n.gapDays >= $minCycleDays AND n.gapDays <= $maxCycleDays
OPTIONAL MATCH (u)-[:RECEIVED]->(notice:LiveEvent {kind:'price_change'})-[:ABOUT]->(nm:LiveMerchant)
  WHERE nm.key = s.merchantKey AND notice.date <= b.date
    AND notice.date >= toString(date(a.date) - duration({days: $noticeLeadDays}))
    AND (notice.amountPaise IS NULL OR toInteger(notice.amountPaise) = toInteger(b.amountPaise))
WITH u, s, a, b, n, collect(DISTINCT notice {.id, .source, .kind, .date}) AS notices
WITH s, a, b, n, notices,
  COUNT { (u)-[:RECEIVED]->(e:LiveEvent {source:'email'})-[:ABOUT]->(em:LiveMerchant) WHERE em.key = s.merchantKey } AS emails
RETURN s.id AS subscriptionId, s.merchant AS merchant, ${PAYMENT("a")} AS previous, ${PAYMENT("b")} AS latest,
  n.deltaPaise AS deltaPaise, n.pctChange AS pctChange, n.gapDays AS gapDays, notices, emails
ORDER BY b.date DESC`;

/** Query 2: verified mandate limits against actual and announced debits. */
export const MANDATE_QUERY = `
MATCH (u:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription)-[:LATEST]->(latest:LivePayment)
MATCH (u)-[:RECEIVED]->(m:LiveEvent {kind:'mandate_created'})-[:ABOUT]->(mm:LiveMerchant)
WHERE mm.key = s.merchantKey AND m.amountPaise IS NOT NULL AND m.amountPaise > 0
OPTIONAL MATCH (u)-[:RECEIVED]->(c:LiveEvent {kind:'mandate_cancelled'})-[:ABOUT]->(cm:LiveMerchant)
  WHERE cm.key = s.merchantKey AND c.date >= m.date AND (m.reference IS NULL OR c.reference IS NULL OR c.reference = m.reference)
WITH u, s, latest, m, min(c.date) AS cancelledOn, collect(c {.id, .source, .kind, .date}) AS cancels
OPTIONAL MATCH (u)-[:HAS_PAYMENT]->(p:LivePayment {merchantKey: s.merchantKey})
  WHERE p.date >= m.date AND (cancelledOn IS NULL OR p.date <= cancelledOn) AND toInteger(p.amountPaise) > toInteger(m.amountPaise)
WITH u, s, latest, m, cancelledOn, cancels, collect(${PAYMENT("p")}) AS over
OPTIONAL MATCH (u)-[:RECEIVED]->(x:LiveEvent)-[:ABOUT]->(xm:LiveMerchant)
  WHERE xm.key = s.merchantKey AND x.kind IN ['debit_scheduled', 'subscription_renewal'] AND cancelledOn IS NULL
    AND coalesce(x.renewalDate, x.date) >= $today AND toInteger(x.amountPaise) > toInteger(m.amountPaise)
RETURN s.id AS subscriptionId, s.merchant AS merchant, m {.id, .source, .kind, .date, .reference} AS mandate,
  toInteger(m.amountPaise) AS limitPaise, cancelledOn, cancels, toInteger(latest.amountPaise) AS typicalPaise, over,
  collect(x {.id, .source, .kind, date: coalesce(x.renewalDate, x.date), amountPaise: toInteger(x.amountPaise)}) AS announced`;

/** Subscriptions with no verified mandate: their limit is shown as unknown. */
export const MANDATE_UNKNOWN_QUERY = `
MATCH (u:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription) WHERE s.paymentCount >= 2
  AND NOT EXISTS { (u)-[:RECEIVED]->(m:LiveEvent {kind:'mandate_created'})-[:ABOUT]->(mm:LiveMerchant) WHERE mm.key = s.merchantKey AND m.amountPaise > 0 }
RETURN s.merchant AS merchant ORDER BY merchant`;

/** Cycle facts per subscription, shared by the unused and upcoming warnings. */
const CYCLES = `
MATCH (u:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription)-[:LATEST]->(latest:LivePayment)
OPTIONAL MATCH (s)-[:FIRST]->(:LivePayment)-[:NEXT*0..]->(:LivePayment)-[n:NEXT]->(:LivePayment)
WITH u, s, latest, collect(n.gapDays) AS gaps`;

/** Query 3: active subscriptions and their verified usage, if any. */
export const UNUSED_QUERY = `${CYCLES}
WHERE size(gaps) >= 1 AND (s.cancelEffectiveOn IS NULL OR s.cancelEffectiveOn > $today)
RETURN s.id AS subscriptionId, s.merchant AS merchant, latest.date AS latestDate, toInteger(latest.amountPaise) AS amountPaise, gaps,
  s.lastVerifiedUsageAt AS lastVerifiedUsageAt, s.usageSource AS usageSource, s.usageEvidenceId AS usageEvidenceId, s.usageCoverage AS usageCoverage`;

/** Query 4: payments on or after a subscription or mandate cancellation. */
export const CANCEL_QUERY = `
MATCH (u:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription)
OPTIONAL MATCH (u)-[:RECEIVED]->(mc:LiveEvent {kind:'mandate_cancelled'})-[:ABOUT]->(mm:LiveMerchant) WHERE mm.key = s.merchantKey
WITH u, s, min(mc.date) AS mandateCancelledOn, collect(mc {.id, .source, .kind, .date}) AS mandateEvidence
WHERE s.cancelRequestedOn IS NOT NULL OR s.cancelEffectiveOn IS NOT NULL OR mandateCancelledOn IS NOT NULL
WITH u, s, mandateCancelledOn, mandateEvidence,
  [d IN [s.cancelRequestedOn, s.cancelEffectiveOn, mandateCancelledOn] WHERE d IS NOT NULL] AS starts
MATCH (u)-[:HAS_PAYMENT]->(p:LivePayment {merchantKey: s.merchantKey})
WHERE ANY(d IN starts WHERE p.date > d)
RETURN s.id AS subscriptionId, s.merchant AS merchant, s.cancelRequestedOn AS requestedOn, s.cancelEffectiveOn AS effectiveOn,
  coalesce(s.cancelConfirmed, false) AS confirmed, s.cancelSource AS cancelSource, s.cancelEvidenceId AS cancelEvidenceId,
  mandateCancelledOn, mandateEvidence, ${PAYMENT("p")} AS payment
ORDER BY p.date`;

/** Upcoming: cycles from the chains, plus verified debit and renewal notices in the window. */
export const UPCOMING_CYCLE_QUERY = `${CYCLES}
WHERE s.cancelEffectiveOn IS NULL OR s.cancelEffectiveOn > $today
RETURN s.id AS subscriptionId, s.merchant AS merchant, s.merchantKey AS merchantKey, latest.date AS latestDate,
  toInteger(latest.amountPaise) AS amountPaise, gaps,
  [(s)-[:FIRST]->(:LivePayment)-[:NEXT*0..]->(p:LivePayment) | p {.date, amountPaise: toInteger(p.amountPaise)}][-6..] AS history`;

export const UPCOMING_NOTICE_QUERY = `
MATCH (u:LiveProfile {id:$profile})-[:RECEIVED]->(e:LiveEvent)-[:ABOUT]->(m:LiveMerchant)
WHERE e.kind IN ['debit_scheduled', 'subscription_renewal'] AND coalesce(e.status, '') <> 'ignored'
  AND coalesce(e.renewalDate, e.date) >= $today AND coalesce(e.renewalDate, e.date) <= $until
RETURN m.key AS merchantKey, e.merchant AS merchant, coalesce(e.renewalDate, e.date) AS day, toInteger(e.amountPaise) AS amountPaise,
  e.renewalFrequency AS frequency, e {.id, .source, .kind, .date} AS evidence
ORDER BY day`;

async function rows(tx: ManagedTransaction, query: string, values: Record<string, unknown>) {
  return (await tx.run(query, values)).records.map((record) => record.toObject() as Record<string, unknown>);
}

export function classifyPrice(notices: Evidence[], emails: number): PriceClass {
  if (notices.length) return "NOTIFIED_PRICE_INCREASE";
  return emails >= L.emailsForSilent ? "POSSIBLE_SILENT_PRICE_INCREASE" : "INSUFFICIENT_EVIDENCE";
}

/** Reads every warning for one profile. Rebuilds that profile's chains first if payments changed. */
export async function readGraphWarnings(profile: string, today = new Date().toISOString().slice(0, 10), windowDays: number = L.upcomingWindowDays): Promise<GraphWarnings> {
  await ensureChains(profile, today);
  const until = new Date(Date.parse(today) + windowDays * 86_400_000).toISOString().slice(0, 10);
  const session = getNeo4jDriver().session({ database: neo4jDatabase, defaultAccessMode: "READ" });
  try {
    const raw = await session.executeRead(async (tx) => ({
      price: await rows(tx, PRICE_QUERY, params(profile, today)),
      mandate: await rows(tx, MANDATE_QUERY, params(profile, today)),
      mandateUnknown: await rows(tx, MANDATE_UNKNOWN_QUERY, params(profile, today)),
      unused: await rows(tx, UNUSED_QUERY, params(profile, today)),
      cancel: await rows(tx, CANCEL_QUERY, params(profile, today)),
      cycles: await rows(tx, UPCOMING_CYCLE_QUERY, params(profile, today)),
      notices: await rows(tx, UPCOMING_NOTICE_QUERY, params(profile, today, { until }))
    }));
    return {
      asOf: today,
      price: raw.price.map(priceWarning),
      ...mandateWarnings(raw.mandate, raw.mandateUnknown),
      unused: raw.unused.map((row) => unusedWarning(row, today)),
      cancellation: raw.cancel.map(cancelWarning),
      upcoming: upcomingWarnings(raw.cycles, raw.notices, today, until)
    };
  } finally {
    await session.close();
  }
}

function priceWarning(row: Record<string, unknown>): PriceWarning {
  const previous = toPayment(row.previous as Record<string, unknown>), latest = toPayment(row.latest as Record<string, unknown>);
  const notices = row.notices as Evidence[];
  const classification = classifyPrice(notices, Number(row.emails));
  const pct = Number(row.pctChange);
  const base = `${row.merchant} went from ${rupees(previous.amountPaise)} on ${previous.date} to ${rupees(latest.amountPaise)} on ${latest.date} (+${pct}%).`;
  const why = classification === "NOTIFIED_PRICE_INCREASE"
    ? `${base} A price-change notice dated ${notices[0].date} announced it.`
    : classification === "POSSIBLE_SILENT_PRICE_INCREASE"
      ? `${base} Paytrace sees this merchant's emails, but found no price-change notice before the higher charge. It may still have been announced somewhere Paytrace cannot see.`
      : `${base} Paytrace sees too little of this merchant's mail to say whether the rise was announced.`;
  return { subscriptionId: String(row.subscriptionId), merchant: String(row.merchant), previous, latest, deltaPaise: Number(row.deltaPaise), pctChange: pct, gapDays: Number(row.gapDays), classification, notices, severity: severityOf(pct), why };
}

function mandateWarnings(found: Record<string, unknown>[], unknown: Record<string, unknown>[]) {
  const mandate: MandateWarning[] = [];
  for (const row of found) {
    const m = row.mandate as Record<string, unknown>;
    const limitPaise = Number(row.limitPaise), typicalPaise = Number(row.typicalPaise);
    const cancelledOn = (row.cancelledOn as string | null) ?? null;
    const mandateEvidence: Evidence = { id: String(m.id), source: String(m.source), kind: String(m.kind), date: String(m.date) };
    const base = { subscriptionId: String(row.subscriptionId), merchant: String(row.merchant), mandateId: (m.reference as string | null) ?? null, limitPaise, status: cancelledOn ? "cancelled" as const : "active" as const, createdOn: String(m.date), cancelledOn, typicalPaise };
    for (const over of (row.over as Record<string, unknown>[]).map(toPayment)) mandate.push({ ...base, kind: "LIMIT_EXCEEDED", violation: true, amountPaise: over.amountPaise, date: over.date, evidence: [mandateEvidence, ...over.evidence], why: `A debit of ${rupees(over.amountPaise)} on ${over.date} is above the verified mandate limit of ${rupees(limitPaise)}.` });
    for (const next of row.announced as Record<string, unknown>[]) mandate.push({ ...base, kind: "UPCOMING_OVER_LIMIT", violation: false, amountPaise: Number(next.amountPaise), date: String(next.date), evidence: [mandateEvidence, next as unknown as Evidence], why: `An announced debit of ${rupees(Number(next.amountPaise))} on ${next.date} would be above the mandate limit of ${rupees(limitPaise)}.` });
    if (!cancelledOn && typicalPaise > 0 && limitPaise >= L.highMandateRatio * typicalPaise) mandate.push({ ...base, kind: "HIGH_LIMIT", violation: false, amountPaise: typicalPaise, date: null, evidence: [mandateEvidence], why: `The mandate allows up to ${rupees(limitPaise)}, ${Math.floor(limitPaise / typicalPaise)}× the usual ${rupees(typicalPaise)}. The merchant could take more without asking again.` });
  }
  return { mandate, mandateUnknown: unknown.map((row) => String(row.merchant)) };
}

function unusedWarning(row: Record<string, unknown>, today: string): UnusedWarning {
  const gap = median((row.gaps as unknown[]).map(Number));
  const amountPaise = Number(row.amountPaise);
  const last = (row.lastVerifiedUsageAt as string | null) ?? null;
  const daysSince = last ? days(last, today) : null;
  const unused = daysSince != null && daysSince >= L.unusedDays;
  const savings = annualPaise(amountPaise, gap);
  const why = last == null
    ? `Usage unavailable. Payments continue, but Paytrace has no verified record of when you last used ${row.merchant}. Review whether you still use it.`
    : unused
      ? `Your last verified use was ${last} (${daysSince} days ago, source: ${row.usageSource ?? "unknown"}), while payments continue.${savings ? ` Stopping it would save about ${rupees(savings)} a year.` : ""}`
      : `Last verified use ${last} (${daysSince} days ago).`;
  return { subscriptionId: String(row.subscriptionId), merchant: String(row.merchant), status: unused ? "UNUSED" : "USAGE_UNAVAILABLE", lastVerifiedUsageAt: last, usageSource: (row.usageSource as string | null) ?? null, usageEvidenceId: (row.usageEvidenceId as string | null) ?? null, usageCoverage: (row.usageCoverage as string | null) ?? null, daysSinceLastUsage: daysSince, amountPaise, frequency: frequencyOf(gap), annualSavingsPaise: unused ? savings : null, why };
}

function cancelWarning(row: Record<string, unknown>): CancelWarning {
  const payment = toPayment(row.payment as Record<string, unknown>);
  const requestedOn = (row.requestedOn as string | null) ?? null;
  const confirmed = Boolean(row.confirmed);
  const subscriptionEffective = (row.effectiveOn as string | null) ?? (confirmed ? requestedOn : null);
  const mandateOn = (row.mandateCancelledOn as string | null) ?? null;
  const userEvidence: Evidence[] = requestedOn || subscriptionEffective ? [{ id: String(row.cancelEvidenceId ?? `user-confirmed:${row.subscriptionId}`), source: String(row.cancelSource ?? "user_confirmed"), kind: "subscription_cancelled", date: String(subscriptionEffective ?? requestedOn) }] : [];
  const base = { subscriptionId: String(row.subscriptionId), merchant: String(row.merchant), requestedOn, payment };
  if (mandateOn && payment.date > mandateOn) return { ...base, kind: "UNEXPECTED_AFTER_CANCELLATION", cancelledWhat: "mandate", effectiveOn: mandateOn, cancellationEvidence: row.mandateEvidence as Evidence[], why: `${rupees(payment.amountPaise)} was debited on ${payment.date}, after the payment mandate was cancelled on ${mandateOn}. Ask your bank to dispute it and check that the mandate is really revoked.` };
  if (subscriptionEffective && payment.date > subscriptionEffective) return { ...base, kind: "UNEXPECTED_AFTER_CANCELLATION", cancelledWhat: "subscription", effectiveOn: subscriptionEffective, cancellationEvidence: userEvidence, why: `${rupees(payment.amountPaise)} was debited on ${payment.date}, after the subscription stopped on ${subscriptionEffective}. Cancelling a subscription does not always cancel the payment mandate: revoke it in your bank or UPI app and ask the merchant for a refund.` };
  if (requestedOn && subscriptionEffective && payment.date <= subscriptionEffective) return { ...base, kind: "FINAL_BILLING", cancelledWhat: "subscription", effectiveOn: subscriptionEffective, cancellationEvidence: userEvidence, why: `${rupees(payment.amountPaise)} on ${payment.date} falls before the cancellation took effect on ${subscriptionEffective}, so it is likely the final bill.` };
  return { ...base, kind: "UNCONFIRMED_CANCELLATION", cancelledWhat: "subscription", effectiveOn: null, cancellationEvidence: userEvidence, why: `${rupees(payment.amountPaise)} was debited on ${payment.date}, after you asked to cancel on ${requestedOn}, but the cancellation is not confirmed. Check with the merchant that it went through.` };
}

function upcomingWarnings(cycles: Record<string, unknown>[], notices: Record<string, unknown>[], today: string, until: string): UpcomingWarning[] {
  const out: UpcomingWarning[] = [];
  const confirmedKeys = new Set<string>();
  const byKey = new Map(cycles.map((row) => [String(row.merchantKey), row]));
  for (const notice of notices) {
    const key = String(notice.merchantKey);
    if (confirmedKeys.has(key)) continue;
    confirmedKeys.add(key);
    const cycle = byKey.get(key);
    const gap = cycle ? median((cycle.gaps as unknown[]).map(Number)) : null;
    const day = String(notice.day);
    out.push({ merchant: String(cycle?.merchant ?? notice.merchant), subscriptionId: cycle ? String(cycle.subscriptionId) : null, amountPaise: n(notice.amountPaise), expectedOn: day, daysRemaining: days(today, day), frequency: gap != null ? frequencyOf(gap) : ((notice.frequency as Frequency | null) ?? "unknown"), confidence: "high", confirmed: true, history: (cycle?.history as { date: string; amountPaise: number }[] | undefined)?.map((h) => ({ date: h.date, amountPaise: Number(h.amountPaise) })) ?? [], evidence: [notice.evidence as Evidence], why: `A ${String((notice.evidence as Evidence).kind).replaceAll("_", " ")} notice says ${notice.amountPaise == null ? "a debit" : rupees(Number(notice.amountPaise))} is due on ${day}.` });
  }
  for (const cycle of cycles) {
    if (confirmedKeys.has(String(cycle.merchantKey))) continue;
    const gaps = (cycle.gaps as unknown[]).map(Number);
    const gap = median(gaps);
    if (gap == null || gap < L.minCycleDays) continue;
    const latestDate = String(cycle.latestDate);
    if (days(latestDate, today) > 2 * gap) continue; // payments stopped: treat as inactive
    const expected = nextDate(latestDate, gap);
    if (expected < today || expected > until) continue;
    const steady = gaps.length >= 3 && gaps.every((g) => Math.abs(g - gap) <= gap * 0.15);
    out.push({ merchant: String(cycle.merchant), subscriptionId: String(cycle.subscriptionId), amountPaise: Number(cycle.amountPaise), expectedOn: expected, daysRemaining: days(today, expected), frequency: frequencyOf(gap), confidence: steady ? "high" : gaps.length >= 2 ? "medium" : "low", confirmed: false, history: (cycle.history as { date: string; amountPaise: number }[]).map((h) => ({ date: h.date, amountPaise: Number(h.amountPaise) })), evidence: [], why: `Estimated from ${gaps.length + 1} payments about ${gap} days apart; the last was ${latestDate}. No notice confirms the date yet.` });
  }
  return out.sort((a, b) => a.expectedOn.localeCompare(b.expectedOn));
}

/** User-confirmed facts about a subscription: last real use, or a cancellation. Scoped to the owner. */
export async function recordSubscriptionFact(profile: string, subscriptionId: string, fact: { usedOn?: string; cancelRequestedOn?: string; cancelEffectiveOn?: string; cancelConfirmed?: boolean }) {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const result = await session.executeWrite((tx) => tx.run(
      `MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription {id:$subscriptionId})
       FOREACH (_ IN CASE WHEN $usedOn IS NULL THEN [] ELSE [1] END |
         SET s.lastVerifiedUsageAt = $usedOn, s.usageSource = 'user_confirmed', s.usageCoverage = 'user_confirmed', s.usageEvidenceId = null)
       FOREACH (_ IN CASE WHEN $cancelRequestedOn IS NULL AND $cancelEffectiveOn IS NULL THEN [] ELSE [1] END |
         SET s.cancelRequestedOn = coalesce($cancelRequestedOn, s.cancelRequestedOn), s.cancelEffectiveOn = coalesce($cancelEffectiveOn, s.cancelEffectiveOn),
             s.cancelConfirmed = coalesce($cancelConfirmed, s.cancelConfirmed, false), s.cancelSource = 'user_confirmed')
       RETURN s.id AS id`,
      { profile, subscriptionId, usedOn: fact.usedOn ?? null, cancelRequestedOn: fact.cancelRequestedOn ?? null, cancelEffectiveOn: fact.cancelEffectiveOn ?? null, cancelConfirmed: fact.cancelConfirmed ?? null }
    ));
    return result.records.length > 0;
  } finally {
    await session.close();
  }
}
