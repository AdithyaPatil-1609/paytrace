/**
 * Subscriptions seen only in emails (receipts, renewal notices, scheduled
 * debits) that are not yet repeating payments on the table, such as a
 * YouTube Premium receipt with no bank debit next to it. The assistant must
 * see them, or its totals silently leave them out; it labels them "charge
 * not confirmed" so they are never passed off as confirmed payments.
 */
import type { Commitment, NotificationRow } from "@/lib/payments/types";
import { ASSISTANT_WATCH_LIMITS } from "@/lib/payments/rules";

export type Frequency = "weekly" | "monthly" | "quarterly" | "annual";

export type WatchItem = {
  name: string;
  /** Rupees, from the notice's amount or listed plan price; null when no email gave one. */
  amount: number | null;
  frequency: Frequency | null;
  /** The latest renewal or debit date any email named, past or future. */
  lastRenewal: string | null;
  lastEmail: string;
  emails: number;
};

export type WatchLists = {
  renewals?: NotificationRow[];
  scheduled?: NotificationRow[];
  registrations?: NotificationRow[];
  candidates?: NotificationRow[];
};

const nameKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "");
/** A bare sender domain ("EMAIL.APPLE.COM") names nobody. */
const isDomain = (name: string) => /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(name.trim());
/** "YOUTUBE PREMIUM STUDENT" reads as "Youtube Premium Student"; mixed case is kept as written. */
const readable = (name: string) => (name === name.toUpperCase() ? name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : name);
const later = (a: string | null, b: string | undefined) => (b && (!a || b > a) ? b : a);

/** One entry per merchant not already on the table, built from every email about it. */
export function watchItems(lists: WatchLists, commitments: Commitment[]): WatchItem[] {
  const onTable = new Set(commitments.flatMap((item) => [nameKey(item.merchant), nameKey(item.rawNarration)]));
  const byName = new Map<string, WatchItem & { amountOn: string }>();
  const rows = [...(lists.renewals ?? []), ...(lists.scheduled ?? []), ...(lists.registrations ?? []), ...(lists.candidates ?? [])];
  for (const row of rows) {
    const key = nameKey(row.brand);
    if (!key || onTable.has(key) || isDomain(row.brand)) continue;
    const entry = byName.get(key) ?? { name: readable(row.brand), amount: null, amountOn: "", frequency: null, lastRenewal: null, lastEmail: row.sentOn, emails: 0 };
    entry.emails += 1;
    entry.lastEmail = later(entry.lastEmail, row.sentOn) ?? row.sentOn;
    entry.lastRenewal = later(entry.lastRenewal, row.renewalDate);
    const amount = row.amount ?? row.planPrice;
    // The newest email with a price wins: a plan change replaces the old price.
    if (amount !== undefined && amount > 0 && row.sentOn >= entry.amountOn) { entry.amount = amount; entry.amountOn = row.sentOn; }
    if (row.renewalFrequency) entry.frequency = row.renewalFrequency;
    byName.set(key, entry);
  }
  return [...byName.values()].map((item) => ({ name: item.name, amount: item.amount, frequency: item.frequency, lastRenewal: item.lastRenewal, lastEmail: item.lastEmail, emails: item.emails })).sort((a, b) => b.lastEmail.localeCompare(a.lastEmail));
}

const DAY = 86_400_000;
const CYCLE_DAYS: Record<Frequency, number> = { weekly: 7, monthly: 31, quarterly: 92, annual: 366 };

function step(date: string, frequency: Frequency) {
  if (frequency === "weekly") return new Date(Date.parse(date) + 7 * DAY).toISOString().slice(0, 10);
  const months = { monthly: 1, quarterly: 3, annual: 12 }[frequency];
  const next = new Date(Date.parse(date));
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  next.setUTCDate(Math.min(day, new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
  return next.toISOString().slice(0, 10);
}

/**
 * Whether the emails are recent enough to expect another charge: the last
 * renewal (or, without one, the last email) is within one cycle plus a grace
 * period of today. Older ones may have been cancelled, so they are not counted.
 */
export function isCurrent(item: WatchItem, asOf: string) {
  if (!item.frequency) return false;
  const anchor = item.lastRenewal ?? item.lastEmail;
  return Date.parse(asOf) - Date.parse(anchor) <= (CYCLE_DAYS[item.frequency] + ASSISTANT_WATCH_LIMITS.graceDays) * DAY;
}

/** Expected renewal dates in [start, end], stepped from the last renewal an email named. */
export function watchDates(item: WatchItem, start: string, end: string, asOf: string) {
  if (!item.frequency || !item.lastRenewal || !isCurrent(item, asOf)) return [];
  const dates: string[] = [];
  let date = item.lastRenewal;
  for (let guard = 0; guard < 400 && date <= end; guard += 1) {
    if (date >= start && date >= asOf) dates.push(date);
    date = step(date, item.frequency);
  }
  return dates;
}
