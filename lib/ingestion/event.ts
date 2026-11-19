import { createHash } from "node:crypto";

export const kinds = ["debit_posted", "mandate_created", "mandate_cancelled", "debit_scheduled", "debit_failed", "price_change", "trial_ending", "subscription_registered"] as const;
export type EventKind = typeof kinds[number];
export type PaymentEvent = {
  source: "sms" | "email";
  kind: EventKind;
  merchant: string;
  amountPaise: number | null;
  date: string;
  reference: string | null;
  sourceId?: string;
  accountHint?: string;
  /** Listed price, not an amount paid or a guaranteed future charge. */
  planPricePaise?: number;
  renewalDate?: string;
};

export function digest(...parts: (string | number | null | undefined)[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export function merchantKey(merchant: string) {
  return merchant.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

const sensitive = /\b(?:OTP|PIN|CVV|password|verification[\s-]*code|one[\s-]*time[\s-]*password)\b/i;
export function isSensitive(text: string) { return sensitive.test(text); }

export function validateEvent(input: unknown): PaymentEvent {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid event");
  const x = input as Record<string, unknown>;
  if (Object.keys(x).some(k => !["source", "kind", "merchant", "amountPaise", "date", "reference", "sourceId", "accountHint", "planPricePaise", "renewalDate"].includes(k))) throw new Error("Unexpected event field");
  if (x.source !== "sms" && x.source !== "email") throw new Error("Invalid source");
  if (!kinds.includes(x.kind as EventKind)) throw new Error("Invalid event kind");
  if (typeof x.merchant !== "string" || !/^[A-Za-z0-9][A-Za-z0-9 .&*_'@/-]{0,79}$/.test(x.merchant.trim()) || isSensitive(x.merchant)) throw new Error("Invalid merchant");
  if (!isDate(x.date)) throw new Error("Invalid date");
  const amount = x.amountPaise;
  const noAmount = x.kind === "mandate_cancelled" || x.kind === "trial_ending";
  const registration = x.kind === "subscription_registered";
  if (registration ? x.source !== "email" || amount !== 0 : amount === null ? !noAmount : typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100_000_000_000) throw new Error("Invalid amount");
  if (x.planPricePaise !== undefined && (!registration || typeof x.planPricePaise !== "number" || !Number.isSafeInteger(x.planPricePaise) || x.planPricePaise < 0 || x.planPricePaise > 100_000_000_000)) throw new Error("Invalid listed price");
  if (x.renewalDate !== undefined && (!registration || !isDate(x.renewalDate) || x.renewalDate < x.date)) throw new Error("Invalid renewal date");
  if (x.reference !== null && (typeof x.reference !== "string" || !/^[A-Za-z0-9-]{3,80}$/.test(x.reference) || isSensitive(x.reference))) throw new Error("Invalid reference");
  if (x.sourceId !== undefined && (typeof x.sourceId !== "string" || !/^[A-Za-z0-9_-]{3,128}$/.test(x.sourceId))) throw new Error("Invalid source ID");
  if (x.accountHint !== undefined && (typeof x.accountHint !== "string" || !/^[A-Za-z0-9-]{2,30}$/.test(x.accountHint))) throw new Error("Invalid masked account hint");
  if (x.reference === null && !x.sourceId) throw new Error("Reference or provider ID required");
  return { source: x.source, kind: x.kind as EventKind, merchant: x.merchant.trim().toUpperCase(), amountPaise: amount as number | null, date: x.date, reference: x.reference === null ? null : (x.reference as string).toUpperCase(), sourceId: x.sourceId as string | undefined, accountHint: x.accountHint as string | undefined, ...(x.planPricePaise === undefined ? {} : {planPricePaise:x.planPricePaise as number}), ...(x.renewalDate === undefined ? {} : {renewalDate:x.renewalDate as string}) };
}

/** Provider retry key, scoped to a profile and channel. Never save raw text. */
export function eventKey(profile: string, event: PaymentEvent) {
  return event.sourceId ? digest(profile, event.source, event.sourceId) : digest(profile, event.source, event.kind, merchantKey(event.merchant), event.amountPaise, event.date, event.reference, event.accountHint);
}

export type MatchablePayment = { id: string; reference: string | null; merchantKey: string; amountPaise: number; date: string; sources: string[]; accountHint?: string };
export function matchPayment(event: PaymentEvent, candidates: MatchablePayment[]) {
  const possible = candidates.filter(p => p.merchantKey === merchantKey(event.merchant) && p.amountPaise === event.amountPaise && p.date === event.date && (!p.accountHint || !event.accountHint || p.accountHint === event.accountHint));
  const exact = possible.filter(p => event.reference && p.reference === event.reference);
  if (exact.length === 1) return { status: "matched" as const, id: exact[0].id, candidates: [] as string[] };
  const crossSource = possible.filter(p => !p.sources.includes(event.source));
  const ambiguous = exact.length > 1 ? exact : crossSource;
  return ambiguous.length ? { status: "review" as const, id: null, candidates: ambiguous.map(p => p.id) } : { status: "created" as const, id: null, candidates: [] as string[] };
}
