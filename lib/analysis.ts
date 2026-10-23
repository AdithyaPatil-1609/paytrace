import type { Bucket, Commitment, SpendGroup } from "./types";
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

/* ---------------------------------------------------------------
   Visualization helpers
   --------------------------------------------------------------- */

export type CategorySlice = {
  group: SpendGroup;
  total: number;
  share: number;
  rows: Commitment[];
};

/**
 * Composition of the year by where the money goes. This is independent of
 * kind: a gym nobody uses is still a subscription, and "unused" is a status
 * rather than a category of spend.
 */
export function groupByCategory(items: Commitment[]): CategorySlice[] {
  const order: SpendGroup[] = ["debt", "subscriptions", "utilities", "insurance"];
  const total = yearlyTotal(items);
  return order
    .map((group) => {
      const rows = items.filter((item) => item.spendGroup === group);
      const groupTotal = yearlyTotal(rows);
      return { group, rows, total: groupTotal, share: total === 0 ? 0 : groupTotal / total };
    })
    .filter((slice) => slice.rows.length > 0)
    .sort((a, b) => b.total - a.total);
}

export type ForecastMonth = {
  key: string;
  label: string;
  total: number;
  /** True when any row in this month is a varying amount or an uneven date. */
  estimated: boolean;
};

function addMonths(date: Date, count: number) {
  const next = new Date(date);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + count);
  return next;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The next twelve months of scheduled debits, built from each commitment's
 * own rhythm. Deliberately not annualCost / 12: an annual renewal lands in
 * one month, and an irregular transfer lands on its own spacing.
 */
export function monthlyForecast(items: Commitment[], asOf: string): ForecastMonth[] {
  const start = addMonths(new Date(Date.parse(asOf)), 1);
  const months: ForecastMonth[] = [];

  for (let index = 0; index < 12; index += 1) {
    const when = addMonths(start, index);
    months.push({
      key: `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, "0")}`,
      label: MONTH_NAMES[when.getUTCMonth()],
      total: 0,
      estimated: false
    });
  }

  const indexOf = new Map(months.map((month, position) => [month.key, position]));

  const place = (position: number, amount: number, estimated: boolean) => {
    const month = months[position];
    if (!month) return;
    month.total += amount;
    if (estimated) month.estimated = true;
  };

  for (const item of items) {
    const estimated = item.dateConfidence !== "confirmed";

    if (item.cadence === "annual") {
      // One charge, on its renewal month, if that month falls in the window.
      if (!item.nextCharge) continue;
      const key = item.nextCharge.slice(0, 7);
      const position = indexOf.get(key);
      if (position !== undefined) place(position, item.amount, estimated);
      continue;
    }

    if (item.cadence === "irregular") {
      // Spread the observed spacing forward, and mark every month an estimate.
      const spacing = Math.max(1, Math.round(12 / Math.max(item.debitCount, 1)));
      for (let position = spacing - 1; position < 12; position += spacing) {
        place(position, item.amount, true);
      }
      continue;
    }

    if (item.cadence === "quarterly") {
      for (let position = 2; position < 12; position += 3) place(position, item.amount, estimated);
      continue;
    }

    for (let position = 0; position < 12; position += 1) place(position, item.amount, estimated);
  }

  return months.map((month) => ({ ...month, total: Math.round(month.total) }));
}

export type PriceHike = {
  item: Commitment;
  from: number;
  to: number;
  delta: number;
  percent: number;
  annualExtra: number;
  /** A hike that arrived with a message is real, but it is not silent. */
  noticed: boolean;
};

/**
 * Every commitment whose price stepped up. A hike with a matching
 * price-change notice is reported at lower severity than a silent one.
 */
export function detectPriceHikes(items: Commitment[]): PriceHike[] {
  return items
    .filter((item) => item.amountPattern === "step" && item.previousAmount !== undefined && item.amount > item.previousAmount)
    .map((item) => {
      const from = item.previousAmount as number;
      const to = item.amount;
      const delta = to - from;
      return {
        item,
        from,
        to,
        delta,
        percent: Math.round((delta / from) * 1000) / 10,
        annualExtra: delta * 12,
        noticed: item.hasPriceChangeNotice
      };
    })
    .sort((a, b) => b.annualExtra - a.annualExtra);
}

/**
 * What stopping the selected rows would take out of the year. Insurance and
 * the loan can never be selected, and nothing here marks a mandate cancelled:
 * it is a projection, not a realized saving.
 */
export function potentialSavings(items: Commitment[], selectedIds: string[]) {
  const eligible = items.filter(
    (item) => item.kind === "unused" && item.cancelMode !== "block" && item.cancelMode !== "warn"
  );
  const selected = eligible.filter((item) => selectedIds.includes(item.id));
  const saved = yearlyTotal(selected);
  return {
    eligible,
    selected,
    saved,
    revisedYear: yearlyTotal(items) - saved
  };
}

export type Renewal = {
  item: Commitment;
  date?: string;
  confidence: Commitment["dateConfidence"];
};

/**
 * Upcoming charges, soonest first. A row whose date cannot be supported by
 * the payment history keeps no date at all rather than a guessed one.
 */
export function upcomingRenewals(items: Commitment[]): Renewal[] {
  return items
    .map((item) => ({
      item,
      date: item.dateConfidence === "unknown" ? undefined : item.nextCharge,
      confidence: item.dateConfidence
    }))
    .sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
}
