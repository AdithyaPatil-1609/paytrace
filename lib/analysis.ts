import type { Bucket, Commitment } from "./types";
import { ZOMBIE_DAYS } from "./engine";

export function yearlyTotal(items: Commitment[]) {
  return items.reduce((total, item) => total + item.annualCost, 0);
}

export function unusedTotal(items: Commitment[]) {
  return yearlyTotal(items.filter((item) => item.kind === "unused"));
}

export function groupByKind(items: Commitment[]) {
  return Object.groupBy(items, (item) => item.kind);
}

/** The five-way split behind the annual screen. */
export function splitByBucket(items: Commitment[]) {
  const order: Bucket[] = ["unused", "review", "used", "bills", "debt"];
  return order.map((bucket) => {
    const rows = items.filter((item) => item.bucket === bucket);
    return { bucket, rows, total: yearlyTotal(rows) };
  });
}

/** A price moved and no message said so. That absence is the finding. */
export function isSilentPriceHike(item: Commitment) {
  return item.signals.includes("silent_hike") && !item.hasPriceChangeNotice;
}

export function hikeAmount(item: Commitment) {
  if (!isSilentPriceHike(item) || item.previousAmount === undefined) return 0;
  const monthsAtNewPrice = item.evidenceRows.filter((row) => row.amount === item.amount).length;
  return (item.amount - item.previousAmount) * monthsAtNewPrice;
}

export function isZombie(item: Commitment) {
  if (item.lastOpenedMonthsAgo === undefined) return item.signals.includes("zombie");
  return item.lastOpenedMonthsAgo * 30 >= ZOMBIE_DAYS;
}

export function isTrialConverted(item: Commitment) {
  return item.signals.includes("trial_converted");
}

/** Rows that deserve a decision: unused, a silent hike, or a converted trial. */
export function issueItems(items: Commitment[]) {
  return items.filter((item) => ["unused", "silent", "trial"].includes(item.kind));
}
