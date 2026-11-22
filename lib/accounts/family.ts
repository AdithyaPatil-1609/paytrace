/**
 * What a family viewer may see of someone's payments: an allowlist, so a new
 * field on Commitment is never shared by accident. No account numbers, bank
 * descriptors, references, messages, tokens or evidence ids.
 */
import type { GraphWarnings } from "@/db/neo4j/warnings";
import { GRAPH_WARNING_LIMITS } from "@/lib/payments/rules";
import type { Cadence, Commitment, SpendGroup } from "@/lib/payments/types";
import { formatINR } from "@/lib/presentation/format";

export const FAMILY_SCOPE = "recurring_summary" as const;

export type FamilyPayment = { merchant: string; product: string; cadence: Cadence; amount: number; annualCost: number; nextCharge: string | null; spendGroup: SpendGroup };
/**
 * One warning as a family viewer sees it: what happened or is about to, in
 * plain words, written from the facts (never the owner's own "why" text, which
 * speaks to the owner). No evidence, mandate references, ids or messages.
 * review: worth a closer look now. soon: money leaves in the next days. note: worth knowing.
 */
export type FamilyAlertKind = "charged_after_cancel" | "over_limit" | "silent_rise" | "price_rise_ahead" | "debit_due" | "price_rise" | "unused";
export type FamilyAlert = { kind: FamilyAlertKind; level: "review" | "soon" | "note"; merchant: string; date: string | null; title: string; detail: string };
export type FamilySummary = {
  owner: string; expiresAt: string; payments: FamilyPayment[]; totals: { count: number; annual: number; monthly: number };
  alerts: FamilyAlert[];
  /** true when the warnings could not all be read: the list may be missing some. */
  alertsIncomplete: boolean;
};

export function familyPayments(commitments: Commitment[]): FamilyPayment[] {
  return commitments
    .map(c => ({ merchant: c.merchant, product: c.product, cadence: c.cadence, amount: c.amount, annualCost: c.annualCost, nextCharge: c.nextCharge ?? null, spendGroup: c.spendGroup }))
    .sort((a, b) => b.annualCost - a.annualCost);
}

export function familyTotals(payments: FamilyPayment[]) {
  const annual = Math.round(payments.reduce((sum, p) => sum + p.annualCost, 0));
  return { count: payments.length, annual, monthly: Math.round(annual / 12) };
}

/** Only the first name is shown to the other person. */
export const firstName = (name: unknown) => (typeof name === "string" && name.trim() ? name.trim().split(/\s+/)[0].slice(0, 40) : "Paytrace user");

const rs = (paise: number) => formatINR(paise / 100);
const LEVEL_ORDER = { review: 0, soon: 1, note: 2 } as const;
const PER: Partial<Record<string, string>> = { weekly: "a week", monthly: "a month", quarterly: "a quarter", "half-yearly": "every six months", yearly: "a year" };
const LATE = " The notice came less than a day before, so it may have been missed.";

/**
 * The four warnings (price rise, mandate limit, unused, charged after
 * cancelling) plus the near heads-ups, cut down to what a family member needs
 * to help: an allowlist built field by field, like familyPayments.
 */
export function familyAlerts(w: Pick<GraphWarnings, "price" | "priceAhead" | "mandate" | "unused" | "cancellation" | "upcoming">, withinDays: number = GRAPH_WARNING_LIMITS.headsUpDays): FamilyAlert[] {
  const out: FamilyAlert[] = [];
  for (const c of w.cancellation) {
    if (c.kind !== "UNEXPECTED_AFTER_CANCELLATION") continue;
    out.push({ kind: "charged_after_cancel", level: "review", merchant: c.merchant, date: c.payment.date,
      title: `${c.merchant} charged after it was cancelled`,
      detail: `${rs(c.payment.amountPaise)} was taken on ${c.payment.date}, after the ${c.cancelledWhat === "mandate" ? "payment mandate" : "subscription"} was cancelled${c.effectiveOn ? ` on ${c.effectiveOn}` : ""}. Worth a review with the bank. It is not proof of fraud.` });
  }
  for (const m of w.mandate) {
    if (m.kind === "HIGH_LIMIT") continue;
    out.push({ kind: "over_limit", level: m.violation ? "review" : "soon", merchant: m.merchant, date: m.date,
      title: m.violation ? `${m.merchant} took more than its limit` : `${m.merchant} plans to take more than its limit`,
      detail: `${m.violation ? "A debit of" : "An announced debit of"} ${rs(m.amountPaise)}${m.date ? ` on ${m.date}` : ""} is above the mandate limit of ${rs(m.limitPaise)}.` });
  }
  const ahead = new Set<string>();
  for (const p of w.priceAhead) {
    ahead.add(p.merchant);
    const when = p.chargeOn ? `${p.dateConfirmed ? "on" : "around"} ${p.chargeOn}` : "at the next renewal";
    out.push({ kind: "price_rise_ahead", level: "soon", merchant: p.merchant, date: p.chargeOn,
      title: `${p.merchant} is going up to ${rs(p.newPaise)}`,
      detail: `Now ${rs(p.currentPaise)} (+${p.pctChange}%). The new price will be taken ${when}.${p.lateNotice ? LATE : ""}` });
  }
  for (const p of w.price) {
    if (p.classification === "INSUFFICIENT_EVIDENCE") continue;
    const silent = p.classification === "POSSIBLE_SILENT_PRICE_INCREASE";
    out.push({ kind: silent ? "silent_rise" : "price_rise", level: silent ? "review" : "note", merchant: p.merchant, date: p.latest.date,
      title: silent ? `${p.merchant} went up with no notice found` : `${p.merchant} went up`,
      detail: `From ${rs(p.previous.amountPaise)} on ${p.previous.date} to ${rs(p.latest.amountPaise)} on ${p.latest.date} (+${p.pctChange}%).${silent ? " No price-change message was found before the higher charge." : " A price-change notice announced it."}` });
  }
  for (const u of w.upcoming) {
    if (u.daysRemaining < 0 || u.daysRemaining > withinDays || ahead.has(u.merchant)) continue;
    const day = u.daysRemaining === 0 ? "today" : u.daysRemaining === 1 ? "tomorrow" : `in ${u.daysRemaining} days`;
    out.push({ kind: "debit_due", level: "soon", merchant: u.merchant, date: u.expectedOn,
      title: `${u.merchant}: ${u.amountPaise == null ? "a debit" : rs(u.amountPaise)} ${day}`,
      detail: `${u.confirmed ? "Announced by the bank or the merchant" : "Expected from past payments"} for ${u.expectedOn}.${u.lateNotice ? LATE : ""}` });
  }
  for (const u of w.unused) {
    if (u.status !== "UNUSED" || u.daysSinceLastUsage == null) continue;
    out.push({ kind: "unused", level: "note", merchant: u.merchant, date: u.lastVerifiedUsageAt,
      title: `${u.merchant} looks unused`,
      detail: `Not used for ${u.daysSinceLastUsage} days, still ${rs(u.amountPaise)} ${PER[u.frequency] ?? "a charge"}.${u.annualSavingsPaise ? ` Stopping it would save about ${rs(u.annualSavingsPaise)} a year.` : ""}` });
  }
  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}
