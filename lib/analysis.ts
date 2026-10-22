import type { Commitment } from "./types";

export function yearlyTotal(items: Commitment[]) {
  return items.reduce((total, item) => total + item.annualCost, 0);
}

export function unusedTotal(items: Commitment[]) {
  return yearlyTotal(items.filter((item) => item.kind === "unused"));
}

export function groupByKind(items: Commitment[]) {
  return Object.groupBy(items, (item) => item.kind);
}

export function isSilentPriceHike(item: Commitment) {
  return item.kind === "silent" && item.evidence.toLowerCase().includes("no price-change notice");
}

export function isZombie(item: Commitment) {
  return item.kind === "unused" && (item.lastOpenedMonthsAgo ?? 0) >= 3;
}
